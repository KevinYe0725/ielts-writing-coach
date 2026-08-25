import { randomInt } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import {
  auditEvent,
  newDomainId,
  question,
  questionGenerationBatch,
  questionRecommendation,
  trainingCycle,
  transferTask,
  user,
  type Database,
} from "@iwc/db";
import {
  QUESTION_BANK,
  QUESTION_TYPES,
  TOPICS,
  type QuestionTopic,
  type QuestionType,
} from "@iwc/question-bank";

import {
  automaticQuestionBankRefillDecision,
  enqueueQuestionBankRefill,
} from "./jobs";
import { ApiProblem } from "./problem";
import {
  exposureCutoff,
  rankQuestionCandidates,
  selectTopBucket,
  type RecommendationCandidate,
} from "./question-recommendation-score";
import { isCanonicalStoredStaticQuestion } from "./questions";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
type QueryDatabase = Database | DatabaseTransaction;

const REFILL_THRESHOLD = 12;
const REFILL_PROPOSAL_COUNT = 15;
const GENERATED_SOURCES = ["AI_RESEARCHED", "AI_GENERATED"] as const;
const NON_TERMINAL_BATCH_STATUSES = [
  "QUEUED",
  "SEARCHING",
  "GENERATING",
  "VALIDATING",
] as const;

export interface RecommendedQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  topic: QuestionTopic;
  ieltsTrack: "academic" | "general_training";
  visibility: "public";
}

export type QuestionRecommendationProjection =
  | {
      id: string;
      status: "READY";
      question: RecommendedQuestion;
    }
  | {
      id: string;
      status: "PENDING" | "UNAVAILABLE";
      question: null;
    };

export interface CreateQuestionRecommendationInput {
  action: "INITIAL" | "SWAP";
  excludedQuestionId?: string;
}

export interface QuestionRecommendationServiceOptions {
  now?: () => Date;
  randomIndex?: (upperExclusive: number) => number;
  afterPersist?: (
    transaction: DatabaseTransaction,
    result: QuestionRecommendationProjection,
  ) => Promise<void>;
}

export interface QuestionSupplyRetryProjection {
  state: "STARTED" | "ATTACHED";
  batchStatus: (typeof questionGenerationBatch.$inferSelect)["status"];
}

export interface QuestionSupplyRetryOptions {
  afterPersist?: (
    transaction: DatabaseTransaction,
    result: QuestionSupplyRetryProjection,
  ) => Promise<void>;
}

export interface PublicQuestionCatalogItem extends RecommendedQuestion {
  source: string;
  status: "validated";
}

export async function listPublicQuestionCatalog(
  database: QueryDatabase,
  filters: { type?: QuestionType; topic?: QuestionTopic } = {},
): Promise<PublicQuestionCatalogItem[]> {
  const staticIdSet = new Set(QUESTION_BANK.map((item) => item.id));
  const storedStaticRows = await database
    .select()
    .from(question)
    .where(inArray(question.externalId, [...staticIdSet]));
  const storedStaticByExternalId = new Map(
    storedStaticRows.map((item) => [item.externalId, item]),
  );
  const staticQuestions = QUESTION_BANK.filter(
    (item) =>
      (filters.type === undefined || item.type === filters.type) &&
      (filters.topic === undefined || item.topic === filters.topic) &&
      (storedStaticByExternalId.get(item.id) === undefined ||
        isCanonicalStoredStaticQuestion(
          storedStaticByExternalId.get(item.id)!,
          item,
        )),
  ).map((item) => ({
    id: item.id,
    prompt: item.prompt,
    type: item.type,
    topic: item.topic,
    ieltsTrack: "academic" as const,
    visibility: "public" as const,
    source: item.origin,
    status: "validated" as const,
  }));
  const dynamicRows = await database
    .select({
      id: question.externalId,
      prompt: question.prompt,
      type: question.questionType,
      topic: question.topic,
      ieltsTrack: question.ieltsTrack,
      source: question.source,
    })
    .from(question)
    .innerJoin(
      questionGenerationBatch,
      eq(question.generationBatchId, questionGenerationBatch.id),
    )
    .where(
      and(
        eq(question.visibility, "public"),
        isNull(question.ownerId),
        inArray(question.source, [...GENERATED_SOURCES]),
        eq(questionGenerationBatch.status, "SUCCEEDED"),
        filters.type === undefined
          ? undefined
          : eq(question.questionType, filters.type),
        filters.topic === undefined
          ? undefined
          : eq(question.topic, filters.topic),
      ),
    )
    .orderBy(asc(question.externalId));

  const seen = new Set(staticQuestions.map((item) => item.id));
  const dynamicQuestions: PublicQuestionCatalogItem[] = dynamicRows.flatMap(
    (row) => {
      if (
        staticIdSet.has(row.id) ||
        seen.has(row.id) ||
        !isQuestionType(row.type) ||
        !isQuestionTopic(row.topic) ||
        (row.ieltsTrack !== "academic" && row.ieltsTrack !== "general_training")
      ) {
        return [];
      }
      seen.add(row.id);
      return [
        {
          id: row.id,
          prompt: row.prompt,
          type: row.type,
          topic: row.topic,
          ieltsTrack: row.ieltsTrack,
          visibility: "public" as const,
          source: row.source,
          status: "validated" as const,
        },
      ];
    },
  );
  return [...staticQuestions, ...dynamicQuestions];
}

