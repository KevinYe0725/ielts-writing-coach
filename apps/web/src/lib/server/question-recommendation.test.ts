import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  aiJob,
  auditEvent,
  createDatabase,
  newDomainId,
  question,
  questionGenerationBatch,
  questionRecommendation,
  trainingCycle,
  transferTask,
  user,
  writingAttempt,
  type Database,
} from "@iwc/db";
import { QUESTION_BANK } from "@iwc/question-bank";

import * as questionRecommendationModule from "./question-recommendation";
import { completeIdempotentResponse, reserveIdempotencyKey } from "./security";

import {
  assertRecommendationForCycle,
  createQuestionRecommendation,
  getQuestionRecommendation,
  listPublicQuestionCatalog,
} from "./question-recommendation";

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

  const options = {
    now: () => now,
    randomIndex: () => 0,
  };

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
        status: "READY",
        shownAt: new Date(now.getTime() - (72 * 60 * 60 * 1_000 - 1_000)),
      },
      {
        userId: learnerId,
        questionExternalId: exactBoundary!.id,
        action: "INITIAL",
        status: "READY",
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

  it.each(["PENDING", "UNAVAILABLE"] as const)(
    "uses a recent %s SWAP record to cool down its excluded question",
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

  it("verifies recommendation ownership and exact question before cycle creation", async () => {
    const learnerId = await createLearner("recommend-cycle-audit");
    const otherId = await createLearner("recommend-cycle-other");
    const ready = await createQuestionRecommendation(
      database.db,
      learnerId,
      { action: "INITIAL" },
      options,
    );

    await expect(
      assertRecommendationForCycle(
        database.db,
        learnerId,
        ready.id,
        ready.question!.id,
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertRecommendationForCycle(
        database.db,
        otherId,
        ready.id,
        ready.question!.id,
      ),
    ).rejects.toMatchObject({ problem: { status: 404 } });
    await expect(
      assertRecommendationForCycle(
        database.db,
        learnerId,
        ready.id,
        QUESTION_BANK[1]!.id,
      ),
    ).rejects.toMatchObject({
      problem: { status: 409, code: "RECOMMENDATION_QUESTION_MISMATCH" },
    });
  });
});
