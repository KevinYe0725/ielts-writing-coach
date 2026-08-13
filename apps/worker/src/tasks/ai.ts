import { and, asc, eq, ne, notInArray, or } from "drizzle-orm";
import type { JobHelpers } from "graphile-worker";

import {
  PROMPT_REGISTRY,
  type AITaskKind,
  type NormalizedUsage,
} from "@iwc/ai";
import {
  LEARNING_CONTRACT_VERSION,
  SKILL_IDS,
  assertContract,
  getSkillDefinition,
  isContract,
  type AiAssessmentJudgment,
  type AiIssueJudgment,
  type ExerciseItem as CanonicalExerciseItem,
  type MasteryLevel,
  type SkillEvidenceEvent as CanonicalSkillEvidenceEvent,
  type SkillId,
} from "@iwc/learning-contracts";
import {
  evaluateAppliedGate,
  evaluateRetainedGate,
  evaluateTransferredGate,
  validateLessonPlan,
  transitionRewrite,
  transitionTransfer,
  transitionTrainingCycle,
} from "@iwc/learning-core";
import {
  aiJob,
  assessment,
  evaluation,
  exerciseAttempt,
  exerciseItem,
  issueEvidence,
  learningObjective,
  lessonPlan,
  mixedReviewTask,
  newDomainId,
  question,
  rewriteTask,
  skillEvidenceEvent,
  trainingCycle,
  transferTask,
  writingAttempt,
  userSkillState,
} from "@iwc/db";

import {
  adapterForJob,
  claimAIJob,
  createChildJob,
  databaseContext,
  markJobFailure,
  markJobSucceeded,
  type ClaimedJob,
} from "../runtime";
import {
  assessmentJudgmentSchema,
  comparisonSchema,
  evaluationSchema,
  issueBatchSchema,
  lessonContentSchema,
  transferEvaluationSchema,
} from "../schemas";
import {
  buildCanonicalLessonPlan,
  buildExercisePresentation,
  buildProviderAwareDelayedRewriteEvidence,
  buildProviderAwareExerciseEvidence,
  buildTransferEvidence,
  buildVersionComparisonMetrics,
  canonicalEvidenceFromPayload,
  classifyIssueForPersistence,
  countComparisonWords,
  followUpSchedule,
  itemTypesForPrompt,
  lessonItemsWithPath,
  verifyComparisonIssueSpans,
  verifyTransferJudgmentEvidence,
  type ComparisonJudgment,
  type ExerciseEvaluationJudgment,
  type GeneratedLessonContent,
  type TransferEvaluationJudgment,
  type VersionScoreSet,
} from "../learning";
import { buildMixedReviewObservation } from "../mixed-review";

interface RunAIJobPayload {
  jobId?: string;
}

async function completeDueMixedReview(
  job: ClaimedJob,
  attempt: {
    readonly id: string;
    readonly cycleId: string;
    readonly assisted: boolean;
    readonly submittedAt: Date | null;
  },
  detectedIssues: readonly {
    readonly id: string;
    readonly skillId: string;
    readonly confidence: number;
    readonly diagnosis: Record<string, unknown>;
  }[],
): Promise<void> {
  const review = await databaseContext.db.query.mixedReviewTask.findFirst({
    where: and(
      eq(mixedReviewTask.userId, job.ownerId),
      eq(mixedReviewTask.targetCycleId, attempt.cycleId),
      eq(mixedReviewTask.status, "READY"),
    ),
  });
  if (!review) return;

  const [sourceCycle, targetCycle] = await Promise.all([
    databaseContext.db.query.trainingCycle.findFirst({
      where: and(
        eq(trainingCycle.id, review.sourceCycleId),
        eq(trainingCycle.userId, job.ownerId),
      ),
    }),
    databaseContext.db.query.trainingCycle.findFirst({
      where: and(
        eq(trainingCycle.id, attempt.cycleId),
        eq(trainingCycle.userId, job.ownerId),
      ),
      with: { question: true },
    }),
  ]);
  const occurredAt = attempt.submittedAt?.toISOString();
  const candidateSkill = sourceCycle?.coreSkillId;
  if (
    !targetCycle ||
    !occurredAt ||
    !candidateSkill ||
    !SKILL_IDS.includes(candidateSkill as SkillId)
  ) {
    await databaseContext.db
      .update(mixedReviewTask)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        result: {
          outcome: "SKIPPED_SOURCE_TARGET_UNAVAILABLE",
          valid_for_mastery_transition: false,
          interpretation_zh:
            "旧轮次缺少可验证的核心目标，本次不写入复发或掌握证据。",
          interpretation_en:
            "The source cycle had no verifiable core target, so this review produced no recurrence or mastery evidence.",
        },
      })
      .where(
        and(
          eq(mixedReviewTask.id, review.id),
          eq(mixedReviewTask.status, "READY"),
        ),
      );
    return;
  }

  const sourceSkillId = candidateSkill as SkillId;
  const observation = buildMixedReviewObservation({
    evidenceId: newDomainId(),
    reviewTaskId: review.id,
    userId: job.ownerId,
    sourceSkillId,
    targetCycleId: targetCycle.id,
    targetAttemptId: attempt.id,
    targetTopicId: targetCycle.question.topic || targetCycle.questionId,
    occurredAt,
    assisted: attempt.assisted,
    providerKind: job.versionSnapshot.providerKind ?? "unknown",
    issues: detectedIssues,
  });
  await databaseContext.db.transaction(async (transaction) => {
    const [lockedReview] = await transaction
      .select()
      .from(mixedReviewTask)
      .where(eq(mixedReviewTask.id, review.id))
      .for("update");
    if (!lockedReview || lockedReview.status === "COMPLETED") return;

    await transaction
      .insert(skillEvidenceEvent)
      .values({
        id: observation.canonicalEvidence.id,
        userId: job.ownerId,
        cycleId: targetCycle.id,
        skillId: sourceSkillId,
        evidenceStage: "RECURRENCE",
        sourceType: "mixed_review_task",
        sourceId: review.id,
        valid: false,
        confidence: observation.canonicalEvidence.confidence,
        occurredAt: new Date(occurredAt),
        payload: {
          canonicalEvidence: observation.canonicalEvidence,
          mixedReviewResult: observation.result,
        },
      })
      .onConflictDoNothing();

    const isRealIndependentRecurrence =
      observation.recurred &&
      !attempt.assisted &&
      job.versionSnapshot.providerKind !== "mock" &&
      observation.canonicalEvidence.confidence >=
        getSkillDefinition(sourceSkillId).minimumGradingConfidence;
    if (isRealIndependentRecurrence) {
      const [state] = await transaction
        .select()
        .from(userSkillState)
        .where(
          and(
            eq(userSkillState.userId, job.ownerId),
            eq(userSkillState.skillId, sourceSkillId),
          ),
        )
        .for("update");
      if (state) {
        await transaction
          .update(userSkillState)
          .set({ stability: Math.max(0, state.stability * 0.65) })
          .where(
            and(
              eq(userSkillState.userId, job.ownerId),
              eq(userSkillState.skillId, sourceSkillId),
            ),
          );
      }
    }
    await transaction
      .update(mixedReviewTask)
      .set({
        status: "COMPLETED",
        completedAt: new Date(occurredAt),
        result: { ...observation.result },
      })
      .where(eq(mixedReviewTask.id, review.id));
  });
}

function usageRecord(usage: NormalizedUsage): Record<string, number> {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    ...(usage.cachedInputTokens === undefined
      ? {}
      : { cachedInputTokens: usage.cachedInputTokens }),
    ...(usage.reasoningTokens === undefined
      ? {}
      : { reasoningTokens: usage.reasoningTokens }),
  };
}

function sumUsageRecords(
  ...records: readonly Record<string, number>[]
): Record<string, number> {
  const total: Record<string, number> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      total[key] = (total[key] ?? 0) + value;
    }
  }
  return total;
}

function model(job: ClaimedJob): string {
  const value = job.versionSnapshot.model;
  if (!value)
    throw new Error("The frozen AI job snapshot is missing its model.");
  return value;
}

function persistedAssessmentScores(
  value: typeof assessment.$inferSelect,
): VersionScoreSet {
  const scores: VersionScoreSet = {
    overall: value.overallBand,
    TR: value.criterionScores.taskResponse,
    CC: value.criterionScores.coherenceCohesion,
    LR: value.criterionScores.lexicalResource,
    GRA: value.criterionScores.grammar,
  };
  if (Object.values(scores).some((score) => !Number.isFinite(score))) {
    throw new Error("A persisted IELTS assessment contains invalid scores.");
  }
  return scores;
}

function assertCurrentAssessmentSnapshot(
  value: typeof assessment.$inferSelect,
): void {
  const prompt = PROMPT_REGISTRY.ielts_assessment;
  const snapshot = value.versionSnapshot;
  if (
    value.schemaVersion !== LEARNING_CONTRACT_VERSION ||
    snapshot.task !== "ielts_assessment" ||
    snapshot.schemaVersion !== LEARNING_CONTRACT_VERSION ||
    snapshot.promptVersion !== prompt.version ||
    snapshot.rubricVersion !== prompt.rubricVersion ||
    !snapshot.model ||
    !snapshot.providerKind ||
    !snapshot.providerConnectionId
  ) {
    throw new Error(
      "Version 1 cannot be rescored with its exact frozen IELTS assessment version.",
    );
  }
}