export async function createQuestionRecommendation(
  database: Database,
  actorId: string,
  input: CreateQuestionRecommendationInput,
  options: QuestionRecommendationServiceOptions = {},
): Promise<QuestionRecommendationProjection> {
  if (input.action === "SWAP" && !input.excludedQuestionId) {
    throw new ApiProblem({
      title: "Current question required",
      status: 422,
      code: "SWAP_QUESTION_REQUIRED",
      detail:
        "Choose a current recommendation before requesting another question.",
    });
  }
  const now = options.now?.() ?? new Date();
  const randomIndex =
    options.randomIndex ?? ((upperExclusive) => randomInt(upperExclusive));

  return database.transaction(async (transaction) => {
    await lockLearner(transaction, actorId);
    const selection = await selectForLearner(transaction, actorId, {
      now,
      randomIndex,
      ...(input.excludedQuestionId === undefined
        ? {}
        : { excludedQuestionId: input.excludedQuestionId }),
    });
    const recommendationId = newDomainId();

    if (selection.question) {
      await transaction.insert(questionRecommendation).values({
        id: recommendationId,
        userId: actorId,
        questionExternalId: selection.question.id,
        action: input.action,
        status: "READY",
        excludedExternalId: input.excludedQuestionId ?? null,
        shownAt: now,
      });
      const result: QuestionRecommendationProjection = {
        id: recommendationId,
        status: "READY",
        question: selection.question,
      };
      if (selection.remainingEligibleCount < REFILL_THRESHOLD) {
        await reserveRefillWithoutRollingBackReady(transaction, actorId);
      }
      await options.afterPersist?.(transaction, result);
      return result;
    }

    const refill = await reserveRefill(transaction, actorId);
    if (refill.kind === "RECHECK") {
      const refreshed = await selectForLearner(transaction, actorId, {
        now,
        randomIndex,
        ...(input.excludedQuestionId === undefined
          ? {}
          : { excludedQuestionId: input.excludedQuestionId }),
      });
      if (refreshed.question) {
        await transaction.insert(questionRecommendation).values({
          id: recommendationId,
          userId: actorId,
          questionExternalId: refreshed.question.id,
          action: input.action,
          status: "READY",
          excludedExternalId: input.excludedQuestionId ?? null,
          shownAt: now,
        });
        const result: QuestionRecommendationProjection = {
          id: recommendationId,
          status: "READY",
          question: refreshed.question,
        };
        if (refreshed.remainingEligibleCount < REFILL_THRESHOLD) {
          await reserveRefillWithoutRollingBackReady(transaction, actorId);
        }
        await options.afterPersist?.(transaction, result);
        return result;
      }
      const result: QuestionRecommendationProjection = {
        id: recommendationId,
        status: "UNAVAILABLE",
        question: null,
      };
      await transaction.insert(questionRecommendation).values({
        id: recommendationId,
        userId: actorId,
        action: input.action,
        status: "UNAVAILABLE",
        excludedExternalId: input.excludedQuestionId ?? null,
        safeFailureCode: "QUESTION_SUPPLY_STATE_CHANGED",
      });
      await options.afterPersist?.(transaction, result);
      return result;
    }
    if (refill.kind === "COOLDOWN") {
      const result: QuestionRecommendationProjection = {
        id: recommendationId,
        status: "UNAVAILABLE",
        question: null,
      };
      await transaction.insert(questionRecommendation).values({
        id: recommendationId,
        userId: actorId,
        action: input.action,
        status: "UNAVAILABLE",
        excludedExternalId: input.excludedQuestionId ?? null,
        safeFailureCode: "QUESTION_BANK_REFILL_COOLDOWN",
      });
      await options.afterPersist?.(transaction, result);
      return result;
    }

    const result: QuestionRecommendationProjection = {
      id: recommendationId,
      status: "PENDING",
      question: null,
    };
    await transaction.insert(questionRecommendation).values({
      id: recommendationId,
      userId: actorId,
      generationBatchId: refill.batchId,
      action: input.action,
      status: "PENDING",
      excludedExternalId: input.excludedQuestionId ?? null,
    });
    await options.afterPersist?.(transaction, result);
    return result;
  });
}

