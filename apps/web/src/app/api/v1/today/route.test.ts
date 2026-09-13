import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  aiJob,
  createDatabase,
  newDomainId,
  question,
  trainingCycle,
  user,
} from "@iwc/db";

const state = vi.hoisted(() => ({ context: null as unknown, actorId: "" }));
vi.mock("@/lib/server/context", () => ({
  getServerContext: () => state.context,
}));
vi.mock("@/lib/server/session", () => ({
  requireSession: async () => ({
    id: state.actorId,
    role: "learner",
    name: "Learner",
    email: "today-flow@example.invalid",
  }),
}));
import { GET } from "./route";

describe.skipIf(!process.env.DATABASE_URL)(
  "Today progress against PostgreSQL",
  () => {
    const database = createDatabase(
      process.env.DATABASE_URL ??
        "postgresql://unused:unused@127.0.0.1:1/unused",
    );
    const actorId = newDomainId();
    const questionId = newDomainId();
    const cycleId = newDomainId();
    const jobIds: string[] = [];
    beforeAll(async () => {
      state.actorId = actorId;
      state.context = {
        ...database,
        environment: {
          DEPLOYMENT_MODE: "personal",
          OPENAI_API_KEY: "test-only-never-used-for-inference",
        },
      };
      await database.db.insert(user).values({
        id: actorId,
        email: `${actorId}@example.invalid`,
        name: "Today flow test",
        role: "learner",
      });
      await database.db.insert(question).values({
        id: questionId,
        externalId: `today-${questionId}`,
        source: "ORIGINAL_OPEN",
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools provide free meals? Give your opinion.",
      });
      await database.db.insert(trainingCycle).values({
        id: cycleId,
        userId: actorId,
        questionId,
        status: "ANALYZING",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
    });
    afterAll(async () => {
      await database.db.delete(user).where(eq(user.id, actorId));
      await database.db.delete(question).where(eq(question.id, questionId));
      await database.pool.end();
    });
    async function jobs(latest: "RUNNING" | "SUCCEEDED") {
      if (jobIds.length)
        await database.db.delete(aiJob).where(inArray(aiJob.id, jobIds));
      for (const [index, status] of ["FAILED", latest].entries()) {
        const id = newDomainId();
        jobIds.push(id);
        await database.db.insert(aiJob).values({
          id,
          ownerId: actorId,
          taskKind: "ielts_assessment",
          status: status as "FAILED" | "RUNNING" | "SUCCEEDED",
          protectedReference: { cycleId },
          versionSnapshot: { model: "test" },
          idempotencyKey: id,
          createdAt: new Date(`2026-09-01T00:00:0${index}.000Z`),
        });
      }
    }
    it("shows the current running attempt instead of resurrecting its older failure", async () => {
      await jobs("RUNNING");
      const response = await GET(
        new Request("https://coach.test/api/v1/today"),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ai_service: { state: "configured", can_manage: false },
        cycle: { resources: { pending_job: { status: "RUNNING" } } },
      });
    });
    it("clears old failure messages after the latest attempt succeeds", async () => {
      await jobs("SUCCEEDED");
      const response = await GET(
        new Request("https://coach.test/api/v1/today"),
      );
      expect(await response.json()).toMatchObject({
        cycle: { resources: { pending_job: null } },
      });
    });
    it("still follows a requeued old job when a newer historical job already succeeded", async () => {
      await jobs("SUCCEEDED");
      const [older] = await database.db
        .select()
        .from(aiJob)
        .where(eq(aiJob.ownerId, actorId))
        .orderBy(aiJob.createdAt);
      await database.db
        .update(aiJob)
        .set({ status: "RUNNING", updatedAt: new Date() })
        .where(eq(aiJob.id, older!.id));
      const response = await GET(
        new Request("https://coach.test/api/v1/today"),
      );
      expect(await response.json()).toMatchObject({
        cycle: {
          resources: { pending_job: { status: "RUNNING", id: older!.id } },
        },
      });
    });
  },
);