function assertSameAssessmentSnapshot(
  version1: typeof assessment.$inferSelect,
  version2: typeof assessment.$inferSelect,
): void {
  const snapshotKeys = [
    "task",
    "schemaVersion",
    "promptVersion",
    "rubricVersion",
    "model",
    "providerKind",
    "providerConnectionId",
  ] as const;
  if (
    version1.schemaVersion !== version2.schemaVersion ||
    snapshotKeys.some(
      (key) => version1.versionSnapshot[key] !== version2.versionSnapshot[key],
    )
  ) {
    throw new Error(
      "Version 1 and Version 2 must use the same frozen IELTS assessment version.",
    );
  }
}

async function ensureVersion2Assessment(input: {
  readonly job: ClaimedJob;
  readonly prompt: string;
  readonly version1Assessment: typeof assessment.$inferSelect;
  readonly version2: typeof writingAttempt.$inferSelect;
}): Promise<{
  readonly persisted: typeof assessment.$inferSelect;
  readonly usage: Record<string, number>;
}> {
  assertCurrentAssessmentSnapshot(input.version1Assessment);
  const existing = await databaseContext.db.query.assessment.findFirst({
    where: eq(assessment.attemptId, input.version2.id),
  });
  if (existing) {
    assertSameAssessmentSnapshot(input.version1Assessment, existing);
    return { persisted: existing, usage: {} };
  }

  const scoringJob: ClaimedJob = {
    ...input.job,
    taskKind: "ielts_assessment",
    versionSnapshot: input.version1Assessment.versionSnapshot,
  };
  const adapter = await adapterForJob(scoringJob);
  const result = await adapter.generateStructured<AiAssessmentJudgment>({
    model: model(scoringJob),
    idempotencyKey: `${input.job.id}:v2-assessment`,
    system: PROMPT_REGISTRY.ielts_assessment.system,
    input: `IELTS Task 2 prompt:\n${input.prompt}\n\nLearner essay (immutable Version 2):\n${input.version2.content}`,
    schemaName: "iwc_ai_assessment_judgment_v1",
    schema: assessmentJudgmentSchema as unknown as Record<string, unknown>,
    validate: (value): value is AiAssessmentJudgment => {
      try {
        assertContract("aiAssessmentJudgment", value);
        return true;
      } catch {
        return false;
      }
    },
    maxOutputTokens: 2_500,
  });
  const overallConfidence =
    Object.values(result.value.criteria).reduce(
      (sum, item) => sum + item.confidence,
      0,
    ) / 4;
  const providerIsMock =
    input.version1Assessment.versionSnapshot.providerKind === "mock";
  await databaseContext.db
    .insert(assessment)
    .values({
      id: newDomainId(),
      attemptId: input.version2.id,
      schemaVersion: input.version1Assessment.schemaVersion,
      overallBand: result.value.overallBand,
      criterionScores: {
        taskResponse: result.value.criteria.TR.band,
        coherenceCohesion: result.value.criteria.CC.band,
        lexicalResource: result.value.criteria.LR.band,
        grammar: result.value.criteria.GRA.band,
      },
      summary: {
        zh: providerIsMock
          ? "Mock 仅演示 Version 2 评分数据流；以下数字不是语言估分。"
          : "Version 2 使用与 Version 1 完全相同的冻结量表和模型进行审慎 AI 估分。",
        en: providerIsMock
          ? "Mock demonstrates the Version 2 scoring data flow only; these numbers are not language scores."
          : "Version 2 was cautiously AI-scored with the exact frozen rubric and model used for Version 1.",
        TR: result.value.criteria.TR.rationale,
        CC: result.value.criteria.CC.rationale,
        LR: result.value.criteria.LR.rationale,
        GRA: result.value.criteria.GRA.rationale,
      },
      confidence: overallConfidence,
      isAiEstimate: !providerIsMock,
      versionSnapshot: input.version1Assessment.versionSnapshot,
    })
    .onConflictDoNothing({ target: assessment.attemptId });
  const persisted = await databaseContext.db.query.assessment.findFirst({
    where: eq(assessment.attemptId, input.version2.id),
  });
  if (!persisted) throw new Error("Version 2 assessment was not persisted.");
  assertSameAssessmentSnapshot(input.version1Assessment, persisted);
  return { persisted, usage: usageRecord(result.usage) };
}

async function findUnfamiliarQuestion(input: {
  readonly ownerId: string;
  readonly originalTopic: string;
  readonly preferredQuestionType: string;
  readonly excludeQuestionId?: string;
}) {
  const [cycleQuestions, priorTransferQuestions] = await Promise.all([
    databaseContext.db
      .select({ questionId: trainingCycle.questionId })
      .from(trainingCycle)
      .where(eq(trainingCycle.userId, input.ownerId)),
    databaseContext.db
      .select({ questionId: transferTask.questionId })
      .from(transferTask)
      .where(eq(transferTask.userId, input.ownerId)),
  ]);
  const excludedIds = [
    ...new Set([
      ...cycleQuestions.map((row) => row.questionId),
      ...priorTransferQuestions.map((row) => row.questionId),
      ...(input.excludeQuestionId === undefined
        ? []
        : [input.excludeQuestionId]),
    ]),
  ];
  const access = or(
    eq(question.visibility, "public"),
    eq(question.ownerId, input.ownerId),
  );
  const differentTopic = ne(question.topic, input.originalTopic);
  const notPreviouslySeen =
    excludedIds.length > 0 ? notInArray(question.id, excludedIds) : undefined;
  const preferred = await databaseContext.db.query.question.findFirst({
    where: and(
      access,
      differentTopic,
      notPreviouslySeen,
      eq(question.questionType, input.preferredQuestionType),
    ),
    orderBy: [asc(question.externalId)],
  });
  if (preferred) return preferred;
  const unusedDifferentType = await databaseContext.db.query.question.findFirst(
    {
      where: and(access, differentTopic, notPreviouslySeen),
      orderBy: [asc(question.externalId)],
    },
  );
  if (unusedDifferentType) return unusedDifferentType;
  const notCurrent = input.excludeQuestionId
    ? ne(question.id, input.excludeQuestionId)
    : undefined;
  const previouslySeenPreferred =
    await databaseContext.db.query.question.findFirst({
      where: and(
        access,
        differentTopic,
        notCurrent,
        eq(question.questionType, input.preferredQuestionType),
      ),
      orderBy: [asc(question.externalId)],
    });
  if (previouslySeenPreferred) return previouslySeenPreferred;
  return databaseContext.db.query.question.findFirst({
    where: and(access, differentTopic, notCurrent),
    orderBy: [asc(question.externalId)],
  });
}

function exactIssueSpans(
  essay: string,
  issues: readonly AiIssueJudgment[],
): AiIssueJudgment[] {
  return issues.filter(
    (issue) =>
      issue.startOffset >= 0 &&
      issue.endOffset > issue.startOffset &&
      issue.endOffset <= essay.length &&
      essay.slice(issue.startOffset, issue.endOffset) === issue.excerpt,
  );
}

async function enqueueChild(
  job: ClaimedJob,
  helpers: JobHelpers,
  taskKind: AITaskKind,
  protectedReference: Record<string, string>,
): Promise<void> {
  const child = await createChildJob(job, taskKind, protectedReference);
  await helpers.addJob(
    "run_ai_job",
    { jobId: child.id },
    {
      jobKey: child.graphileJobKey,
      jobKeyMode: "preserve_run_at",
      maxAttempts: 5,
    },
  );
}

