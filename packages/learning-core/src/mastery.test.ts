import { describe, expect, it } from "vitest";

import type {
  EvidenceKind,
  SkillEvidenceEvent,
  UserSkillState,
} from "@iwc/learning-contracts";

import {
  evaluateAppliedGate,
  evaluateRetainedGate,
  evaluateTransferredGate,
  updateUserSkillState,
} from "./mastery";

function evidence(
  id: string,
  kind: EvidenceKind,
  overrides: Partial<SkillEvidenceEvent> = {},
): SkillEvidenceEvent {
  return {
    schemaVersion: "1.0.0",
    id,
    userId: "user-1",
    skillId: "collocation_perspective",
    objectiveId: "objective-1",
    kind,
    outcome: "PASS",
    independent: true,
    firstAttempt: true,
    hintLevel: "NONE",
    confidence: 0.92,
    validForStateTransition: true,
    adjudicationStatus: "ACCEPTED",
    contextId: `context-${id}`,
    topicId: "education",
    sourceEntityType: "EXERCISE",
    sourceEntityId: `source-${id}`,
    occurredAt: "2026-08-13T12:00:00.000Z",
    ...overrides,
  };
}

describe("hard mastery gates", () => {
  it("requires two distinct blind generations, integrated near transfer, and an unseen exit for applied", () => {
    const events = [
      evidence("generation-1", "INDEPENDENT_GENERATION", {
        contextId: "students-face-pressure",
      }),
      evidence("generation-2", "INDEPENDENT_GENERATION", {
        contextId: "courses-place-pressure",
      }),
      evidence("integrated", "INTEGRATED_APPLICATION", {
        contextId: "micro-paragraph",
        naturalOpportunity: true,
        coreErrorRecurred: false,
      }),
      evidence("exit", "EXIT_TEST", {
        contextId: "workload-exit",
        unseenSurfaceForm: true,
      }),
    ];
    expect(
      evaluateAppliedGate("collocation_perspective", events),
    ).toMatchObject({
      passed: true,
      noOpportunity: false,
      missing: [],
      finalMastery: false,
    });

    const repeatedContext = events.map((event) =>
      event.kind === "INDEPENDENT_GENERATION"
        ? { ...event, contextId: "same-context" }
        : event,
    );
    expect(
      evaluateAppliedGate("collocation_perspective", repeatedContext).passed,
    ).toBe(false);
  });

  it("treats low-confidence evidence and no natural opportunity as no transition", () => {
    const events = [
      evidence("generation-1", "INDEPENDENT_GENERATION", { contextId: "one" }),
      evidence("generation-2", "INDEPENDENT_GENERATION", { contextId: "two" }),
      evidence("integrated", "INTEGRATED_APPLICATION", {
        confidence: 0.4,
        naturalOpportunity: true,
        coreErrorRecurred: false,
      }),
      evidence("exit", "EXIT_TEST", { unseenSurfaceForm: true }),
    ];
    expect(evaluateAppliedGate("collocation_perspective", events).passed).toBe(
      false,
    );

    const noOpportunity = evidence(
      "integrated-none",
      "INTEGRATED_APPLICATION",
      {
        outcome: "NO_OPPORTUNITY",
        independent: false,
        firstAttempt: false,
        naturalOpportunity: false,
      },
    );
    const result = evaluateAppliedGate("collocation_perspective", [
      ...events,
      noOpportunity,
    ]);
    expect(result.noOpportunity).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("requires at least 24 hours, no assistance, and no skipped prerequisite for retained", () => {
    const delayed = evidence("rewrite", "DELAYED_REWRITE", {
      sourceEntityType: "REWRITE",
      naturalOpportunity: true,
      targetPrompted: false,
      instructionExposureAt: "2026-08-13T12:00:00.000Z",
      occurredAt: "2026-08-14T12:00:00.000Z",
      prerequisiteSkipped: false,
      assisted: false,
    });
    expect(
      evaluateRetainedGate("collocation_perspective", "applied", [delayed])
        .passed,
    ).toBe(true);
    expect(
      evaluateRetainedGate("collocation_perspective", "applied", [
        { ...delayed, id: "early", occurredAt: "2026-08-13T13:00:00.000Z" },
      ]).passed,
    ).toBe(false);
    expect(
      evaluateRetainedGate("collocation_perspective", "applied", [
        { ...delayed, id: "skipped", prerequisiteSkipped: true },
      ]).passed,
    ).toBe(false);
    expect(
      evaluateRetainedGate("collocation_perspective", "applied", [
        { ...delayed, id: "assisted", assisted: true },
      ]).passed,
    ).toBe(false);
  });

  it("requires prior retention and a different-topic natural opportunity for transferred", () => {
    const transfer = evidence("transfer", "CROSS_TOPIC_TRANSFER", {
      sourceEntityType: "TRANSFER",
      topicId: "public-transport",
      naturalOpportunity: true,
      targetPrompted: false,
    });
    const passed = evaluateTransferredGate(
      "collocation_perspective",
      "retained",
      "education",
      [transfer],
    );
    expect(passed).toMatchObject({ passed: true, finalMastery: false });
    expect(
      evaluateTransferredGate(
        "collocation_perspective",
        "applied",
        "education",
        [transfer],
      ).passed,
    ).toBe(false);
    expect(
      evaluateTransferredGate(
        "collocation_perspective",
        "retained",
        "education",
        [{ ...transfer, id: "same-topic", topicId: "education" }],
      ).passed,
    ).toBe(false);
  });
});

describe("skill state stability", () => {
  it("never lowers historical highest level when a recurrence occurs", () => {
    const current: UserSkillState = {
      skillId: "collocation_perspective",
      highestAttainedLevel: "transferred",
      currentStability: "stable",
      latestLessonOutcome: "applied",
      recurrenceCount: 0,
      consecutiveIndependentSuccesses: 3,
    };
    const next = updateUserSkillState(current, {
      attainedLevel: "practicing",
      evidence: evidence("recurrence", "RECURRENCE", { outcome: "FAIL" }),
    });
    expect(next.highestAttainedLevel).toBe("transferred");
    expect(next.currentStability).toBe("needs_review");
    expect(next.recurrenceCount).toBe(1);
    expect(next.consecutiveIndependentSuccesses).toBe(0);
  });
});
