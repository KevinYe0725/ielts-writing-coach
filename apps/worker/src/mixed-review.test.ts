import { describe, expect, it } from "vitest";

import { buildMixedReviewObservation } from "./mixed-review";

const base = {
  evidenceId: "0198a8ea-6d70-7000-8000-000000000001",
  reviewTaskId: "0198a8ea-6d70-7000-8000-000000000002",
  userId: "learner-1",
  sourceSkillId: "collocation_perspective" as const,
  targetCycleId: "0198a8ea-6d70-7000-8000-000000000003",
  targetAttemptId: "0198a8ea-6d70-7000-8000-000000000004",
  targetTopicId: "technology",
  occurredAt: "2026-08-27T12:00:00.000Z",
  assisted: false,
  providerKind: "openai",
};

describe("D14 mixed review observation", () => {
  it("records recurrence without making it mastery evidence", () => {
    const observation = buildMixedReviewObservation({
      ...base,
      issues: [
        {
          id: "0198a8ea-6d70-7000-8000-000000000005",
          skillId: "collocation_perspective",
          confidence: 0.91,
          diagnosis: { source: "AI_CLASSIFICATION" },
        },
      ],
    });

    expect(observation.recurred).toBe(true);
    expect(observation.result.outcome).toBe("RECURRED");
    expect(observation.canonicalEvidence).toMatchObject({
      kind: "RECURRENCE",
      outcome: "FAIL",
      coreErrorRecurred: true,
      targetPrompted: false,
      validForStateTransition: false,
    });
  });

  it("does not turn absence from a bounded issue list into mastery", () => {
    const observation = buildMixedReviewObservation({
      ...base,
      issues: [],
    });

    expect(observation.recurred).toBe(false);
    expect(observation.result.outcome).toBe("NOT_AMONG_DETECTED_ISSUES");
    expect(observation.canonicalEvidence).toMatchObject({
      outcome: "PASS",
      validForStateTransition: false,
      confidence: 0.5,
    });
  });

  it("ignores the deterministic fallback and labels Mock as demo-only", () => {
    const observation = buildMixedReviewObservation({
      ...base,
      providerKind: "mock",
      issues: [
        {
          id: "0198a8ea-6d70-7000-8000-000000000006",
          skillId: "collocation_perspective",
          confidence: 0.6,
          diagnosis: { source: "SYNTHETIC_FALLBACK" },
        },
      ],
    });

    expect(observation.recurred).toBe(false);
    expect(observation.result.language_scoring).toBe("DEMO_ONLY");
  });
});
