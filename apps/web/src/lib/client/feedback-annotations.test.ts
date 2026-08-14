import { describe, expect, it } from "vitest";

import type { FeedbackIssue } from "./types";
import { buildFeedbackSegments } from "./feedback-annotations";

const issue = (
  id: string,
  evidence: string,
  offsets?: { startOffset: number; endOffset: number },
): FeedbackIssue => ({
  id,
  priority: 1,
  categoryZh: "语法",
  categoryEn: "Grammar",
  titleZh: "修改这一处",
  titleEn: "Revise this span",
  evidence,
  explanationZh: "解释",
  explanationEn: "Explanation",
  transferRuleZh: "规则",
  transferRuleEn: "Rule",
  issueType: "GRAMMAR",
  correctedVersion: "Correction",
  knowledgePointZh: "知识点",
  severity: "must_fix",
  confidence: 0.9,
  startOffset: offsets?.startOffset ?? null,
  endOffset: offsets?.endOffset ?? null,
});

describe("feedback essay annotations", () => {
  it("builds ordered text and issue segments from exact immutable offsets", () => {
    const essay = "Alpha error. Beta issue.";
    const segments = buildFeedbackSegments(essay, [
      issue("beta", "issue", { startOffset: 18, endOffset: 23 }),
      issue("alpha", "error", { startOffset: 6, endOffset: 11 }),
    ]);

    expect(segments).toEqual([
      { kind: "text", text: "Alpha " },
      { issueId: "alpha", kind: "issue", text: "error" },
      { kind: "text", text: ". Beta " },
      { issueId: "beta", kind: "issue", text: "issue" },
      { kind: "text", text: "." },
    ]);
  });

  it("uses an exact-text fallback only when the historical excerpt is unique", () => {
    expect(
      buildFeedbackSegments("One rare phrase here.", [
        issue("legacy", "rare phrase"),
      ]),
    ).toContainEqual({
      issueId: "legacy",
      kind: "issue",
      text: "rare phrase",
    });

    expect(
      buildFeedbackSegments("repeat and repeat", [
        issue("ambiguous", "repeat"),
      ]),
    ).toEqual([{ kind: "text", text: "repeat and repeat" }]);
  });

  it("keeps the source unchanged and marks each repeated excerpt only with stored offsets", () => {
    const essay = "repeat and repeat";
    const segments = buildFeedbackSegments(essay, [
      issue("first", "repeat", { startOffset: 0, endOffset: 6 }),
      issue("second", "repeat", { startOffset: 11, endOffset: 17 }),
    ]);

    expect(segments.map((segment) => segment.text).join("")).toBe(essay);
    expect(
      segments.flatMap((segment) =>
        segment.kind === "issue" ? [segment.issueId] : [],
      ),
    ).toEqual(["first", "second"]);
  });

  it("omits invalid, mismatched and overlapping annotations instead of guessing", () => {
    const essay = "abcdefghij";
    expect(
      buildFeedbackSegments(essay, [
        issue("valid", "cdef", { startOffset: 2, endOffset: 6 }),
        issue("overlap", "efgh", { startOffset: 4, endOffset: 8 }),
        issue("mismatch", "abcd", { startOffset: 6, endOffset: 10 }),
      ]),
    ).toEqual([
      { kind: "text", text: "ab" },
      { issueId: "valid", kind: "issue", text: "cdef" },
      { kind: "text", text: "ghij" },
    ]);
  });
});
