import type { FeedbackIssue } from "./types";

type Issue = Pick<
  FeedbackIssue,
  "id" | "issueType" | "severity" | "priority" | "skillId"
>;
export type FeedbackGroup = "must_fix" | "naturalness" | "polish";

export function feedbackGroup(
  issue: Pick<Issue, "issueType" | "severity">,
): FeedbackGroup {
  return issue.issueType === "OPTIONAL_POLISH" ? "polish" : issue.severity;
}

/** A short reading plan, not another score or a replacement for the full report. */
export function priorityFeedback<T extends Issue>(
  issues: readonly T[],
  targetId?: string | null,
): T[] {
  const rank = { must_fix: 0, naturalness: 1, polish: 2 };
  const seen = new Set<string>();
  return [...issues]
    .filter((issue) => feedbackGroup(issue) !== "polish")
    .sort(
      (left, right) =>
        rank[feedbackGroup(left)] - rank[feedbackGroup(right)] ||
        Number(right.id === targetId) - Number(left.id === targetId) ||
        left.priority - right.priority,
    )
    .filter((issue) => {
      const key = issue.skillId ?? issue.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}
