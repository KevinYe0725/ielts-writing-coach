import { describe, expect, it } from "vitest";

import { getUniqueNextAction } from "./next-action";
import {
  createLearningSchedule,
  isDue,
  recordInstructionExposure,
  unlockRewriteAfterInstruction,
} from "./schedule";
import {
  InvalidLearningTransitionError,
  transitionLesson,
  transitionRewrite,
  transitionTrainingCycle,
  transitionTransfer,
} from "./state-machines";

describe("independent deterministic state machines", () => {
  it("allows only declared TrainingCycle and subtask transitions", () => {
    expect(transitionTrainingCycle("QUESTION_READY", "ATTEMPT_1_ACTIVE")).toBe(
      "ATTEMPT_1_ACTIVE",
    );
    expect(transitionLesson("ACTIVE", "TIMEBOX_EXPIRED")).toBe(
      "TIMEBOX_EXPIRED",
    );
    expect(transitionRewrite("LOCKED", "RESCHEDULED")).toBe("RESCHEDULED");
    expect(transitionRewrite("SKIPPED_PREREQUISITE", "ACTIVE")).toBe("ACTIVE");
    expect(transitionTransfer("READY", "NO_OPPORTUNITY")).toBe(
      "NO_OPPORTUNITY",
    );
    expect(transitionTransfer("NO_OPPORTUNITY", "RESCHEDULED")).toBe(
      "RESCHEDULED",
    );

    expect(() =>
      transitionTrainingCycle("QUESTION_READY", "REWRITE_READY"),
    ).toThrow(InvalidLearningTransitionError);
    expect(() => transitionLesson("CORE_COMPLETED", "ACTIVE")).toThrow(
      InvalidLearningTransitionError,
    );
    expect(() => transitionRewrite("COMPLETED", "READY")).toThrow(
      InvalidLearningTransitionError,
    );
    expect(() => transitionTransfer("NO_OPPORTUNITY", "COMPLETED")).toThrow(
      InvalidLearningTransitionError,
    );
  });
});

describe("D1-D2, D5-D7, and D14 schedule", () => {
  const D0 = "2026-08-13T08:00:00.000Z";

  it("preplans windows but leaves formal rewrite dueAt null until instruction resolves", () => {
    const schedule = createLearningSchedule(D0);
    expect(schedule.lessonWindowEndsAt).toBe("2026-08-14T08:00:00.000Z");
    expect(schedule.rewrite).toEqual({
      targetRewriteAt: "2026-08-14T08:00:00.000Z",
      targetWindowEndsAt: "2026-08-15T08:00:00.000Z",
      dueAt: null,
      lastInstructionExposureAt: null,
    });
    expect(schedule.transfer).toEqual({
      windowStartsAt: "2026-08-18T08:00:00.000Z",
      windowEndsAt: "2026-08-20T08:00:00.000Z",
      dueAt: "2026-08-18T08:00:00.000Z",
    });
    expect(schedule.mixedReview.dueAt).toBe("2026-08-27T08:00:00.000Z");
    expect(isDue(schedule.rewrite.dueAt, "2026-08-20T00:00:00.000Z")).toBe(
      false,
    );
  });

  it("unlocks at 24-48 hours and resets after later substantive instruction", () => {
    const schedule = createLearningSchedule(D0);
    const unlocked = unlockRewriteAfterInstruction(
      schedule,
      "2026-08-13T12:00:00.000Z",
      36,
    );
    expect(unlocked.rewrite.dueAt).toBe("2026-08-15T00:00:00.000Z");

    const exposedAgain = recordInstructionExposure(
      unlocked,
      "2026-08-14T18:00:00.000Z",
    );
    expect(exposedAgain.rewrite.dueAt).toBe("2026-08-15T18:00:00.000Z");
    expect(exposedAgain.rewrite.lastInstructionExposureAt).toBe(
      "2026-08-14T18:00:00.000Z",
    );
    expect(() => unlockRewriteAfterInstruction(schedule, D0, 12)).toThrow(
      RangeError,
    );
  });
});

