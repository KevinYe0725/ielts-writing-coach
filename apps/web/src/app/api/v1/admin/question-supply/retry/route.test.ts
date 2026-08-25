import { eq, inArray, sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { readServerEnvironment } from "@iwc/config";
import {
  aiJob,
  auditEvent,
  createDatabase,
  newDomainId,
  questionGenerationBatch,
  user,
} from "@iwc/db";

import type { SessionActor } from "@/lib/server/session";

const routeState = vi.hoisted(() => ({
  actor: null as SessionActor | null,
  context: null as unknown,
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => routeState.context,
}));

vi.mock("@/lib/server/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/session")>();
  return {
    ...actual,
    requireSession: async () => routeState.actor,
  };
});

import { POST } from "./route";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)(
  "privileged question-supply retry route (PostgreSQL)",
  () => {
    const database = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const ownerId = `supply-retry-owner-${suffix}`;
    const adminId = `supply-retry-admin-${suffix}`;
    const learnerId = `supply-retry-learner-${suffix}`;
    const actor = (id: string, role: SessionActor["role"]): SessionActor => ({
      id,
      email: `${id}@example.test`,
      name: `Supply retry ${role}`,
      role,
    });

    function request(
      idempotencyKey?: string,
      origin = "https://coach.test",
    ): Request {
      return new Request(
        "https://coach.test/api/v1/admin/question-supply/retry",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
            origin,
          },
          body: "{}",
        },
      );
    }

    beforeAll(async () => {
      routeState.context = {
        db: database.db,
        pool: database.pool,
        environment: readServerEnvironment({
          NODE_ENV: "test",
          APP_URL: "https://coach.test",
          AUTH_SECRET: "a".repeat(32),
          APP_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64"),
          DATABASE_URL: databaseUrl!,
        }),
      };
      await database.db.insert(user).values([
        {
          id: ownerId,
          email: `${ownerId}@example.test`,
          name: "Supply retry owner",
          role: "owner",
        },
        {
          id: adminId,
          email: `${adminId}@example.test`,
          name: "Supply retry admin",
          role: "admin",
        },
        {
          id: learnerId,
          email: `${learnerId}@example.test`,
          name: "Supply retry learner",
          role: "learner",
        },
      ]);
    });

    afterEach(async () => {
      const jobs = await database.db.query.aiJob.findMany({
        columns: { graphileJobKey: true },
        where: inArray(aiJob.ownerId, [ownerId, adminId, learnerId]),
      });
      for (const job of jobs) {
        if (job.graphileJobKey)
          await database.db.execute(
            sql`select graphile_worker.remove_job(${job.graphileJobKey})`,
          );
      }
      await database.db
        .delete(auditEvent)
        .where(inArray(auditEvent.actorId, [ownerId, adminId, learnerId]));
      await database.db
        .delete(questionGenerationBatch)
        .where(
          inArray(questionGenerationBatch.triggeredByUserId, [
            ownerId,
            adminId,
            learnerId,
          ]),
        );
      await database.db
        .delete(aiJob)
        .where(inArray(aiJob.ownerId, [ownerId, adminId, learnerId]));
      routeState.actor = actor(ownerId, "owner");
    });

    afterAll(async () => {
      await database.db.delete(user).where(eq(user.id, ownerId));
      await database.db.delete(user).where(eq(user.id, adminId));
      await database.db.delete(user).where(eq(user.id, learnerId));
      await database.pool.end();
    });

    async function insertFailedBatch(): Promise<void> {
      await database.db.insert(questionGenerationBatch).values({
        triggeredByUserId: ownerId,
        status: "FAILED",
        mode: "OFFLINE",
        targetMix: [],
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
        safeFailureCode: "AI_UNAVAILABLE",
      });
    }

    it("rejects untrusted origins, learners, and missing idempotency keys", async () => {
      await insertFailedBatch();
      routeState.actor = actor(ownerId, "owner");
      expect(
        (await POST(request("bad-origin", "https://evil.test"))).status,
      ).toBe(403);

      routeState.actor = actor(learnerId, "learner");
      expect((await POST(request("learner-denied"))).status).toBe(403);

      routeState.actor = actor(ownerId, "owner");
      expect((await POST(request())).status).toBe(400);
      await expect(
        database.db.query.questionGenerationBatch.findMany(),
      ).resolves.toHaveLength(1);
    });

    it("starts once, replays exactly, lets Admin attach, rate limits, and returns no operational IDs", async () => {
      await insertFailedBatch();
      routeState.actor = actor(ownerId, "owner");
      const first = await POST(request(`owner-retry-${suffix}`));
      const firstBody = (await first.json()) as Record<string, unknown>;
      expect(first.status).toBe(202);
      expect(firstBody).toEqual({ state: "STARTED", batch_status: "QUEUED" });
      expect(JSON.stringify(firstBody)).not.toMatch(
        /(?:batch|job|search).*(?:id)|(?:id).*(?:batch|job|search)/iu,
      );

      const replay = await POST(request(`owner-retry-${suffix}`));
      expect(replay.status).toBe(202);
      expect(replay.headers.get("idempotency-replayed")).toBe("true");
      await expect(replay.json()).resolves.toEqual(firstBody);

      routeState.actor = actor(adminId, "admin");
      for (let index = 0; index < 5; index += 1) {
        const response = await POST(request(`admin-attach-${suffix}-${index}`));
        expect(response.status).toBe(202);
        await expect(response.json()).resolves.toEqual({
          state: "ATTACHED",
          batch_status: "QUEUED",
        });
      }
      const limited = await POST(request(`admin-limited-${suffix}`));
      expect(limited.status).toBe(429);

      const batches = await database.db.query.questionGenerationBatch.findMany({
        where: inArray(questionGenerationBatch.triggeredByUserId, [
          ownerId,
          adminId,
        ]),
      });
      expect(batches).toHaveLength(2);
      expect(batches.filter((batch) => batch.status === "QUEUED")).toHaveLength(
        1,
      );
    });
  },
);
