import { describe, expect, it } from "vitest";
import { feedbackGroup, priorityFeedback } from "./feedback-priorities";

describe("actionable report priorities", () => {
  it("keeps optional polish out of the priority list, even when an old record calls it mandatory", () => {
    const polish = {
      id: "style",
      issueType: "OPTIONAL_POLISH" as const,
      severity: "must_fix" as const,
      priority: 1,
    };
    expect(feedbackGroup(polish)).toBe("polish");
    expect(priorityFeedback([polish], "style")).toEqual([]);
  });

  it("shows corrections first and groups repeated instances of the same skill without changing the original order", () => {
    const issues = [
      {
        id: "words",
        issueType: "NATURALNESS" as const,
        severity: "naturalness" as const,
        priority: 1,
      },
      {
        id: "grammar-1",
        issueType: "GRAMMAR" as const,
        severity: "must_fix" as const,
        priority: 2,
        skillId: "agreement",
      },
      {
        id: "grammar-2",
        issueType: "GRAMMAR" as const,
        severity: "must_fix" as const,
        priority: 3,
        skillId: "agreement",
      },
      {
        id: "logic",
        issueType: "LOGIC" as const,
        severity: "must_fix" as const,
        priority: 4,
      },
    ];
    expect(priorityFeedback(issues, "logic").map((item) => item.id)).toEqual([
      "logic",
      "grammar-1",
      "words",
    ]);
    expect(issues.map((item) => item.id)).toEqual([
      "words",
      "grammar-1",
      "grammar-2",
      "logic",
    ]);
  });
});