describe("unique next action", () => {
  const base = {
    now: "2026-08-15T08:00:00.000Z",
    cycle: {
      id: "cycle-1",
      state: "REWRITE_LOCKED" as const,
      lessonId: "lesson-1",
      lessonStatus: "TIMEBOX_EXPIRED" as const,
      rewrite: {
        id: "rewrite-1",
        status: "LOCKED" as const,
        dueAt: null,
        expiresAt: null,
      },
    },
    transfers: [],
  };

  it("prioritizes the unfinished core path and never invents an overdue rewrite without dueAt", () => {
    const next = getUniqueNextAction(base);
    expect(next).toMatchObject({
      kind: "COMPLETE_CORE_PREREQUISITE",
      entityId: "lesson-1",
      dueAt: null,
      overdue: false,
    });
  });

  it("offers the explicitly requested rewrite while keeping it out of retention evidence", () => {
    const next = getUniqueNextAction({
      ...base,
      cycle: {
        ...base.cycle,
        rewrite: {
          id: "rewrite-1",
          status: "SKIPPED_PREREQUISITE",
          dueAt: "2026-08-15T08:00:00.000Z",
          expiresAt: null,
        },
      },
    });
    expect(next.kind).toBe("START_REWRITE");
    expect(next.entityId).toBe("rewrite-1");
    expect(next.reason).toContain("cannot create retention evidence");
  });

  it("offers a prerequisite-skipped rewrite immediately even when its provisional target was later", () => {
    const next = getUniqueNextAction({
      ...base,
      cycle: {
        ...base.cycle,
        rewrite: {
          id: "rewrite-1",
          status: "SKIPPED_PREREQUISITE",
          dueAt: "2026-08-20T08:00:00.000Z",
          expiresAt: null,
        },
      },
    });
    expect(next).toMatchObject({
      kind: "START_REWRITE",
      entityId: "rewrite-1",
      overdue: false,
    });
  });

  it("requires an explicit rewrite reschedule after the server window expires", () => {
    const next = getUniqueNextAction({
      ...base,
      cycle: {
        ...base.cycle,
        lessonStatus: "CORE_COMPLETED",
        rewrite: {
          id: "rewrite-expired",
          status: "READY",
          dueAt: "2026-08-13T08:00:00.000Z",
          expiresAt: "2026-08-14T08:00:00.000Z",
        },
      },
    });
    expect(next).toMatchObject({
      kind: "RESCHEDULE_REWRITE",
      entityId: "rewrite-expired",
      overdue: true,
    });
  });

  it("chooses the earliest due transfer after core completion, with an ID tie-breaker", () => {
    const next = getUniqueNextAction({
      ...base,
      cycle: {
        ...base.cycle,
        state: "CORE_CYCLE_COMPLETED",
        lessonStatus: "CORE_COMPLETED",
        rewrite: {
          id: "rewrite-1",
          status: "COMPLETED",
          dueAt: "2026-08-14T08:00:00.000Z",
          expiresAt: null,
        },
      },
      transfers: [
        {
          id: "transfer-b",
          status: "READY",
          dueAt: "2026-08-15T00:00:00.000Z",
          expiresAt: null,
        },
        {
          id: "transfer-a",
          status: "READY",
          dueAt: "2026-08-15T00:00:00.000Z",
          expiresAt: null,
        },
      ],
    });
    expect(next).toMatchObject({
      kind: "START_TRANSFER",
      entityId: "transfer-a",
    });
  });

  it("requires an explicit transfer reschedule after the server window expires", () => {
    const next = getUniqueNextAction({
      ...base,
      cycle: {
        ...base.cycle,
        state: "CORE_CYCLE_COMPLETED",
        lessonStatus: "CORE_COMPLETED",
        rewrite: {
          id: "rewrite-1",
          status: "COMPLETED",
          dueAt: "2026-08-14T08:00:00.000Z",
          expiresAt: null,
        },
      },
      transfers: [
        {
          id: "transfer-expired",
          status: "READY",
          dueAt: "2026-08-10T08:00:00.000Z",
          expiresAt: "2026-08-12T08:00:00.000Z",
        },
      ],
    });
    expect(next).toMatchObject({
      kind: "RESCHEDULE_TRANSFER",
      entityId: "transfer-expired",
      overdue: true,
    });
  });
});
