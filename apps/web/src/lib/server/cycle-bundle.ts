import { and, eq, or, sql } from "drizzle-orm";

import {
  LEARNING_CONTRACT_VERSION,
  getSkillDefinition,
  isContract,
  type AssessmentContract,
  type CycleBundle,
  type CycleBundleConflict,
  type CycleBundleLessonResponse,
  type IssueEvidence as IssueEvidenceContract,
  type LessonPlan as LessonPlanContract,
  type SkillEvidenceEvent as SkillEvidenceContract,
} from "@iwc/learning-contracts";
import {
  assessment,
  evaluation,
  exerciseAttempt,
  exerciseItem,
  importRecord,
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
  type Database,
} from "@iwc/db";
import {
  canonicalJson,
  sha256Hex,
  signCycleBundle,
  verifyCycleBundle,
} from "@iwc/exchange";

import { ApiProblem } from "./problem";

const recognitionTypes = new Set([
  "MINIMAL_PAIR",
  "ERROR_LOCATION",
  "MATCHING",
  "TASK_TYPE_IDENTIFICATION",
  "THESIS_COMPARISON",
  "RELEVANCE_FILTER",
  "WEIGHING_CHOICE",
  "FUNCTION_LABELING",
  "ORDERING",
  "LINK_RELATION",
]);

function diagnosisText(value: Record<string, string>): string {
  return (
    value.en ??
    value.zh ??
    Object.values(value)[0] ??
    "Evidence-backed learning issue."
  );
}

function asLessonPlan(value: unknown): LessonPlanContract | null {
  const candidate =
    Array.isArray(value) && value.length === 1 ? value[0] : value;
  return isContract("lessonPlan", candidate) ? candidate : null;
}

function evidenceFromPayload(
  value: Record<string, unknown>,
): SkillEvidenceContract | null {
  for (const candidate of [value.contract, value.canonicalEvidence, value]) {
    if (isContract("skillEvidenceEvent", candidate)) return candidate;
  }
  return null;
}

/**
 * Canonical learning content used to advance the exchange revision. Transport
 * metadata deliberately stays out so repeated exports remain idempotent.
 */
export function cycleBundleContentHash(bundle: CycleBundle): string {
  return sha256Hex(
    canonicalJson({
      contractVersion: bundle.contractVersion,
      appendOnlyEntityIds: [...bundle.manifest.appendOnlyEntityIds].sort(),
      cycle: bundle.cycle,
      attempts: bundle.attempts,
      assessment: bundle.assessment,
      issueEvidence: bundle.issueEvidence,
      objectives: bundle.objectives,
      lesson: bundle.lesson,
      evidence: bundle.evidence,
      dueTasks: bundle.dueTasks,
      conflicts: bundle.conflicts,
    }),
  );
}

