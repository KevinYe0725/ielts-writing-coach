import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  createDatabase,
  newDomainId,
  question,
  questionGenerationBatch,
  trainingCycle,
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

import { POST as createTrainingCycle } from "../training-cycles/route";
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

  async function seedSucceededStaticCollision(label: string): Promise<{
    learnerId: string;
    externalId: string;
  }> {
    const suffix = newDomainId();
    const learnerId = `${label}-${suffix}`;
    const batchId = newDomainId();
    const questionId = newDomainId();
    const storedExternalIds = new Set(
      (
        await database.db.query.question.findMany({
          columns: { externalId: true },
        })
      ).map((item) => item.externalId),
    );
    const staticQuestion = QUESTION_BANK.find(
      (item) => !storedExternalIds.has(item.id),
    );
    expect(staticQuestion).toBeDefined();
    createdUsers.push(learnerId);
    createdBatchIds.push(batchId);
    createdQuestionIds.push(questionId);
    routeState.actorId = learnerId;
    await database.db.insert(user).values({
      id: learnerId,
      name: "Static collision learner",
      email: `${learnerId}@example.test`,
      role: "learner",
    });
    await database.db.insert(questionGenerationBatch).values({
      id: batchId,
      triggeredByUserId: learnerId,
      status: "SUCCEEDED",
      mode: "OFFLINE",
      targetMix: [],
      promptVersion: "1.0.0",
      rubricVersion: "iwc-question-bank-refill-1.0.0",
    });
    await database.db.insert(question).values({
      id: questionId,
      externalId: staticQuestion!.id,
      source: "AI_GENERATED",
      visibility: "public",
      questionType: staticQuestion!.type,
      topic: staticQuestion!.topic,
      ieltsTrack: "academic",
      prompt:
        "A conflicting generated prompt that must never redefine a static external ID.",
      generationBatchId: batchId,
    });
    return { learnerId, externalId: staticQuestion!.id };
  }

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

  it("excludes a generated row that collides with a canonical static ID from the recommendation catalog", async () => {
    const collision = await seedSucceededStaticCollision(
      "catalog-static-collision",
    );

    const response = await GET(
      new Request("https://coach.test/api/v1/questions"),
    );
    const body = (await response.json()) as {
      questions: Array<{ id?: string; externalId?: string; prompt?: string }>;
    };
    const matching = body.questions.filter(
      (item) => (item.externalId ?? item.id) === collision.externalId,
    );

    expect(response.status).toBe(200);
    expect(matching).toHaveLength(0);
  });

  it("returns 404 when direct cycle creation names a generated row colliding with a static ID", async () => {
    const collision = await seedSucceededStaticCollision(
      "cycle-static-collision",
    );

    const response = await createTrainingCycle(
      new Request("https://coach.test/api/v1/training-cycles", {
        method: "POST",
        headers: {
          origin: "https://coach.test",
          "content-type": "application/json",
          "idempotency-key": `cycle-static-collision-${newDomainId()}`,
        },
        body: JSON.stringify({
          question_id: collision.externalId,
          timezone: "UTC",
        }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "QUESTION_NOT_FOUND",
    });
  });

  it("rejects direct cycles for unvalidated dynamic rows while keeping valid shared and owned-private questions", async () => {
    const suffix = newDomainId();
    const learnerId = `cycle-question-validation-${suffix}`;
    const succeededBatchId = newDomainId();
    const failedBatchId = newDomainId();
    const queuedBatchId = newDomainId();
    createdUsers.push(learnerId);
    createdBatchIds.push(succeededBatchId, failedBatchId, queuedBatchId);
    routeState.actorId = learnerId;
    await database.db.insert(user).values({
      id: learnerId,
      name: "Cycle question learner",
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
      {
        id: queuedBatchId,
        triggeredByUserId: learnerId,
        status: "QUEUED",
        mode: "OFFLINE",
        targetMix: [],
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
    ]);
    const storedExternalIds = new Set(
      (
        await database.db.query.question.findMany({
          columns: { externalId: true },
        })
      ).map((item) => item.externalId),
    );
    const staticCollision = QUESTION_BANK.find(
      (item) => !storedExternalIds.has(item.id),
    );
    expect(staticCollision).toBeDefined();
    const rows = [
      {
        label: "failed",
        generationBatchId: failedBatchId,
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        ieltsTrack: "academic",
      },
      {
        label: "failed-static-id",
        externalId: staticCollision!.id,
        generationBatchId: failedBatchId,
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        ieltsTrack: "academic",
      },
      {
        label: "queued",
        generationBatchId: queuedBatchId,
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        ieltsTrack: "academic",
      },
      {
        label: "private-generated",
        generationBatchId: succeededBatchId,
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        ieltsTrack: "academic",
      },
      {
        label: "invalid-type",
        generationBatchId: succeededBatchId,
        visibility: "public",
        questionType: "unsupported",
        topic: "education",
        ieltsTrack: "academic",
      },
      {
        label: "invalid-track",
        generationBatchId: succeededBatchId,
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        ieltsTrack: "unsupported",
      },
      {
        label: "valid-generated",
        generationBatchId: succeededBatchId,
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        ieltsTrack: "academic",
      },
    ] as const;
    const externalIds = new Map<string, string>();
    for (const row of rows) {
      const id = newDomainId();
      const externalId =
        "externalId" in row ? row.externalId : `${row.label}-${suffix}`;
      createdQuestionIds.push(id);
      externalIds.set(row.label, externalId);
      await database.db.insert(question).values({
        id,
        externalId,
        source: "AI_GENERATED",
        visibility: row.visibility,
        questionType: row.questionType,
        topic: row.topic,
        ieltsTrack: row.ieltsTrack,
        prompt: `A direct-cycle fixture for ${row.label}.`,
        generationBatchId: row.generationBatchId,
      });
    }
    const privateId = newDomainId();
    const privateExternalId = `owned-private-${suffix}`;
    const unlinkedGeneratedPrivateId = newDomainId();
    const unlinkedGeneratedPrivateExternalId = `owned-private-generated-${suffix}`;
    createdQuestionIds.push(privateId, unlinkedGeneratedPrivateId);
    await database.db.insert(question).values([
      {
        id: privateId,
        externalId: privateExternalId,
        ownerId: learnerId,
        source: "USER_CUSTOM",
        visibility: "private",
        questionType: "discussion",
        topic: "health",
        ieltsTrack: "general_training",
        prompt: "A valid owned private question for direct cycle creation.",
      },
      {
        id: unlinkedGeneratedPrivateId,
        externalId: unlinkedGeneratedPrivateExternalId,
        ownerId: learnerId,
        source: "AI_GENERATED",
        visibility: "private",
        questionType: "discussion",
        topic: "health",
        ieltsTrack: "academic",
        prompt:
          "An actor-owned generated private row without batch provenance.",
      },
    ]);

    const postCycle = (externalId: string, key: string) =>
      createTrainingCycle(
        new Request("https://coach.test/api/v1/training-cycles", {
          method: "POST",
          headers: {
            origin: "https://coach.test",
            "content-type": "application/json",
            "idempotency-key": key,
          },
          body: JSON.stringify({ question_id: externalId, timezone: "UTC" }),
        }),
      );
    for (const label of [
      "failed",
      "failed-static-id",
      "queued",
      "private-generated",
      "invalid-type",
      "invalid-track",
    ]) {
      const response = await postCycle(
        externalIds.get(label)!,
        `invalid-cycle-${label}-${suffix}`,
      );
      expect(response.status, label).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        code: "QUESTION_NOT_FOUND",
      });
    }
    const unlinkedGeneratedPrivate = await postCycle(
      unlinkedGeneratedPrivateExternalId,
      `invalid-cycle-private-generated-unlinked-${suffix}`,
    );
    expect(unlinkedGeneratedPrivate.status).toBe(404);
    await expect(unlinkedGeneratedPrivate.json()).resolves.toMatchObject({
      code: "QUESTION_NOT_FOUND",
    });

    expect(
      (
        await postCycle(
          externalIds.get("valid-generated")!,
          `valid-generated-${suffix}`,
        )
      ).status,
    ).toBe(201);
    expect(
      (await postCycle(privateExternalId, `valid-private-${suffix}`)).status,
    ).toBe(201);
    await expect(
      database.db.query.trainingCycle.findMany({
        where: eq(trainingCycle.userId, learnerId),
      }),
    ).resolves.toHaveLength(2);
  });
});
