import { describe, expect, it } from "vitest";

import {
  decideLessonAdaptivePath,
  effectiveLessonElapsedSeconds,
  lessonTimeboxExpired,
  productiveSecondsDelta,
  type RuntimeLessonItem,
} from "./lesson-runtime";

const items: RuntimeLessonItem[] = [
  {
    id: "pretest",
    ordinal: 1,
    path: "CORE",
    evidenceOpportunity: "PRETEST",
  },
  {
    id: "generation-a",
    ordinal: 2,
    path: "CORE",
    evidenceOpportunity: "INDEPENDENT_GENERATION",
  },
  {
    id: "generation-b",
    ordinal: 3,
    path: "CORE",
    evidenceOpportunity: "INDEPENDENT_GENERATION",
  },
  {
    id: "optional-repeat",
    ordinal: 4,
    path: "CORE",
    evidenceOpportunity: "OTHER",
  },
  {
    id: "exit",
    ordinal: 5,
    path: "CORE",
    evidenceOpportunity: "EXIT_TEST",
  },
  {
    id: "repair",
    ordinal: 6,
    path: "FLEX",
    evidenceOpportunity: "OTHER",
  },
  {
    id: "fresh",
    ordinal: 7,
    path: "FLEX",
    evidenceOpportunity: "INDEPENDENT_GENERATION",
  },
  {
    id: "third-remedy",
    ordinal: 8,
    path: "FLEX",
    evidenceOpportunity: "OTHER",
  },
];

describe("lesson adaptive runtime", () => {
  it("activates one two-item remedial layer after consecutive genuine failures", () => {
    const decision = decideLessonAdaptivePath({
      items,
      evaluations: [
        {
          itemId: "pretest",
          passed: false,
          firstAttemptPassed: false,
          demoOnly: false,
          createdAt: new Date("2026-08-13T10:00:00Z"),
        },
        {
          itemId: "generation-a",
          passed: false,
          firstAttemptPassed: false,
          demoOnly: false,
          createdAt: new Date("2026-08-13T10:01:00Z"),
        },
      ],
    });
    expect(decision.adaptive.remediationDepth).toBe(1);
    expect(decision.adaptive.activatedFlexItemIds).toEqual(["repair", "fresh"]);
    expect(decision.activeItemIds).toEqual([
      "pretest",
      "generation-a",
      "repair",
      "fresh",
      "generation-b",
      "optional-repeat",
      "exit",
    ]);
  });

  it("does not treat two evaluations of one answer as two consecutive errors", () => {
    const decision = decideLessonAdaptivePath({
      items,
      evaluations: [
        {
          itemId: "generation-a",
          passed: false,
          firstAttemptPassed: false,
          demoOnly: false,
          createdAt: new Date("2026-08-13T10:00:00Z"),
        },
        {
          itemId: "generation-a",
          passed: false,
          firstAttemptPassed: false,
          demoOnly: false,
          createdAt: new Date("2026-08-13T10:01:00Z"),
        },
      ],
    });

    expect(decision.remediationActive).toBe(false);
    expect(decision.adaptive.activatedFlexItemIds).toEqual([]);
  });

  it("keeps low-confidence neutral judgments out of failure branching", () => {
    const decision = decideLessonAdaptivePath({
      items,
      evaluations: [
        {
          itemId: "pretest",
          passed: false,
          firstAttemptPassed: false,
          neutral: true,
          supplementRequired: true,
          demoOnly: false,
          createdAt: new Date("2026-08-13T10:00:00Z"),
        },
        {
          itemId: "generation-a",
          passed: false,
          firstAttemptPassed: false,
          neutral: true,
          supplementRequired: true,
          demoOnly: false,
          createdAt: new Date("2026-08-13T10:01:00Z"),
        },
      ],
    });
    expect(decision.remediationActive).toBe(false);
    expect(decision.adaptive.activatedFlexItemIds).toEqual([]);
  });

  it("never branches on Mock output and never skips an evidence opportunity", () => {
    const evaluations = ["generation-a", "generation-b"].map(
      (itemId, index) => ({
        itemId,
        passed: true,
        firstAttemptPassed: true,
        demoOnly: false,
        createdAt: new Date(`2026-08-13T10:0${index}:00Z`),
      }),
    );
    const decision = decideLessonAdaptivePath({
      items,
      evaluations: [
        ...evaluations,
        {
          itemId: "pretest",
          passed: false,
          firstAttemptPassed: false,
          demoOnly: true,
          createdAt: new Date("2026-08-13T10:02:00Z"),
        },
      ],
    });
    expect(decision.remediationActive).toBe(false);
    expect(decision.adaptive.skippedItemIds).toEqual(["optional-repeat"]);
    expect(decision.activeItemIds).toContain("exit");
  });

  it("does not skip redundancy after non-consecutive independent success", () => {
    const decision = decideLessonAdaptivePath({
      items: [
        ...items,
        {
          id: "generation-c",
          ordinal: 3.5,
          path: "CORE",
          evidenceOpportunity: "INDEPENDENT_GENERATION",
        },
      ],
      evaluations: [
        {
          itemId: "generation-a",
          passed: true,
          firstAttemptPassed: true,
          demoOnly: false,
          createdAt: new Date("2026-08-13T10:00:00Z"),
        },
        {
          itemId: "generation-b",
          passed: false,
          firstAttemptPassed: false,
          demoOnly: false,
          createdAt: new Date("2026-08-13T10:01:00Z"),
        },
        {
          itemId: "generation-c",
          passed: true,
          firstAttemptPassed: true,
          demoOnly: false,
          createdAt: new Date("2026-08-13T10:02:00Z"),
        },
      ],
    });

    expect(decision.adaptive.skippedItemIds).toEqual([]);
    expect(decision.activeItemIds).toContain("optional-repeat");
  });

  it("tracks wall and productive time without double-counting retries", () => {
    expect(
      effectiveLessonElapsedSeconds({
        elapsedSeconds: 600,
        activeStartedAt: new Date("2026-08-13T10:00:00Z"),
        now: new Date("2026-08-13T10:10:00Z"),
      }),
    ).toBe(1_200);
    expect(productiveSecondsDelta(70, [40, 55])).toBe(15);
    expect(productiveSecondsDelta(20, [55])).toBe(20);
    expect(
      lessonTimeboxExpired({
        elapsedSeconds: 3_500,
        activeStartedAt: new Date("2026-08-13T10:00:00Z"),
        now: new Date("2026-08-13T10:02:00Z"),
        state: {},
      }),
    ).toBe(true);
  });
});