async function buildCycleBundleInTransaction(
  db: Database,
  userId: string,
  cycleId: string,
): Promise<CycleBundle> {
  const cycle = await db.query.trainingCycle.findFirst({
    where: and(eq(trainingCycle.id, cycleId), eq(trainingCycle.userId, userId)),
    with: {
      question: true,
      writingAttempts: { with: { assessment: { with: { issues: true } } } },
      objectives: true,
      lessonPlans: {
        with: {
          items: {
            with: { attempts: { with: { evaluations: true } } },
          },
        },
      },
      rewriteTasks: true,
      transferTasks: true,
      mixedReviewTasks: true,
    },
  });
  if (!cycle) {
    throw new ApiProblem({
      title: "Cycle not found",
      status: 404,
      code: "CYCLE_NOT_FOUND",
      detail: "The training cycle does not exist.",
    });
  }
  const rewrite = cycle.rewriteTasks[0];
  const review = cycle.mixedReviewTasks[0];
  if (!rewrite || !review) {
    throw new ApiProblem({
      title: "Cycle is not portable yet",
      status: 409,
      code: "BUNDLE_DUE_TASKS_MISSING",
      detail:
        "Start Version 1 before exporting so deterministic due tasks exist.",
    });
  }
  const submittedAttempts = cycle.writingAttempts
    .filter((attempt) => attempt.submittedAt && attempt.content.trim())
    .sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
  const sourceAssessment = submittedAttempts
    .map((attempt) => attempt.assessment)
    .find((item) => item !== null && item !== undefined);
  const issues: IssueEvidenceContract[] = [...(sourceAssessment?.issues ?? [])]
    .sort(
      (left, right) =>
        left.startOffset - right.startOffset || left.id.localeCompare(right.id),
    )
    .map((issue) => ({
      schemaVersion: LEARNING_CONTRACT_VERSION,
      id: issue.id,
      essayAttemptId: sourceAssessment!.attemptId,
      skillId: issue.skillId as IssueEvidenceContract["skillId"],
      startOffset: issue.startOffset,
      endOffset: issue.endOffset,
      excerpt: issue.excerpt,
      diagnosis: diagnosisText(issue.diagnosis),
      categories: issue.categories as IssueEvidenceContract["categories"],
      hardGrammarError: issue.hardGrammarError,
      severity:
        issue.severity >= 3 ? "HIGH" : issue.severity === 2 ? "MEDIUM" : "LOW",
      confidence: issue.confidence,
      adjudicationStatus:
        issue.adjudicationStatus as IssueEvidenceContract["adjudicationStatus"],
    }));
  const importedAssessment = sourceAssessment?.portableContract;
  const assessmentContract: AssessmentContract | null = sourceAssessment
    ? isContract("assessment", importedAssessment)
      ? importedAssessment
      : {
          schemaVersion: LEARNING_CONTRACT_VERSION,
          id: sourceAssessment.id,
          attemptId: sourceAssessment.attemptId,
          rubricVersion:
            sourceAssessment.versionSnapshot.rubric ?? "ielts-task2@1.0.0",
          modelId: sourceAssessment.versionSnapshot.model ?? "unknown-model",
          overallBand: sourceAssessment.overallBand,
          criteria: {
            TR: {
              band: sourceAssessment.criterionScores.taskResponse,
              confidence: sourceAssessment.confidence,
              rationale:
                sourceAssessment.summary.TR ??
                sourceAssessment.summary.en ??
                "AI-estimated criterion result.",
              evidenceIds: issues
                .filter(
                  (issue) =>
                    getSkillDefinition(issue.skillId).dimension === "TR",
                )
                .map((issue) => issue.id),
            },
            CC: {
              band: sourceAssessment.criterionScores.coherenceCohesion,
              confidence: sourceAssessment.confidence,
              rationale:
                sourceAssessment.summary.CC ??
                sourceAssessment.summary.en ??
                "AI-estimated criterion result.",
              evidenceIds: issues
                .filter(
                  (issue) =>
                    getSkillDefinition(issue.skillId).dimension === "CC",
                )
                .map((issue) => issue.id),
            },
            LR: {
              band: sourceAssessment.criterionScores.lexicalResource,
              confidence: sourceAssessment.confidence,
              rationale:
                sourceAssessment.summary.LR ??
                sourceAssessment.summary.en ??
                "AI-estimated criterion result.",
              evidenceIds: issues
                .filter(
                  (issue) =>
                    getSkillDefinition(issue.skillId).dimension === "LR",
                )
                .map((issue) => issue.id),
            },
            GRA: {
              band: sourceAssessment.criterionScores.grammar,
              confidence: sourceAssessment.confidence,
              rationale:
                sourceAssessment.summary.GRA ??
                sourceAssessment.summary.en ??
                "AI-estimated criterion result.",
              evidenceIds: issues
                .filter(
                  (issue) =>
                    getSkillDefinition(issue.skillId).dimension === "GRA",
                )
                .map((issue) => issue.id),
            },
          },
          issueEvidenceIds: issues.map((issue) => issue.id),
        }
    : null;

  const storedPlan = cycle.lessonPlans[0];
  const canonicalPlan = storedPlan ? asLessonPlan(storedPlan.stages) : null;
  const responses: CycleBundleLessonResponse[] = [];
  if (storedPlan) {
    for (const item of [...storedPlan.items].sort(
      (left, right) =>
        left.ordinal - right.ordinal || left.id.localeCompare(right.id),
    )) {
      for (const response of [...item.attempts].sort((left, right) =>
        left.id.localeCompare(right.id),
      )) {
        const currentEvaluation = [...response.evaluations]
          .sort(
            (left, right) =>
              left.createdAt.getTime() - right.createdAt.getTime() ||
              left.id.localeCompare(right.id),
          )
          .at(-1);
        const responseEvaluations = [...response.evaluations]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((storedEvaluation) => ({
            id: storedEvaluation.id,
            attemptId:
              storedEvaluation.responseAttemptId ??
              response.finalAttemptEventId,
            outcome: storedEvaluation.passed
              ? ("PASS" as const)
              : ("FAIL" as const),
            confidence: storedEvaluation.confidence,
            dimensionScores: storedEvaluation.dimensionScores,
            userAnswerEvidence: storedEvaluation.userAnswerEvidence,
            mostImportantSuggestion: storedEvaluation.mostImportantSuggestion,
            evaluatorVersion:
              storedEvaluation.versionSnapshot.evaluator ??
              storedEvaluation.versionSnapshot.model ??
              "unknown-model",
            promptVersion:
              storedEvaluation.versionSnapshot.prompt ?? "open-exercise@1.0.0",
            rubricVersion:
              storedEvaluation.versionSnapshot.rubric ?? "open-exercise@1.0.0",
            adjudicationStatus:
              storedEvaluation.adjudicationStatus as "ACCEPTED",
            ...(storedEvaluation.supersedesEvaluationId
              ? {
                  supersedesEvaluationId:
                    storedEvaluation.supersedesEvaluationId,
                }
              : {}),
          }));
        const contractResponse: CycleBundleLessonResponse = {
          schemaVersion: LEARNING_CONTRACT_VERSION,
          id: response.id,
          exerciseItemId: item.id,
          firstAttemptId: response.firstAttemptEventId,
          finalAttemptId: response.finalAttemptEventId,
          ...(currentEvaluation
            ? { currentEvaluationId: currentEvaluation.id }
            : {}),
          attempts: [...response.contractAttempts].sort(
            (left, right) =>
              left.submittedAt.localeCompare(right.submittedAt) ||
              left.id.localeCompare(right.id),
          ),
          evaluations: responseEvaluations,
        };
        if (isContract("exerciseResponse", contractResponse)) {
          responses.push(contractResponse);
        }
      }
    }
  }
  const evidenceRows = await db.query.skillEvidenceEvent.findMany({
    where: and(
      eq(skillEvidenceEvent.userId, userId),
      eq(skillEvidenceEvent.cycleId, cycle.id),
    ),
  });
  const evidence = evidenceRows
    .map((row) => evidenceFromPayload(row.payload))
    .filter((row): row is SkillEvidenceContract => row !== null)
    .sort(
      (left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) ||
        left.id.localeCompare(right.id),
    );

  const unsigned: CycleBundle = {
    contractVersion: LEARNING_CONTRACT_VERSION,
    manifest: {
      bundleId: newDomainId(),
      cycleId: cycle.id,
      source: "WEB",
      exportedAt: new Date().toISOString(),
      revision: cycle.bundleRevision,
      parentRevision: cycle.bundleParentRevision,
      appendOnlyEntityIds: [],
    },
    checksum: {
      algorithm: "SHA-256",
      canonicalization: "JCS",
      value: "0".repeat(64),
    },
    cycle: {
      id: cycle.id,
      state: cycle.status,
      question: {
        // The exchange contract requires a stable UUIDv7. Public-bank slugs and
        // private `private-*` aliases remain Web-only lookup identifiers.
        id: cycle.question.id,
        prompt: cycle.question.prompt,
        instructions: cycle.question.instructions,
      },
      createdAt: cycle.createdAt.toISOString(),
      updatedAt: cycle.updatedAt.toISOString(),
      ...(cycle.completedAt
        ? { coreCompletedAt: cycle.completedAt.toISOString() }
        : {}),
    },
    attempts: submittedAttempts.map((attempt) => ({
      id: attempt.id,
      version: attempt.kind === "version_2" ? "V2" : "V1",
      content: attempt.content,
      startedAt: attempt.createdAt.toISOString(),
      submittedAt: attempt.submittedAt!.toISOString(),
      wordCount: attempt.wordCount,
      assisted: attempt.assisted,
      interrupted: attempt.interrupted,
      ...(attempt.draftBeforeSelfCheck
        ? { draftBeforeSelfCheck: attempt.draftBeforeSelfCheck }
        : {}),
      ...(attempt.draftAfterSelfCheck
        ? { draftAfterSelfCheck: attempt.draftAfterSelfCheck }
        : {}),
    })),
    assessment: assessmentContract,
    issueEvidence: issues,
    objectives: [...cycle.objectives]
      .sort(
        (left, right) =>
          left.priority - right.priority || left.id.localeCompare(right.id),
      )
      .map((objective) => ({
        id: objective.id,
        trainingCycleId: cycle.id,
        skillId:
          objective.skillId as (typeof cycle.objectives)[number]["skillId"] &
            IssueEvidenceContract["skillId"],
        role: objective.role,
        sourceEvidenceIds: objective.sourceEvidenceIds,
        priority: objective.priority,
        successCriterion: objective.successCriterion,
      })),
    lesson: { plan: canonicalPlan, responses },
    evidence,
    dueTasks: {
      rewrite: {
        id: rewrite.id,
        status: rewrite.status,
        targetRewriteAt: rewrite.availableAt.toISOString(),
        dueAt:
          rewrite.contractDueAt?.toISOString() ??
          (rewrite.lastInstructionExposureAt
            ? rewrite.availableAt.toISOString()
            : null),
        lastInstructionExposureAt:
          rewrite.lastInstructionExposureAt?.toISOString() ?? null,
        assisted: rewrite.assisted,
        prerequisiteSkipped: rewrite.prerequisiteSkipped,
      },
      transfers: [...cycle.transferTasks]
        .filter((task) => task.objectiveId !== null)
        .sort(
          (left, right) =>
            left.availableAt.getTime() - right.availableAt.getTime() ||
            left.id.localeCompare(right.id),
        )
        .map((task) => ({
          id: task.id,
          objectiveId: task.objectiveId!,
          status: task.status,
          windowStartsAt: task.availableAt.toISOString(),
          windowEndsAt: (task.expiresAt ?? task.availableAt).toISOString(),
          dueAt:
            task.contractDueAt?.toISOString() ?? task.availableAt.toISOString(),
          naturalOpportunityDefinition: task.naturalOpportunityDefinition,
          noHintRequired: task.noHintRequired as true,
        })),
      mixedReview: {
        id: review.id,
        dueAt: review.dueAt.toISOString(),
        status: review.status as
          | "PLANNED"
          | "READY"
          | "COMPLETED"
          | "RESCHEDULED",
      },
    },
    conflicts: [...(cycle.bundleConflicts as CycleBundleConflict[])].sort(
      (left, right) =>
        left.detectedAt.localeCompare(right.detectedAt) ||
        left.id.localeCompare(right.id),
    ),
  };

  const concreteIds = new Set<string>([
    ...cycle.bundleEntityIds,
    unsigned.cycle.id,
    unsigned.cycle.question.id,
    ...unsigned.attempts.map((item) => item.id),
    ...unsigned.issueEvidence.map((item) => item.id),
    ...unsigned.objectives.map((item) => item.id),
    ...unsigned.lesson.responses.flatMap((item) => [
      item.id,
      ...item.attempts.map((attempt) => attempt.id),
      ...item.evaluations.map((evaluationItem) => evaluationItem.id),
    ]),
    ...unsigned.evidence.map((item) => item.id),
    unsigned.dueTasks.rewrite.id,
    ...unsigned.dueTasks.transfers.map((item) => item.id),
    unsigned.dueTasks.mixedReview.id,
  ]);
  if (unsigned.assessment) concreteIds.add(unsigned.assessment.id);
  if (unsigned.lesson.plan) {
    concreteIds.add(unsigned.lesson.plan.id);
    for (const block of unsigned.lesson.plan.blocks) {
      concreteIds.add(block.id);
      for (const item of block.items) concreteIds.add(item.id);
    }
  }
  let portable = signCycleBundle({
    ...unsigned,
    manifest: {
      ...unsigned.manifest,
      appendOnlyEntityIds: [...concreteIds].sort(),
    },
  });
  const contentHash = cycleBundleContentHash(portable);
  const changed =
    cycle.bundleContentHash !== null && cycle.bundleContentHash !== contentHash;
  const revision = changed ? cycle.bundleRevision + 1 : cycle.bundleRevision;
  const parentRevision = changed
    ? cycle.bundleRevision
    : cycle.bundleParentRevision;
  if (
    cycle.bundleContentHash !== contentHash ||
    cycle.bundleRevision !== revision ||
    cycle.bundleParentRevision !== parentRevision
  ) {
    await db
      .update(trainingCycle)
      .set({
        bundleRevision: revision,
        bundleParentRevision: parentRevision,
        bundleContentHash: contentHash,
        // Updating transport metadata must not manufacture learning content.
        updatedAt: cycle.updatedAt,
      })
      .where(
        and(eq(trainingCycle.id, cycle.id), eq(trainingCycle.userId, userId)),
      );
  }
  if (
    portable.manifest.revision !== revision ||
    portable.manifest.parentRevision !== parentRevision
  ) {
    portable = signCycleBundle({
      ...portable,
      manifest: { ...portable.manifest, revision, parentRevision },
    });
  }
  return portable;
}

