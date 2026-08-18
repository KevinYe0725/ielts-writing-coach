import type { FeedbackIssue } from "./types";

export type FeedbackTextSegment =
  | { kind: "text"; text: string }
  | { issueId: string; kind: "issue"; text: string };

interface ResolvedAnnotation {
  end: number;
  issueId: string;
  start: number;
}

function exactSourceSpan(
  essay: string,
  issue: FeedbackIssue,
): ResolvedAnnotation | null {
  const { startOffset, endOffset, evidence } = issue;
  const hasStoredOffset = startOffset !== null || endOffset !== null;

  if (
    Number.isInteger(startOffset) &&
    Number.isInteger(endOffset) &&
    startOffset !== null &&
    endOffset !== null &&
    startOffset >= 0 &&
    endOffset > startOffset &&
    endOffset <= essay.length &&
    essay.slice(startOffset, endOffset) === evidence
  ) {
    return { end: endOffset, issueId: issue.id, start: startOffset };
  }

  // Stored offsets are authoritative evidence. If they no longer match the
  // immutable draft, do not silently relocate the issue to similar wording.
  if (hasStoredOffset) return null;

  if (!evidence) return null;

  const firstMatch = essay.indexOf(evidence);
  if (firstMatch < 0 || firstMatch !== essay.lastIndexOf(evidence)) return null;

  return {
    end: firstMatch + evidence.length,
    issueId: issue.id,
    start: firstMatch,
  };
}

/**
 * Splits an immutable Version 1 essay into display segments without changing a
 * character. Exact spans are kept; a smaller span nested inside a larger one
 * is shown together with it (the larger span is split around it). Ambiguous
 * evidence and partially-overlapping spans are deliberately left unmarked: a
 * missing highlight is safer than pointing at the wrong text.
 */
export function buildFeedbackSegments(
  essay: string,
  issues: FeedbackIssue[],
): FeedbackTextSegment[] {
  const annotations = issues
    .map((issue) => exactSourceSpan(essay, issue))
    .filter(
      (annotation): annotation is ResolvedAnnotation => annotation !== null,
    )
    // Longer spans first so an outer span is placed before its nested inner
    // span, which then splits it instead of being dropped.
    .sort((left, right) => left.start - right.start || right.end - left.end);

  if (annotations.length === 0) return [{ kind: "text", text: essay }];

  const placed: ResolvedAnnotation[] = [];
  const place = (annotation: ResolvedAnnotation): void => {
    for (const existing of placed) {
      const overlaps =
        annotation.start < existing.end && annotation.end > existing.start;
      if (!overlaps) continue;
      // A span fully contained inside an existing one is a nested highlight:
      // split the outer span around it so both remain visible.
      if (
        annotation.start >= existing.start &&
        annotation.end <= existing.end
      ) {
        const index = placed.indexOf(existing);
        placed.splice(index, 1);
        if (existing.start < annotation.start) {
          placed.push({
            end: annotation.start,
            issueId: existing.issueId,
            start: existing.start,
          });
        }
        placed.push(annotation);
        if (annotation.end < existing.end) {
          placed.push({
            end: existing.end,
            issueId: existing.issueId,
            start: annotation.end,
          });
        }
        return;
      }
      // Partially overlapping spans are ambiguous; drop the later one.
      return;
    }
    placed.push(annotation);
  };
  for (const annotation of annotations) place(annotation);

  placed.sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );

  const segments: FeedbackTextSegment[] = [];
  let cursor = 0;
  for (const annotation of placed) {
    if (annotation.start > cursor) {
      segments.push({
        kind: "text",
        text: essay.slice(cursor, annotation.start),
      });
    }
    segments.push({
      issueId: annotation.issueId,
      kind: "issue",
      text: essay.slice(annotation.start, annotation.end),
    });
    cursor = annotation.end;
  }
  if (cursor < essay.length) {
    segments.push({ kind: "text", text: essay.slice(cursor) });
  }
  return segments;
}