async function assessEssay(
  job: ClaimedJob,
  helpers: JobHelpers,
): Promise<Record<string, number>> {
  const attemptId = job.protectedReference.attemptId;
  if (!attemptId) throw new Error("Assessment job is missing attemptId.");
  const attempt = await databaseContext.db.query.writingAttempt.findFirst({
    where: and(
      eq(writingAttempt.id, attemptId),
      eq(writingAttempt.userId, job.ownerId),
    ),
    with: { cycle: { with: { question: true } } },
  });
  if (!attempt)
    throw new Error("The protected writing attempt no longer exists.");
  const existingAssessment =
    await databaseContext.db.query.assessment.findFirst({
      where: eq(assessment.attemptId, attempt.id),
    });
  if (existingAssessment) {
    await enqueueChild(job, helpers, "issue_classification", {
      attemptId: attempt.id,
      cycleId: attempt.cycleId,
      assessmentId: existingAssessment.id,
    });
    return {};
  }
  const adapter = await adapterForJob(job);
  const result = await adapter.generateStructured<AiAssessmentJudgment>({
    model: model(job),
    idempotencyKey: job.id,
    system: PROMPT_REGISTRY.ielts_assessment.system,
    input: `IELTS Task 2 prompt:\n${attempt.cycle.question.prompt}\n\nLearner essay (immutable Version 1):\n${attempt.content}`,
    schemaName: "iwc_ai_assessment_judgment_v1",
    schema: assessmentJudgmentSchema as unknown as Record<string, unknown>,
    validate: (value): value is AiAssessmentJudgment => {
      try {
        assertContract("aiAssessmentJudgment", value);
        return true;
      } catch {
        return false;
      }
    },
    maxOutputTokens: 2_500,
  });
  const overallConfidence =
    Object.values(result.value.criteria).reduce(
      (sum, item) => sum + item.confidence,
      0,
    ) / 4;
  const providerIsMock = job.versionSnapshot.providerKind === "mock";
  const assessmentId = newDomainId();
  await databaseContext.db
    .insert(assessment)
    .values({
      id: assessmentId,
      attemptId: attempt.id,
      schemaVersion: LEARNING_CONTRACT_VERSION,
      overallBand: result.value.overallBand,
      criterionScores: {
        taskResponse: result.value.criteria.TR.band,
        coherenceCohesion: result.value.criteria.CC.band,
        lexicalResource: result.value.criteria.LR.band,
        grammar: result.value.criteria.GRA.band,
      },
      summary: {
        zh: providerIsMock
          ? "Mock 仅演示批改数据流；以下数字不是语言估分，不进入能力趋势。"
          : "以下为 AI 基于作文文本给出的审慎估分，不是官方 IELTS 成绩或教师认证。",
        en: providerIsMock
          ? "Mock demonstrates the feedback data flow only. These numbers are not language scores and do not enter progress trends."
          : "This is a cautious AI estimate, not an official IELTS score or teacher certification.",
        TR: result.value.criteria.TR.rationale,
        CC: result.value.criteria.CC.rationale,
        LR: result.value.criteria.LR.rationale,
        GRA: result.value.criteria.GRA.rationale,
      },
      confidence: overallConfidence,
      isAiEstimate: !providerIsMock,
      versionSnapshot: job.versionSnapshot,
    })
    .onConflictDoNothing({ target: assessment.attemptId });
  const persistedAssessment =
    await databaseContext.db.query.assessment.findFirst({
      where: eq(assessment.attemptId, attempt.id),
    });
  if (!persistedAssessment) {
    throw new Error("The assessment could not be persisted.");
  }
  await enqueueChild(job, helpers, "issue_classification", {
    attemptId: attempt.id,
    cycleId: attempt.cycleId,
    assessmentId: persistedAssessment.id,
  });
  return usageRecord(result.usage);
}

async function classifyIssues(
  job: ClaimedJob,
  helpers: JobHelpers,
): Promise<Record<string, number>> {
  const attemptId = job.protectedReference.attemptId;
  const assessmentId = job.protectedReference.assessmentId;
  if (!attemptId || !assessmentId)
    throw new Error("Issue job is missing protected references.");
  const attempt = await databaseContext.db.query.writingAttempt.findFirst({
    where: eq(writingAttempt.id, attemptId),
  });
  if (!attempt || attempt.userId !== job.ownerId)
    throw new Error("The protected writing attempt no longer exists.");
  const persistedIssues = await databaseContext.db.query.issueEvidence.findMany(
    {
      where: eq(issueEvidence.assessmentId, assessmentId),
    },
  );
  if (persistedIssues.length > 0) {
    const persistedPrimary = [...persistedIssues].sort(
      (left, right) =>
        right.severity - left.severity || right.confidence - left.confidence,
    )[0]?.skillId;
    const primarySkillId =
      persistedPrimary !== undefined &&
      SKILL_IDS.includes(persistedPrimary as SkillId)
        ? (persistedPrimary as SkillId)
        : "mechanism_chain";
    await databaseContext.db
      .update(trainingCycle)
      .set({ coreSkillId: primarySkillId })
      .where(eq(trainingCycle.id, attempt.cycleId));
    await completeDueMixedReview(job, attempt, persistedIssues);
    await enqueueChild(job, helpers, "exercise_generation", {
      attemptId,
      cycleId: attempt.cycleId,
      assessmentId,
      skillId: primarySkillId,
    });
    return {};
  }
  const adapter = await adapterForJob(job);
  const result = await adapter.generateStructured<{
    issues: AiIssueJudgment[];
  }>({
    model: model(job),
    idempotencyKey: job.id,
    system: PROMPT_REGISTRY.issue_classification.system,
    input: `Return the highest-value, non-overlapping issues. Character offsets use this exact immutable essay, starting at zero. A phrase can be grammatical but unnatural; in particular, do not claim that "much + comparative" is ungrammatical.\n\n${attempt.content}`,
    schemaName: "iwc_ai_issue_batch_v1",
    schema: issueBatchSchema as unknown as Record<string, unknown>,
    validate: (value): value is { issues: AiIssueJudgment[] } =>
      typeof value === "object" &&
      value !== null &&
      Array.isArray((value as { issues?: unknown }).issues) &&
      (value as { issues: unknown[] }).issues.every((issue) => {
        try {
          assertContract("aiIssueJudgment", issue);
          return true;
        } catch {
          return false;
        }
      }),
    maxOutputTokens: 4_000,
  });
  let issues = exactIssueSpans(attempt.content, result.value.issues);
  let usedSyntheticFallback = false;
  if (issues.length === 0 && attempt.content.length > 0) {
    usedSyntheticFallback = true;
    const endOffset = Math.min(
      attempt.content.length,
      Math.max(1, attempt.content.search(/[.!?](?:\s|$)/) + 1 || 1),
    );
    issues = [
      {
        skillId: "mechanism_chain",
        startOffset: 0,
        endOffset,
        excerpt: attempt.content.slice(0, endOffset),
        diagnosis:
          "Use this exact span as the starting point for evidence-based development practice.",
        severity: "MEDIUM",
        confidence: 0.6,
      },
    ];
  }
  const severity = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
  issues.sort(
    (a, b) =>
      severity[b.severity] - severity[a.severity] ||
      b.confidence - a.confidence,
  );
  const classifiedIssues = issues.map((issue) => ({
    issue,
    classification: classifyIssueForPersistence(issue),
  }));
  const primarySkillId =
    classifiedIssues[0]?.classification.skillId ?? "mechanism_chain";
  await databaseContext.db.transaction(async (transaction) => {
    if (classifiedIssues.length > 0) {
      await transaction.insert(issueEvidence).values(
        classifiedIssues.map(({ issue, classification }) => ({
          assessmentId,
          skillId: classification.skillId,
          startOffset: issue.startOffset,
          endOffset: issue.endOffset,
          excerpt: issue.excerpt,
          diagnosis: {
            en: classification.diagnosis,
            source: usedSyntheticFallback
              ? "SYNTHETIC_FALLBACK"
              : "AI_CLASSIFICATION",
          },
          categories: [...classification.categories],
          hardGrammarError: classification.hardGrammarError,
          severity: severity[issue.severity],
          confidence: issue.confidence,
        })),
      );
    }
    await transaction
      .update(trainingCycle)
      .set({ coreSkillId: primarySkillId })
      .where(eq(trainingCycle.id, attempt.cycleId));
  });
  const storedIssues = await databaseContext.db.query.issueEvidence.findMany({
    where: eq(issueEvidence.assessmentId, assessmentId),
  });
  await completeDueMixedReview(job, attempt, storedIssues);
  await enqueueChild(job, helpers, "exercise_generation", {
    attemptId,
    cycleId: attempt.cycleId,
    assessmentId,
    skillId: primarySkillId,
  });
  return usageRecord(result.usage);
}

