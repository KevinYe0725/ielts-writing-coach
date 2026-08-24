import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createDatabase } from "./index";
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

  afterAll(async () => {
    await pool.end();
  });

  it("persists pending recommendations and generated-question provenance", async () => {
    const recommendationStatus: QuestionRecommendationStatus = "PENDING";
    const batchStatus: QuestionGenerationBatchStatus = "QUEUED";

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
        configuredByUserId: ownerId,
        kind: "BRAVE",
        encryptedApiKey: "ciphertext",
        encryptionKeyVersion: 1,
        status: "ACTIVE",
      })
      .returning();
    if (!savedSearchConnection) {
      throw new Error("search connection insert did not return a row");
    }
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

    expect(savedRecommendation).toMatchObject({
      action: "INITIAL",
      status: "PENDING",
      questionExternalId: null,
    });
    expect(savedQuestion.generationBatchId).toBe(savedBatch.id);
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
