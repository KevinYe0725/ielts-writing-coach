import { randomBytes, randomUUID } from "node:crypto";

import {
  decryptProviderSecret,
  encryptProviderSecret,
} from "../../ai/src/crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createDatabase, newDomainId } from "./index";
import {
  aiJob,
  question,
  questionGenerationBatch,
  questionRecommendation,
  searchConnection,
  user,
  type QuestionGenerationBatchStatus,
  type QuestionRecommendationStatus,
} from "./schema";

const integrationUrl = process.env.DATABASE_URL;
const integration = integrationUrl ? describe : describe.skip;

integration("adaptive question supply persistence", () => {
  if (!integrationUrl) return;
  const { db, pool } = createDatabase(integrationUrl);
  const testId = randomUUID();
  const ownerId = `owner-question-supply-${testId}`;
  const learnerId = `learner-question-supply-${testId}`;
  const createdUserIds = [ownerId, learnerId];
  const createdSearchConnectionIds: string[] = [];
  const createdRecommendationIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdBatchIds: string[] = [];
  const createdQuestionIds: string[] = [];

  afterAll(async () => {
    if (createdRecommendationIds.length > 0)
      await db
        .delete(questionRecommendation)
        .where(inArray(questionRecommendation.id, createdRecommendationIds));
    if (createdQuestionIds.length > 0)
      await db.delete(question).where(inArray(question.id, createdQuestionIds));
    if (createdBatchIds.length > 0)
      await db
        .delete(questionGenerationBatch)
        .where(inArray(questionGenerationBatch.id, createdBatchIds));
    if (createdJobIds.length > 0)
      await db.delete(aiJob).where(inArray(aiJob.id, createdJobIds));
    if (createdSearchConnectionIds.length > 0)
      await db
        .delete(searchConnection)
        .where(inArray(searchConnection.id, createdSearchConnectionIds));
    await db.delete(user).where(inArray(user.id, createdUserIds));
    await pool.end();
  });

  it("persists ABANDONED as an internal recommendation status", async () => {
    const enumValues = await db.execute(sql`
      select enumlabel
      from pg_enum
      join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'question_recommendation_status'
      order by enumsortorder
    `);

    expect(enumValues.rows.map((row) => row.enumlabel)).toEqual([
      "PENDING",
      "READY",
      "UNAVAILABLE",
      "ABANDONED",
      "STARTED",
    ]);
  });

  it("persists pending recommendations and generated-question provenance", async () => {
    const recommendationStatus: QuestionRecommendationStatus = "PENDING";
    const batchStatus: QuestionGenerationBatchStatus = "QUEUED";
    const searchConnectionId = newDomainId();
    const masterKey = randomBytes(32);
    const encryptedApiKey = encryptProviderSecret(
      "brave-test-key",
      masterKey,
      1,
      `search:${ownerId}:${searchConnectionId}`,
    );

    await db.insert(user).values([
      {
        id: ownerId,
        name: "Question Supply Owner",
        email: `owner-question-supply-${testId}@example.test`,
        role: "owner",
      },
      {
        id: learnerId,
        name: "Question Supply Learner",
        email: `learner-question-supply-${testId}@example.test`,
      },
    ]);

    const [savedSearchConnection] = await db
      .insert(searchConnection)
      .values({
        id: searchConnectionId,
        configuredByUserId: ownerId,
        kind: "BRAVE",
        encryptedApiKey: encryptedApiKey.ciphertext,
        encryptedApiKeyNonce: encryptedApiKey.nonce,
        encryptionKeyVersion: encryptedApiKey.keyVersion,
        status: "ACTIVE",
      })
      .returning();
    if (!savedSearchConnection) {
      throw new Error("search connection insert did not return a row");
    }
    createdSearchConnectionIds.push(savedSearchConnection.id);
    const [savedRecommendation] = await db
      .insert(questionRecommendation)
      .values({
        userId: learnerId,
        action: "INITIAL",
        status: recommendationStatus,
      })
      .returning();
    if (!savedRecommendation) {
      throw new Error("recommendation insert did not return a row");
    }
    createdRecommendationIds.push(savedRecommendation.id);
    const [savedJob] = await db
      .insert(aiJob)
      .values({
        ownerId,
        taskKind: "question_bank_refill",
        protectedReference: {},
        versionSnapshot: {},
        idempotencyKey: `question-supply-${testId}`,
      })
      .returning();
    if (!savedJob) {
      throw new Error("AI job insert did not return a row");
    }
    createdJobIds.push(savedJob.id);
    const [savedBatch] = await db
      .insert(questionGenerationBatch)
      .values({
        triggeredByUserId: ownerId,
        status: batchStatus,
        mode: "WEB_RESEARCH",
        targetMix: [{ questionType: "discussion", topic: "health", count: 1 }],
        researchSources: [
          {
            url: "https://example.test/public-theme",
            title: "Public theme",
            snippet: "A bounded public issue-theme summary.",
          },
        ],
        searchConnectionId: savedSearchConnection.id,
        aiJobId: savedJob.id,
        promptVersion: "question-bank-refill-v1",
        rubricVersion: "question-quality-v1",
      })
      .returning();
    if (!savedBatch) {
      throw new Error("generation batch insert did not return a row");
    }
    createdBatchIds.push(savedBatch.id);
    const [linkedRecommendation] = await db
      .update(questionRecommendation)
      .set({ generationBatchId: savedBatch.id })
      .where(eq(questionRecommendation.id, savedRecommendation.id))
      .returning();
    if (!linkedRecommendation) {
      throw new Error("linked recommendation update did not return a row");
    }
    const [savedQuestion] = await db
      .insert(question)
      .values({
        externalId: `generated-question-${testId}`,
        source: "AI_RESEARCHED",
        questionType: "discussion",
        topic: "health",
        prompt:
          "Some people think governments should fund preventive healthcare. Discuss both views and give your own opinion.",
        generationBatchId: savedBatch.id,
      })
      .returning();
    if (!savedQuestion) {
      throw new Error("generated question insert did not return a row");
    }
    createdQuestionIds.push(savedQuestion.id);

    expect(savedRecommendation).toMatchObject({
      action: "INITIAL",
      status: "PENDING",
      questionExternalId: null,
    });
    expect(linkedRecommendation.generationBatchId).toBe(savedBatch.id);
    expect(savedQuestion.generationBatchId).toBe(savedBatch.id);
    expect(
      decryptProviderSecret(
        {
          ciphertext: savedSearchConnection.encryptedApiKey,
          nonce: savedSearchConnection.encryptedApiKeyNonce,
          keyVersion: savedSearchConnection.encryptionKeyVersion,
        },
        masterKey,
        `search:${ownerId}:${searchConnectionId}`,
      ),
    ).toBe("brave-test-key");

    const invalidBatchLink = await db
      .insert(questionRecommendation)
      .values({
        userId: learnerId,
        action: "SWAP",
        status: "PENDING",
        generationBatchId: newDomainId(),
      })
      .catch((error: unknown) => error);
    expect(invalidBatchLink).toMatchObject({ cause: { code: "23503" } });

    const indexRows = await db.execute(sql`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'question_recommendation'
        and indexname = 'question_recommendation_generation_batch_status_idx'
    `);
    expect(indexRows.rows).toHaveLength(1);
  });

  it("rejects a batch-backed generated question with an owner", async () => {
    const generatedQuestionOwnerId = `generated-question-owner-${randomUUID()}`;
    createdUserIds.push(generatedQuestionOwnerId);
    await db.insert(user).values({
      id: generatedQuestionOwnerId,
      name: "Generated Question Owner",
      email: `${generatedQuestionOwnerId}@example.test`,
      role: "owner",
    });
    const [batch] = await db
      .insert(questionGenerationBatch)
      .values({
        triggeredByUserId: generatedQuestionOwnerId,
        status: "QUEUED",
        mode: "OFFLINE",
        targetMix: [{ questionType: "discussion", topic: "health", count: 1 }],
        promptVersion: "question-bank-refill-v1",
        rubricVersion: "question-quality-v1",
      })
      .returning();
    if (!batch) throw new Error("generation batch insert did not return a row");
    createdBatchIds.push(batch.id);

    await expect(
      db.insert(question).values({
        externalId: `owned-generated-question-${randomUUID()}`,
        ownerId: generatedQuestionOwnerId,
        source: "AI_GENERATED",
        questionType: "discussion",
        topic: "health",
        prompt:
          "Some people think city governments should subsidise cycling. Discuss both views and give your own opinion.",
        generationBatchId: batch.id,
      }),
    ).rejects.toThrow();
  });

  it("preserves a shared batch and generated question when its trigger user is deleted", async () => {
    const triggerUserId = `generation-trigger-${randomUUID()}`;
    createdUserIds.push(triggerUserId);
    await db.insert(user).values({
      id: triggerUserId,
      name: "Question Generation Trigger",
      email: `${triggerUserId}@example.test`,
      role: "admin",
    });
    const [batch] = await db
      .insert(questionGenerationBatch)
      .values({
        triggeredByUserId: triggerUserId,
        status: "SUCCEEDED",
        mode: "OFFLINE",
        targetMix: [{ questionType: "discussion", topic: "health", count: 1 }],
        promptVersion: "question-bank-refill-v1",
        rubricVersion: "question-quality-v1",
        acceptedCount: 1,
      })
      .returning();
    if (!batch) throw new Error("generation batch insert did not return a row");
    createdBatchIds.push(batch.id);
    const [generatedQuestion] = await db
      .insert(question)
      .values({
        externalId: `shared-generated-question-${randomUUID()}`,
        source: "AI_GENERATED",
        questionType: "discussion",
        topic: "health",
        prompt:
          "Some people think employers should provide paid time for volunteering. Discuss both views and give your own opinion.",
        generationBatchId: batch.id,
      })
      .returning();
    if (!generatedQuestion)
      throw new Error("generated question insert did not return a row");
    createdQuestionIds.push(generatedQuestion.id);

    await db.delete(user).where(eq(user.id, triggerUserId));

    const [savedBatch] = await db
      .select({
        id: questionGenerationBatch.id,
        trigger: questionGenerationBatch.triggeredByUserId,
      })
      .from(questionGenerationBatch)
      .where(eq(questionGenerationBatch.id, batch.id));
    const [savedQuestion] = await db
      .select({
        id: question.id,
        ownerId: question.ownerId,
        generationBatchId: question.generationBatchId,
      })
      .from(question)
      .where(eq(question.id, generatedQuestion.id));

    expect(savedBatch).toMatchObject({ id: batch.id, trigger: null });
    expect(savedQuestion).toMatchObject({
      id: generatedQuestion.id,
      ownerId: null,
      generationBatchId: batch.id,
    });
  });

  it("rejects oversized and over-count research source payloads in PostgreSQL", async () => {
    const fortyOneSources = Array.from({ length: 41 }, (_, index) => ({
      url: `https://example.test/source-${index}`,
      title: `Source ${index}`,
      snippet: "A bounded source summary.",
    }));

    await expect(
      db.insert(questionGenerationBatch).values({
        status: "QUEUED",
        mode: "WEB_RESEARCH",
        targetMix: [{ questionType: "discussion", topic: "health", count: 1 }],
        researchSources: fortyOneSources,
        promptVersion: "question-bank-refill-v1",
        rubricVersion: "question-quality-v1",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(questionGenerationBatch).values({
        status: "QUEUED",
        mode: "WEB_RESEARCH",
        targetMix: [{ questionType: "discussion", topic: "health", count: 1 }],
        researchSources: [
          {
            url: "https://example.test/oversized-source",
            title: "Oversized source",
            snippet: "x".repeat(256 * 1024),
          },
        ],
        promptVersion: "question-bank-refill-v1",
        rubricVersion: "question-quality-v1",
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid question supply enum values in PostgreSQL", async () => {
    await expect(
      pool.query("select 'INVALID'::question_recommendation_action"),
    ).rejects.toThrow();
    await expect(
      pool.query("select 'INVALID'::question_recommendation_status"),
    ).rejects.toThrow();
    await expect(
      pool.query("select 'INVALID'::question_generation_batch_status"),
    ).rejects.toThrow();
    await expect(
      pool.query("select 'INVALID'::question_generation_batch_mode"),
    ).rejects.toThrow();
    await expect(
      pool.query("select 'INVALID'::search_connection_kind"),
    ).rejects.toThrow();
    await expect(
      pool.query("select 'UNRECOGNIZED'::search_connection_status"),
    ).rejects.toThrow();
  });
});