async function generateLesson(
  job: ClaimedJob,
): Promise<Record<string, number>> {
  const cycleId = job.protectedReference.cycleId;
  const skillId = job.protectedReference.skillId;
  if (
    !cycleId ||
    !skillId ||
    !SKILL_IDS.includes(skillId as (typeof SKILL_IDS)[number])
  )
    throw new Error("Lesson job has an invalid protected skill reference.");
  const cycle = await databaseContext.db.query.trainingCycle.findFirst({
    where: and(
      eq(trainingCycle.id, cycleId),
      eq(trainingCycle.userId, job.ownerId),
    ),
    with: { question: true, writingAttempts: true, lessonPlans: true },
  });
  if (!cycle) throw new Error("The training cycle no longer exists.");
  if (cycle.lessonPlans.length > 0) return {};
  const canonicalSkillId = skillId as SkillId;
  const assessmentId = job.protectedReference.assessmentId;
  if (!assessmentId)
    throw new Error("Lesson generation requires its source assessment ID.");
  const issueRows = await databaseContext.db.query.issueEvidence.findMany({
    where: eq(issueEvidence.assessmentId, assessmentId),
  });
  const sourceEvidenceIds = issueRows
    .filter((issue) => issue.skillId === canonicalSkillId)
    .map((issue) => issue.id);
  if (sourceEvidenceIds.length === 0) {
    throw new Error(
      "Lesson generation requires at least one source issue for the selected skill.",
    );
  }
  const secondaryIssue = issueRows
    .filter(
      (issue) =>
        issue.skillId !== canonicalSkillId &&
        SKILL_IDS.includes(issue.skillId as (typeof SKILL_IDS)[number]),
    )
    .sort(
      (left, right) =>
        right.severity - left.severity ||
        right.confidence - left.confidence ||
        left.id.localeCompare(right.id),
    )[0];
  const secondaryObjective = secondaryIssue
    ? {
        skillId: secondaryIssue.skillId as SkillId,
        sourceEvidenceIds: [secondaryIssue.id],
      }
    : undefined;
  const version1 = cycle.writingAttempts.find(
    (attempt) => attempt.kind === "version_1",
  );
  const adapter = await adapterForJob(job);
  const result = await adapter.generateStructured<GeneratedLessonContent>({
    model: model(job),
    idempotencyKey: job.id,
    system: PROMPT_REGISTRY.exercise_generation.system,
    input: `Supply content for five active-output slots inside a deterministic canonical lesson. Target skill: ${canonicalSkillId}. The deterministic planner will assign these forms: slot 1 ${itemTypesForPrompt(canonicalSkillId).pretest}; slot 2 ${itemTypesForPrompt(canonicalSkillId).controlled}; slots 3 and 4 ${itemTypesForPrompt(canonicalSkillId).production} as semantically distinct first-attempt no-hint generations whose feedback is delayed until both are submitted; slot 5 is an 80–120 word integrated paragraph lab. For every slot, provide usable sourceText, 2–4 distinct options, explicit acceptedAnswers that use option IDs for choice tasks, correct mappingPairs, semantic slotLabels, every validOrders variant, three branch-specific prompts, and fixed rubricCriteria. A meaning fork is unscored and its options represent plausible intended meanings; later branch prompts must genuinely differ by that meaning. Closed answers must be internally consistent with the prompt and repeatable. Explain in Chinese; all learner prompts and output are English. Do not choose timings, IDs, lifecycle state, evidence gates, or mastery. Use fresh contexts and do not reveal a complete model essay. Task prompt: ${cycle.question.prompt}\nLearner evidence: ${(version1?.content ?? "").slice(0, 4_000)}`,
    schemaName: "iwc_lesson_content_v1",
    schema: lessonContentSchema as unknown as Record<string, unknown>,
    validate: (value): value is GeneratedLessonContent =>
      typeof value === "object" &&
      value !== null &&
      Array.isArray((value as { stages?: unknown }).stages) &&
      (value as { stages: unknown[] }).stages.length === 5,
    maxOutputTokens: 5_000,
  });
  const ids = {
    planId: newDomainId(),
    objectiveId: newDomainId(),
    secondaryObjectiveId: newDomainId(),
    foundationBlockId: newDomainId(),
    breakBlockId: newDomainId(),
    applicationBlockId: newDomainId(),
    flexBlockId: newDomainId(),
    independentGroupId: newDomainId(),
    pretestItemId: newDomainId(),
    controlledItemId: newDomainId(),
    generationOneItemId: newDomainId(),
    generationTwoItemId: newDomainId(),
    integratedItemId: newDomainId(),
    selfCheckItemId: newDomainId(),
    exitItemId: newDomainId(),
    flexRepairItemId: newDomainId(),
    flexGenerationItemId: newDomainId(),
  };
  const canonicalPlan = buildCanonicalLessonPlan({
    cycleId,
    skillId: canonicalSkillId,
    sourceEvidenceIds,
    content: result.value,
    ids,
    plannerVersion: "worker-canonical-planner@1.0.0",
    generatorVersion:
      job.versionSnapshot.promptVersion ??
      PROMPT_REGISTRY.exercise_generation.version,
    ...(secondaryObjective ? { secondaryObjective } : {}),
  });
  const canonicalItems = lessonItemsWithPath(canonicalPlan);
  const coreItems = canonicalPlan.blocks
    .filter((block) => block.path === "CORE")
    .flatMap((block) => block.items);
  const coreTotalSeconds = coreItems.reduce(
    (sum, item) => sum + item.expectedTotalSeconds,
    0,
  );
  const coreActiveSeconds = coreItems.reduce(
    (sum, item) => sum + item.expectedActiveSeconds,
    0,
  );
  const lessonMetrics = validateLessonPlan(canonicalPlan).metrics;
  await databaseContext.db.transaction(async (transaction) => {
    await transaction.insert(learningObjective).values(
      canonicalPlan.objectives.map((objective) => ({
        id: objective.id,
        cycleId,
        skillId: objective.skillId,
        role: objective.role,
        sourceEvidenceIds: [...objective.sourceEvidenceIds],
        priority: objective.priority,
        successCriterion: objective.successCriterion,
      })),
    );
    await transaction.insert(lessonPlan).values({
      id: ids.planId,
      cycleId,
      coreSkillId: canonicalSkillId,
      schemaVersion: LEARNING_CONTRACT_VERSION,
      plannedMinutes: 60,
      coreMinutes: 45,
      activeOutputRatio:
        coreTotalSeconds === 0 ? 0 : coreActiveSeconds / coreTotalSeconds,
      selectionRatio: lessonMetrics.recognitionItemRatio,
      remediationMinutes: 15,
      // Stable export shape: exactly one complete canonical plan in the legacy unknown[] column.
      stages: [canonicalPlan],
    });
    await transaction.insert(exerciseItem).values(
      canonicalItems.map(({ item, path }, index) => {
        const generated =
          result.value.stages[index % result.value.stages.length];
        const stage = generated ?? result.value.stages[0]!;
        const presentation = buildExercisePresentation({
          item,
          stage,
          ...(canonicalPlan.blocks
            .flatMap((block) => block.items)
            .find((candidate) => candidate.itemType === "MEANING_FORK")
            ? { meaningStage: result.value.stages[0] }
            : {}),
          ...(item.id === ids.selfCheckItemId
            ? { revisionSourceItemId: ids.integratedItemId }
            : {}),
        });
        const minimumConfidence =
          item.grading.mode === "RUBRIC" ? item.grading.minimumConfidence : 1;
        return {
          id: item.id,
          lessonPlanId: ids.planId,
          learningObjectiveId: ids.objectiveId,
          ordinal: index + 1,
          itemType: item.itemType,
          prompt: {
            titleZh: generated?.titleZh ?? result.value.titleZh,
            instructionZh:
              item.itemType === "SELF_CHECK"
                ? "对上一张段落实验卡逐项目标检查，至少做一处针对性修改，再提交第二版。"
                : (generated?.instructionZh ?? result.value.objectiveZh),
            promptEn: item.prompt,
            canonicalPrompt: item.prompt,
            responseMode: presentation.responseMode,
            presentation,
            ...(presentation.sourceText
              ? { source: presentation.sourceText }
              : {}),
            ...(presentation.options ? { choices: presentation.options } : {}),
            ...(presentation.selfCheckPrompts
              ? { selfCheckPrompts: presentation.selfCheckPrompts }
              : {}),
            criteria: item.criteria ?? [],
          },
          // Stable row-level export/evaluation shape; IDs and prompt are intentionally duplicated for integrity checks.
          evaluationContract: {
            canonicalItem: item,
            path,
            skillId: canonicalSkillId,
            requiresIndependentFirstAnswer: item.firstAttemptRequired,
            minimumConfidence,
            presentation,
          },
          expectedMinutes: item.expectedTotalSeconds / 60,
        };
      }),
    );
    const current = cycle.status;
    const feedbackReady =
      current === "ANALYZING"
        ? transitionTrainingCycle(current, "FEEDBACK_READY")
        : current;
    const generating =
      feedbackReady === "FEEDBACK_READY"
        ? transitionTrainingCycle(feedbackReady, "LESSON_GENERATING")
        : feedbackReady;
    const ready =
      generating === "LESSON_GENERATING"
        ? transitionTrainingCycle(generating, "LESSON_READY")
        : generating;
    await transaction
      .update(trainingCycle)
      .set({ status: ready })
      .where(eq(trainingCycle.id, cycleId));
  });
  return usageRecord(result.usage);
}

