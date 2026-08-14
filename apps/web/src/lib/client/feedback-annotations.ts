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
 * character. Ambiguous, mismatched, or overlapping evidence is deliberately
 * left unmarked: a missing highlight is safer than pointing at the wrong text.
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
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const accepted: ResolvedAnnotation[] = [];
  let coveredUntil = 0;

  for (const annotation of annotations) {
    if (annotation.start < coveredUntil) continue;
    accepted.push(annotation);
    coveredUntil = annotation.end;
  }

  if (accepted.length === 0) return [{ kind: "text", text: essay }];

  const segments: FeedbackTextSegment[] = [];
  let cursor = 0;

  for (const annotation of accepted) {
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
