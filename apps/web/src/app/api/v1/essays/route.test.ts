import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  createDatabase,
  newDomainId,
  question,
  trainingCycle,
  user,
} from "@iwc/db";

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
    name: "Workspace learner",
    role: "learner" as const,
  }),
}));

import { GET } from "./route";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("essay workspace route (PostgreSQL)", () => {
  const database = createDatabase(databaseUrl!);
  const createdUsers: string[] = [];

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
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("returns only the signed-in learner's active essays", async () => {
    const suffix = newDomainId();
    const learnerId = `essay-route-${suffix}`;
    const otherId = `essay-route-other-${suffix}`;
    const learnerQuestionId = newDomainId();
    const otherQuestionId = newDomainId();
    const learnerCycleId = newDomainId();
    createdUsers.push(learnerId, otherId);
    routeState.actorId = learnerId;

    await database.db.insert(user).values([
      {
        id: learnerId,
        name: "Workspace learner",
        email: `${learnerId}@example.test`,
        role: "learner",
      },
      {
        id: otherId,
        name: "Other learner",
        email: `${otherId}@example.test`,
        role: "learner",
      },
    ]);
    await database.db.insert(question).values([
      {
        id: learnerQuestionId,
        externalId: `essay-route-learner-${suffix}`,
        ownerId: learnerId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach practical decision-making?",
      },
      {
        id: otherQuestionId,
        externalId: `essay-route-other-${suffix}`,
        ownerId: otherId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "technology",
        prompt: "Should children use digital devices at school?",
      },
    ]);
    await database.db.insert(trainingCycle).values([
      {
        id: learnerCycleId,
        userId: learnerId,
        questionId: learnerQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      },
      {
        userId: otherId,
        questionId: otherQuestionId,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      },
    ]);

    const response = await GET(new Request("https://coach.test/api/v1/essays"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      active_count: 1,
      active_limit: 8,
      essays: [
        expect.objectContaining({
          id: learnerCycleId,
          prompt: "Should schools teach practical decision-making?",
          next_action: expect.objectContaining({ kind: "START_ATTEMPT_1" }),
          resources: expect.objectContaining({ cycle_id: learnerCycleId }),
        }),
      ],
    });
  });
});