async function evaluateExercise(
  job: ClaimedJob,
): Promise<Record<string, number>> {
  const exerciseAttemptId = job.protectedReference.exerciseAttemptId;
  if (!exerciseAttemptId)
    throw new Error("Evaluation job is missing exerciseAttemptId.");
  const attempt = await databaseContext.db.query.exerciseAttempt.findFirst({
    where: and(
      eq(exerciseAttempt.id, exerciseAttemptId),
      eq(exerciseAttempt.userId, job.ownerId),
    ),
    with: {
      item: {
        with: { lessonPlan: { with: { cycle: { with: { question: true } } } } },
      },
    },
  });
  if (!attempt)
    throw new Error("The protected exercise attempt no longer exists.");
  const priorEvaluation = await databaseContext.db.query.evaluation.findFirst({
    where: eq(evaluation.aiJobId, job.id),
  });
  if (priorEvaluation) return {};
  const supersedesEvaluationId =
    job.protectedReference.reevaluationOfEvaluationId;
  const supersededEvaluation = supersedesEvaluationId
    ? await databaseContext.db.query.evaluation.findFirst({
        where: and(
          eq(evaluation.id, supersedesEvaluationId),
          eq(evaluation.exerciseAttemptId, attempt.id),
        ),
      })
    : undefined;
  if (supersedesEvaluationId && !supersededEvaluation) {
    throw new Error(
      "Exercise re-evaluation requires a prior evaluation from the same immutable attempt.",
    );
  }
  const canonicalCandidate = attempt.item.evaluationContract.canonicalItem;
  if (!isContract("exerciseItem", canonicalCandidate)) {
    throw new Error(
      "Exercise evaluation requires a validated canonical item contract.",
    );
  }
  const canonicalItem: CanonicalExerciseItem = canonicalCandidate;
  const firstContractAttempt =
    attempt.contractAttempts.find(
      (candidate) => candidate.id === attempt.firstAttemptEventId,
    ) ?? attempt.contractAttempts[0];
  if (!firstContractAttempt) {
    throw new Error(
      "Exercise evaluation requires the immutable first-attempt event.",
    );
  }
  const immutableFirstAnswer =
    typeof attempt.firstAnswer === "string" ? attempt.firstAnswer : "";
  const occurredAt = new Date(firstContractAttempt.submittedAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new Error(
      "The first-attempt event has an invalid submittedAt value.",
    );
  }
  const adapter = await adapterForJob(job);
  const result = await adapter.generateStructured<ExerciseEvaluationJudgment>({
    model: model(job),
    idempotencyKey: job.id,
    system: PROMPT_REGISTRY.open_sentence_evaluation.system,
    input: `Exercise: ${JSON.stringify(attempt.item.prompt)}\nCanonical target and evidence opportunity: ${JSON.stringify(canonicalItem)}\nLearner first answer: ${JSON.stringify(attempt.firstAnswer)}\nLearner hinted answer: ${JSON.stringify(attempt.hintedAnswer)}\nLearner final answer: ${JSON.stringify(attempt.finalAnswer)}\nJudge the first attempt separately from the final answer. A hinted or repaired final answer must never turn a failed first attempt into first-attempt evidence. Return concrete evidence copied exactly from the learner's immutable first answer and separate target correctness, meaning preservation, and naturalness. Return exactly one criterionResults entry for every rubric criterion ID and every integrated objective criterion ID in the canonical target; score each criterion independently against its stated threshold and attach exact first-answer evidence for that criterion.`,
    schemaName: "iwc_exercise_evaluation_v1",
    schema: evaluationSchema as unknown as Record<string, unknown>,
    validate: (value): value is ExerciseEvaluationJudgment =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { passed?: unknown }).passed === "boolean" &&
      typeof (value as { firstAttemptPassed?: unknown }).firstAttemptPassed ===
        "boolean" &&
      typeof (value as { confidence?: unknown }).confidence === "number" &&
      Array.isArray(
        (value as { criterionResults?: unknown }).criterionResults,
      ) &&
      Array.isArray(
        (value as { userAnswerEvidence?: unknown }).userAnswerEvidence,
      ),
    maxOutputTokens: 1_000,
  });
  const providerIsMock = job.versionSnapshot.providerKind === "mock";
  const minimumConfidence =
    canonicalItem.grading.mode === "RUBRIC"
      ? canonicalItem.grading.minimumConfidence
      : 1;
  const lowConfidence = result.value.confidence < minimumConfidence;
  const criterionDefinitions = new Map<
    string,
    { readonly passingScore: number }
  >();
  if (canonicalItem.grading.mode === "RUBRIC") {
    for (const criterion of canonicalItem.grading.criteria) {
      criterionDefinitions.set(criterion.id, {
        passingScore: criterion.passingScore,
      });
    }
  }
  for (const criterion of canonicalItem.criteria ?? []) {
    const id = `${criterion.objectiveId}:${criterion.skillId}`;
    criterionDefinitions.set(id, { passingScore: criterion.passingScore });
  }
  const verifiedOverallEvidence = result.value.userAnswerEvidence
    .map((span) => span.trim())
    .filter(
      (span, index, source) =>
        span.length > 0 &&
        immutableFirstAnswer.includes(span) &&
        source.indexOf(span) === index,
    );
  const modelCriterionResults = new Map(
    result.value.criterionResults.map((criterion) => [criterion.id, criterion]),
  );
  const criterionResults = [...criterionDefinitions].map(([id, definition]) => {
    const modelResult = modelCriterionResults.get(id);
    const evidence = (modelResult?.userAnswerEvidence ?? [])
      .map((span) => span.trim())
      .filter(
        (span, index, source) =>
          span.length > 0 &&
          immutableFirstAnswer.includes(span) &&
          source.indexOf(span) === index,
      );
    const score =
      modelResult && evidence.length > 0
        ? Math.max(0, Math.min(1, modelResult.score))
        : 0;
    return {
      id,
      score,
      passed: score >= definition.passingScore,
      evidence,
    };
  });
  const criterionScores = Object.fromEntries(
    criterionResults.map((criterion) => [criterion.id, criterion.score]),
  );
  const allCriteriaPassed = criterionResults.every(
    (criterion) => criterion.passed,
  );
  const evaluationPassed =
    !lowConfidence && result.value.passed && allCriteriaPassed;
  const firstAttemptPassed =
    !lowConfidence && result.value.firstAttemptPassed && allCriteriaPassed;
  const verifiedEvidence = Array.from(
    new Set([
      ...verifiedOverallEvidence,
      ...criterionResults.flatMap((criterion) => criterion.evidence),
    ]),
  );
  const canonicalEvidence = buildProviderAwareExerciseEvidence({
    id: newDomainId(),
    userId: job.ownerId,
    attemptId: attempt.id,
    objectiveId: attempt.item.learningObjectiveId,
    item: canonicalItem,
    topicId:
      attempt.item.lessonPlan.cycle.question.topic ||
      attempt.item.lessonPlan.cycle.questionId,
    hintsUsed: firstContractAttempt.hintLevel === "NONE" ? 0 : 1,
    hintLevel: firstContractAttempt.hintLevel,
    referenceAnswerSeen: firstContractAttempt.referenceAnswerSeen,
    occurredAt,
    judgment: {
      ...result.value,
      userAnswerEvidence: verifiedEvidence,
      passed: evaluationPassed,
      firstAttemptPassed,
    },
    providerKind: job.versionSnapshot.providerKind ?? "unknown",
  });
  const eligibleFirstAttempt =
    !lowConfidence &&
    canonicalEvidence.validForStateTransition &&
    canonicalEvidence.outcome === "PASS" &&
    canonicalEvidence.independent &&
    canonicalEvidence.firstAttempt &&
    canonicalEvidence.hintLevel === "NONE";
  const evaluationId = newDomainId();
  await databaseContext.db.transaction(async (transaction) => {
    // Serializes evidence-gate calculation so the last required exercise always sees prior committed evidence.
    await transaction
      .select({ id: trainingCycle.id })
      .from(trainingCycle)
      .where(eq(trainingCycle.id, attempt.item.lessonPlan.cycleId))
      .for("update");
    await transaction
      .insert(evaluation)
      .values({
        id: evaluationId,
        aiJobId: job.id,
        exerciseAttemptId: attempt.id,
        responseAttemptId: attempt.firstAttemptEventId,
        passed: evaluationPassed,
        confidence: result.value.confidence,
        feedback: {
          zh: result.value.feedbackZh,
          en: result.value.evidenceEn,
          firstAttemptPassed: String(firstAttemptPassed),
          outcome: lowConfidence
            ? "NEUTRAL"
            : evaluationPassed
              ? "PASS"
              : "FAIL",
          criterionResults: JSON.stringify(criterionResults),
        },
        dimensionScores: {
          ...result.value.dimensionScores,
          ...criterionScores,
        },
        userAnswerEvidence: verifiedEvidence,
        mostImportantSuggestion: result.value.mostImportantSuggestionZh,
        ...(supersededEvaluation
          ? { supersedesEvaluationId: supersededEvaluation.id }
          : {}),
        versionSnapshot: job.versionSnapshot,
        validForEvidence: eligibleFirstAttempt,
      })
      .onConflictDoNothing({ target: evaluation.aiJobId });
    await transaction
      .insert(skillEvidenceEvent)
      .values({
        id: canonicalEvidence.id,
        userId: job.ownerId,
        cycleId: attempt.item.lessonPlan.cycleId,
        skillId: canonicalEvidence.skillId,
        evidenceStage: canonicalEvidence.kind,
        sourceType: supersededEvaluation
          ? "exercise_reevaluation"
          : "exercise_attempt",
        sourceId: supersededEvaluation ? evaluationId : attempt.id,
        valid: eligibleFirstAttempt,
        confidence: canonicalEvidence.confidence,
        occurredAt,
        payload: {
          canonicalEvidence,
          dimensionScores: {
            ...result.value.dimensionScores,
            ...criterionScores,
          },
          criterionResults,
          userAnswerEvidence: verifiedEvidence,
          mostImportantSuggestionZh: result.value.mostImportantSuggestionZh,
          feedbackZh: result.value.feedbackZh,
          finalAnswerPassed: evaluationPassed,
          outcome: lowConfidence
            ? "NEUTRAL"
            : evaluationPassed
              ? "PASS"
              : "FAIL",
        },
      })
      .onConflictDoNothing();

    // Mock is an explicit no-cost product demonstration. Its length-based
    // output must never be allowed to change a learner's mastery state.
    if (providerIsMock) return;

    const evidenceRows = await transaction.query.skillEvidenceEvent.findMany({
      where: and(
        eq(skillEvidenceEvent.userId, job.ownerId),
        eq(skillEvidenceEvent.cycleId, attempt.item.lessonPlan.cycleId),
        eq(skillEvidenceEvent.skillId, canonicalEvidence.skillId),
      ),
    });
    const evidenceContracts = evidenceRows
      .map((row) => canonicalEvidenceFromPayload(row.payload))
      .filter((event): event is CanonicalSkillEvidenceEvent => event !== null);
    const appliedGate = evaluateAppliedGate(
      canonicalEvidence.skillId,
      evidenceContracts,
    );
    if (!appliedGate.passed) return;

    const [currentSkillState] = await transaction
      .select()
      .from(userSkillState)
      .where(
        and(
          eq(userSkillState.userId, job.ownerId),
          eq(userSkillState.skillId, canonicalEvidence.skillId),
        ),
      )
      .for("update");
    if (!currentSkillState) {
      await transaction
        .insert(userSkillState)
        .values({
          userId: job.ownerId,
          skillId: canonicalEvidence.skillId,
          appliedAt: occurredAt,
          stability: 0.6,
          evidenceCount: evidenceContracts.length,
        })
        .onConflictDoNothing();
    } else if (currentSkillState.appliedAt === null) {
      await transaction
        .update(userSkillState)
        .set({
          appliedAt: occurredAt,
          stability: Math.max(currentSkillState.stability, 0.6),
          evidenceCount: Math.max(
            currentSkillState.evidenceCount,
            evidenceContracts.length,
          ),
        })
        .where(
          and(
            eq(userSkillState.userId, job.ownerId),
            eq(userSkillState.skillId, canonicalEvidence.skillId),
          ),
        );
    }
  });
  return usageRecord(result.usage);
}