export async function getQuestionRecommendation(
  database: Database,
  actorId: string,
  recommendationId: string,
  options: Pick<
    QuestionRecommendationServiceOptions,
    "now" | "randomIndex"
  > = {},
): Promise<QuestionRecommendationProjection> {
  const now = options.now?.() ?? new Date();
  const randomIndex =
    options.randomIndex ?? ((upperExclusive) => randomInt(upperExclusive));
  return database.transaction(async (transaction) => {
    await lockLearner(transaction, actorId);
    const [stored] = await transaction
      .select()
      .from(questionRecommendation)
      .where(
        and(
          eq(questionRecommendation.id, recommendationId),
          eq(questionRecommendation.userId, actorId),
        ),
      )
      .limit(1)
      .for("update");
    if (!stored) throw recommendationNotFound();
    if (stored.status === "READY") {
      const projected = stored.questionExternalId
        ? await findCatalogQuestion(transaction, stored.questionExternalId)
        : null;
      if (!projected) {
        throw new ApiProblem({
          title: "Recommendation unavailable",
          status: 503,
          code: "QUESTION_SUPPLY_UNAVAILABLE",
          detail:
            "This question is no longer available. Browse the question bank or paste your own question.",
        });
      }
      return { id: stored.id, status: "READY", question: projected };
    }
    if (stored.status === "UNAVAILABLE") {
      return { id: stored.id, status: "UNAVAILABLE", question: null };
    }
    if (!stored.generationBatchId) {
      return finalizeUnavailable(
        transaction,
        stored.id,
        "QUESTION_SUPPLY_STATE_INVALID",
      );
    }
    const batch = await transaction.query.questionGenerationBatch.findFirst({
      columns: { status: true, safeFailureCode: true },
      where: eq(questionGenerationBatch.id, stored.generationBatchId),
    });
    if (!batch || batch.status === "FAILED") {
      return finalizeUnavailable(
        transaction,
        stored.id,
        batch?.safeFailureCode ?? "QUESTION_SUPPLY_UNAVAILABLE",
      );
    }
    if (batch.status !== "SUCCEEDED") {
      return { id: stored.id, status: "PENDING", question: null };
    }

    const selection = await selectForLearner(transaction, actorId, {
      now,
      randomIndex,
      ...(stored.excludedExternalId === null
        ? {}
        : { excludedQuestionId: stored.excludedExternalId }),
    });
    if (!selection.question) {
      return finalizeUnavailable(
        transaction,
        stored.id,
        "QUESTION_SUPPLY_EMPTY_RESULT",
      );
    }
    await transaction
      .update(questionRecommendation)
      .set({
        status: "READY",
        questionExternalId: selection.question.id,
        shownAt: now,
        safeFailureCode: null,
      })
      .where(
        and(
          eq(questionRecommendation.id, stored.id),
          eq(questionRecommendation.status, "PENDING"),
        ),
      );
    if (selection.remainingEligibleCount < REFILL_THRESHOLD) {
      await reserveRefillWithoutRollingBackReady(transaction, actorId);
    }
    return { id: stored.id, status: "READY", question: selection.question };
  });
}

export async function assertRecommendationForCycle(
  database: Database,
  actorId: string,
  recommendationId: string,
  questionExternalId: string,
): Promise<void> {
  const stored = await database.query.questionRecommendation.findFirst({
    columns: { questionExternalId: true, status: true },
    where: and(
      eq(questionRecommendation.id, recommendationId),
      eq(questionRecommendation.userId, actorId),
    ),
  });
  if (!stored) throw recommendationNotFound();
  if (stored.status !== "READY") {
    throw new ApiProblem({
      title: "Recommendation not ready",
      status: 409,
      code: "RECOMMENDATION_NOT_READY",
      detail:
        "Wait for the recommended question or choose one from the question bank.",
    });
  }
  if (stored.questionExternalId !== questionExternalId) {
    throw new ApiProblem({
      title: "Recommendation does not match question",
      status: 409,
      code: "RECOMMENDATION_QUESTION_MISMATCH",
      detail:
        "Start the question attached to this recommendation or omit the recommendation reference.",
    });
  }
}

