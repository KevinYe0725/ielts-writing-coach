import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  aiJob,
  auditEvent,
  createDatabase,
  instanceConfiguration,
  mixedReviewTask,
  modelRoute,
  newDomainId,
  providerConnection,
  question,
  questionGenerationBatch,
  questionRecommendation,
  trainingCycle,
  transferTask,
  user,
  writingAttempt,
  type Database,
} from "@iwc/db";
import { QUESTION_BANK, QUESTION_TYPES, TOPICS } from "@iwc/question-bank";

import * as questionRecommendationModule from "./question-recommendation";
import { completeIdempotentResponse, reserveIdempotencyKey } from "./security";

import {
  buildQuestionBankRefillTargetMix,
  createQuestionRecommendation,
  getQuestionRecommendation,
  listPublicQuestionCatalog,
  retryQuestionBankRefill,
} from "./question-recommendation";
import { lockLearnerAndAssertActiveCycleCapacity } from "./active-cycle-limit";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const integration = databaseUrl ? describe.sequential : describe.skip;
const now = new Date("2026-08-25T12:00:00.000Z");

integration("question recommendation service (PostgreSQL)", () => {
  const database = createDatabase(databaseUrl!);
  const createdUsers: string[] = [];
  const createdQuestionIds: string[] = [];
  let adjustedBatchSnapshot: Array<{
    id: string;
    status: typeof questionGenerationBatch.$inferSelect.status;
    updatedAt: Date;
  }> = [];

  async function createLearner(label: string): Promise<string> {
    const id = `${label}-${newDomainId()}`;
    createdUsers.push(id);
    await database.db.insert(user).values({
      id,
      name: "Recommendation learner",
      email: `${id}@example.test`,
      role: "learner",
    });
    return id;
  }

  async function exposeAllExcept(
    userId: string,
    allowedIds: readonly string[],
    shownAt = now,
  ): Promise<void> {
    const allowed = new Set(allowedIds);
    const catalog = await listPublicQuestionCatalog(database.db);
    await database.db.insert(questionRecommendation).values(
      catalog
        .filter((item) => !allowed.has(item.id))
        .map((item) => ({
          userId,
          questionExternalId: item.id,
          action: "INITIAL" as const,
          status: "READY" as const,
          shownAt,
        })),
    );
  }

  async function insertStoredQuestion(input: {
    externalId: string;
    ownerId?: string | null;
    visibility?: "public" | "private";
    generationBatchId?: string | null;
    source?: string;
    type?: string;
    topic?: string;
  }): Promise<string> {
    const id = newDomainId();
    createdQuestionIds.push(id);
    await database.db.insert(question).values({
      id,
      externalId: input.externalId,
      ownerId: input.ownerId ?? null,
      source: input.source ?? "test",
      visibility: input.visibility ?? "public",
      ieltsTrack: "academic",
      questionType: input.type ?? "opinion",
      topic: input.topic ?? "education",
      prompt: `A sufficiently clear test prompt for ${input.externalId}.`,
      bankVersion: input.generationBatchId ? "dynamic-v1" : "test",
      generationBatchId: input.generationBatchId ?? null,
    });
    return id;
  }

  async function insertBatch(
    userId: string,
    status:
      | "QUEUED"
      | "SEARCHING"
      | "GENERATING"
      | "VALIDATING"
      | "SUCCEEDED"
      | "FAILED",
    updatedAt = now,
  ): Promise<string> {
    const id = newDomainId();
    await database.db.insert(questionGenerationBatch).values({
      id,
      triggeredByUserId: userId,
      status,
      mode: "OFFLINE",
      targetMix: [{ questionType: "opinion", topic: "education", count: 1 }],
      promptVersion: "1.0.0",
      rubricVersion: "iwc-question-bank-refill-1.0.0",
      updatedAt,
    });
    return id;
  }

  async function createSucceededPendingPollFixture(
    actorId: string,
    label: string,
  ): Promise<{
    recommendationId: string;
    candidateIds: [string, string];
  }> {
    const batchId = await insertBatch(actorId, "SUCCEEDED");
    const candidateIds: [string, string] = [
      `poll-${label}-a-${newDomainId()}`,
      `poll-${label}-b-${newDomainId()}`,
    ];
    for (const externalId of candidateIds) {
      await insertStoredQuestion({
        externalId,
        generationBatchId: batchId,
        source: "AI_GENERATED",
      });
    }
    await exposeAllExcept(actorId, candidateIds);
    const recommendationId = newDomainId();
    await database.db.insert(questionRecommendation).values({
      id: recommendationId,
      userId: actorId,
      generationBatchId: batchId,
      action: "INITIAL",
      status: "PENDING",
    });
    return { recommendationId, candidateIds };
  }

  const options = {
    now: () => now,
    randomIndex: () => 0,
  };

  type RecommendationTransaction = Parameters<
    Parameters<Database["transaction"]>[0]
  >[0];

  function cycleRecommendationApi() {
    return questionRecommendationModule as unknown as {
      abandonRecommendationForCycle?: (
        transaction: RecommendationTransaction,
        actorId: string,
        recommendationId: string,
        cycleQuestionExternalId: string,
      ) => Promise<void>;
      assertRecommendationForCycle?: (
        transaction: RecommendationTransaction,
        actorId: string,
        recommendationId: string,
        questionExternalId: string,
      ) => Promise<void>;
    };
  }

  function marginalCounts(
    targetMix: Array<{ questionType: string; topic: string }>,
    dimension: "questionType" | "topic",
    values: readonly string[],
  ): number[] {
    return values.map(
      (value) =>
        targetMix.filter((target) => target[dimension] === value).length,
    );
  }

  function databaseWithRefillContentionBarrier(input: {
    observed: () => void;
    waitForTransition: () => Promise<void>;
  }): Database {
    return {
      transaction: (callback: (transaction: unknown) => Promise<unknown>) =>
        database.db.transaction(async (transaction) => {
          let intercepted = false;
          const transactionProxy = new Proxy(transaction, {
            get(target, property) {
              if (property === "transaction") {
                return async (
                  nestedCallback: (nested: unknown) => Promise<unknown>,
                ) => {
                  try {
                    return await transaction.transaction(nestedCallback);
                  } catch (error) {
                    if (
                      !intercepted &&
                      (error as { code?: string }).code ===
                        "QUESTION_BANK_REFILL_ACTIVE"
                    ) {
                      intercepted = true;
                      input.observed();
                      await input.waitForTransition();
                    }
                    throw error;
                  }
                };
              }
              const value = Reflect.get(target, property, target);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
          return callback(transactionProxy);
        }),
    } as unknown as Database;
  }

  function databaseWithCommitBarrier(input: {
    reached: () => void;
    release: () => Promise<void>;
  }): Database {
    return {
      transaction: (callback: (transaction: unknown) => Promise<unknown>) =>
        database.db.transaction(async (transaction) => {
          const result = await callback(transaction);
          input.reached();
          await input.release();
          return result;
        }),
    } as unknown as Database;
  }

  function databaseWithRefillAdmissionBarrier(input: {
    acquired: () => void;
    release: () => Promise<void>;
  }): Database {
    let intercepted = false;
    const wrapTransaction = (transaction: object): object =>
      new Proxy(transaction, {
        get(target, property) {
          if (property === "execute") {
            return async (...args: unknown[]) => {
              const execute = Reflect.get(target, property, target) as (
                ...executeArgs: unknown[]
              ) => Promise<unknown>;
              const result = await execute.apply(target, args);
              if (!intercepted) {
                intercepted = true;
                input.acquired();
                await input.release();
              }
              return result;
            };
          }
          if (property === "transaction") {
            return async (
              callback: (nestedTransaction: unknown) => Promise<unknown>,
            ) => {
              const nested = Reflect.get(target, property, target) as (
                nestedCallback: (nestedTransaction: object) => Promise<unknown>,
              ) => Promise<unknown>;
              return nested.call(target, async (nestedTransaction: object) =>
                callback(wrapTransaction(nestedTransaction)),
              );
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });

    return {
      transaction: (callback: (transaction: unknown) => Promise<unknown>) =>
        database.db.transaction((transaction) =>
          callback(wrapTransaction(transaction)),
        ),
    } as unknown as Database;
  }

  async function within<T>(
    promise: Promise<T>,
    label: string,
    timeoutMs = 8_000,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Timed out waiting for ${label}`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function waitForAdvisoryLockWaiter(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await database.pool.query<{ waiting: string }>(`
        select count(*)::text as waiting
        from pg_locks
        where locktype = 'advisory' and not granted
      `);
      if (Number(result.rows[0]?.waiting ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Timed out waiting for a PostgreSQL advisory-lock waiter");
  }

  async function installSharedRefillRoute(ownerId: string): Promise<{
    restoreDeploymentMode: () => Promise<void>;
  }> {
    let instance = await database.db.query.instanceConfiguration.findFirst();
    let createdInstance = false;
    if (!instance) {
      const id = newDomainId();
      [instance] = await database.db
        .insert(instanceConfiguration)
        .values({ id, deploymentMode: "personal", defaultLocale: "zh-CN" })
        .returning();
      createdInstance = true;
    }
    const originalMode = instance!.deploymentMode;
    const providerId = newDomainId();
    await database.db.insert(providerConnection).values({
      id: providerId,
      ownerId,
      name: `Refill lock-order provider ${providerId}`,
      kind: "mock",
      secretMode: "encrypted",
    });
    await database.db.insert(modelRoute).values({
      id: newDomainId(),
      ownerId,
      taskKind: "question_bank_refill",
      providerConnectionId: providerId,
      model: "mock-deterministic-v1",
      updatedAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
    });
    await database.db
      .update(instanceConfiguration)
      .set({ deploymentMode: "shared" })
      .where(eq(instanceConfiguration.id, instance!.id));

    return {
      restoreDeploymentMode: async () => {
        if (createdInstance) {
          await database.db
            .delete(instanceConfiguration)
            .where(eq(instanceConfiguration.id, instance!.id));
          return;
        }
        await database.db
          .update(instanceConfiguration)
          .set({ deploymentMode: originalMode })
          .where(eq(instanceConfiguration.id, instance!.id));
      },
    };
  }

  async function expectOneActiveRefillWithoutOrphanJobs(
    actorIds: readonly string[],
  ): Promise<typeof questionGenerationBatch.$inferSelect> {
    const activeBatches =
      await database.db.query.questionGenerationBatch.findMany({
        where: and(
          inArray(questionGenerationBatch.triggeredByUserId, [...actorIds]),
          inArray(questionGenerationBatch.status, [
            "QUEUED",
            "SEARCHING",
            "GENERATING",
            "VALIDATING",
          ]),
        ),
      });
    expect(activeBatches).toHaveLength(1);
    const jobs = await database.db.query.aiJob.findMany({
      where: and(
        inArray(aiJob.ownerId, [...actorIds]),
        eq(aiJob.taskKind, "question_bank_refill"),
      ),
    });
    expect(jobs).toHaveLength(1);
    expect(activeBatches[0]?.aiJobId).toBe(jobs[0]?.id);
    expect(jobs[0]?.protectedReference).toEqual({
      generationBatchId: activeBatches[0]?.id,
    });
    return activeBatches[0]!;
  }

  async function waitForLockWaiter(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await database.pool.query<{ waiting: string }>(`
        select count(*)::text as waiting
        from pg_locks
        where not granted
      `);
      if (Number(result.rows[0]?.waiting ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Timed out waiting for a PostgreSQL lock waiter");
  }

  beforeEach(async () => {
    adjustedBatchSnapshot =
      await database.db.query.questionGenerationBatch.findMany({
        columns: { id: true, status: true, updatedAt: true },
        where: inArray(questionGenerationBatch.status, [
          "QUEUED",
          "SEARCHING",
          "GENERATING",
          "VALIDATING",
          "FAILED",
        ]),
      });
    for (const batch of adjustedBatchSnapshot) {
      await database.db
        .update(questionGenerationBatch)
        .set(
          batch.status === "FAILED"
            ? { updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1_000) }
            : { status: "SUCCEEDED" },
        )
        .where(eq(questionGenerationBatch.id, batch.id));
    }
  });

  afterEach(async () => {
    for (const userId of createdUsers.splice(0)) {
      await database.db
        .delete(auditEvent)
        .where(eq(auditEvent.actorId, userId));
      const [jobs, batches] = await Promise.all([
        database.db.query.aiJob.findMany({
          columns: { graphileJobKey: true },
          where: eq(aiJob.ownerId, userId),
        }),
        database.db.query.questionGenerationBatch.findMany({
          columns: { id: true },
          where: eq(questionGenerationBatch.triggeredByUserId, userId),
        }),
      ]);
      for (const job of jobs) {
        if (job.graphileJobKey) {
          await database.db.execute(
            sql`select graphile_worker.remove_job(${job.graphileJobKey})`,
          );
        }
      }
      await database.db.delete(user).where(eq(user.id, userId));
      if (batches.length > 0) {
        await database.db.delete(questionGenerationBatch).where(
          inArray(
            questionGenerationBatch.id,
            batches.map((batch) => batch.id),
          ),
        );
      }
    }
    if (createdQuestionIds.length > 0) {
      await database.db
        .delete(question)
        .where(inArray(question.id, createdQuestionIds.splice(0)));
    }
    for (const batch of adjustedBatchSnapshot) {
      await database.db
        .update(questionGenerationBatch)
        .set({ status: batch.status, updatedAt: batch.updatedAt })
        .where(eq(questionGenerationBatch.id, batch.id));
    }
    adjustedBatchSnapshot = [];
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("balances a fully tied fifteen-target refill across all five types and eight topics", async () => {
    const targetMix = await database.db.transaction((transaction) =>
      buildQuestionBankRefillTargetMix(transaction),
    );

    expect(targetMix).toHaveLength(15);
    expect(marginalCounts(targetMix, "questionType", QUESTION_TYPES)).toEqual([
      3, 3, 3, 3, 3,
    ]);
    const topicCounts = marginalCounts(targetMix, "topic", TOPICS);
    expect(
      Math.max(...topicCounts) - Math.min(...topicCounts),
    ).toBeLessThanOrEqual(1);
  });

  it("prioritizes lower pair counts while balancing types when one type is overrepresented", async () => {
    const ownerId = await createLearner("target-mix-type-deficit");
    const batchId = await insertBatch(ownerId, "SUCCEEDED");
    for (const topic of TOPICS) {
      await insertStoredQuestion({
        externalId: `target-type-heavy-${topic}-${newDomainId()}`,
        generationBatchId: batchId,
        source: "AI_GENERATED",
        type: "opinion",
        topic,
      });
    }

    const targetMix = await database.db.transaction((transaction) =>
      buildQuestionBankRefillTargetMix(transaction),
    );

    expect(targetMix).toHaveLength(15);
    expect(targetMix.some((target) => target.questionType === "opinion")).toBe(
      false,
    );
    const underrepresentedTypeCounts = marginalCounts(
      targetMix,
      "questionType",
      QUESTION_TYPES.filter((type) => type !== "opinion"),
    );
    expect(
      Math.max(...underrepresentedTypeCounts) -
        Math.min(...underrepresentedTypeCounts),
    ).toBeLessThanOrEqual(1);
    const topicCounts = marginalCounts(targetMix, "topic", TOPICS);
    expect(
      Math.max(...topicCounts) - Math.min(...topicCounts),
    ).toBeLessThanOrEqual(1);
  });

  it("prioritizes lower pair counts while balancing topics when one topic is overrepresented", async () => {
    const ownerId = await createLearner("target-mix-topic-deficit");
    const batchId = await insertBatch(ownerId, "SUCCEEDED");
    for (const questionType of QUESTION_TYPES) {
      await insertStoredQuestion({
        externalId: `target-topic-heavy-${questionType}-${newDomainId()}`,
        generationBatchId: batchId,
        source: "AI_GENERATED",
        type: questionType,
        topic: "education",
      });
    }

    const targetMix = await database.db.transaction((transaction) =>
      buildQuestionBankRefillTargetMix(transaction),
    );

    expect(targetMix).toHaveLength(15);
    expect(targetMix.some((target) => target.topic === "education")).toBe(
      false,
    );
    expect(marginalCounts(targetMix, "questionType", QUESTION_TYPES)).toEqual([
      3, 3, 3, 3, 3,
    ]);
    const underrepresentedTopicCounts = marginalCounts(
      targetMix,
      "topic",
      TOPICS.filter((topic) => topic !== "education"),
    );
    expect(
      Math.max(...underrepresentedTopicCounts) -
        Math.min(...underrepresentedTopicCounts),
    ).toBeLessThanOrEqual(1);
  });

  it("permanently excludes cycle and transfer questions", async () => {
    const learnerId = await createLearner("recommend-history");
    const [cycleCandidate, transferCandidate, freshCandidate] =
      QUESTION_BANK.slice(0, 3);
    expect(cycleCandidate && transferCandidate && freshCandidate).toBeTruthy();
    await exposeAllExcept(learnerId, [
      cycleCandidate!.id,
      transferCandidate!.id,
      freshCandidate!.id,
    ]);
    const cycleQuestionId = await insertStoredQuestion({
      externalId: cycleCandidate!.id,
      type: cycleCandidate!.type,
      topic: cycleCandidate!.topic,
    });
    const transferQuestionId = await insertStoredQuestion({
      externalId: transferCandidate!.id,
      type: transferCandidate!.type,
      topic: transferCandidate!.topic,
    });
    const [sourceCycle] = await database.db
      .insert(trainingCycle)
      .values({
        userId: learnerId,
        questionId: cycleQuestionId,
        status: "CORE_CYCLE_COMPLETED",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      })
      .returning({ id: trainingCycle.id });
    await database.db.insert(transferTask).values({
      sourceCycleId: sourceCycle!.id,
      userId: learnerId,
      questionId: transferQuestionId,
      skillId: "argument-development",
      status: "READY",
      availableAt: now,
    });

    const result = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    expect(result).toMatchObject({
      status: "READY",
      question: { id: freshCandidate!.id },
    });
  });

  it("excludes 71:59:59 exposure while admitting the exact 72-hour boundary", async () => {
    const learnerId = await createLearner("recommend-boundary");
    const [tooRecent, exactBoundary] = QUESTION_BANK.slice(0, 2);
    expect(tooRecent && exactBoundary).toBeTruthy();
    await exposeAllExcept(learnerId, [tooRecent!.id, exactBoundary!.id]);
    await database.db.insert(questionRecommendation).values([
      {
        userId: learnerId,
        questionExternalId: tooRecent!.id,
        action: "INITIAL",
        status: "ABANDONED",
        shownAt: new Date(now.getTime() - (72 * 60 * 60 * 1_000 - 1_000)),
      },
      {
        userId: learnerId,
        questionExternalId: exactBoundary!.id,
        action: "INITIAL",
        status: "STARTED",
        shownAt: new Date(now.getTime() - 72 * 60 * 60 * 1_000),
      },
    ]);

    const result = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    expect(result).toMatchObject({
      status: "READY",
      question: { id: exactBoundary!.id },
    });
  });

  it("selects validated shared dynamic questions but never private questions", async () => {
    const learnerId = await createLearner("recommend-visibility");
    await exposeAllExcept(learnerId, []);
    const batchId = await insertBatch(learnerId, "SUCCEEDED");
    await insertStoredQuestion({
      externalId: `private-${newDomainId()}`,
      ownerId: learnerId,
      visibility: "private",
      type: "discussion",
      topic: "health",
    });
    const publicExternalId = `iwc-dynamic-${newDomainId()}`;
    await insertStoredQuestion({
      externalId: publicExternalId,
      generationBatchId: batchId,
      source: "AI_GENERATED",
      type: "discussion",
      topic: "health",
    });

    const result = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    expect(result).toMatchObject({
      status: "READY",
      question: { id: publicExternalId, visibility: "public" },
    });
  });

  it("SWAP excludes the current question and appends a new READY exposure", async () => {
    const learnerId = await createLearner("recommend-swap");
    const [first, second] = QUESTION_BANK.slice(0, 2);
    expect(first && second).toBeTruthy();
    await exposeAllExcept(learnerId, [first!.id, second!.id]);
    const initial = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    expect(initial).toMatchObject({ status: "READY" });
    const swap = await createQuestionRecommendation(
      database.db,
      learnerId,
      {
        action: "SWAP",
        excludedQuestionId: initial.question!.id,
      },
      options,
    );

    expect(swap).toMatchObject({
      status: "READY",
      question: { id: second!.id },
    });
    const stored = await database.db.query.questionRecommendation.findMany({
      where: eq(questionRecommendation.userId, learnerId),
    });
    expect(
      stored.filter((item) => item.id === initial.id || item.id === swap.id),
    ).toHaveLength(2);
    expect(stored.find((item) => item.id === swap.id)).toMatchObject({
      action: "SWAP",
      excludedExternalId: initial.question!.id,
      shownAt: now,
    });
  });

  it("keeps an expired original question cooling down after SWAP on the next request", async () => {
    const learnerId = await createLearner("recommend-swap-cooldown");
    const [original, replacement] = QUESTION_BANK.slice(0, 2);
    expect(original && replacement).toBeTruthy();
    await exposeAllExcept(learnerId, [original!.id, replacement!.id]);
    await database.db.insert(questionRecommendation).values({
      userId: learnerId,
      questionExternalId: original!.id,
      action: "INITIAL",
      status: "READY",
      shownAt: new Date(now.getTime() - 72 * 60 * 60 * 1_000),
    });

    const swap = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "SWAP", excludedQuestionId: original!.id },
      options,
    );
    expect(swap).toMatchObject({
      status: "READY",
      question: { id: replacement!.id },
    });

    const next = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    expect(next.status).toBe("PENDING");
    expect(next.question).toBeNull();
  });

  it.each(["PENDING", "READY", "UNAVAILABLE", "ABANDONED", "STARTED"] as const)(
    "uses recent SWAP createdAt to cool its excluded question regardless of %s status",
    async (status) => {
      const learnerId = await createLearner(
        `recommend-swap-cooldown-${status}`,
      );
      const original = QUESTION_BANK[0]!;
      await exposeAllExcept(learnerId, [original.id]);
      await database.db.insert(questionRecommendation).values({
        userId: learnerId,
        questionExternalId: null,
        action: "SWAP",
        status,
        excludedExternalId: original.id,
        createdAt: now,
        safeFailureCode:
          status === "UNAVAILABLE" ? "QUESTION_SUPPLY_UNAVAILABLE" : null,
      });

      const next = await createQuestionRecommendation(
        database.db,
        learnerId,
        { action: "INITIAL" },
        options,
      );

      expect(next.status).not.toBe("READY");
      expect(next.question).toBeNull();
    },
  );

  it("admits a SWAP excluded question at the exact open 72-hour createdAt boundary", async () => {
    const learnerId = await createLearner("recommend-swap-created-boundary");
    const original = QUESTION_BANK[0]!;
    await exposeAllExcept(learnerId, [original.id]);
    await database.db.insert(questionRecommendation).values({
      userId: learnerId,
      action: "SWAP",
      status: "ABANDONED",
      excludedExternalId: original.id,
      createdAt: new Date(now.getTime() - 72 * 60 * 60 * 1_000),
    });

    await expect(
      createQuestionRecommendation(
        database.db,
        learnerId,
        { action: "INITIAL" },
        options,
      ),
    ).resolves.toMatchObject({
      status: "READY",
      question: { id: original.id },
    });
  });

  it("serializes concurrent INITIAL calls into distinct exposure rows", async () => {
    const learnerId = await createLearner("recommend-concurrent");
    const allowed = QUESTION_BANK.slice(0, 2).map((item) => item.id);
    await exposeAllExcept(learnerId, allowed);

    const [left, right] = await Promise.all([
      createQuestionRecommendation(
        database.db,
        learnerId,
        { action: "INITIAL" },
        options,
      ),
      createQuestionRecommendation(
        database.db,
        learnerId,
        { action: "INITIAL" },
        options,
      ),
    ]);

    expect(left.status).toBe("READY");
    expect(right.status).toBe("READY");
    expect(new Set([left.question!.id, right.question!.id])).toEqual(
      new Set(allowed),
    );
    const exposures = await database.db.query.questionRecommendation.findMany({
      where: eq(questionRecommendation.userId, learnerId),
    });
    expect(
      exposures.filter((item) => item.id === left.id || item.id === right.id),
    ).toHaveLength(2);
  });

  it("orders and limits the actual recent-cycle query to the latest three", async () => {
    const learnerId = await createLearner("recommend-latest-three");
    const opinionEducation = QUESTION_BANK.find(
      (item) => item.type === "opinion" && item.topic === "education",
    )!;
    const discussionTechnology = QUESTION_BANK.find(
      (item) => item.type === "discussion" && item.topic === "technology",
    )!;
    await exposeAllExcept(learnerId, [
      opinionEducation.id,
      discussionTechnology.id,
    ]);
    for (let index = 0; index < 7; index += 1) {
      const isOlderOpinion = index < 4;
      const storedQuestionId = await insertStoredQuestion({
        externalId: `history-${learnerId}-${index}`,
        type: isOlderOpinion ? "opinion" : "discussion",
        topic: isOlderOpinion ? "education" : "technology",
      });
      await database.db.insert(trainingCycle).values({
        userId: learnerId,
        questionId: storedQuestionId,
        status: "CORE_CYCLE_COMPLETED",
        schemaVersion: "1.0.0",
        timezone: "UTC",
        createdAt: new Date(now.getTime() - (7 - index) * 60_000),
      });
    }

    const result = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    expect(result).toMatchObject({
      status: "READY",
      question: { id: opinionEducation.id },
    });
  });

  it("selects a different-topic question for the actual deterministic due mixed review", async () => {
    const learnerId = await createLearner("recommend-due-mixed-review");
    const sameTopic = QUESTION_BANK.find(
      (item) => item.type === "discussion" && item.topic === "health",
    )!;
    const differentTopic = QUESTION_BANK.find(
      (item) => item.type === "discussion" && item.topic === "education",
    )!;
    await exposeAllExcept(learnerId, [sameTopic.id, differentTopic.id]);

    const history = [
      { label: "source", topic: "health", createdAtOffset: 5 },
      { label: "education", topic: "education", createdAtOffset: 3 },
      { label: "technology", topic: "technology", createdAtOffset: 2 },
      { label: "environment", topic: "environment", createdAtOffset: 1 },
    ] as const;
    const sourceQuestionId = await insertStoredQuestion({
      externalId: `due-source-${learnerId}`,
      type: "opinion",
      topic: "health",
    });
    const [sourceCycle] = await database.db
      .insert(trainingCycle)
      .values({
        userId: learnerId,
        questionId: sourceQuestionId,
        status: "CORE_CYCLE_COMPLETED",
        schemaVersion: "1.0.0",
        timezone: "UTC",
        createdAt: new Date(now.getTime() - 5 * 60_000),
      })
      .returning({ id: trainingCycle.id });
    for (const item of history.slice(1)) {
      const questionId = await insertStoredQuestion({
        externalId: `due-history-${item.label}-${learnerId}`,
        type: "opinion",
        topic: item.topic,
      });
      await database.db.insert(trainingCycle).values({
        userId: learnerId,
        questionId,
        status: "CORE_CYCLE_COMPLETED",
        schemaVersion: "1.0.0",
        timezone: "UTC",
        createdAt: new Date(now.getTime() - item.createdAtOffset * 60_000),
      });
    }
    await database.db.insert(mixedReviewTask).values({
      sourceCycleId: sourceCycle!.id,
      userId: learnerId,
      status: "PLANNED",
      dueAt: now,
    });

    const result = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    expect(result).toMatchObject({
      status: "READY",
      question: { id: differentTopic.id },
    });
  });

  it("persists an idempotent response atomically and replays the same recommendation", async () => {
    const learnerId = await createLearner("recommend-idempotency");
    const payload = { action: "INITIAL" as const };
    const idempotencyKey = `recommend-idempotency-${newDomainId()}`;
    const makeRequest = () =>
      new Request("https://coach.test/api/v1/question-recommendations", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify(payload),
      });
    const reservation = await reserveIdempotencyKey(
      database.db,
      learnerId,
      makeRequest(),
      payload,
    );
    const first = await createQuestionRecommendation(
      database.db,
      learnerId,
      payload,
      {
        ...options,
        afterPersist: async (transaction, result) =>
          completeIdempotentResponse(
            transaction,
            learnerId,
            reservation.key,
            200,
            { recommendation_id: result.id },
          ),
      },
    );

    const replay = await reserveIdempotencyKey(
      database.db,
      learnerId,
      makeRequest(),
      payload,
    );

    expect(replay.replay?.headers.get("idempotency-replayed")).toBe("true");
    await expect(replay.replay?.json()).resolves.toEqual({
      recommendation_id: first.id,
    });
    const recommendations =
      await database.db.query.questionRecommendation.findMany({
        where: eq(questionRecommendation.userId, learnerId),
      });
    expect(recommendations).toHaveLength(1);
  });

  it("restores the recommendation polling Location on a real 202 replay", async () => {
    const learnerId = await createLearner("recommend-pending-replay");
    await exposeAllExcept(learnerId, []);
    const payload = { action: "INITIAL" as const };
    const idempotencyKey = `recommend-pending-replay-${newDomainId()}`;
    const makeRequest = () =>
      new Request("https://coach.test/api/v1/question-recommendations", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify(payload),
      });
    const reservation = await reserveIdempotencyKey(
      database.db,
      learnerId,
      makeRequest(),
      payload,
    );
    const pending = await createQuestionRecommendation(
      database.db,
      learnerId,
      payload,
      {
        ...options,
        afterPersist: async (transaction, result) =>
          completeIdempotentResponse(
            transaction,
            learnerId,
            reservation.key,
            202,
            {
              recommendation: {
                id: result.id,
                status: "PENDING",
                retry_after_seconds: 2,
              },
            },
          ),
      },
    );
    expect(pending.status).toBe("PENDING");

    const replay = await reserveIdempotencyKey(
      database.db,
      learnerId,
      makeRequest(),
      payload,
    );

    expect(replay.replay?.status).toBe(202);
    expect(replay.replay?.headers.get("location")).toBe(
      `/api/v1/question-recommendations/${pending.id}`,
    );
  });

  it("refills below twelve remaining candidates but not at twelve", async () => {
    const thresholdLearner = await createLearner("recommend-threshold");
    const belowLearner = await createLearner("recommend-below-threshold");
    await exposeAllExcept(
      thresholdLearner,
      QUESTION_BANK.slice(0, 13).map((item) => item.id),
    );
    await exposeAllExcept(
      belowLearner,
      QUESTION_BANK.slice(0, 12).map((item) => item.id),
    );

    await createQuestionRecommendation(
      database.db,
      thresholdLearner,
      { action: "INITIAL" },
      options,
    );
    await createQuestionRecommendation(
      database.db,
      belowLearner,
      { action: "INITIAL" },
      options,
    );

    await expect(
      database.db.query.questionGenerationBatch.findMany({
        where: eq(questionGenerationBatch.triggeredByUserId, thresholdLearner),
      }),
    ).resolves.toHaveLength(0);
    await expect(
      database.db.query.questionGenerationBatch.findMany({
        where: eq(questionGenerationBatch.triggeredByUserId, belowLearner),
      }),
    ).resolves.toHaveLength(1);
  });

  it("creates one batch-linked PENDING recommendation when no candidate exists", async () => {
    const learnerId = await createLearner("recommend-pending");
    await exposeAllExcept(learnerId, []);

    const result = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    expect(result).toMatchObject({ status: "PENDING", question: null });
    const stored = await database.db.query.questionRecommendation.findFirst({
      where: eq(questionRecommendation.id, result.id),
    });
    expect(stored?.generationBatchId).toEqual(expect.any(String));
    await expect(
      database.db.query.questionGenerationBatch.findMany({
        where: eq(questionGenerationBatch.triggeredByUserId, learnerId),
      }),
    ).resolves.toHaveLength(1);
  });

  it("links zero-pool PENDING to an existing active batch and never leaves a null link", async () => {
    const learnerId = await createLearner("recommend-pending-active");
    await exposeAllExcept(learnerId, []);
    const activeBatchId = await insertBatch(learnerId, "QUEUED");

    const result = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    expect(result.status).toBe("PENDING");
    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, result.id),
      }),
    ).resolves.toMatchObject({
      status: "PENDING",
      generationBatchId: activeBatchId,
    });
    await expect(
      database.db.query.questionGenerationBatch.findMany({
        where: eq(questionGenerationBatch.triggeredByUserId, learnerId),
      }),
    ).resolves.toHaveLength(1);
  });

  it("returns UNAVAILABLE instead of persisting an unlinked PENDING during cooldown", async () => {
    const learnerId = await createLearner("recommend-pending-cooldown");
    await exposeAllExcept(learnerId, []);
    await insertBatch(learnerId, "FAILED", now);

    const result = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    expect(result.status).toBe("UNAVAILABLE");
    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, result.id),
      }),
    ).resolves.toMatchObject({
      status: "UNAVAILABLE",
      generationBatchId: null,
      safeFailureCode: "QUESTION_BANK_REFILL_COOLDOWN",
    });
  });

  it("serializes privileged early retries into one fresh auditable balanced batch and one safe attachment", async () => {
    const actorId = await createLearner("question-supply-retry-owner");
    await database.db
      .update(user)
      .set({ role: "owner" })
      .where(eq(user.id, actorId));
    const failedBatchId = await insertBatch(actorId, "FAILED", new Date());
    const retryQuestionSupply = (
      questionRecommendationModule as unknown as {
        retryQuestionBankRefill?: (
          database: Database,
          actorId: string,
        ) => Promise<{ state: "STARTED" | "ATTACHED"; batchStatus: string }>;
      }
    ).retryQuestionBankRefill;
    expect(retryQuestionSupply).toEqual(expect.any(Function));
    if (!retryQuestionSupply) return;

    const results = await Promise.all([
      retryQuestionSupply(database.db, actorId),
      retryQuestionSupply(database.db, actorId),
    ]);

    expect(results.map((result) => result.state).sort()).toEqual([
      "ATTACHED",
      "STARTED",
    ]);
    expect(results.every((result) => result.batchStatus === "QUEUED")).toBe(
      true,
    );
    const batches = await database.db.query.questionGenerationBatch.findMany({
      where: eq(questionGenerationBatch.triggeredByUserId, actorId),
    });
    const retries = batches.filter((batch) => batch.id !== failedBatchId);
    expect(retries).toHaveLength(1);
    expect(retries[0]?.targetMix).toHaveLength(15);
    expect(retries[0]?.targetMix.every((item) => item.count === 1)).toBe(true);
    expect(
      new Set(
        retries[0]?.targetMix.map(
          (item) => `${item.questionType}:${item.topic}`,
        ),
      ).size,
    ).toBe(15);
    const audits = await database.db.query.auditEvent.findMany({
      where: eq(auditEvent.actorId, actorId),
    });
    expect(audits).toHaveLength(2);
    expect(
      audits.every(
        (event) =>
          event.action === "question_supply.retry" &&
          event.targetType === "question_generation_batch",
      ),
    ).toBe(true);
  });

  it("orders same-owner recommendation and privileged retry as refill admission before the user row", async () => {
    const ownerId = await createLearner("refill-order-same-owner");
    await database.db
      .update(user)
      .set({ role: "owner" })
      .where(eq(user.id, ownerId));
    const shared = await installSharedRefillRoute(ownerId);
    const onlyCandidate = QUESTION_BANK[0]!;
    await exposeAllExcept(ownerId, [onlyCandidate.id]);
    await insertBatch(ownerId, "FAILED", new Date());

    let markAdmissionAcquired!: () => void;
    const admissionAcquired = new Promise<void>((resolve) => {
      markAdmissionAcquired = resolve;
    });
    let releaseAdmission!: () => void;
    const admissionReleased = new Promise<void>((resolve) => {
      releaseAdmission = resolve;
    });
    const retryDatabase = databaseWithRefillAdmissionBarrier({
      acquired: markAdmissionAcquired,
      release: () => admissionReleased,
    });
    const retry = retryQuestionBankRefill(retryDatabase, ownerId);
    let recommendation: ReturnType<typeof createQuestionRecommendation> | null =
      null;
    try {
      await within(admissionAcquired, "privileged refill admission");
      recommendation = createQuestionRecommendation(
        database.db,
        ownerId,
        { action: "INITIAL" },
        options,
      );
      await waitForAdvisoryLockWaiter();

      await within(
        database.db.transaction(async (transaction) => {
          await transaction
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, ownerId))
            .for("update");
        }),
        "the still-unlocked recommendation owner row",
        1_000,
      );
      releaseAdmission();

      const [retryResult, recommendationResult] = await within(
        Promise.all([retry, recommendation]),
        "same-owner retry and recommendation completion",
      );
      expect(retryResult).toEqual({
        state: "STARTED",
        batchStatus: "QUEUED",
      });
      expect(recommendationResult).toMatchObject({
        status: "READY",
        question: { id: onlyCandidate.id },
      });
      await expectOneActiveRefillWithoutOrphanJobs([ownerId]);
    } finally {
      releaseAdmission();
      await Promise.allSettled([
        retry,
        ...(recommendation ? [recommendation] : []),
      ]);
      await shared.restoreDeploymentMode();
    }
  });

  it("serializes a learner recommendation with its canonical privileged refill owner retry", async () => {
    const ownerId = await createLearner("refill-order-route-owner");
    const learnerId = await createLearner("refill-order-route-learner");
    await database.db
      .update(user)
      .set({ role: "owner" })
      .where(eq(user.id, ownerId));
    const shared = await installSharedRefillRoute(ownerId);
    await exposeAllExcept(learnerId, []);
    await insertBatch(ownerId, "FAILED", new Date());

    let markAdmissionAcquired!: () => void;
    const admissionAcquired = new Promise<void>((resolve) => {
      markAdmissionAcquired = resolve;
    });
    let releaseAdmission!: () => void;
    const admissionReleased = new Promise<void>((resolve) => {
      releaseAdmission = resolve;
    });
    const retryDatabase = databaseWithRefillAdmissionBarrier({
      acquired: markAdmissionAcquired,
      release: () => admissionReleased,
    });
    const retry = retryQuestionBankRefill(retryDatabase, ownerId);
    let recommendation: ReturnType<typeof createQuestionRecommendation> | null =
      null;
    try {
      await within(admissionAcquired, "canonical-owner refill admission");
      recommendation = createQuestionRecommendation(
        database.db,
        learnerId,
        { action: "INITIAL" },
        options,
      );
      await waitForAdvisoryLockWaiter();

      await within(
        database.db.transaction(async (transaction) => {
          await transaction
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, learnerId))
            .for("update");
        }),
        "the still-unlocked learner row",
        1_000,
      );
      releaseAdmission();

      const [retryResult, recommendationResult] = await within(
        Promise.all([retry, recommendation]),
        "canonical-owner retry and learner recommendation completion",
      );
      expect(retryResult).toEqual({
        state: "STARTED",
        batchStatus: "QUEUED",
      });
      expect(recommendationResult).toMatchObject({
        status: "PENDING",
        question: null,
      });
      const active = await expectOneActiveRefillWithoutOrphanJobs([
        ownerId,
        learnerId,
      ]);
      await expect(
        database.db.query.questionRecommendation.findFirst({
          where: eq(questionRecommendation.id, recommendationResult.id),
        }),
      ).resolves.toMatchObject({
        status: "PENDING",
        generationBatchId: active.id,
      });
    } finally {
      releaseAdmission();
      await Promise.allSettled([
        retry,
        ...(recommendation ? [recommendation] : []),
      ]);
      await shared.restoreDeploymentMode();
    }
  });

  it("serializes two privileged recommenders before either learner row and keeps one refill job", async () => {
    const ownerId = await createLearner("refill-order-owner-recommender");
    const adminId = await createLearner("refill-order-admin-recommender");
    await database.db
      .update(user)
      .set({ role: "owner" })
      .where(eq(user.id, ownerId));
    await database.db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.id, adminId));
    const shared = await installSharedRefillRoute(ownerId);
    await exposeAllExcept(ownerId, []);
    await exposeAllExcept(adminId, []);

    let markAdmissionAcquired!: () => void;
    const admissionAcquired = new Promise<void>((resolve) => {
      markAdmissionAcquired = resolve;
    });
    let releaseAdmission!: () => void;
    const admissionReleased = new Promise<void>((resolve) => {
      releaseAdmission = resolve;
    });
    const firstDatabase = databaseWithRefillAdmissionBarrier({
      acquired: markAdmissionAcquired,
      release: () => admissionReleased,
    });
    const first = createQuestionRecommendation(
      firstDatabase,
      adminId,
      { action: "INITIAL" },
      options,
    );
    let second: ReturnType<typeof createQuestionRecommendation> | null = null;
    try {
      await within(admissionAcquired, "first privileged refill admission");
      second = createQuestionRecommendation(
        database.db,
        ownerId,
        { action: "INITIAL" },
        options,
      );
      await waitForAdvisoryLockWaiter();

      await within(
        database.db.transaction(async (transaction) => {
          await transaction
            .select({ id: user.id })
            .from(user)
            .where(inArray(user.id, [ownerId, adminId]))
            .for("update");
        }),
        "both still-unlocked privileged recommender rows",
        1_000,
      );
      releaseAdmission();

      const recommendations = await within(
        Promise.all([first, second]),
        "both privileged recommendations",
      );
      expect(recommendations).toEqual([
        expect.objectContaining({ status: "PENDING", question: null }),
        expect.objectContaining({ status: "PENDING", question: null }),
      ]);
      const active = await expectOneActiveRefillWithoutOrphanJobs([
        ownerId,
        adminId,
      ]);
      const stored = await database.db.query.questionRecommendation.findMany({
        where: inArray(
          questionRecommendation.id,
          recommendations.map((item) => item.id),
        ),
      });
      expect(stored).toHaveLength(2);
      expect(
        stored.every(
          (item) =>
            item.status === "PENDING" && item.generationBatchId === active.id,
        ),
      ).toBe(true);
    } finally {
      releaseAdmission();
      await Promise.allSettled([first, ...(second ? [second] : [])]);
      await shared.restoreDeploymentMode();
    }
  });

  it("refuses an explicit retry when the latest batch did not fail", async () => {
    const actorId = await createLearner("question-supply-retry-unavailable");
    await database.db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.id, actorId));
    await insertBatch(actorId, "SUCCEEDED", new Date());
    const retryQuestionSupply = (
      questionRecommendationModule as unknown as {
        retryQuestionBankRefill: (
          database: Database,
          actorId: string,
        ) => Promise<unknown>;
      }
    ).retryQuestionBankRefill;

    await expect(
      retryQuestionSupply(database.db, actorId),
    ).rejects.toMatchObject({
      problem: {
        code: "QUESTION_BANK_REFILL_RETRY_NOT_AVAILABLE",
        status: 409,
      },
    });
    await expect(
      database.db.query.questionGenerationBatch.findMany({
        where: eq(questionGenerationBatch.triggeredByUserId, actorId),
      }),
    ).resolves.toHaveLength(1);
    await expect(
      database.db.query.auditEvent.findMany({
        where: eq(auditEvent.actorId, actorId),
      }),
    ).resolves.toHaveLength(0);
  });

  it("polling a completed batch finalizes its linked recommendation as READY", async () => {
    const learnerId = await createLearner("recommend-poll-ready");
    await exposeAllExcept(learnerId, []);
    const pending = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    const storedPending =
      await database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, pending.id),
      });
    const generatedExternalId = `iwc-dynamic-${newDomainId()}`;
    await insertStoredQuestion({
      externalId: generatedExternalId,
      generationBatchId: storedPending!.generationBatchId,
      source: "AI_GENERATED",
      type: "two_part",
      topic: "urban_transport",
    });
    await database.db
      .update(questionGenerationBatch)
      .set({ status: "SUCCEEDED", acceptedCount: 1 })
      .where(eq(questionGenerationBatch.id, storedPending!.generationBatchId!));

    const ready = await getQuestionRecommendation(
      database.db,
      learnerId,
      pending.id,
      options,
    );

    expect(ready).toMatchObject({
      id: pending.id,
      status: "READY",
      question: { id: generatedExternalId },
    });
    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, pending.id),
      }),
    ).resolves.toMatchObject({ status: "READY", shownAt: now });
  });

  it("orders a successful low-supply poll before a same-learner recommendation", async () => {
    const learnerId = await createLearner("refill-order-poll-create");
    await database.db
      .update(user)
      .set({ role: "owner" })
      .where(eq(user.id, learnerId));
    const shared = await installSharedRefillRoute(learnerId);
    const fixture = await createSucceededPendingPollFixture(
      learnerId,
      "create",
    );

    let markAdmissionAcquired!: () => void;
    const admissionAcquired = new Promise<void>((resolve) => {
      markAdmissionAcquired = resolve;
    });
    let releaseAdmission!: () => void;
    const admissionReleased = new Promise<void>((resolve) => {
      releaseAdmission = resolve;
    });
    const createDatabaseWithBarrier = databaseWithRefillAdmissionBarrier({
      acquired: markAdmissionAcquired,
      release: () => admissionReleased,
    });
    const create = createQuestionRecommendation(
      createDatabaseWithBarrier,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    let poll: ReturnType<typeof getQuestionRecommendation> | null = null;
    let rowProbe: Promise<void> | null = null;
    try {
      await within(admissionAcquired, "same-learner create admission");
      poll = getQuestionRecommendation(
        database.db,
        learnerId,
        fixture.recommendationId,
        options,
      );
      await waitForAdvisoryLockWaiter();

      rowProbe = database.db.transaction(async (transaction) => {
        await transaction
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, learnerId))
          .for("update");
      });
      await within(
        rowProbe,
        "the poll learner row while refill admission is held",
        1_000,
      );
      releaseAdmission();

      const [created, polled] = await within(
        Promise.all([create, poll]),
        "same-learner create and successful poll completion",
      );
      expect(created.status).toBe("READY");
      expect(polled.status).toBe("READY");
      expect(new Set([created.question!.id, polled.question!.id])).toEqual(
        new Set(fixture.candidateIds),
      );
      await expect(
        database.db.query.questionRecommendation.findFirst({
          where: eq(questionRecommendation.id, fixture.recommendationId),
        }),
      ).resolves.toMatchObject({
        status: "READY",
        questionExternalId: polled.question!.id,
        shownAt: now,
      });
      await expectOneActiveRefillWithoutOrphanJobs([learnerId]);
    } finally {
      releaseAdmission();
      await Promise.allSettled([
        create,
        ...(poll ? [poll] : []),
        ...(rowProbe ? [rowProbe] : []),
      ]);
      await shared.restoreDeploymentMode();
    }
  });

  it("orders a successful low-supply poll before an overlapping privileged retry", async () => {
    const ownerId = await createLearner("refill-order-poll-retry-owner");
    await database.db
      .update(user)
      .set({ role: "owner" })
      .where(eq(user.id, ownerId));
    const shared = await installSharedRefillRoute(ownerId);
    const fixture = await createSucceededPendingPollFixture(ownerId, "retry");
    await insertBatch(ownerId, "FAILED", new Date(now.getTime() + 60_000));

    let markAdmissionAcquired!: () => void;
    const admissionAcquired = new Promise<void>((resolve) => {
      markAdmissionAcquired = resolve;
    });
    let releaseAdmission!: () => void;
    const admissionReleased = new Promise<void>((resolve) => {
      releaseAdmission = resolve;
    });
    const retryDatabase = databaseWithRefillAdmissionBarrier({
      acquired: markAdmissionAcquired,
      release: () => admissionReleased,
    });
    const retry = retryQuestionBankRefill(retryDatabase, ownerId);
    let poll: ReturnType<typeof getQuestionRecommendation> | null = null;
    let rowProbe: Promise<void> | null = null;
    try {
      await within(admissionAcquired, "overlapping privileged retry admission");
      poll = getQuestionRecommendation(
        database.db,
        ownerId,
        fixture.recommendationId,
        options,
      );
      await waitForAdvisoryLockWaiter();

      rowProbe = database.db.transaction(async (transaction) => {
        await transaction
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, ownerId))
          .for("update");
      });
      await within(
        rowProbe,
        "the poll owner row while retry admission is held",
        1_000,
      );
      releaseAdmission();

      const [retried, polled] = await within(
        Promise.all([retry, poll]),
        "overlapping privileged retry and successful poll completion",
      );
      expect(retried).toEqual({
        state: "STARTED",
        batchStatus: "QUEUED",
      });
      expect(polled).toMatchObject({
        status: "READY",
        question: { id: fixture.candidateIds[0] },
      });
      await expect(
        database.db.query.questionRecommendation.findFirst({
          where: eq(questionRecommendation.id, fixture.recommendationId),
        }),
      ).resolves.toMatchObject({
        status: "READY",
        questionExternalId: fixture.candidateIds[0],
        shownAt: now,
      });
      await expectOneActiveRefillWithoutOrphanJobs([ownerId]);
    } finally {
      releaseAdmission();
      await Promise.allSettled([
        retry,
        ...(poll ? [poll] : []),
        ...(rowProbe ? [rowProbe] : []),
      ]);
      await shared.restoreDeploymentMode();
    }
  });

  it("couples READY fallback to cycle creation, preserves exposure, and keeps the question cooled", async () => {
    const abandon = cycleRecommendationApi().abandonRecommendationForCycle;
    expect(abandon).toEqual(expect.any(Function));
    if (!abandon) return;
    const learnerId = await createLearner("recommend-abandon-ready");
    const candidate = QUESTION_BANK[0]!;
    const manualExternalId = `manual-ready-fallback-${newDomainId()}`;
    const manualQuestionId = await insertStoredQuestion({
      externalId: manualExternalId,
      ownerId: learnerId,
      visibility: "private",
    });
    await exposeAllExcept(learnerId, [candidate.id]);
    const ready = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    expect(ready).toMatchObject({
      status: "READY",
      question: { id: candidate.id },
    });

    await database.db.transaction(async (transaction) => {
      await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
      await abandon(transaction, learnerId, ready.id, manualExternalId);
      await transaction.insert(trainingCycle).values({
        userId: learnerId,
        questionId: manualQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
    });

    const abandoned = await database.db.query.questionRecommendation.findFirst({
      where: eq(questionRecommendation.id, ready.id),
    });
    expect(abandoned).toMatchObject({
      status: "ABANDONED",
      questionExternalId: candidate.id,
      shownAt: now,
      safeFailureCode: null,
    });
    await expect(
      database.db.transaction(async (transaction) => {
        await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
        await abandon(transaction, learnerId, ready.id, manualExternalId);
      }),
    ).rejects.toMatchObject({
      problem: { code: "RECOMMENDATION_NOT_ABANDONABLE", status: 409 },
    });
    const next = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    expect(next.status).not.toBe("READY");
    expect(next.question).toBeNull();
  });

  it("treats fallback use of the exact READY question as STARTED, never ABANDONED", async () => {
    const abandon = cycleRecommendationApi().abandonRecommendationForCycle;
    expect(abandon).toEqual(expect.any(Function));
    if (!abandon) return;
    const learnerId = await createLearner("recommend-fallback-same-question");
    const candidate = QUESTION_BANK[0]!;
    await exposeAllExcept(learnerId, [candidate.id]);
    const ready = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    await database.db.transaction(async (transaction) => {
      await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
      await abandon(transaction, learnerId, ready.id, candidate.id);
    });

    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, ready.id),
      }),
    ).resolves.toMatchObject({
      status: "STARTED",
      questionExternalId: candidate.id,
      shownAt: now,
    });
  });

  it("couples PENDING fallback for its owner without creating an exposure", async () => {
    const abandon = cycleRecommendationApi().abandonRecommendationForCycle;
    expect(abandon).toEqual(expect.any(Function));
    if (!abandon) return;
    const learnerId = await createLearner("recommend-abandon-pending");
    const otherId = await createLearner("recommend-abandon-other");
    const manualExternalId = `manual-pending-fallback-${newDomainId()}`;
    const manualQuestionId = await insertStoredQuestion({
      externalId: manualExternalId,
      ownerId: learnerId,
      visibility: "private",
    });
    const candidate = QUESTION_BANK[0]!;
    const pending = { id: newDomainId() };
    await exposeAllExcept(learnerId, [candidate.id]);
    await database.db.insert(questionRecommendation).values({
      id: pending.id,
      userId: learnerId,
      action: "INITIAL",
      status: "PENDING",
    });

    await expect(
      database.db.transaction(async (transaction) => {
        await lockLearnerAndAssertActiveCycleCapacity(transaction, otherId);
        await abandon(transaction, otherId, pending.id, manualExternalId);
      }),
    ).rejects.toMatchObject({ problem: { status: 404 } });
    await database.db.transaction(async (transaction) => {
      await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
      await abandon(transaction, learnerId, pending.id, manualExternalId);
      await transaction.insert(trainingCycle).values({
        userId: learnerId,
        questionId: manualQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
    });

    await expect(
      getQuestionRecommendation(database.db, learnerId, pending.id, options),
    ).resolves.toEqual({
      id: pending.id,
      status: "UNAVAILABLE",
      question: null,
    });
    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, pending.id),
      }),
    ).resolves.toMatchObject({ status: "ABANDONED", shownAt: null });
    await expect(
      database.db.query.trainingCycle.findMany({
        where: eq(trainingCycle.userId, learnerId),
      }),
    ).resolves.toHaveLength(1);
    await expect(
      createQuestionRecommendation(
        database.db,
        learnerId,
        { action: "INITIAL" },
        options,
      ),
    ).resolves.toMatchObject({
      status: "READY",
      question: { id: candidate.id },
    });
  });

  it("keeps the swapped-away question cooled after PENDING SWAP becomes ABANDONED", async () => {
    const abandon = cycleRecommendationApi().abandonRecommendationForCycle;
    expect(abandon).toEqual(expect.any(Function));
    if (!abandon) return;
    const learnerId = await createLearner("recommend-abandoned-pending-swap");
    const original = QUESTION_BANK[0]!;
    const recommendationId = newDomainId();
    const manualExternalId = `manual-abandoned-swap-${newDomainId()}`;
    const manualQuestionId = await insertStoredQuestion({
      externalId: manualExternalId,
      ownerId: learnerId,
      visibility: "private",
    });
    await exposeAllExcept(learnerId, [original.id]);
    await database.db.insert(questionRecommendation).values({
      id: recommendationId,
      userId: learnerId,
      action: "SWAP",
      status: "PENDING",
      excludedExternalId: original.id,
      createdAt: now,
    });

    await database.db.transaction(async (transaction) => {
      await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
      await abandon(transaction, learnerId, recommendationId, manualExternalId);
      await transaction.insert(trainingCycle).values({
        userId: learnerId,
        questionId: manualQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
    });

    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, recommendationId),
      }),
    ).resolves.toMatchObject({
      status: "ABANDONED",
      questionExternalId: null,
      shownAt: null,
      excludedExternalId: original.id,
      createdAt: now,
    });
    const next = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    expect(next.status).not.toBe("READY");
    expect(next.question).toBeNull();
  });

  it("rolls back abandonment when the coupled cycle transaction fails", async () => {
    const abandon = cycleRecommendationApi().abandonRecommendationForCycle;
    expect(abandon).toEqual(expect.any(Function));
    if (!abandon) return;
    const learnerId = await createLearner("recommend-abandon-rollback");
    const candidate = QUESTION_BANK[0]!;
    await exposeAllExcept(learnerId, [candidate.id]);
    const ready = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    await expect(
      database.db.transaction(async (transaction) => {
        await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
        await abandon(
          transaction,
          learnerId,
          ready.id,
          "manual-rollback-question",
        );
        throw new Error("cycle insert failed");
      }),
    ).rejects.toThrow("cycle insert failed");

    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, ready.id),
      }),
    ).resolves.toMatchObject({
      status: "READY",
      questionExternalId: candidate.id,
      shownAt: now,
    });
    await expect(
      database.db.query.trainingCycle.findMany({
        where: eq(trainingCycle.userId, learnerId),
      }),
    ).resolves.toHaveLength(0);
  });

  it("forces recommended STARTED first so fallback fails and no second cycle commits", async () => {
    const assertForCycle =
      cycleRecommendationApi().assertRecommendationForCycle;
    const abandon = cycleRecommendationApi().abandonRecommendationForCycle;
    expect(assertForCycle).toEqual(expect.any(Function));
    expect(abandon).toEqual(expect.any(Function));
    if (!assertForCycle || !abandon) return;
    const learnerId = await createLearner("recommend-started-first");
    const recommendedExternalId = `started-first-recommended-${newDomainId()}`;
    const manualExternalId = `started-first-manual-${newDomainId()}`;
    const recommendedQuestionId = await insertStoredQuestion({
      externalId: recommendedExternalId,
      ownerId: learnerId,
      visibility: "private",
    });
    const manualQuestionId = await insertStoredQuestion({
      externalId: manualExternalId,
      ownerId: learnerId,
      visibility: "private",
    });
    const recommendationId = newDomainId();
    await database.db.insert(questionRecommendation).values({
      id: recommendationId,
      userId: learnerId,
      questionExternalId: recommendedExternalId,
      action: "INITIAL",
      status: "READY",
      shownAt: now,
    });
    let reached!: () => void;
    const atCommit = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const startingDatabase = databaseWithCommitBarrier({
      reached,
      release: () => released,
    });

    const started = startingDatabase.transaction(async (transaction) => {
      await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
      await assertForCycle(
        transaction,
        learnerId,
        recommendationId,
        recommendedExternalId,
      );
      await transaction.insert(trainingCycle).values({
        userId: learnerId,
        questionId: recommendedQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
    });
    await atCommit;
    const fallback = database.db.transaction(async (transaction) => {
      await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
      await abandon(transaction, learnerId, recommendationId, manualExternalId);
      await transaction.insert(trainingCycle).values({
        userId: learnerId,
        questionId: manualQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
    });
    await waitForLockWaiter();
    release();

    await expect(started).resolves.toBeUndefined();
    await expect(fallback).rejects.toMatchObject({
      problem: { code: "RECOMMENDATION_NOT_ABANDONABLE", status: 409 },
    });
    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, recommendationId),
      }),
    ).resolves.toMatchObject({ status: "STARTED" });
    await expect(
      database.db.query.trainingCycle.findMany({
        where: eq(trainingCycle.userId, learnerId),
      }),
    ).resolves.toHaveLength(1);
  });

  it("forces different-question fallback ABANDONED first so recommended start fails and no second cycle commits", async () => {
    const assertForCycle =
      cycleRecommendationApi().assertRecommendationForCycle;
    const abandon = cycleRecommendationApi().abandonRecommendationForCycle;
    expect(assertForCycle).toEqual(expect.any(Function));
    expect(abandon).toEqual(expect.any(Function));
    if (!assertForCycle || !abandon) return;
    const learnerId = await createLearner("recommend-abandoned-first");
    const recommendedExternalId = `abandoned-first-recommended-${newDomainId()}`;
    const manualExternalId = `abandoned-first-manual-${newDomainId()}`;
    const recommendedQuestionId = await insertStoredQuestion({
      externalId: recommendedExternalId,
      ownerId: learnerId,
      visibility: "private",
    });
    const manualQuestionId = await insertStoredQuestion({
      externalId: manualExternalId,
      ownerId: learnerId,
      visibility: "private",
    });
    const recommendationId = newDomainId();
    await database.db.insert(questionRecommendation).values({
      id: recommendationId,
      userId: learnerId,
      questionExternalId: recommendedExternalId,
      action: "INITIAL",
      status: "READY",
      shownAt: now,
    });
    let reached!: () => void;
    const atCommit = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fallbackDatabase = databaseWithCommitBarrier({
      reached,
      release: () => released,
    });

    const fallback = fallbackDatabase.transaction(async (transaction) => {
      await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
      await abandon(transaction, learnerId, recommendationId, manualExternalId);
      await transaction.insert(trainingCycle).values({
        userId: learnerId,
        questionId: manualQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
    });
    await atCommit;
    const started = database.db.transaction(async (transaction) => {
      await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
      await assertForCycle(
        transaction,
        learnerId,
        recommendationId,
        recommendedExternalId,
      );
      await transaction.insert(trainingCycle).values({
        userId: learnerId,
        questionId: recommendedQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
    });
    await waitForLockWaiter();
    release();

    await expect(fallback).resolves.toBeUndefined();
    await expect(started).rejects.toMatchObject({
      problem: { code: "RECOMMENDATION_NOT_READY", status: 409 },
    });
    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, recommendationId),
      }),
    ).resolves.toMatchObject({ status: "ABANDONED" });
    await expect(
      database.db.query.trainingCycle.findMany({
        where: eq(trainingCycle.userId, learnerId),
      }),
    ).resolves.toHaveLength(1);
  });

  it("linearizes poll finalization before coupled fallback and preserves the READY exposure", async () => {
    const abandon = cycleRecommendationApi().abandonRecommendationForCycle;
    expect(abandon).toEqual(expect.any(Function));
    if (!abandon) return;
    const learnerId = await createLearner("recommend-finalize-before-abandon");
    const manualExternalId = `manual-finalize-first-${newDomainId()}`;
    const manualQuestionId = await insertStoredQuestion({
      externalId: manualExternalId,
      ownerId: learnerId,
      visibility: "private",
    });
    await exposeAllExcept(learnerId, []);
    const pending = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    const stored = await database.db.query.questionRecommendation.findFirst({
      where: eq(questionRecommendation.id, pending.id),
    });
    const generatedExternalId = `iwc-dynamic-${newDomainId()}`;
    await insertStoredQuestion({
      externalId: generatedExternalId,
      generationBatchId: stored!.generationBatchId,
      source: "AI_GENERATED",
      type: "two_part",
      topic: "urban_transport",
    });
    await database.db
      .update(questionGenerationBatch)
      .set({ status: "SUCCEEDED", acceptedCount: 1 })
      .where(eq(questionGenerationBatch.id, stored!.generationBatchId!));
    let reached!: () => void;
    const atCommit = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pollingDatabase = databaseWithCommitBarrier({
      reached,
      release: () => released,
    });

    const poll = getQuestionRecommendation(
      pollingDatabase,
      learnerId,
      pending.id,
      options,
    );
    await atCommit;
    const fallback = database.db.transaction(async (transaction) => {
      await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
      await abandon(transaction, learnerId, pending.id, manualExternalId);
      await transaction.insert(trainingCycle).values({
        userId: learnerId,
        questionId: manualQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
    });
    await waitForLockWaiter();
    release();

    await expect(poll).resolves.toMatchObject({ status: "READY" });
    await expect(fallback).resolves.toBeUndefined();
    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, pending.id),
      }),
    ).resolves.toMatchObject({
      status: "ABANDONED",
      questionExternalId: generatedExternalId,
      shownAt: now,
    });
    await expect(
      database.db.query.trainingCycle.findMany({
        where: eq(trainingCycle.userId, learnerId),
      }),
    ).resolves.toHaveLength(1);
  });

  it("linearizes coupled PENDING fallback before polling so the batch cannot finalize it", async () => {
    const abandon = cycleRecommendationApi().abandonRecommendationForCycle;
    expect(abandon).toEqual(expect.any(Function));
    if (!abandon) return;
    const learnerId = await createLearner("recommend-abandon-before-finalize");
    const manualExternalId = `manual-abandon-first-${newDomainId()}`;
    const manualQuestionId = await insertStoredQuestion({
      externalId: manualExternalId,
      ownerId: learnerId,
      visibility: "private",
    });
    await exposeAllExcept(learnerId, []);
    const pending = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    const stored = await database.db.query.questionRecommendation.findFirst({
      where: eq(questionRecommendation.id, pending.id),
    });
    const generatedExternalId = `iwc-dynamic-${newDomainId()}`;
    await insertStoredQuestion({
      externalId: generatedExternalId,
      generationBatchId: stored!.generationBatchId,
      source: "AI_GENERATED",
      type: "discussion",
      topic: "health",
    });
    await database.db
      .update(questionGenerationBatch)
      .set({ status: "SUCCEEDED", acceptedCount: 1 })
      .where(eq(questionGenerationBatch.id, stored!.generationBatchId!));
    let reached!: () => void;
    const atCommit = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const abandoningDatabase = databaseWithCommitBarrier({
      reached,
      release: () => released,
    });

    const fallback = abandoningDatabase.transaction(async (transaction) => {
      await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
      await abandon(transaction, learnerId, pending.id, manualExternalId);
      await transaction.insert(trainingCycle).values({
        userId: learnerId,
        questionId: manualQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
    });
    await atCommit;
    const poll = getQuestionRecommendation(
      database.db,
      learnerId,
      pending.id,
      options,
    );
    await waitForLockWaiter();
    release();

    await expect(fallback).resolves.toBeUndefined();
    await expect(poll).resolves.toEqual({
      id: pending.id,
      status: "UNAVAILABLE",
      question: null,
    });
    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, pending.id),
      }),
    ).resolves.toMatchObject({
      status: "ABANDONED",
      questionExternalId: null,
      shownAt: null,
    });
    await expect(
      database.db.query.trainingCycle.findMany({
        where: eq(trainingCycle.userId, learnerId),
      }),
    ).resolves.toHaveLength(1);
  });

  it("polling a failed batch finalizes UNAVAILABLE without creating learning rows", async () => {
    const learnerId = await createLearner("recommend-poll-failed");
    await exposeAllExcept(learnerId, []);
    const pending = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    const storedPending =
      await database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, pending.id),
      });
    await database.db
      .update(questionGenerationBatch)
      .set({ status: "FAILED", safeFailureCode: "AI_UNAVAILABLE" })
      .where(eq(questionGenerationBatch.id, storedPending!.generationBatchId!));

    const unavailable = await getQuestionRecommendation(
      database.db,
      learnerId,
      pending.id,
      options,
    );

    expect(unavailable).toMatchObject({
      id: pending.id,
      status: "UNAVAILABLE",
      question: null,
    });
    await expect(
      database.db.query.trainingCycle.findMany({
        where: eq(trainingCycle.userId, learnerId),
      }),
    ).resolves.toHaveLength(0);
    await expect(
      database.db.query.writingAttempt.findMany({
        where: eq(writingAttempt.userId, learnerId),
      }),
    ).resolves.toHaveLength(0);
  });

  it.each(["QUEUED", "FAILED"] as const)(
    "keeps a READY recommendation when refill admission contends with %s supply",
    async (batchStatus) => {
      const learnerId = await createLearner(
        `recommend-contention-${batchStatus}`,
      );
      const onlyCandidate = QUESTION_BANK[0]!;
      await exposeAllExcept(learnerId, [onlyCandidate.id]);
      await insertBatch(learnerId, batchStatus, now);

      const ready = await createQuestionRecommendation(
        database.db,
        learnerId,
        { action: "INITIAL" },
        options,
      );

      expect(ready).toMatchObject({
        status: "READY",
        question: { id: onlyCandidate.id },
      });
      await expect(
        database.db.query.questionGenerationBatch.findMany({
          where: eq(questionGenerationBatch.triggeredByUserId, learnerId),
        }),
      ).resolves.toHaveLength(1);
    },
  );

  it("keeps proactive READY when the contending active batch turns terminal before requery", async () => {
    const learnerId = await createLearner("recommend-ready-transition");
    const onlyCandidate = QUESTION_BANK[0]!;
    await exposeAllExcept(learnerId, [onlyCandidate.id]);
    const activeBatchId = await insertBatch(learnerId, "QUEUED");
    let observeContention!: () => void;
    const contentionObserved = new Promise<void>((resolve) => {
      observeContention = resolve;
    });
    let releaseRecommendation!: () => void;
    const transitionCommitted = new Promise<void>((resolve) => {
      releaseRecommendation = resolve;
    });
    const barrierDatabase = databaseWithRefillContentionBarrier({
      observed: observeContention,
      waitForTransition: () => transitionCommitted,
    });

    const recommendationPromise = createQuestionRecommendation(
      barrierDatabase,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    await contentionObserved;
    await database.db
      .update(questionGenerationBatch)
      .set({ status: "SUCCEEDED" })
      .where(eq(questionGenerationBatch.id, activeBatchId));
    releaseRecommendation();
    const result = await recommendationPromise;

    expect(result).toMatchObject({
      status: "READY",
      question: { id: onlyCandidate.id },
    });
    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, result.id),
      }),
    ).resolves.toMatchObject({
      status: "READY",
      questionExternalId: onlyCandidate.id,
    });
  });

  it("re-evaluates zero-pool catalog when the contending batch succeeds before requery", async () => {
    const learnerId = await createLearner("recommend-zero-transition");
    await exposeAllExcept(learnerId, []);
    const activeBatchId = await insertBatch(learnerId, "QUEUED");
    const generatedExternalId = `iwc-dynamic-${newDomainId()}`;
    await insertStoredQuestion({
      externalId: generatedExternalId,
      generationBatchId: activeBatchId,
      source: "AI_GENERATED",
      type: "discussion",
      topic: "health",
    });
    let observeContention!: () => void;
    const contentionObserved = new Promise<void>((resolve) => {
      observeContention = resolve;
    });
    let releaseRecommendation!: () => void;
    const transitionCommitted = new Promise<void>((resolve) => {
      releaseRecommendation = resolve;
    });
    const barrierDatabase = databaseWithRefillContentionBarrier({
      observed: observeContention,
      waitForTransition: () => transitionCommitted,
    });

    const recommendationPromise = createQuestionRecommendation(
      barrierDatabase,
      learnerId,
      { action: "INITIAL" },
      options,
    );
    await contentionObserved;
    await database.db
      .update(questionGenerationBatch)
      .set({ status: "SUCCEEDED", acceptedCount: 1 })
      .where(eq(questionGenerationBatch.id, activeBatchId));
    releaseRecommendation();
    const result = await recommendationPromise;

    expect(result).toMatchObject({
      status: "READY",
      question: { id: generatedExternalId },
    });
  });

  it("locks and marks a matching READY recommendation STARTED while terminal states cannot replay", async () => {
    const assertForCycle =
      cycleRecommendationApi().assertRecommendationForCycle;
    expect(assertForCycle).toEqual(expect.any(Function));
    if (!assertForCycle) return;
    const learnerId = await createLearner("recommend-cycle-audit");
    const otherId = await createLearner("recommend-cycle-other");
    const candidate = QUESTION_BANK[0]!;
    const mismatchId = newDomainId();
    const otherOwnedId = newDomainId();
    const startedId = newDomainId();
    await database.db.insert(questionRecommendation).values([
      {
        id: startedId,
        userId: learnerId,
        questionExternalId: candidate.id,
        action: "INITIAL",
        status: "READY",
        shownAt: now,
      },
      {
        id: mismatchId,
        userId: learnerId,
        questionExternalId: candidate.id,
        action: "INITIAL",
        status: "READY",
        shownAt: now,
      },
      {
        id: otherOwnedId,
        userId: learnerId,
        questionExternalId: candidate.id,
        action: "INITIAL",
        status: "READY",
        shownAt: now,
      },
    ]);

    await expect(
      database.db.transaction(async (transaction) => {
        await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
        await assertForCycle(transaction, learnerId, startedId, candidate.id);
      }),
    ).resolves.toBeUndefined();
    await expect(
      database.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, startedId),
      }),
    ).resolves.toMatchObject({
      status: "STARTED",
      questionExternalId: candidate.id,
      shownAt: now,
    });
    await expect(
      database.db.transaction(async (transaction) => {
        await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
        await assertForCycle(transaction, learnerId, startedId, candidate.id);
      }),
    ).rejects.toMatchObject({
      problem: { status: 409, code: "RECOMMENDATION_NOT_READY" },
    });
    await expect(
      database.db.transaction(async (transaction) => {
        await lockLearnerAndAssertActiveCycleCapacity(transaction, otherId);
        await assertForCycle(transaction, otherId, otherOwnedId, candidate.id);
      }),
    ).rejects.toMatchObject({ problem: { status: 404 } });
    await expect(
      database.db.transaction(async (transaction) => {
        await lockLearnerAndAssertActiveCycleCapacity(transaction, learnerId);
        await assertForCycle(
          transaction,
          learnerId,
          mismatchId,
          QUESTION_BANK[1]!.id,
        );
      }),
    ).rejects.toMatchObject({
      problem: { status: 409, code: "RECOMMENDATION_QUESTION_MISMATCH" },
    });
  });
});