async function compareVersions(
  job: ClaimedJob,
): Promise<Record<string, number>> {
  const cycleId = job.protectedReference.cycleId;
  if (!cycleId) throw new Error("Comparison job is missing cycleId.");
  const cycle = await databaseContext.db.query.trainingCycle.findFirst({
    where: and(
      eq(trainingCycle.id, cycleId),
      eq(trainingCycle.userId, job.ownerId),
    ),
    with: {
      writingAttempts: {
        with: { assessment: { with: { issues: true } } },
      },
      question: true,
      rewriteTasks: true,
    },
  });
  if (!cycle) throw new Error("The training cycle no longer exists.");
  if (!cycle.startedAt)
    throw new Error(
      "Comparison follow-up scheduling requires cycle.startedAt.",
    );
  const version1 = cycle.writingAttempts.find(
    (attempt) => attempt.kind === "version_1",
  );
  const version2 = cycle.writingAttempts.find(
    (attempt) => attempt.kind === "version_2",
  );
  if (!version1 || !version2)
    throw new Error("Both writing versions are required for comparison.");
  if (!version1.assessment)
    throw new Error("Version 1 assessment is required for comparison.");
  if (!version2.submittedAt)
    throw new Error("Version 2 must be submitted before comparison.");
  const version2SubmittedAt = version2.submittedAt;
  const rewrite = cycle.rewriteTasks[0];
  if (!rewrite)
    throw new Error("Version comparison requires its persisted rewrite task.");
  const coreSkillId = cycle.coreSkillId as SkillId | null;
  if (!coreSkillId || !SKILL_IDS.includes(coreSkillId)) {
    throw new Error("Version comparison requires a canonical core skill.");
  }
  const objective = await databaseContext.db.query.learningObjective.findFirst({
    where: and(
      eq(learningObjective.cycleId, cycleId),
      eq(learningObjective.role, "CORE"),
    ),
  });
  const version2Assessment = await ensureVersion2Assessment({
    job,
    prompt: cycle.question.prompt,
    version1Assessment: version1.assessment,
    version2,
  });
  const persistedRewriteEvidence =
    await databaseContext.db.query.skillEvidenceEvent.findFirst({
      where: and(
        eq(skillEvidenceEvent.userId, job.ownerId),
        eq(skillEvidenceEvent.cycleId, cycleId),
        eq(skillEvidenceEvent.skillId, coreSkillId),
        eq(skillEvidenceEvent.evidenceStage, "DELAYED_REWRITE"),
        eq(skillEvidenceEvent.sourceType, "rewrite_task"),
        eq(skillEvidenceEvent.sourceId, rewrite.id),
      ),
    });
  if (persistedRewriteEvidence) return version2Assessment.usage;
  const adapter = await adapterForJob(job);
  const hasBlindSnapshot = version2.draftBeforeSelfCheck !== null;
  const version2BeforeSelfCheck =
    version2.draftBeforeSelfCheck ?? version2.content;
  const knownVersion1Evidence = version1.assessment.issues
    .filter((issue) => issue.skillId === coreSkillId)
    .map((issue) => ({
      startOffset: issue.startOffset,
      endOffset: issue.endOffset,
      excerpt: issue.excerpt,
      diagnosis: issue.diagnosis,
    }));
  const result = await adapter.generateStructured<ComparisonJudgment>({
    model: model(job),
    idempotencyKey: job.id,
    system: PROMPT_REGISTRY.version_comparison.system,
    input: `Task: ${cycle.question.prompt}\nTarget skill: ${coreSkillId}\nKnown verified Version 1 evidence: ${JSON.stringify(knownVersion1Evidence)}\nDetermine whether the task naturally offered a chance to use the target; no opportunity is not a failure. Evaluate retention evidence against the Version 2 snapshot before personal self-check whenever available. Return every occurrence of the same core issue in each essay as an exact zero-based [startOffset, endOffset) span whose excerpt exactly equals that slice of the corresponding essay. Use an empty array when there is no occurrence.\n\nV1:\n${version1.content}\n\nV2 before self-check:\n${version2BeforeSelfCheck}`,
    schemaName: "iwc_version_comparison_v1",
    schema: comparisonSchema as unknown as Record<string, unknown>,
    validate: (value): value is ComparisonJudgment =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { targetApplied?: unknown }).targetApplied ===
        "boolean" &&
      typeof (value as { naturalOpportunity?: unknown }).naturalOpportunity ===
        "boolean" &&
      Array.isArray((value as { improvementsZh?: unknown }).improvementsZh) &&
      Array.isArray(
        (value as { coreIssueSpansV1?: unknown }).coreIssueSpansV1,
      ) &&
      Array.isArray(
        (value as { coreIssueSpansV2?: unknown }).coreIssueSpansV2,
      ) &&
      typeof (value as { modelEssay?: unknown }).modelEssay === "string",
    maxOutputTokens: 2_000,
  });
  const verifiedV1Spans = verifyComparisonIssueSpans(
    version1.content,
    result.value.coreIssueSpansV1,
  );
  const verifiedV2Spans = verifyComparisonIssueSpans(
    version2BeforeSelfCheck,
    result.value.coreIssueSpansV2,
  );
  const spanEvidenceVerified =
    verifiedV1Spans.length === result.value.coreIssueSpansV1.length &&
    verifiedV2Spans.length === result.value.coreIssueSpansV2.length;
  const comparisonMetrics = buildVersionComparisonMetrics({
    scoringVersion: {
      schemaVersion: version1.assessment.schemaVersion,
      promptVersion: version1.assessment.versionSnapshot.promptVersion!,
      rubricVersion: version1.assessment.versionSnapshot.rubricVersion!,
      model: version1.assessment.versionSnapshot.model!,
    },
    v1Scores: persistedAssessmentScores(version1.assessment),
    v2Scores: persistedAssessmentScores(version2Assessment.persisted),
    v1WordCount: countComparisonWords(version1.content),
    v2WordCount: countComparisonWords(version2.content),
    v2BlindWordCount: countComparisonWords(version2BeforeSelfCheck),
    v1IssueSpans: verifiedV1Spans,
    v2IssueSpans: verifiedV2Spans,
    evidenceVerified: spanEvidenceVerified,
  });
  const adjudicatedJudgment: ComparisonJudgment = {
    ...result.value,
    targetApplied:
      result.value.targetApplied &&
      spanEvidenceVerified &&
      !comparisonMetrics.coreIssueRecurrence.recurred,
    coreIssueSpansV1: verifiedV1Spans,
    coreIssueSpansV2: verifiedV2Spans,
  };
  const now = new Date();
  const assisted = version2.assisted || rewrite.assisted;
  const prerequisiteSkipped = rewrite.prerequisiteSkipped || !hasBlindSnapshot;
  const canonicalEvidence = buildProviderAwareDelayedRewriteEvidence({
    id: newDomainId(),
    userId: job.ownerId,
    skillId: coreSkillId,
    ...(objective === undefined ? {} : { objectiveId: objective.id }),
    cycleId,
    rewriteTaskId: rewrite.id,
    topicId: cycle.question.topic || cycle.questionId,
    submittedAt: version2SubmittedAt,
    instructionExposureAt: rewrite.lastInstructionExposureAt,
    assisted,
    prerequisiteSkipped,
    judgment: adjudicatedJudgment,
    providerKind: job.versionSnapshot.providerKind ?? "unknown",
  });
  const followUps = followUpSchedule(cycle.startedAt);
  const transferQuestion = await findUnfamiliarQuestion({
    ownerId: job.ownerId,
    originalTopic: cycle.question.topic,
    preferredQuestionType: cycle.question.questionType,
    excludeQuestionId: cycle.questionId,
  });
  if (!transferQuestion) {
    throw new Error(
      "A cross-topic transfer task requires at least one accessible question on a different topic.",
    );
  }
  await databaseContext.db.transaction(async (transaction) => {
    const [lockedCycle] = await transaction
      .select()
      .from(trainingCycle)
      .where(eq(trainingCycle.id, cycleId))
      .for("update");
    if (!lockedCycle)
      throw new Error("The training cycle disappeared during comparison.");

    const [currentSkillState] = await transaction
      .select()
      .from(userSkillState)
      .where(
        and(
          eq(userSkillState.userId, job.ownerId),
          eq(userSkillState.skillId, coreSkillId),
        ),
      )
      .for("update");
    const priorLevel: MasteryLevel = currentSkillState?.transferredAt
      ? "transferred"
      : currentSkillState?.retainedAt
        ? "retained"
        : currentSkillState?.appliedAt
          ? "applied"
          : "practicing";
    const existingRewriteEvidence =
      await transaction.query.skillEvidenceEvent.findFirst({
        where: and(
          eq(skillEvidenceEvent.userId, job.ownerId),
          eq(skillEvidenceEvent.cycleId, cycleId),
          eq(skillEvidenceEvent.skillId, coreSkillId),
          eq(skillEvidenceEvent.evidenceStage, "DELAYED_REWRITE"),
          eq(skillEvidenceEvent.sourceType, "rewrite_task"),
          eq(skillEvidenceEvent.sourceId, rewrite.id),
        ),
      });
    const evidenceForGate = existingRewriteEvidence
      ? canonicalEvidenceFromPayload(existingRewriteEvidence.payload)
      : canonicalEvidence;
    if (!evidenceForGate) {
      throw new Error(
        "Persisted delayed-rewrite evidence is missing its canonical contract.",
      );
    }
    const retainedGate = evaluateRetainedGate(coreSkillId, priorLevel, [
      evidenceForGate,
    ]);
    if (!existingRewriteEvidence) {
      await transaction.insert(skillEvidenceEvent).values({
        id: canonicalEvidence.id,
        userId: job.ownerId,
        cycleId,
        skillId: coreSkillId,
        evidenceStage: canonicalEvidence.kind,
        sourceType: "rewrite_task",
        sourceId: rewrite.id,
        valid: retainedGate.passed,
        confidence: canonicalEvidence.confidence,
        occurredAt: version2SubmittedAt,
        payload: {
          canonicalEvidence,
          retainedGate,
          evidenceV2: result.value.evidenceV2,
          improvementsZh: result.value.improvementsZh,
          regressionsZh: result.value.regressionsZh,
          comparisonMetrics,
          verifiedCoreIssueSpansV1: verifiedV1Spans,
          verifiedCoreIssueSpansV2: verifiedV2Spans,
          modelEssay: result.value.modelEssay ?? "",
          referenceProviderKind: job.versionSnapshot.providerKind ?? "unknown",
          measuredDelaySeconds:
            rewrite.lastInstructionExposureAt === null
              ? null
              : Math.floor(
                  (version2SubmittedAt.getTime() -
                    rewrite.lastInstructionExposureAt.getTime()) /
                    1_000,
                ),
        },
      });
    }
    if (retainedGate.passed && currentSkillState?.retainedAt === null) {
      const retainedAt = new Date(evidenceForGate.occurredAt);
      await transaction
        .update(userSkillState)
        .set({
          retainedAt,
          stability: Math.max(currentSkillState.stability, 0.8),
          evidenceCount: currentSkillState.evidenceCount + 1,
        })
        .where(
          and(
            eq(userSkillState.userId, job.ownerId),
            eq(userSkillState.skillId, coreSkillId),
          ),
        );
    }

    const completed =
      lockedCycle.status === "CORE_CYCLE_COMPLETED"
        ? lockedCycle.status
        : transitionTrainingCycle(lockedCycle.status, "CORE_CYCLE_COMPLETED");
    if (lockedCycle.status !== "CORE_CYCLE_COMPLETED") {
      await transaction
        .update(trainingCycle)
        .set({ status: completed, completedAt: now })
        .where(eq(trainingCycle.id, cycleId));
    }
    if (rewrite.status !== "COMPLETED") {
      const rewriteStatus =
        rewrite.status === "ACTIVE"
          ? transitionRewrite(rewrite.status, "COMPLETED")
          : "COMPLETED";
      await transaction
        .update(rewriteTask)
        .set({ status: rewriteStatus, completedAt: version2SubmittedAt })
        .where(eq(rewriteTask.id, rewrite.id));
    }
    const existingTransfer = await transaction.query.transferTask.findFirst({
      where: and(
        eq(transferTask.sourceCycleId, cycleId),
        eq(transferTask.userId, job.ownerId),
        eq(transferTask.skillId, coreSkillId),
      ),
    });
    if (!existingTransfer) {
      await transaction.insert(transferTask).values({
        sourceCycleId: cycleId,
        userId: job.ownerId,
        questionId: transferQuestion.id,
        skillId: coreSkillId,
        objectiveId: objective?.id,
        status: "PLANNED",
        availableAt: followUps.transferAvailableAt,
        expiresAt: followUps.transferExpiresAt,
      });
    } else if (existingTransfer.questionId === cycle.questionId) {
      await transaction
        .update(transferTask)
        .set({ questionId: transferQuestion.id })
        .where(eq(transferTask.id, existingTransfer.id));
    }
    await transaction
      .insert(mixedReviewTask)
      .values({
        sourceCycleId: cycleId,
        userId: job.ownerId,
        status: "PLANNED",
        dueAt: followUps.mixedReviewDueAt,
      })
      .onConflictDoUpdate({
        target: mixedReviewTask.sourceCycleId,
        set: { dueAt: followUps.mixedReviewDueAt },
      });
  });
  return sumUsageRecords(version2Assessment.usage, usageRecord(result.usage));
}