export async function retryQuestionBankRefill(
  database: Database,
  actorId: string,
  options: QuestionSupplyRetryOptions = {},
): Promise<QuestionSupplyRetryProjection> {
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext('question-bank-refill'))`,
    );
    const [active] = await transaction
      .select({
        id: questionGenerationBatch.id,
        status: questionGenerationBatch.status,
      })
      .from(questionGenerationBatch)
      .where(
        inArray(questionGenerationBatch.status, [
          ...NON_TERMINAL_BATCH_STATUSES,
        ]),
      )
      .orderBy(
        asc(questionGenerationBatch.createdAt),
        asc(questionGenerationBatch.id),
      )
      .limit(1)
      .for("update");
    if (active) {
      const result: QuestionSupplyRetryProjection = {
        state: "ATTACHED",
        batchStatus: active.status,
      };
      await transaction.insert(auditEvent).values({
        actorId,
        action: "question_supply.retry",
        targetType: "question_generation_batch",
        targetId: active.id,
        result: "attached",
        metadata: { outcome: "active_batch" },
      });
      await options.afterPersist?.(transaction, result);
      return result;
    }

    const [latest] = await transaction
      .select({
        id: questionGenerationBatch.id,
        status: questionGenerationBatch.status,
      })
      .from(questionGenerationBatch)
      .orderBy(
        desc(questionGenerationBatch.updatedAt),
        desc(questionGenerationBatch.id),
      )
      .limit(1)
      .for("update");
    if (!latest || latest.status !== "FAILED") {
      throw new ApiProblem({
        title: "Question supply retry unavailable",
        status: 409,
        code: "QUESTION_BANK_REFILL_RETRY_NOT_AVAILABLE",
        detail: "There is no failed question-supply batch to retry.",
      });
    }

    const batchId = newDomainId();
    const targetMix = await buildQuestionBankRefillTargetMix(transaction);
    await transaction.insert(questionGenerationBatch).values({
      id: batchId,
      triggeredByUserId: actorId,
      status: "QUEUED",
      mode: "OFFLINE",
      targetMix,
      promptVersion: "1.0.0",
      rubricVersion: "iwc-question-bank-refill-1.0.0",
    });
    await enqueueQuestionBankRefill(transaction, actorId, batchId, {
      bypassFailedCooldown: true,
    });
    const result: QuestionSupplyRetryProjection = {
      state: "STARTED",
      batchStatus: "QUEUED",
    };
    await transaction.insert(auditEvent).values({
      actorId,
      action: "question_supply.retry",
      targetType: "question_generation_batch",
      targetId: batchId,
      result: "success",
      metadata: { outcome: "new_batch" },
    });
    await options.afterPersist?.(transaction, result);
    return result;
  });
}

async function lockLearner(
  transaction: DatabaseTransaction,
  actorId: string,
): Promise<void> {
  const [locked] = await transaction
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, actorId))
    .for("update");
  if (!locked) {
    throw new ApiProblem({
      title: "Learner not found",
      status: 404,
      code: "LEARNER_NOT_FOUND",
      detail: "The learner account no longer exists.",
    });
  }
}

async function selectForLearner(
  transaction: DatabaseTransaction,
  actorId: string,
  input: {
    now: Date;
    randomIndex: (upperExclusive: number) => number;
    excludedQuestionId?: string;
  },
): Promise<{
  question: RecommendedQuestion | null;
  remainingEligibleCount: number;
}> {
  const priorCycles = await transaction
    .select({
      id: question.externalId,
      type: question.questionType,
      topic: question.topic,
    })
    .from(trainingCycle)
    .innerJoin(question, eq(trainingCycle.questionId, question.id))
    .where(eq(trainingCycle.userId, actorId));
  // The scorer deliberately consumes exactly the caller-supplied window. Keep
  // ordering and LIMIT in SQL so four or more histories cannot broaden it.
  const recentCycleRows = await transaction
    .select({
      id: question.externalId,
      type: question.questionType,
      topic: question.topic,
    })
    .from(trainingCycle)
    .innerJoin(question, eq(trainingCycle.questionId, question.id))
    .where(eq(trainingCycle.userId, actorId))
    .orderBy(desc(trainingCycle.createdAt), desc(trainingCycle.id))
    .limit(3);
  const transferred = await transaction
    .select({ id: question.externalId })
    .from(transferTask)
    .innerJoin(question, eq(transferTask.questionId, question.id))
    .where(eq(transferTask.userId, actorId));
  const exposures = await transaction
    .select({
      id: questionRecommendation.questionExternalId,
      excludedId: questionRecommendation.excludedExternalId,
    })
    .from(questionRecommendation)
    .where(
      and(
        eq(questionRecommendation.userId, actorId),
        or(
          and(
            eq(questionRecommendation.status, "READY"),
            gt(questionRecommendation.shownAt, exposureCutoff(input.now)),
          ),
          and(
            eq(questionRecommendation.action, "SWAP"),
            isNotNull(questionRecommendation.excludedExternalId),
            gt(
              sql`coalesce(${questionRecommendation.shownAt}, ${questionRecommendation.createdAt})`,
              exposureCutoff(input.now),
            ),
          ),
        ),
      ),
    );
  const catalog = await listPublicQuestionCatalog(transaction);
  const hardExcluded = new Set<string>([
    ...transferred.map((item) => item.id),
    ...exposures.flatMap((item) => (item.id ? [item.id] : [])),
    ...exposures.flatMap((item) => (item.excludedId ? [item.excludedId] : [])),
    ...(input.excludedQuestionId ? [input.excludedQuestionId] : []),
  ]);
  const candidates = catalog
    .filter((item) => !hardExcluded.has(item.id))
    .map(toScoreCandidate);
  const scoredPrior = priorCycles.flatMap(toValidatedScoreCandidate);
  const scoredRecent = recentCycleRows.flatMap(toValidatedScoreCandidate);
  const ranked = rankQuestionCandidates({
    candidates,
    priorCycles: scoredPrior,
    recentCycles: scoredRecent,
  });
  const selected = selectTopBucket(ranked, input.randomIndex);
  const selectedQuestion = selected
    ? (catalog.find((item) => item.id === selected.id) ?? null)
    : null;
  return {
    question: selectedQuestion,
    remainingEligibleCount: Math.max(0, ranked.length - (selected ? 1 : 0)),
  };
}

async function reserveRefillWithoutRollingBackReady(
  transaction: DatabaseTransaction,
  actorId: string,
): Promise<void> {
  try {
    await reserveRefill(transaction, actorId);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (
      code === "QUESTION_BANK_REFILL_ACTIVE" ||
      code === "QUESTION_BANK_REFILL_COOLDOWN"
    ) {
      return;
    }
    throw error;
  }
}

async function reserveRefill(
  transaction: DatabaseTransaction,
  actorId: string,
): Promise<
  | { kind: "RESERVED" | "ACTIVE"; batchId: string }
  | { kind: "COOLDOWN" }
  | { kind: "RECHECK" }
> {
  try {
    const batchId = await transaction.transaction(async (savepoint) => {
      const reservedBatchId = newDomainId();
      const targetMix = await buildQuestionBankRefillTargetMix(savepoint);
      await savepoint.insert(questionGenerationBatch).values({
        id: reservedBatchId,
        triggeredByUserId: actorId,
        status: "QUEUED",
        mode: "OFFLINE",
        targetMix,
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      });
      await enqueueQuestionBankRefill(savepoint, actorId, reservedBatchId);
      return reservedBatchId;
    });
    return { kind: "RESERVED", batchId };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "QUESTION_BANK_REFILL_ACTIVE") {
      const active = await transaction.query.questionGenerationBatch.findFirst({
        columns: { id: true },
        where: inArray(questionGenerationBatch.status, [
          ...NON_TERMINAL_BATCH_STATUSES,
        ]),
        orderBy: [
          asc(questionGenerationBatch.createdAt),
          asc(questionGenerationBatch.id),
        ],
      });
      if (active) return { kind: "ACTIVE", batchId: active.id };
      const latestFailed =
        await transaction.query.questionGenerationBatch.findFirst({
          columns: { updatedAt: true },
          where: eq(questionGenerationBatch.status, "FAILED"),
          orderBy: [desc(questionGenerationBatch.updatedAt)],
        });
      const currentDecision = automaticQuestionBankRefillDecision({
        hasOtherNonTerminalBatch: false,
        latestFailedAt: latestFailed?.updatedAt ?? null,
        now: new Date(),
      });
      return currentDecision.allowed
        ? { kind: "RECHECK" }
        : { kind: "COOLDOWN" };
    }
    if (code === "QUESTION_BANK_REFILL_COOLDOWN") {
      return { kind: "COOLDOWN" };
    }
    throw error;
  }
}

export async function buildQuestionBankRefillTargetMix(
  transaction: DatabaseTransaction,
): Promise<Array<{ questionType: string; topic: string; count: number }>> {
  const catalog = await listPublicQuestionCatalog(transaction);
  const pairCounts = new Map<string, number>();
  const typeMarginals = new Map(QUESTION_TYPES.map((type) => [type, 0]));
  const topicMarginals = new Map(TOPICS.map((topic) => [topic, 0]));
  for (const type of QUESTION_TYPES) {
    for (const topic of TOPICS) pairCounts.set(`${type}:${topic}`, 0);
  }
  for (const item of catalog) {
    const key = `${item.type}:${item.topic}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    typeMarginals.set(item.type, (typeMarginals.get(item.type) ?? 0) + 1);
    topicMarginals.set(item.topic, (topicMarginals.get(item.topic) ?? 0) + 1);
  }
  const candidates = QUESTION_TYPES.flatMap((questionType, typeOrder) =>
    TOPICS.map((topic, topicOrder) => ({
      questionType,
      topic,
      pairCount: pairCounts.get(`${questionType}:${topic}`) ?? 0,
      typeOrder,
      topicOrder,
    })),
  );
  const targetMix: Array<{
    questionType: string;
    topic: string;
    count: number;
  }> = [];
  while (targetMix.length < REFILL_PROPOSAL_COUNT && candidates.length > 0) {
    candidates.sort(
      (left, right) =>
        left.pairCount - right.pairCount ||
        (typeMarginals.get(left.questionType) ?? 0) -
          (typeMarginals.get(right.questionType) ?? 0) ||
        (topicMarginals.get(left.topic) ?? 0) -
          (topicMarginals.get(right.topic) ?? 0) ||
        left.typeOrder - right.typeOrder ||
        left.topicOrder - right.topicOrder,
    );
    const selected = candidates.shift()!;
    targetMix.push({
      questionType: selected.questionType,
      topic: selected.topic,
      count: 1,
    });
    typeMarginals.set(
      selected.questionType,
      (typeMarginals.get(selected.questionType) ?? 0) + 1,
    );
    topicMarginals.set(
      selected.topic,
      (topicMarginals.get(selected.topic) ?? 0) + 1,
    );
  }
  return targetMix;
}

