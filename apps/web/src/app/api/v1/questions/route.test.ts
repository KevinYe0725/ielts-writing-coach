import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  createDatabase,
  newDomainId,
  question,
  questionGenerationBatch,
  user,
} from "@iwc/db";
import { QUESTION_BANK } from "@iwc/question-bank";

const routeState = vi.hoisted(() => ({
  actorId: "",
  context: null as unknown,
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => routeState.context,
}));
vi.mock("@/lib/server/session", () => ({
  requireSession: async () => ({
    id: routeState.actorId,
    email: `${routeState.actorId}@example.test`,
    name: "Question learner",
    role: "learner" as const,
  }),
}));

import { GET } from "./route";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("GET /api/v1/questions (PostgreSQL)", () => {
  const database = createDatabase(databaseUrl!);
  const createdUsers: string[] = [];
  const createdQuestionIds: string[] = [];
  const createdBatchIds: string[] = [];

  routeState.context = {
    db: database.db,
    pool: database.pool,
    environment: {
      APP_URL: "https://coach.test",
      DEPLOYMENT_MODE: "personal",
      TRUST_PROXY_HOPS: 0,
    },
  };

  afterEach(async () => {
    for (const userId of createdUsers.splice(0)) {
      await database.db.delete(user).where(eq(user.id, userId));
    }
    if (createdQuestionIds.length > 0) {
      await database.db
        .delete(question)
        .where(inArray(question.id, createdQuestionIds.splice(0)));
    }
    if (createdBatchIds.length > 0) {
      await database.db
        .delete(questionGenerationBatch)
        .where(inArray(questionGenerationBatch.id, createdBatchIds.splice(0)));
    }
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("merges owned private, static, and validated public dynamic questions once", async () => {
    const suffix = newDomainId();
    const learnerId = `questions-route-${suffix}`;
    const succeededBatchId = newDomainId();
    const failedBatchId = newDomainId();
    const privateId = newDomainId();
    const dynamicId = newDomainId();
    const invalidId = newDomainId();
    createdUsers.push(learnerId);
    createdBatchIds.push(succeededBatchId, failedBatchId);
    createdQuestionIds.push(privateId, dynamicId, invalidId);
    routeState.actorId = learnerId;
    await database.db.insert(user).values({
      id: learnerId,
      name: "Question learner",
      email: `${learnerId}@example.test`,
      role: "learner",
    });
    await database.db.insert(questionGenerationBatch).values([
      {
        id: succeededBatchId,
        triggeredByUserId: learnerId,
        status: "SUCCEEDED",
        mode: "OFFLINE",
        targetMix: [],
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
      {
        id: failedBatchId,
        triggeredByUserId: learnerId,
        status: "FAILED",
        mode: "OFFLINE",
        targetMix: [],
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
    ]);
    const privateExternalId = `private-${suffix}`;
    const dynamicExternalId = `iwc-dynamic-${suffix}`;
    const invalidExternalId = `iwc-invalid-${suffix}`;
    await database.db.insert(question).values([
      {
        id: privateId,
        externalId: privateExternalId,
        ownerId: learnerId,
        source: "user_private",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "A private question visible only to its owner.",
      },
      {
        id: dynamicId,
        externalId: dynamicExternalId,
        source: "AI_GENERATED",
        visibility: "public",
        questionType: "discussion",
        topic: "health",
        prompt: "A validated shared dynamic question.",
        generationBatchId: succeededBatchId,
      },
      {
        id: invalidId,
        externalId: invalidExternalId,
        source: "AI_GENERATED",
        visibility: "public",
        questionType: "discussion",
        topic: "health",
        prompt: "A failed-batch question that must stay hidden.",
        generationBatchId: failedBatchId,
      },
    ]);

    const response = await GET(
      new Request("https://coach.test/api/v1/questions"),
    );
    const body = (await response.json()) as {
      questions: Array<{ id?: string; externalId?: string }>;
    };
    const ids = body.questions.map((item) => item.externalId ?? item.id);

    expect(response.status).toBe(200);
    expect(ids[0]).toBe(privateExternalId);
    expect(ids).toContain(QUESTION_BANK[0]!.id);
    expect(ids).toContain(dynamicExternalId);
    expect(ids).not.toContain(invalidExternalId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(body)).not.toMatch(/AI_GENERATED|AI_RESEARCHED/u);
  });
});