async function evaluateTransfer(
  job: ClaimedJob,
): Promise<Record<string, number>> {
  const transferTaskId = job.protectedReference.transferTaskId;
  const transferResponseId = job.protectedReference.transferResponseId;
  if (!transferTaskId || !transferResponseId) {
    throw new Error(
      "Transfer evaluation is missing its protected task or response reference.",
    );
  }
  const existingEvidence =
    await databaseContext.db.query.skillEvidenceEvent.findFirst({
      where: and(
        eq(skillEvidenceEvent.userId, job.ownerId),
        eq(skillEvidenceEvent.sourceId, transferResponseId),
        eq(skillEvidenceEvent.sourceType, "transfer_response"),
        eq(skillEvidenceEvent.evidenceStage, "CROSS_TOPIC_TRANSFER"),
      ),
    });
  if (existingEvidence) return {};

  const task = await databaseContext.db.query.transferTask.findFirst({
    where: and(
      eq(transferTask.id, transferTaskId),
      eq(transferTask.userId, job.ownerId),
    ),
    with: { cycle: { with: { question: true } } },
  });
  if (!task) throw new Error("The protected transfer task no longer exists.");
  if (task.status !== "READY") {
    throw new Error("Only a ready transfer task can be evaluated.");
  }
  const targetQuestion = await databaseContext.db.query.question.findFirst({
    where: eq(question.id, task.questionId),
  });
  if (!targetQuestion) {
    throw new Error(
      "The transfer task's unfamiliar question no longer exists.",
    );
  }
  const responseRow =
    await databaseContext.db.query.skillEvidenceEvent.findFirst({
      where: and(
        eq(skillEvidenceEvent.userId, job.ownerId),
        eq(skillEvidenceEvent.sourceId, transferResponseId),
        eq(skillEvidenceEvent.sourceType, "transfer_response"),
        eq(skillEvidenceEvent.evidenceStage, "TRANSFER_RESPONSE"),
      ),
    });
  if (!responseRow) {
    throw new Error("The immutable transfer first answer no longer exists.");
  }
  const responsePayload = responseRow.payload;
  const firstAnswer = responsePayload.firstAnswer;
  const submittedAtValue = responsePayload.submittedAt;
  if (typeof firstAnswer !== "string" || firstAnswer.trim().length === 0) {
    throw new Error("The immutable transfer first answer is invalid.");
  }
  if (typeof submittedAtValue !== "string") {
    throw new Error("The transfer response has no immutable submission time.");
  }
  const submittedAt = new Date(submittedAtValue);
  if (!Number.isFinite(submittedAt.getTime())) {
    throw new Error("The transfer response submission time is invalid.");
  }
  const coreSkillId = task.skillId as SkillId;
  if (!SKILL_IDS.includes(coreSkillId)) {
    throw new Error("The transfer task has an invalid canonical skill ID.");
  }
  const skillDefinition = getSkillDefinition(coreSkillId);

  const adapter = await adapterForJob(job);
  const result = await adapter.generateStructured<TransferEvaluationJudgment>({
    model: model(job),
    idempotencyKey: job.id,
    system: PROMPT_REGISTRY.transfer_evaluation.system,
    input: `Original topic ID: ${JSON.stringify(task.cycle.question.topic)}\nNew topic ID: ${JSON.stringify(targetQuestion.topic)}\nNew IELTS Task 2 prompt: ${JSON.stringify(targetQuestion.prompt)}\nTarget skill ID (server-only; it was hidden from the learner): ${JSON.stringify(coreSkillId)}\nTarget skill definition: ${JSON.stringify(skillDefinition.description)}\nAccepted-answer rubric: ${JSON.stringify(skillDefinition.acceptedAnswerPolicy.rubricCriteria ?? [])}\nMinimum grading confidence: ${skillDefinition.minimumGradingConfidence}\nFirst-answer conditions: no hints, no reference answer, no target prompt, unassisted.\nLearner immutable first answer: ${JSON.stringify(firstAnswer)}\nJudge only this first answer. PASS requires correct, meaning-preserving, natural use of the target in the new topic. If this prompt and response did not provide a genuine natural opportunity to demonstrate the target, return naturalOpportunity=false; that is neutral rather than FAIL. Quote concrete learner evidence and keep confidence below the skill threshold when evidence is ambiguous.`,
    schemaName: "iwc_transfer_evaluation_v1",
    schema: transferEvaluationSchema as unknown as Record<string, unknown>,
    validate: (value): value is TransferEvaluationJudgment =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { targetApplied?: unknown }).targetApplied ===
        "boolean" &&
      typeof (value as { naturalOpportunity?: unknown }).naturalOpportunity ===
        "boolean" &&
      typeof (value as { confidence?: unknown }).confidence === "number" &&
      typeof (value as { feedbackZh?: unknown }).feedbackZh === "string" &&
      typeof (value as { feedbackEn?: unknown }).feedbackEn === "string" &&
      Array.isArray(
        (value as { userAnswerEvidence?: unknown }).userAnswerEvidence,
      ),
    maxOutputTokens: 1_500,
  });
  const providerKind = job.versionSnapshot.providerKind ?? "unknown";
  const verifiedJudgment = verifyTransferJudgmentEvidence(
    firstAnswer,
    result.value,
  );
  const canonicalEvidence = buildTransferEvidence({
    id: newDomainId(),
    userId: job.ownerId,
    skillId: coreSkillId,
    ...(task.objectiveId === null ? {} : { objectiveId: task.objectiveId }),
    transferTaskId: task.id,
    responseId: transferResponseId,
    topicId: targetQuestion.topic || targetQuestion.id,
    submittedAt,
    providerKind,
    judgment: verifiedJudgment,
  });
  const replacementQuestion = !verifiedJudgment.naturalOpportunity
    ? await findUnfamiliarQuestion({
        ownerId: job.ownerId,
        originalTopic: task.cycle.question.topic,
        preferredQuestionType: task.cycle.question.questionType,
        excludeQuestionId: targetQuestion.id,
      })
    : undefined;

  await databaseContext.db.transaction(async (transaction) => {
    const [lockedTask] = await transaction
      .select()
      .from(transferTask)
      .where(eq(transferTask.id, task.id))
      .for("update");
    if (!lockedTask) {
      throw new Error("The transfer task disappeared during evaluation.");
    }
    const persistedEvidence =
      await transaction.query.skillEvidenceEvent.findFirst({
        where: and(
          eq(skillEvidenceEvent.userId, job.ownerId),
          eq(skillEvidenceEvent.sourceId, transferResponseId),
          eq(skillEvidenceEvent.sourceType, "transfer_response"),
          eq(skillEvidenceEvent.evidenceStage, "CROSS_TOPIC_TRANSFER"),
        ),
      });
    if (persistedEvidence) return;

    const [currentSkillState] = await transaction
      .select()
      .from(userSkillState)
      .where(
        and(
          eq(userSkillState.userId, job.ownerId),
          eq(userSkillState.skillId, coreSkillId),
        ),
      )
      .for("update");
    const priorLevel: MasteryLevel = currentSkillState?.transferredAt
      ? "transferred"
      : currentSkillState?.retainedAt
        ? "retained"
        : currentSkillState?.appliedAt
          ? "applied"
          : "practicing";
    const transferGate = evaluateTransferredGate(
      coreSkillId,
      priorLevel,
      task.cycle.question.topic || task.cycle.questionId,
      [canonicalEvidence],
    );
    await transaction.insert(skillEvidenceEvent).values({
      id: canonicalEvidence.id,
      userId: job.ownerId,
      cycleId: task.sourceCycleId,
      skillId: coreSkillId,
      evidenceStage: canonicalEvidence.kind,
      sourceType: "transfer_response",
      sourceId: transferResponseId,
      valid: transferGate.passed,
      confidence: canonicalEvidence.confidence,
      occurredAt: submittedAt,
      payload: {
        transferTaskId: task.id,
        canonicalEvidence,
        transferGate,
        judgment: verifiedJudgment,
        providerKind,
        versionSnapshot: job.versionSnapshot,
        mockLanguageScoring: providerKind === "mock",
        responseMetadata: {
          firstAnswerStartedAt: responsePayload.firstAnswerStartedAt,
          submittedAt: submittedAt.toISOString(),
          elapsedSeconds: responsePayload.elapsedSeconds,
          targetHintHidden: true,
          assisted: false,
        },
      },
    });

    if (canonicalEvidence.outcome === "NO_OPPORTUNITY") {
      const noOpportunity =
        lockedTask.status === "READY"
          ? transitionTransfer(lockedTask.status, "NO_OPPORTUNITY")
          : lockedTask.status;
      const rescheduled =
        noOpportunity === "NO_OPPORTUNITY"
          ? transitionTransfer(noOpportunity, "RESCHEDULED")
          : noOpportunity;
      const availableAt = new Date(Date.now() + 48 * 60 * 60 * 1_000);
      await transaction
        .update(transferTask)
        .set({
          status: rescheduled,
          availableAt,
          expiresAt: new Date(availableAt.getTime() + 48 * 60 * 60 * 1_000),
          completedAt: null,
          ...(replacementQuestion === undefined
            ? {}
            : { questionId: replacementQuestion.id }),
        })
        .where(eq(transferTask.id, task.id));
      return;
    }

    const completed =
      lockedTask.status === "COMPLETED"
        ? lockedTask.status
        : transitionTransfer(lockedTask.status, "COMPLETED");
    await transaction
      .update(transferTask)
      .set({ status: completed, completedAt: submittedAt })
      .where(eq(transferTask.id, task.id));
    if (
      transferGate.passed &&
      currentSkillState &&
      currentSkillState.transferredAt === null
    ) {
      await transaction
        .update(userSkillState)
        .set({
          transferredAt: submittedAt,
          stability: Math.max(currentSkillState.stability, 1),
          evidenceCount: currentSkillState.evidenceCount + 1,
        })
        .where(
          and(
            eq(userSkillState.userId, job.ownerId),
            eq(userSkillState.skillId, coreSkillId),
          ),
        );
    }
  });
  return usageRecord(result.usage);
}

async function execute(
  job: ClaimedJob,
  helpers: JobHelpers,
): Promise<Record<string, number>> {
  switch (job.taskKind) {
    case "ielts_assessment":
      return assessEssay(job, helpers);
    case "issue_classification":
      return classifyIssues(job, helpers);
    case "exercise_generation":
      return generateLesson(job);
    case "open_sentence_evaluation":
    case "paragraph_evaluation":
      return evaluateExercise(job);
    case "version_comparison":
      return compareVersions(job);
    case "transfer_evaluation":
      return evaluateTransfer(job);
    case "objective_prioritization":
      return {};
  }
}

export async function runAIJob(
  payload: unknown,
  helpers: JobHelpers,
): Promise<void> {
  const input = payload as RunAIJobPayload;
  if (!input.jobId) throw new Error("run_ai_job requires a jobId.");
  const job = await claimAIJob(input.jobId, helpers.job.attempts);
  if (!job) return;
  try {
    const usage = await execute(job, helpers);
    await markJobSucceeded(job.id, usage);
  } catch (error) {
    await markJobFailure(job, error);
  }
}