export async function buildCycleBundle(
  db: Database,
  userId: string,
  cycleId: string,
): Promise<CycleBundle> {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select id from ${trainingCycle} where ${trainingCycle.id} = ${cycleId} and ${trainingCycle.userId} = ${userId} for update`,
    );
    return buildCycleBundleInTransaction(
      transaction as unknown as Database,
      userId,
      cycleId,
    );
  });
}

type MergePlan =
  | { readonly kind: "IDEMPOTENT" }
  | { readonly kind: "APPEND" }
  | { readonly kind: "CONFLICT"; readonly fieldPaths: readonly string[] };

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function indexById<T extends { readonly id: string }>(values: readonly T[]) {
  return new Map(values.map((value) => [value.id, value] as const));
}

function requireAppendOnlyEntities(
  localValues: readonly { readonly id: string }[],
  incomingValues: readonly { readonly id: string }[],
  path: string,
  conflicts: string[],
): void {
  const incoming = indexById(incomingValues);
  for (const local of localValues) {
    const candidate = incoming.get(local.id);
    if (!candidate || !sameValue(local, candidate)) {
      conflicts.push(`${path}/${local.id}`);
    }
  }
}

/** Decide whether an incoming snapshot is the direct append-only successor. */
export function planCycleBundleMerge(
  local: CycleBundle,
  incoming: CycleBundle,
): MergePlan {
  const localHash = cycleBundleContentHash(local);
  const incomingHash = cycleBundleContentHash(incoming);
  if (
    local.manifest.revision === incoming.manifest.revision &&
    localHash === incomingHash
  ) {
    return { kind: "IDEMPOTENT" };
  }

  const conflicts: string[] = [];
  if (
    incoming.manifest.revision !== local.manifest.revision + 1 ||
    incoming.manifest.parentRevision !== local.manifest.revision
  ) {
    conflicts.push("/manifest/revision", "/manifest/parentRevision");
  }
  if (local.cycle.id !== incoming.cycle.id) conflicts.push("/cycle/id");
  if (!sameValue(local.cycle.question, incoming.cycle.question)) {
    conflicts.push("/cycle/question");
  }
  if (
    new Date(local.cycle.createdAt).getTime() !==
    new Date(incoming.cycle.createdAt).getTime()
  ) {
    conflicts.push("/cycle/createdAt");
  }
  if (
    local.cycle.coreCompletedAt !== undefined &&
    local.cycle.coreCompletedAt !== incoming.cycle.coreCompletedAt
  ) {
    conflicts.push("/cycle/coreCompletedAt");
  }

  const localHistory = new Set(local.manifest.appendOnlyEntityIds);
  const incomingHistory = new Set(incoming.manifest.appendOnlyEntityIds);
  for (const id of localHistory) {
    if (!incomingHistory.has(id)) {
      conflicts.push(`/manifest/appendOnlyEntityIds/${id}`);
    }
  }
  requireAppendOnlyEntities(
    local.attempts,
    incoming.attempts,
    "/attempts",
    conflicts,
  );
  if (local.assessment) {
    if (
      !incoming.assessment ||
      !sameValue(local.assessment, incoming.assessment)
    ) {
      conflicts.push("/assessment");
    }
  }
  requireAppendOnlyEntities(
    local.issueEvidence,
    incoming.issueEvidence,
    "/issueEvidence",
    conflicts,
  );
  requireAppendOnlyEntities(
    local.objectives,
    incoming.objectives,
    "/objectives",
    conflicts,
  );
  if (local.lesson.plan) {
    if (
      !incoming.lesson.plan ||
      !sameValue(local.lesson.plan, incoming.lesson.plan)
    ) {
      conflicts.push("/lesson/plan");
    }
  }
  const incomingResponses = indexById(incoming.lesson.responses);
  for (const localResponse of local.lesson.responses) {
    const candidate = incomingResponses.get(localResponse.id);
    if (!candidate) {
      conflicts.push(`/lesson/responses/${localResponse.id}`);
      continue;
    }
    if (
      localResponse.schemaVersion !== candidate.schemaVersion ||
      localResponse.exerciseItemId !== candidate.exerciseItemId ||
      localResponse.firstAttemptId !== candidate.firstAttemptId
    ) {
      conflicts.push(`/lesson/responses/${localResponse.id}/identity`);
    }
    requireAppendOnlyEntities(
      localResponse.attempts,
      candidate.attempts,
      `/lesson/responses/${localResponse.id}/attempts`,
      conflicts,
    );
    requireAppendOnlyEntities(
      localResponse.evaluations,
      candidate.evaluations,
      `/lesson/responses/${localResponse.id}/evaluations`,
      conflicts,
    );
  }
  requireAppendOnlyEntities(
    local.evidence,
    incoming.evidence,
    "/evidence",
    conflicts,
  );
  if (local.dueTasks.rewrite.id !== incoming.dueTasks.rewrite.id) {
    conflicts.push("/dueTasks/rewrite/id");
  }
  const incomingTransfers = indexById(incoming.dueTasks.transfers);
  for (const task of local.dueTasks.transfers) {
    const candidate = incomingTransfers.get(task.id);
    if (!candidate || candidate.objectiveId !== task.objectiveId) {
      conflicts.push(`/dueTasks/transfers/${task.id}`);
    }
  }
  if (local.dueTasks.mixedReview.id !== incoming.dueTasks.mixedReview.id) {
    conflicts.push("/dueTasks/mixedReview/id");
  }
  requireAppendOnlyEntities(
    local.conflicts,
    incoming.conflicts,
    "/conflicts",
    conflicts,
  );
  return conflicts.length
    ? { kind: "CONFLICT", fieldPaths: [...new Set(conflicts)].sort() }
    : { kind: "APPEND" };
}

export interface BundleImportResult {
  imported: boolean;
  idempotent: boolean;
  cycleId: string;
  bundleId: string;
}

async function insertEvaluationContract(
  db: Database,
  responseId: string,
  result: CycleBundleLessonResponse["evaluations"][number],
): Promise<void> {
  await db.insert(evaluation).values({
    id: result.id,
    exerciseAttemptId: responseId,
    responseAttemptId: result.attemptId,
    passed: result.outcome === "PASS",
    confidence: result.confidence,
    feedback: { en: result.mostImportantSuggestion },
    dimensionScores: { ...result.dimensionScores },
    userAnswerEvidence: [...result.userAnswerEvidence],
    mostImportantSuggestion: result.mostImportantSuggestion,
    adjudicationStatus: result.adjudicationStatus,
    supersedesEvaluationId: result.supersedesEvaluationId,
    versionSnapshot: {
      evaluator: result.evaluatorVersion,
      prompt: result.promptVersion,
      rubric: result.rubricVersion,
    },
    validForEvidence:
      result.outcome !== "NO_OPPORTUNITY" &&
      result.adjudicationStatus === "ACCEPTED",
  });
}

async function insertResponseContract(
  db: Database,
  userId: string,
  response: CycleBundleLessonResponse,
): Promise<void> {
  const first = response.attempts.find(
    (attempt) => attempt.id === response.firstAttemptId,
  )!;
  const final = response.attempts.find(
    (attempt) => attempt.id === response.finalAttemptId,
  )!;
  await db.insert(exerciseAttempt).values({
    id: response.id,
    exerciseItemId: response.exerciseItemId,
    userId,
    schemaVersion: response.schemaVersion,
    firstAttemptEventId: response.firstAttemptId,
    finalAttemptEventId: response.finalAttemptId,
    contractAttempts: [...response.attempts],
    firstAnswer: first.answer,
    finalAnswer: final.answer,
    hintsUsed: response.attempts.filter((item) => item.hintLevel !== "NONE")
      .length,
    hintLevel: final.hintLevel,
    referenceAnswerSeen: final.referenceAnswerSeen,
  });
  for (const result of response.evaluations) {
    await insertEvaluationContract(db, response.id, result);
  }
}

async function applyCycleBundleAppend(
  db: Database,
  userId: string,
  local: CycleBundle,
  incoming: CycleBundle,
): Promise<void> {
  const localAttemptIds = new Set(local.attempts.map((item) => item.id));
  for (const attempt of incoming.attempts) {
    if (localAttemptIds.has(attempt.id)) continue;
    await db.insert(writingAttempt).values({
      id: attempt.id,
      cycleId: incoming.cycle.id,
      userId,
      kind: attempt.version === "V1" ? "version_1" : "version_2",
      content: attempt.content,
      wordCount: attempt.wordCount,
      lockedAt: new Date(attempt.submittedAt),
      submittedAt: new Date(attempt.submittedAt),
      assisted: attempt.assisted,
      interrupted: attempt.interrupted,
      draftBeforeSelfCheck: attempt.draftBeforeSelfCheck,
      draftAfterSelfCheck: attempt.draftAfterSelfCheck,
      createdAt: new Date(attempt.startedAt),
    });
  }

  if (!local.assessment && incoming.assessment) {
    const criteria = incoming.assessment.criteria;
    await db.insert(assessment).values({
      id: incoming.assessment.id,
      attemptId: incoming.assessment.attemptId,
      schemaVersion: incoming.assessment.schemaVersion,
      overallBand: incoming.assessment.overallBand,
      criterionScores: {
        taskResponse: criteria.TR.band,
        coherenceCohesion: criteria.CC.band,
        lexicalResource: criteria.LR.band,
        grammar: criteria.GRA.band,
      },
      summary: {
        TR: criteria.TR.rationale,
        CC: criteria.CC.rationale,
        LR: criteria.LR.rationale,
        GRA: criteria.GRA.rationale,
        en: "Imported AI estimate; not an official IELTS score or teacher certification.",
      },
      confidence:
        Object.values(criteria).reduce(
          (sum, item) => sum + item.confidence,
          0,
        ) / 4,
      isAiEstimate: true,
      portableContract: { ...incoming.assessment },
      versionSnapshot: {
        rubric: incoming.assessment.rubricVersion,
        model: incoming.assessment.modelId,
        contract: incoming.assessment.schemaVersion,
      },
    });
  }
  const localIssueIds = new Set(local.issueEvidence.map((item) => item.id));
  const newIssues = incoming.issueEvidence.filter(
    (item) => !localIssueIds.has(item.id),
  );
  if (newIssues.length && incoming.assessment) {
    await db.insert(issueEvidence).values(
      newIssues.map((issue) => ({
        id: issue.id,
        assessmentId: incoming.assessment!.id,
        skillId: issue.skillId,
        startOffset: issue.startOffset,
        endOffset: issue.endOffset,
        excerpt: issue.excerpt,
        diagnosis: { en: issue.diagnosis },
        categories: [...issue.categories],
        hardGrammarError: issue.hardGrammarError,
        severity:
          issue.severity === "HIGH" ? 3 : issue.severity === "MEDIUM" ? 2 : 1,
        confidence: issue.confidence,
        adjudicationStatus: issue.adjudicationStatus,
      })),
    );
  }
  const localObjectiveIds = new Set(local.objectives.map((item) => item.id));
  const newObjectives = incoming.objectives.filter(
    (item) => !localObjectiveIds.has(item.id),
  );
  if (newObjectives.length) {
    await db.insert(learningObjective).values(
      newObjectives.map((objective) => ({
        id: objective.id,
        cycleId: incoming.cycle.id,
        skillId: objective.skillId,
        role: objective.role,
        sourceEvidenceIds: [...objective.sourceEvidenceIds],
        priority: objective.priority,
        successCriterion: objective.successCriterion,
      })),
    );
  }

  if (!local.lesson.plan && incoming.lesson.plan) {
    const plan = incoming.lesson.plan;
    const planItems = plan.blocks.flatMap((block) => block.items);
    const activeSeconds = planItems.reduce(
      (sum, item) => sum + item.expectedActiveSeconds,
      0,
    );
    const totalSeconds = planItems.reduce(
      (sum, item) => sum + item.expectedTotalSeconds,
      0,
    );
    const recognitionSeconds = planItems
      .filter((item) => recognitionTypes.has(item.itemType))
      .reduce((sum, item) => sum + item.expectedTotalSeconds, 0);
    await db.insert(lessonPlan).values({
      id: plan.id,
      cycleId: incoming.cycle.id,
      coreSkillId:
        plan.objectives.find((objective) => objective.role === "CORE")
          ?.skillId ?? incoming.objectives[0]!.skillId,
      schemaVersion: plan.schemaVersion,
      plannedMinutes: Math.round(plan.plannedUserSeconds / 60),
      coreMinutes: Math.round(plan.corePathSeconds / 60),
      activeOutputRatio: totalSeconds ? activeSeconds / totalSeconds : 0,
      selectionRatio: totalSeconds ? recognitionSeconds / totalSeconds : 0,
      remediationMinutes: Math.round(plan.flexiblePathSeconds / 60),
      stages: [plan],
    });
    let ordinal = 0;
    for (const block of plan.blocks) {
      for (const item of block.items) {
        ordinal += 1;
        await db.insert(exerciseItem).values({
          id: item.id,
          lessonPlanId: plan.id,
          learningObjectiveId: item.learningObjectiveId,
          ordinal,
          itemType: item.itemType,
          prompt: { en: item.prompt },
          evaluationContract: { ...item, path: block.path },
          expectedMinutes: Math.ceil(item.expectedTotalSeconds / 60),
        });
      }
    }
  }
  const localResponses = indexById(local.lesson.responses);
  for (const response of incoming.lesson.responses) {
    const previous = localResponses.get(response.id);
    if (!previous) {
      await insertResponseContract(db, userId, response);
      continue;
    }
    const previousEvaluationIds = new Set(
      previous.evaluations.map((item) => item.id),
    );
    const final = response.attempts.find(
      (attempt) => attempt.id === response.finalAttemptId,
    )!;
    await db
      .update(exerciseAttempt)
      .set({
        finalAttemptEventId: response.finalAttemptId,
        contractAttempts: [...response.attempts],
        finalAnswer: final.answer,
        hintsUsed: response.attempts.filter((item) => item.hintLevel !== "NONE")
          .length,
        hintLevel: final.hintLevel,
        referenceAnswerSeen: final.referenceAnswerSeen,
      })
      .where(eq(exerciseAttempt.id, response.id));
    for (const result of response.evaluations) {
      if (!previousEvaluationIds.has(result.id)) {
        await insertEvaluationContract(db, response.id, result);
      }
    }
  }

  const localEvidenceIds = new Set(local.evidence.map((item) => item.id));
  const newEvidence = incoming.evidence.filter(
    (item) => !localEvidenceIds.has(item.id),
  );
  if (newEvidence.length) {
    await db.insert(skillEvidenceEvent).values(
      newEvidence.map((event) => ({
        id: event.id,
        userId,
        cycleId: incoming.cycle.id,
        skillId: event.skillId,
        evidenceStage: event.kind,
        sourceType: event.sourceEntityType,
        sourceId: event.sourceEntityId,
        valid: event.validForStateTransition,
        confidence: event.confidence,
        occurredAt: new Date(event.occurredAt),
        payload: { contract: event },
      })),
    );
  }

  await db
    .update(rewriteTask)
    .set({
      status: incoming.dueTasks.rewrite.status,
      availableAt: new Date(incoming.dueTasks.rewrite.targetRewriteAt),
      contractDueAt: incoming.dueTasks.rewrite.dueAt
        ? new Date(incoming.dueTasks.rewrite.dueAt)
        : null,
      lastInstructionExposureAt: incoming.dueTasks.rewrite
        .lastInstructionExposureAt
        ? new Date(incoming.dueTasks.rewrite.lastInstructionExposureAt)
        : null,
      assisted: incoming.dueTasks.rewrite.assisted,
      prerequisiteSkipped: incoming.dueTasks.rewrite.prerequisiteSkipped,
    })
    .where(eq(rewriteTask.id, incoming.dueTasks.rewrite.id));
  const localTransfers = indexById(local.dueTasks.transfers);
  for (const task of incoming.dueTasks.transfers) {
    if (!localTransfers.has(task.id)) {
      await db.insert(transferTask).values({
        id: task.id,
        sourceCycleId: incoming.cycle.id,
        userId,
        questionId: incoming.cycle.question.id,
        skillId:
          incoming.objectives.find(
            (objective) => objective.id === task.objectiveId,
          )?.skillId ?? incoming.objectives[0]!.skillId,
        objectiveId: task.objectiveId,
        status: task.status,
        availableAt: new Date(task.windowStartsAt),
        contractDueAt: new Date(task.dueAt),
        naturalOpportunityDefinition: task.naturalOpportunityDefinition,
        noHintRequired: task.noHintRequired,
        expiresAt: new Date(task.windowEndsAt),
      });
    } else {
      await db
        .update(transferTask)
        .set({
          status: task.status,
          availableAt: new Date(task.windowStartsAt),
          contractDueAt: new Date(task.dueAt),
          naturalOpportunityDefinition: task.naturalOpportunityDefinition,
          noHintRequired: task.noHintRequired,
          expiresAt: new Date(task.windowEndsAt),
        })
        .where(eq(transferTask.id, task.id));
    }
  }
  await db
    .update(mixedReviewTask)
    .set({
      status: incoming.dueTasks.mixedReview.status,
      dueAt: new Date(incoming.dueTasks.mixedReview.dueAt),
    })
    .where(eq(mixedReviewTask.id, incoming.dueTasks.mixedReview.id));
  await db
    .update(trainingCycle)
    .set({
      status: incoming.cycle.state,
      coreSkillId:
        incoming.objectives.find((objective) => objective.role === "CORE")
          ?.skillId ?? null,
      completedAt: incoming.cycle.coreCompletedAt
        ? new Date(incoming.cycle.coreCompletedAt)
        : null,
      bundleRevision: incoming.manifest.revision,
      bundleParentRevision: incoming.manifest.parentRevision,
      bundleContentHash: cycleBundleContentHash(incoming),
      bundleEntityIds: [...incoming.manifest.appendOnlyEntityIds],
      bundleConflicts: [...incoming.conflicts],
      updatedAt: new Date(incoming.cycle.updatedAt),
    })
    .where(
      and(
        eq(trainingCycle.id, incoming.cycle.id),
        eq(trainingCycle.userId, userId),
      ),
    );
}

export async function importCycleBundle(
  db: Database,
  userId: string,
  unknownBundle: unknown,
): Promise<BundleImportResult> {
  const bundle = verifyCycleBundle(unknownBundle);
  const existingImport = await db.query.importRecord.findFirst({
    where: and(
      eq(importRecord.userId, userId),
      eq(importRecord.bundleId, bundle.manifest.bundleId),
    ),
  });
  if (existingImport) {
    if (existingImport.checksum !== bundle.checksum.value) {
      throw new ApiProblem({
        title: "Bundle ID collision",
        status: 409,
        code: "BUNDLE_ID_COLLISION",
        detail: "This bundle ID was already imported with different content.",
      });
    }
    if (existingImport.status === "CONFLICT") {
      throw new ApiProblem({
        title: "Import conflict",
        status: 409,
        code: "BUNDLE_CONFLICT",
        detail:
          "This bundle was already rejected as a conflicting branch; no learning content was overwritten.",
        conflicts: existingImport.conflicts,
      });
    }
    return {
      imported: false,
      idempotent: true,
      cycleId: bundle.cycle.id,
      bundleId: bundle.manifest.bundleId,
    };
  }
  const existingCycle = await db.query.trainingCycle.findFirst({
    where: and(
      eq(trainingCycle.id, bundle.cycle.id),
      eq(trainingCycle.userId, userId),
    ),
  });
  if (existingCycle) {
    const outcome = await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select id from ${trainingCycle} where ${trainingCycle.id} = ${bundle.cycle.id} and ${trainingCycle.userId} = ${userId} for update`,
      );
      const local = await buildCycleBundleInTransaction(
        transaction as unknown as Database,
        userId,
        bundle.cycle.id,
      );
      const plan = planCycleBundleMerge(local, bundle);
      if (plan.kind === "CONFLICT") {
        const conflict: CycleBundleConflict = {
          id: newDomainId(),
          entityType: "ATTEMPT",
          entityId: bundle.cycle.id,
          fieldPaths: plan.fieldPaths,
          localValueHash: cycleBundleContentHash(local),
          incomingValueHash: cycleBundleContentHash(bundle),
          status: "UNRESOLVED",
          detectedAt: new Date().toISOString(),
        };
        await transaction.insert(importRecord).values({
          userId,
          bundleId: bundle.manifest.bundleId,
          checksum: bundle.checksum.value,
          schemaVersion: bundle.contractVersion,
          status: "CONFLICT",
          conflicts: [conflict],
        });
        return { kind: "CONFLICT" as const, conflict };
      }
      if (plan.kind === "APPEND") {
        await applyCycleBundleAppend(
          transaction as unknown as Database,
          userId,
          local,
          bundle,
        );
      }
      await transaction.insert(importRecord).values({
        userId,
        bundleId: bundle.manifest.bundleId,
        checksum: bundle.checksum.value,
        schemaVersion: bundle.contractVersion,
        status: "IMPORTED",
        conflicts: [],
      });
      return { kind: plan.kind };
    });
    if (outcome.kind === "CONFLICT") {
      throw new ApiProblem({
        title: "Import conflict",
        status: 409,
        code: "BUNDLE_CONFLICT",
        detail:
          "The incoming bundle is not the direct append-only successor; no learning content was overwritten.",
        conflicts: [outcome.conflict],
      });
    }
    return {
      imported: outcome.kind === "APPEND",
      idempotent: outcome.kind === "IDEMPOTENT",
      cycleId: bundle.cycle.id,
      bundleId: bundle.manifest.bundleId,
    };
  }

  await db.transaction(async (transaction) => {
    let selectedQuestion = await transaction.query.question.findFirst({
      where: or(
        eq(question.id, bundle.cycle.question.id),
        eq(question.externalId, bundle.cycle.question.id),
      ),
    });
    if (!selectedQuestion) {
      [selectedQuestion] = await transaction
        .insert(question)
        .values({
          id: bundle.cycle.question.id,
          externalId: bundle.cycle.question.id,
          ownerId: userId,
          source: "cycle_bundle_import",
          visibility: "private",
          ieltsTrack: "academic",
          questionType: "imported",
          topic: "imported",
          prompt: bundle.cycle.question.prompt,
          instructions: bundle.cycle.question.instructions,
          attribution: "Private imported question",
          bankVersion: bundle.contractVersion,
        })
        .returning();
    }
    if (!selectedQuestion)
      throw new Error("Imported question could not be saved.");
    if (
      selectedQuestion.prompt !== bundle.cycle.question.prompt ||
      selectedQuestion.instructions !== bundle.cycle.question.instructions
    ) {
      throw new ApiProblem({
        title: "Import conflict",
        status: 409,
        code: "BUNDLE_CONFLICT",
        detail:
          "The question ID already exists with different immutable content; no data was overwritten.",
      });
    }
    await transaction.insert(trainingCycle).values({
      id: bundle.cycle.id,
      userId,
      questionId: selectedQuestion.id,
      status: bundle.cycle.state,
      schemaVersion: bundle.contractVersion,
      timezone: "UTC",
      coreSkillId:
        bundle.objectives.find((objective) => objective.role === "CORE")
          ?.skillId ?? null,
      bundleRevision: bundle.manifest.revision,
      bundleParentRevision: bundle.manifest.parentRevision,
      bundleContentHash: cycleBundleContentHash(bundle),
      bundleEntityIds: [...bundle.manifest.appendOnlyEntityIds],
      bundleConflicts: [...bundle.conflicts],
      startedAt: bundle.attempts[0]
        ? new Date(bundle.attempts[0].startedAt)
        : null,
      completedAt: bundle.cycle.coreCompletedAt
        ? new Date(bundle.cycle.coreCompletedAt)
        : null,
      createdAt: new Date(bundle.cycle.createdAt),
      updatedAt: new Date(bundle.cycle.updatedAt),
    });
    for (const attempt of bundle.attempts) {
      await transaction.insert(writingAttempt).values({
        id: attempt.id,
        cycleId: bundle.cycle.id,
        userId,
        kind: attempt.version === "V1" ? "version_1" : "version_2",
        content: attempt.content,
        wordCount: attempt.wordCount,
        lockedAt: new Date(attempt.submittedAt),
        submittedAt: new Date(attempt.submittedAt),
        assisted: attempt.assisted,
        interrupted: attempt.interrupted,
        draftBeforeSelfCheck: attempt.draftBeforeSelfCheck,
        draftAfterSelfCheck: attempt.draftAfterSelfCheck,
        createdAt: new Date(attempt.startedAt),
      });
    }
    if (bundle.assessment) {
      const criteria = bundle.assessment.criteria;
      await transaction.insert(assessment).values({
        id: bundle.assessment.id,
        attemptId: bundle.assessment.attemptId,
        schemaVersion: bundle.assessment.schemaVersion,
        overallBand: bundle.assessment.overallBand,
        criterionScores: {
          taskResponse: criteria.TR.band,
          coherenceCohesion: criteria.CC.band,
          lexicalResource: criteria.LR.band,
          grammar: criteria.GRA.band,
        },
        summary: {
          TR: criteria.TR.rationale,
          CC: criteria.CC.rationale,
          LR: criteria.LR.rationale,
          GRA: criteria.GRA.rationale,
          en: "Imported AI estimate; not an official IELTS score or teacher certification.",
        },
        confidence:
          Object.values(criteria).reduce(
            (sum, item) => sum + item.confidence,
            0,
          ) / 4,
        isAiEstimate: true,
        portableContract: { ...bundle.assessment },
        versionSnapshot: {
          rubric: bundle.assessment.rubricVersion,
          model: bundle.assessment.modelId,
          contract: bundle.assessment.schemaVersion,
        },
      });
      if (bundle.issueEvidence.length) {
        await transaction.insert(issueEvidence).values(
          bundle.issueEvidence.map((issue) => ({
            id: issue.id,
            assessmentId: bundle.assessment!.id,
            skillId: issue.skillId,
            startOffset: issue.startOffset,
            endOffset: issue.endOffset,
            excerpt: issue.excerpt,
            diagnosis: { en: issue.diagnosis },
            categories: [...issue.categories],
            hardGrammarError: issue.hardGrammarError,
            severity:
              issue.severity === "HIGH"
                ? 3
                : issue.severity === "MEDIUM"
                  ? 2
                  : 1,
            confidence: issue.confidence,
            adjudicationStatus: issue.adjudicationStatus,
          })),
        );
      }
    }
    if (bundle.objectives.length) {
      await transaction.insert(learningObjective).values(
        bundle.objectives.map((objective) => ({
          id: objective.id,
          cycleId: bundle.cycle.id,
          skillId: objective.skillId,
          role: objective.role,
          sourceEvidenceIds: [...objective.sourceEvidenceIds],
          priority: objective.priority,
          successCriterion: objective.successCriterion,
        })),
      );
    }
    const plan = bundle.lesson.plan;
    if (plan) {
      const planItems = plan.blocks.flatMap((block) => block.items);
      const activeSeconds = planItems.reduce(
        (sum, item) => sum + item.expectedActiveSeconds,
        0,
      );
      const totalSeconds = planItems.reduce(
        (sum, item) => sum + item.expectedTotalSeconds,
        0,
      );
      const recognitionSeconds = planItems
        .filter((item) => recognitionTypes.has(item.itemType))
        .reduce((sum, item) => sum + item.expectedTotalSeconds, 0);
      await transaction.insert(lessonPlan).values({
        id: plan.id,
        cycleId: bundle.cycle.id,
        coreSkillId:
          plan.objectives.find((objective) => objective.role === "CORE")
            ?.skillId ?? bundle.objectives[0]!.skillId,
        schemaVersion: plan.schemaVersion,
        plannedMinutes: Math.round(plan.plannedUserSeconds / 60),
        coreMinutes: Math.round(plan.corePathSeconds / 60),
        activeOutputRatio: totalSeconds ? activeSeconds / totalSeconds : 0,
        selectionRatio: totalSeconds ? recognitionSeconds / totalSeconds : 0,
        remediationMinutes: Math.round(plan.flexiblePathSeconds / 60),
        stages: [plan],
      });
      let ordinal = 0;
      for (const block of plan.blocks) {
        for (const item of block.items) {
          ordinal += 1;
          await transaction.insert(exerciseItem).values({
            id: item.id,
            lessonPlanId: plan.id,
            learningObjectiveId: item.learningObjectiveId,
            ordinal,
            itemType: item.itemType,
            prompt: { en: item.prompt },
            evaluationContract: { ...item, path: block.path },
            expectedMinutes: Math.ceil(item.expectedTotalSeconds / 60),
          });
        }
      }
      for (const response of bundle.lesson.responses) {
        const first = response.attempts.find(
          (attempt) => attempt.id === response.firstAttemptId,
        )!;
        const final = response.attempts.find(
          (attempt) => attempt.id === response.finalAttemptId,
        )!;
        await transaction.insert(exerciseAttempt).values({
          id: response.id,
          exerciseItemId: response.exerciseItemId,
          userId,
          schemaVersion: response.schemaVersion,
          firstAttemptEventId: response.firstAttemptId,
          finalAttemptEventId: response.finalAttemptId,
          contractAttempts: [...response.attempts],
          firstAnswer: first.answer,
          finalAnswer: final.answer,
          hintsUsed: response.attempts.filter(
            (item) => item.hintLevel !== "NONE",
          ).length,
          hintLevel: final.hintLevel,
          referenceAnswerSeen: final.referenceAnswerSeen,
        });
        for (const result of response.evaluations) {
          await transaction.insert(evaluation).values({
            id: result.id,
            exerciseAttemptId: response.id,
            responseAttemptId: result.attemptId,
            passed: result.outcome === "PASS",
            confidence: result.confidence,
            feedback: { en: result.mostImportantSuggestion },
            dimensionScores: { ...result.dimensionScores },
            userAnswerEvidence: [...result.userAnswerEvidence],
            mostImportantSuggestion: result.mostImportantSuggestion,
            adjudicationStatus: result.adjudicationStatus,
            supersedesEvaluationId: result.supersedesEvaluationId,
            versionSnapshot: {
              evaluator: result.evaluatorVersion,
              prompt: result.promptVersion,
              rubric: result.rubricVersion,
            },
            validForEvidence:
              result.outcome !== "NO_OPPORTUNITY" &&
              result.adjudicationStatus === "ACCEPTED",
          });
        }
      }
    }
    if (bundle.evidence.length) {
      await transaction.insert(skillEvidenceEvent).values(
        bundle.evidence.map((event) => ({
          id: event.id,
          userId,
          cycleId: bundle.cycle.id,
          skillId: event.skillId,
          evidenceStage: event.kind,
          sourceType: event.sourceEntityType,
          sourceId: event.sourceEntityId,
          valid: event.validForStateTransition,
          confidence: event.confidence,
          occurredAt: new Date(event.occurredAt),
          payload: { contract: event },
        })),
      );
    }
    await transaction.insert(rewriteTask).values({
      id: bundle.dueTasks.rewrite.id,
      cycleId: bundle.cycle.id,
      userId,
      status: bundle.dueTasks.rewrite.status,
      availableAt: new Date(bundle.dueTasks.rewrite.targetRewriteAt),
      contractDueAt: bundle.dueTasks.rewrite.dueAt
        ? new Date(bundle.dueTasks.rewrite.dueAt)
        : null,
      lastInstructionExposureAt: bundle.dueTasks.rewrite
        .lastInstructionExposureAt
        ? new Date(bundle.dueTasks.rewrite.lastInstructionExposureAt)
        : null,
      assisted: bundle.dueTasks.rewrite.assisted,
      prerequisiteSkipped: bundle.dueTasks.rewrite.prerequisiteSkipped,
      abstractChecklist: [],
    });
    for (const task of bundle.dueTasks.transfers) {
      await transaction.insert(transferTask).values({
        id: task.id,
        sourceCycleId: bundle.cycle.id,
        userId,
        questionId: selectedQuestion.id,
        skillId:
          bundle.objectives.find(
            (objective) => objective.id === task.objectiveId,
          )?.skillId ?? bundle.objectives[0]!.skillId,
        objectiveId: task.objectiveId,
        status: task.status,
        availableAt: new Date(task.windowStartsAt),
        contractDueAt: new Date(task.dueAt),
        naturalOpportunityDefinition: task.naturalOpportunityDefinition,
        noHintRequired: task.noHintRequired,
        expiresAt: new Date(task.windowEndsAt),
      });
    }
    await transaction.insert(mixedReviewTask).values({
      id: bundle.dueTasks.mixedReview.id,
      sourceCycleId: bundle.cycle.id,
      userId,
      status: bundle.dueTasks.mixedReview.status,
      dueAt: new Date(bundle.dueTasks.mixedReview.dueAt),
    });
    await transaction.insert(importRecord).values({
      userId,
      bundleId: bundle.manifest.bundleId,
      checksum: bundle.checksum.value,
      schemaVersion: bundle.contractVersion,
      status: "IMPORTED",
      conflicts: [],
    });
  });
  return {
    imported: true,
    idempotent: false,
    cycleId: bundle.cycle.id,
    bundleId: bundle.manifest.bundleId,
  };
}