async function findCatalogQuestion(
  transaction: DatabaseTransaction,
  externalId: string,
): Promise<RecommendedQuestion | null> {
  const catalog = await listPublicQuestionCatalog(transaction);
  return catalog.find((item) => item.id === externalId) ?? null;
}

async function finalizeUnavailable(
  transaction: DatabaseTransaction,
  recommendationId: string,
  safeFailureCode: string,
): Promise<QuestionRecommendationProjection> {
  await transaction
    .update(questionRecommendation)
    .set({ status: "UNAVAILABLE", safeFailureCode })
    .where(
      and(
        eq(questionRecommendation.id, recommendationId),
        eq(questionRecommendation.status, "PENDING"),
      ),
    );
  return { id: recommendationId, status: "UNAVAILABLE", question: null };
}

function toScoreCandidate(item: RecommendedQuestion): RecommendationCandidate {
  return { id: item.id, type: item.type, topic: item.topic };
}

function toValidatedScoreCandidate(item: {
  id: string;
  type: string;
  topic: string;
}): RecommendationCandidate[] {
  return isQuestionType(item.type) && isQuestionTopic(item.topic)
    ? [{ id: item.id, type: item.type, topic: item.topic }]
    : [];
}

function isQuestionType(value: string): value is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(value);
}

function isQuestionTopic(value: string): value is QuestionTopic {
  return (TOPICS as readonly string[]).includes(value);
}

function recommendationNotFound(): ApiProblem {
  return new ApiProblem({
    title: "Recommendation not found",
    status: 404,
    code: "QUESTION_RECOMMENDATION_NOT_FOUND",
    detail: "The requested recommendation does not exist.",
  });
}
