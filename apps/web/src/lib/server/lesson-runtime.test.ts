import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  evaluation,
  exerciseAttempt,
  exerciseItem,
  learningObjective,
  lessonPlan,
  newDomainId,
  question,
  trainingCycle,
  user,
} from "@iwc/db";

import {
  AUTO_SPLIT_MAX_SECONDS,
  buildAutoSplitModules,
  currentAutoSplitItemIds,
  deriveLessonProgress,
  expireLessonRuntime,
  lessonEvidenceApplied,
  lessonRuntimeSnapshot,
  normalizeLessonRuntimeState,
  pauseLessonRuntime,
  recordAbnormalInterruption,
  refresherPlanForItem,
  startLessonRuntime,
  type AttemptWithEvaluations,
  type ExerciseItemRow,
} from "./lesson-runtime";

describe("lesson runtime server projection", () => {
  it("opens the applied gate only from a complete current-cycle evidence set", () => {
    const evidence = (
      id: string,
      kind: "INDEPENDENT_GENERATION" | "INTEGRATED_APPLICATION" | "EXIT_TEST",
      extra: Record<string, unknown> = {},
    ) => ({
      canonicalEvidence: {
        schemaVersion: "1.0.0",
        id,
        userId: "learner-1",
        skillId: "collocation_perspective",
        kind,
        outcome: "PASS",
        independent: true,
        firstAttempt: true,
        hintLevel: "NONE",
        confidence: 0.95,
        validForStateTransition: true,
        adjudicationStatus: "ACCEPTED",
        contextId: `context-${id}`,
        topicId: "education",
        sourceEntityType: "EXERCISE",
        sourceEntityId: `attempt-${id}`,
        occurredAt: "2026-08-13T12:00:00.000Z",
        ...extra,
      },
    });
    const currentCyclePayloads = [
      evidence("generation-1", "INDEPENDENT_GENERATION"),
      evidence("generation-2", "INDEPENDENT_GENERATION"),
      evidence("integrated", "INTEGRATED_APPLICATION", {
        naturalOpportunity: true,
        coreErrorRecurred: false,
      }),
      evidence("exit", "EXIT_TEST", { unseenSurfaceForm: true }),
    ];

    expect(
      lessonEvidenceApplied("collocation_perspective", currentCyclePayloads),
    ).toBe(true);
    expect(lessonEvidenceApplied("collocation_perspective", [])).toBe(false);
    expect(
      lessonEvidenceApplied(
        "collocation_perspective",
        currentCyclePayloads.map((payload) => ({
          canonicalEvidence: {
            ...payload.canonicalEvidence,
            validForStateTransition: false,
          },
        })),
      ),
    ).toBe(false);
  });

  it("keeps canonical plan data immutable while projecting an active clock", () => {
    const snapshot = lessonRuntimeSnapshot(
      {
        id: "00000000-0000-7000-8000-000000000001",
        cycleId: "00000000-0000-7000-8000-000000000002",
        coreSkillId: "collocation_perspective",
        schemaVersion: "1.0.0",
        plannedMinutes: 60,
        coreMinutes: 45,
        activeOutputRatio: 0.7,
        selectionRatio: 0,
        remediationMinutes: 15,
        stages: [],
        runtimeStatus: "ACTIVE",
        startedAt: new Date("2026-08-13T10:00:00Z"),
        activeStartedAt: new Date("2026-08-13T10:05:00Z"),
        pausedAt: null,
        timeboxExpiredAt: null,
        resolvedAt: null,
        elapsedSeconds: 300,
        productiveSeconds: 240,
        runtimeRevision: 2,
        runtimeState: {},
        createdAt: new Date("2026-08-13T10:00:00Z"),
        updatedAt: new Date("2026-08-13T10:00:00Z"),
      },
      new Date("2026-08-13T10:10:00Z"),
    );
    expect(snapshot.effectiveElapsedSeconds).toBe(600);
    expect(snapshot.productiveSeconds).toBe(240);
    expect(snapshot.timeboxExpired).toBe(false);
  });

  it("normalizes corrupt optional runtime values safely", () => {
    expect(normalizeLessonRuntimeState({ split: "bad" })).toMatchObject({
      split: "NONE",
      refresher: "NOT_REQUIRED",
    });
  });

  it("preserves an unscored meaning branch without turning it into mastery", () => {
    expect(
      normalizeLessonRuntimeState({
        split: "NONE",
        refresher: "NOT_REQUIRED",
        semanticBranch: "lighter_workload",
        semanticBranchSourceItemId: "meaning-fork",
      }),
    ).toMatchObject({
      semanticBranch: "lighter_workload",
      semanticBranchSourceItemId: "meaning-fork",
    });
  });

  it("treats low-confidence AI output as neutral and activates one extra evidence opportunity", () => {
    const row = (id: string, ordinal: number, path: "CORE" | "FLEX") =>
      ({
        id,
        ordinal,
        evaluationContract: {
          path,
          canonicalItem: { evidenceOpportunity: "OTHER" },
        },
      }) as unknown as ExerciseItemRow;
    const neutralAttempt = {
      id: "attempt-neutral",
      exerciseItemId: "open-card",
      evaluations: [
        {
          id: "evaluation-neutral",
          passed: false,
          feedback: { outcome: "NEUTRAL", firstAttemptPassed: "false" },
          versionSnapshot: { providerKind: "openai" },
          createdAt: new Date("2026-08-13T10:00:00Z"),
        },
      ],
    } as unknown as AttemptWithEvaluations;
    const progress = deriveLessonProgress({
      items: [row("open-card", 1, "CORE"), row("extra-evidence", 2, "FLEX")],
      attempts: [neutralAttempt],
    });
    expect(progress.completedItemIds).toContain("open-card");
    expect(progress.activeItemIds).toEqual(["open-card", "extra-evidence"]);
    expect(progress.nextItemId).toBe("extra-evidence");
    expect(progress.remediationActive).toBe(true);
  });

  it("does not activate supplemental evidence for an unscored meaning fork", () => {
    const item = {
      id: "meaning-fork",
      ordinal: 1,
      evaluationContract: {
        path: "CORE",
        canonicalItem: { evidenceOpportunity: "OTHER" },
      },
    } as unknown as ExerciseItemRow;
    const attempt = {
      id: "attempt-meaning",
      exerciseItemId: "meaning-fork",
      evaluations: [
        {
          id: "evaluation-meaning",
          passed: false,
          feedback: { outcome: "NEUTRAL", firstAttemptPassed: "false" },
          versionSnapshot: { providerKind: "deterministic" },
          createdAt: new Date("2026-08-13T10:00:00Z"),
        },
      ],
    } as unknown as AttemptWithEvaluations;
    const progress = deriveLessonProgress({
      items: [item],
      attempts: [attempt],
    });
    expect(progress.completedItemIds).toEqual(["meaning-fork"]);
    expect(progress.remediationActive).toBe(false);
    expect(progress.nextItemId).toBeNull();
  });

  it("persists pause as a canonical ACTIVE sub-state and resumes its clock", () => {
    const plan = {
      id: "00000000-0000-7000-8000-000000000001",
      cycleId: "00000000-0000-7000-8000-000000000002",
      coreSkillId: "collocation_perspective",
      schemaVersion: "1.0.0",
      plannedMinutes: 60,
      coreMinutes: 45,
      activeOutputRatio: 0.7,
      selectionRatio: 0,
      remediationMinutes: 15,
      stages: [],
      runtimeStatus: "ACTIVE",
      startedAt: new Date("2026-08-13T10:00:00Z"),
      activeStartedAt: new Date("2026-08-13T10:00:00Z"),
      pausedAt: null,
      timeboxExpiredAt: null,
      resolvedAt: null,
      elapsedSeconds: 0,
      productiveSeconds: 0,
      runtimeRevision: 1,
      runtimeState: {},
      createdAt: new Date("2026-08-13T10:00:00Z"),
      updatedAt: new Date("2026-08-13T10:00:00Z"),
    };
    const paused = {
      ...plan,
      ...pauseLessonRuntime(plan, new Date("2026-08-13T10:05:00Z")),
    };
    expect(paused.runtimeStatus).toBe("ACTIVE");
    expect(lessonRuntimeSnapshot(paused).status).toBe("PAUSED");
    const resumed = {
      ...paused,
      ...startLessonRuntime(paused, new Date("2026-08-13T10:10:00Z")),
    };
    expect(resumed.activeStartedAt).toEqual(new Date("2026-08-13T10:10:00Z"));
  });

  it("counts only explicit abnormal interruptions and auto-splits remaining core after the second within seven days", () => {
    const item = (id: string, ordinal: number, expectedMinutes: number) =>
      ({
        id,
        ordinal,
        expectedMinutes,
        itemType: "SENTENCE_GENERATION",
        evaluationContract: {
          path: "CORE",
          canonicalItem: { evidenceOpportunity: "INDEPENDENT_GENERATION" },
        },
      }) as unknown as ExerciseItemRow;
    const items = [item("done", 1, 5), item("a", 2, 15), item("b", 3, 15)];
    const modules = buildAutoSplitModules(items, ["done"]);
    expect(modules).toEqual([
      { itemIds: ["a"], expectedMinutes: 15 },
      { itemIds: ["b"], expectedMinutes: 15 },
    ]);
    const base = {
      id: "00000000-0000-7000-8000-000000000001",
      cycleId: "00000000-0000-7000-8000-000000000002",
      coreSkillId: "collocation_perspective",
      schemaVersion: "1.0.0",
      plannedMinutes: 60,
      coreMinutes: 45,
      activeOutputRatio: 0.7,
      selectionRatio: 0,
      remediationMinutes: 15,
      stages: [],
      runtimeStatus: "ACTIVE",
      startedAt: new Date("2026-08-10T10:00:00Z"),
      activeStartedAt: new Date("2026-08-10T10:00:00Z"),
      pausedAt: null,
      timeboxExpiredAt: null,
      resolvedAt: null,
      elapsedSeconds: 0,
      productiveSeconds: 0,
      runtimeRevision: 1,
      runtimeState: {},
      createdAt: new Date("2026-08-10T10:00:00Z"),
      updatedAt: new Date("2026-08-10T10:00:00Z"),
    };
    const firstUpdate = recordAbnormalInterruption({
      plan: base,
      kind: "NETWORK",
      modules,
      now: new Date("2026-08-10T10:05:00Z"),
    });
    const first = { ...base, ...firstUpdate };
    expect(normalizeLessonRuntimeState(first.runtimeState)).toMatchObject({
      interruptions: [{ kind: "NETWORK" }],
      split: "NONE",
    });
    const resumed = {
      ...first,
      ...startLessonRuntime(first, new Date("2026-08-11T10:00:00Z")),
    };
    const secondUpdate = recordAbnormalInterruption({
      plan: resumed,
      kind: "USER_ABNORMAL",
      modules,
      now: new Date("2026-08-11T10:05:00Z"),
    });
    const second = { ...resumed, ...secondUpdate };
    const state = normalizeLessonRuntimeState(second.runtimeState);
    expect(state.interruptions).toHaveLength(2);
    expect(state.autoSplit?.maxSegmentSeconds).toBe(AUTO_SPLIT_MAX_SECONDS);
    expect(currentAutoSplitItemIds(state)).toEqual(["a"]);
    const splitResume = {
      ...second,
      ...startLessonRuntime(second, new Date("2026-08-12T10:00:00Z")),
    };
    const snapshot = lessonRuntimeSnapshot(
      splitResume,
      new Date("2026-08-12T10:00:00Z"),
    );
    expect(
      snapshot.segmentLimitSeconds - snapshot.effectiveElapsedSeconds,
    ).toBe(AUTO_SPLIT_MAX_SECONDS);
  });

  it("maps the failure location to the corresponding bounded refresher", () => {
    const item = (itemType: string, evidenceOpportunity: string) =>
      ({
        id: `item-${evidenceOpportunity}`,
        itemType,
        evaluationContract: { canonicalItem: { evidenceOpportunity } },
      }) as unknown as ExerciseItemRow;
    expect(
      refresherPlanForItem(item("MATCHING", "CONTROLLED_REPAIR")),
    ).toMatchObject({
      kind: "RULE_CONTRAST",
      durationMinutes: 10,
    });
    expect(
      refresherPlanForItem(
        item("SENTENCE_GENERATION", "INDEPENDENT_GENERATION"),
      ),
    ).toMatchObject({ kind: "SCAFFOLD_FADE", durationMinutes: 15 });
    expect(
      refresherPlanForItem(
        item("INTEGRATED_APPLICATION", "INTEGRATED_APPLICATION"),
      ),
    ).toMatchObject({ kind: "TIMED_PARAGRAPH", durationMinutes: 20 });
  });
});

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("lesson runtime persistence (PostgreSQL)", () => {
  it("persists the seven-day interruption window and 25-minute auto-split state", async () => {
    const database = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const userId = `lesson-interrupt-${suffix}`;
    const questionId = newDomainId();
    const cycleId = newDomainId();
    const planId = newDomainId();
    try {
      await database.db.insert(user).values({
        id: userId,
        name: "Lesson interruption test",
        email: `${suffix}@example.test`,
        role: "learner",
      });
      await database.db.insert(question).values({
        id: questionId,
        externalId: `interrupt-${suffix}`,
        source: "runtime_test",
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        prompt: "Should interrupted learning be split?",
      });
      await database.db.insert(trainingCycle).values({
        id: cycleId,
        userId,
        questionId,
        status: "LESSON_ACTIVE",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
      await database.db.insert(lessonPlan).values({
        id: planId,
        cycleId,
        coreSkillId: "collocation_perspective",
        schemaVersion: "1.0.0",
        coreMinutes: 45,
        activeOutputRatio: 0.7,
        selectionRatio: 0.1,
        remediationMinutes: 15,
        stages: [],
        runtimeStatus: "ACTIVE",
        startedAt: new Date("2026-08-10T10:00:00Z"),
        activeStartedAt: new Date("2026-08-10T10:00:00Z"),
      });
      const modules = [
        { itemIds: [newDomainId()], expectedMinutes: 20 },
        { itemIds: [newDomainId()], expectedMinutes: 25 },
      ];
      let stored = await database.db.query.lessonPlan.findFirst({
        where: eq(lessonPlan.id, planId),
      });
      const first = recordAbnormalInterruption({
        plan: stored!,
        kind: "NETWORK",
        modules,
        now: new Date("2026-08-10T10:05:00Z"),
      });
      await database.db
        .update(lessonPlan)
        .set(first)
        .where(eq(lessonPlan.id, planId));
      stored = await database.db.query.lessonPlan.findFirst({
        where: eq(lessonPlan.id, planId),
      });
      const resumed = { ...stored!, ...startLessonRuntime(stored!) };
      const second = recordAbnormalInterruption({
        plan: resumed,
        kind: "TIMER",
        modules,
        now: new Date("2026-08-11T10:05:00Z"),
      });
      await database.db
        .update(lessonPlan)
        .set(second)
        .where(eq(lessonPlan.id, planId));
      const reloaded = await database.db.query.lessonPlan.findFirst({
        where: eq(lessonPlan.id, planId),
      });
      expect(reloaded?.runtimeState.interruptions).toHaveLength(2);
      expect(reloaded?.runtimeState).toMatchObject({
        split: "SCHEDULED",
        segmentDurationSeconds: 1500,
        autoSplit: {
          maxSegmentSeconds: 1500,
          currentModuleIndex: 0,
          modules,
        },
      });
    } finally {
      await database.db.delete(user).where(eq(user.id, userId));
      await database.pool.end();
    }
  });

  it("keeps the authoritative elapsed clock across pause, reload, and resume", async () => {
    const database = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const userId = `lesson-pause-${suffix}`;
    const cycleId = newDomainId();
    const planId = newDomainId();
    const questionId = newDomainId();
    const sessionStart = new Date("2026-08-13T10:00:00.000Z");
    const firstActiveStart = new Date("2026-08-13T10:15:00.000Z");
    const pauseAt = new Date("2026-08-13T10:20:00.000Z");
    const resumeAt = new Date("2026-08-13T11:20:00.000Z");
    try {
      await database.db.insert(user).values({
        id: userId,
        name: "Lesson pause test",
        email: `${suffix}@example.test`,
        role: "learner",
      });
      await database.db.insert(question).values({
        id: questionId,
        externalId: `pause-${suffix}`,
        source: "runtime_test",
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        prompt: "Should lessons include regular breaks?",
      });
      await database.db.insert(trainingCycle).values({
        id: cycleId,
        userId,
        questionId,
        status: "LESSON_ACTIVE",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
      await database.db.insert(lessonPlan).values({
        id: planId,
        cycleId,
        coreSkillId: "collocation_perspective",
        schemaVersion: "1.0.0",
        coreMinutes: 45,
        activeOutputRatio: 0.7,
        selectionRatio: 0,
        remediationMinutes: 15,
        stages: [],
        runtimeStatus: "ACTIVE",
        startedAt: sessionStart,
        activeStartedAt: firstActiveStart,
        elapsedSeconds: 900,
      });

      const initial = await database.db.query.lessonPlan.findFirst({
        where: eq(lessonPlan.id, planId),
      });
      expect(initial).toBeDefined();
      const pause = pauseLessonRuntime(initial!, pauseAt);
      await database.db
        .update(lessonPlan)
        .set({ ...pause, runtimeRevision: initial!.runtimeRevision + 1 })
        .where(eq(lessonPlan.id, planId));

      const afterReload = await database.db.query.lessonPlan.findFirst({
        where: eq(lessonPlan.id, planId),
      });
      expect(afterReload).toBeDefined();
      const pausedSnapshot = lessonRuntimeSnapshot(
        afterReload!,
        new Date("2026-08-13T11:00:00.000Z"),
      );
      expect(pausedSnapshot).toMatchObject({
        status: "PAUSED",
        effectiveElapsedSeconds: 1_200,
      });
      expect(afterReload!.startedAt).toEqual(sessionStart);

      const resume = startLessonRuntime(afterReload!, resumeAt);
      await database.db
        .update(lessonPlan)
        .set({ ...resume, runtimeRevision: afterReload!.runtimeRevision + 1 })
        .where(eq(lessonPlan.id, planId));
      const resumedReload = await database.db.query.lessonPlan.findFirst({
        where: eq(lessonPlan.id, planId),
      });
      expect(resumedReload).toBeDefined();
      expect(resumedReload!.startedAt).toEqual(sessionStart);
      expect(resumedReload!.elapsedSeconds).toBe(1_200);
      expect(resumedReload!.activeStartedAt).toEqual(resumeAt);

      const expiry = expireLessonRuntime(
        resumedReload!,
        new Date("2026-08-13T12:00:00.000Z"),
      );
      expect(expiry).toMatchObject({
        runtimeStatus: "TIMEBOX_EXPIRED",
        elapsedSeconds: 3_600,
      });
    } finally {
      await database.db.delete(user).where(eq(user.id, userId));
      await database.pool.end();
    }
  });

  it("persists one bounded remedial branch and a hard timebox expiry", async () => {
    const database = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const userId = `lesson-runtime-${suffix}`;
    const cycleId = newDomainId();
    const planId = newDomainId();
    const objectiveId = newDomainId();
    const questionId = newDomainId();
    const coreIds = [newDomainId(), newDomainId(), newDomainId()];
    const flexIds = [newDomainId(), newDomainId(), newDomainId()];
    try {
      await database.db.insert(user).values({
        id: userId,
        name: "Lesson runtime test",
        email: `${suffix}@example.test`,
        role: "learner",
      });
      await database.db.insert(question).values({
        id: questionId,
        externalId: `runtime-${suffix}`,
        source: "runtime_test",
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach practical skills?",
      });
      await database.db.insert(trainingCycle).values({
        id: cycleId,
        userId,
        questionId,
        status: "LESSON_ACTIVE",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
      await database.db.insert(learningObjective).values({
        id: objectiveId,
        cycleId,
        skillId: "collocation_perspective",
        role: "CORE",
        sourceEvidenceIds: [newDomainId()],
        priority: 1,
        successCriterion: "Use the target independently.",
      });
      await database.db.insert(lessonPlan).values({
        id: planId,
        cycleId,
        coreSkillId: "collocation_perspective",
        schemaVersion: "1.0.0",
        coreMinutes: 45,
        activeOutputRatio: 0.7,
        selectionRatio: 0,
        remediationMinutes: 15,
        stages: [],
        runtimeStatus: "ACTIVE",
        startedAt: new Date(Date.now() - 3_700_000),
        activeStartedAt: new Date(Date.now() - 3_700_000),
      });
      await database.db.insert(exerciseItem).values(
        [...coreIds, ...flexIds].map((id, index) => ({
          id,
          lessonPlanId: planId,
          learningObjectiveId: objectiveId,
          ordinal: index + 1,
          itemType: "SENTENCE_GENERATION",
          prompt: { promptEn: `Item ${index + 1}` },
          evaluationContract: {
            path: index < coreIds.length ? "CORE" : "FLEX",
            canonicalItem: {
              evidenceOpportunity:
                index === 0
                  ? "CONTROLLED_REPAIR"
                  : index < coreIds.length
                    ? "INDEPENDENT_GENERATION"
                    : "OTHER",
              ...(index > 0 && index < coreIds.length
                ? { independentGroupId: "blind-group" }
                : {}),
            },
          },
          expectedMinutes: 5,
        })),
      );
      const insertFailure = async (itemId: string, index: number) => {
        const attemptId = newDomainId();
        const eventId = newDomainId();
        await database.db.insert(exerciseAttempt).values({
          id: attemptId,
          exerciseItemId: itemId,
          userId,
          firstAttemptEventId: eventId,
          finalAttemptEventId: eventId,
          contractAttempts: [
            {
              id: eventId,
              answer: "Failed answer",
              submittedAt: new Date(Date.now() + index).toISOString(),
              elapsedSeconds: 20,
              hintLevel: "NONE",
              referenceAnswerSeen: false,
            },
          ],
          firstAnswer: "Failed answer",
          finalAnswer: "Failed answer",
        });
        await database.db.insert(evaluation).values({
          exerciseAttemptId: attemptId,
          responseAttemptId: eventId,
          passed: false,
          confidence: 0.95,
          feedback: { firstAttemptPassed: "false" },
          versionSnapshot: { providerKind: "openai" },
        });
      };
      for (const [index, itemId] of coreIds.slice(0, 2).entries()) {
        await insertFailure(itemId!, index);
      }
      const stored = await database.db.query.lessonPlan.findFirst({
        where: eq(lessonPlan.id, planId),
        with: { items: true },
      });
      let attempts = await database.db.query.exerciseAttempt.findMany({
        where: eq(exerciseAttempt.userId, userId),
        with: { evaluations: true },
      });
      expect(stored).toBeDefined();
      const partialGroupProgress = deriveLessonProgress({
        items: stored!.items,
        attempts,
      });
      expect(partialGroupProgress.remediationActive).toBe(false);
      await insertFailure(coreIds[2]!, 2);
      attempts = await database.db.query.exerciseAttempt.findMany({
        where: eq(exerciseAttempt.userId, userId),
        with: { evaluations: true },
      });
      const progress = deriveLessonProgress({
        items: stored!.items,
        attempts,
      });
      expect(progress.adaptive.activatedFlexItemIds).toEqual(
        flexIds.slice(0, 2),
      );
      const expiry = expireLessonRuntime(stored!);
      const [updated] = await database.db
        .update(lessonPlan)
        .set({
          ...expiry,
          runtimeState: {
            ...normalizeLessonRuntimeState(stored!.runtimeState),
            adaptive: progress.adaptive,
          },
        })
        .where(eq(lessonPlan.id, planId))
        .returning();
      expect(updated).toMatchObject({
        runtimeStatus: "TIMEBOX_EXPIRED",
        elapsedSeconds: 3_600,
      });
      expect(updated?.runtimeState.adaptive?.activatedFlexItemIds).toHaveLength(
        2,
      );
    } finally {
      await database.db.delete(user).where(eq(user.id, userId));
      await database.pool.end();
    }
  });
});
