import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  aiJob,
  createDatabase,
  idempotencyRecord,
  newDomainId,
  question,
  rewriteTask,
  trainingCycle,
  transferTask,
  user,
  writingAttempt,
  writingAttemptRevision,
} from "@iwc/db";

const routeState = vi.hoisted(() => ({
  actor: {
    id: "",
    email: "",
    name: "HTTP route contract",
    role: "learner" as const,
  },
  context: null as unknown,
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => routeState.context,
}));

vi.mock("@/lib/server/session", () => ({
  requireSession: async () => routeState.actor,
}));

import {
  GET as getAttempt,
  PATCH as patchAttempt,
} from "../../app/api/v1/writing-attempts/[id]/route";
import { POST as submitAttemptRoute } from "../../app/api/v1/writing-attempts/[id]/submit/route";
import { POST as rescheduleRewriteRoute } from "../../app/api/v1/rewrite-tasks/[id]/reschedule/route";
import { GET as getToday } from "../../app/api/v1/today/route";
import { POST as createCycle } from "../../app/api/v1/training-cycles/route";
import { GET as getCycle } from "../../app/api/v1/training-cycles/[id]/route";
import { POST as startCycle } from "../../app/api/v1/training-cycles/[id]/start/route";
import { POST as rescheduleTransferRoute } from "../../app/api/v1/transfer-tasks/[id]/reschedule/route";
import { HttpLearningClient } from "./http-service";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)(
  "HttpLearningClient → writing-attempt routes (PostgreSQL)",
  () => {
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
      auth: undefined,
      mail: undefined,
    };

    afterEach(async () => {
      for (const userId of createdUsers.splice(0)) {
        const jobs = await database.db.query.aiJob.findMany({
          where: eq(aiJob.ownerId, userId),
        });
        for (const job of jobs) {
          if (job.graphileJobKey) {
            await database.db.execute(
              sql`select graphile_worker.remove_job(${job.graphileJobKey})`,
            );
          }
        }
        await database.db.delete(user).where(eq(user.id, userId));
      }
    });

    afterAll(async () => {
      await database.pool.end();
    });

    it("saves with If-Match, submits an exact empty body, and enqueues once", async () => {
      const suffix = newDomainId();
      const userId = `http-contract-${suffix}`;
      const questionId = newDomainId();
      const cycleId = newDomainId();
      const attemptId = newDomainId();
      const draft =
        "Schools should teach practical skills because learners need sound decisions.";
      createdUsers.push(userId);
      routeState.actor.id = userId;
      routeState.actor.email = `${suffix}@example.test`;

      await database.db.insert(user).values({
        id: userId,
        name: routeState.actor.name,
        email: routeState.actor.email,
        role: "learner",
      });
      await database.db.insert(question).values({
        id: questionId,
        externalId: `http-contract-${suffix}`,
        ownerId: userId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach practical decision-making?",
      });
      await database.db.insert(trainingCycle).values({
        id: cycleId,
        userId,
        questionId,
        status: "ATTEMPT_1_ACTIVE",
        schemaVersion: "1.0.0",
        timezone: "UTC",
        startedAt: new Date(),
      });
      await database.db.insert(writingAttempt).values({
        id: attemptId,
        cycleId,
        userId,
        kind: "version_1",
        revision: 1,
        content: "",
        wordCount: 0,
      });
      await database.db.insert(writingAttemptRevision).values({
        attemptId,
        revision: 1,
        content: "",
        wordCount: 0,
        branch: "canonical",
      });

      const observedSubmitBodies: unknown[] = [];
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        const pathname = new URL(url).pathname;
        const attemptPath = `/api/v1/writing-attempts/${attemptId}`;
        const request = new Request(url, init);
        const context = { params: Promise.resolve({ id: attemptId }) };
        if (pathname === attemptPath && request.method === "GET") {
          return getAttempt(request, context);
        }
        if (pathname === attemptPath && request.method === "PATCH") {
          return patchAttempt(request, context);
        }
        if (pathname === `${attemptPath}/submit` && request.method === "POST") {
          observedSubmitBodies.push(await request.clone().json());
          return submitAttemptRoute(request, context);
        }
        if (pathname.startsWith("/api/v1/ai-jobs/")) {
          return Response.json({ job: { status: "SUCCEEDED" } });
        }
        throw new Error(`Unexpected request: ${request.method} ${pathname}`);
      });
      let idempotencySequence = 0;
      const client = new HttpLearningClient({
        baseUrl: "https://coach.test/api/v1",
        fetch: fetcher,
        idempotencyKey: () =>
          `http-contract-${suffix}-${(idempotencySequence += 1)}`,
        origin: "https://coach.test",
        pollIntervalMs: 0,
        sleep: async () => undefined,
      });

      await client.submitAttempt(attemptId, draft);

      expect(observedSubmitBodies).toEqual([{}]);
      await expect(
        database.db.query.writingAttempt.findFirst({
          where: eq(writingAttempt.id, attemptId),
        }),
      ).resolves.toMatchObject({
        content: draft,
        revision: 2,
        wordCount: 10,
      });
      const storedAttempt = await database.db.query.writingAttempt.findFirst({
        where: eq(writingAttempt.id, attemptId),
      });
      expect(storedAttempt?.lockedAt).toBeInstanceOf(Date);
      await expect(
        database.db.query.trainingCycle.findFirst({
          where: eq(trainingCycle.id, cycleId),
        }),
      ).resolves.toMatchObject({ status: "ANALYZING" });
      await expect(
        database.db.query.aiJob.findMany({
          where: eq(aiJob.ownerId, userId),
        }),
      ).resolves.toHaveLength(1);
      await expect(
        database.db.query.idempotencyRecord.findMany({
          where: eq(idempotencyRecord.userId, userId),
        }),
      ).resolves.toHaveLength(2);
    });

    it("serializes concurrent cycle creation so a learner never exceeds two active cycles", async () => {
      const suffix = newDomainId();
      const userId = `http-cycle-limit-${suffix}`;
      const questionIds = [newDomainId(), newDomainId(), newDomainId()];
      const externalIds = questionIds.map(
        (_id, index) => `cycle-limit-${suffix}-${index}`,
      );
      createdUsers.push(userId);
      routeState.actor.id = userId;
      routeState.actor.email = `${suffix}@example.test`;

      await database.db.insert(user).values({
        id: userId,
        name: routeState.actor.name,
        email: routeState.actor.email,
        role: "learner",
      });
      await database.db.insert(question).values(
        questionIds.map((id, index) => ({
          id,
          externalId: externalIds[index]!,
          ownerId: userId,
          source: "private_test",
          visibility: "private" as const,
          questionType: "opinion" as const,
          topic: "education" as const,
          prompt: `Concurrent cycle question ${index + 1}?`,
        })),
      );
      await database.db.insert(trainingCycle).values({
        userId,
        questionId: questionIds[0]!,
        status: "QUESTION_READY",
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });

      const makeRequest = (questionId: string, key: string) =>
        new Request("https://coach.test/api/v1/training-cycles", {
          body: JSON.stringify({ question_id: questionId, timezone: "UTC" }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
            origin: "https://coach.test",
          },
          method: "POST",
        });
      const responses = await Promise.all([
        createCycle(makeRequest(externalIds[1]!, `cycle-limit-${suffix}-a`)),
        createCycle(makeRequest(externalIds[2]!, `cycle-limit-${suffix}-b`)),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      await expect(
        database.db.query.trainingCycle.findMany({
          where: eq(trainingCycle.userId, userId),
        }),
      ).resolves.toHaveLength(2);
      const conflict = responses.find((response) => response.status === 409)!;
      await expect(conflict.json()).resolves.toMatchObject({
        code: "ACTIVE_CYCLE_LIMIT",
      });
    });

    it("opens the explicitly requested cycle even when Today prioritizes another active cycle", async () => {
      const suffix = newDomainId();
      const userId = `http-identity-${suffix}`;
      const firstQuestionId = newDomainId();
      const secondQuestionId = newDomainId();
      const firstCycleId = newDomainId();
      const secondCycleId = newDomainId();
      const firstAttemptId = newDomainId();
      createdUsers.push(userId);
      routeState.actor.id = userId;
      routeState.actor.email = `${suffix}@example.test`;

      await database.db.insert(user).values({
        id: userId,
        name: routeState.actor.name,
        email: routeState.actor.email,
        role: "learner",
      });
      await database.db.insert(question).values([
        {
          id: firstQuestionId,
          externalId: `identity-first-${suffix}`,
          ownerId: userId,
          source: "private_test",
          visibility: "private",
          questionType: "opinion",
          topic: "education",
          prompt: "Should schools teach practical decision-making?",
        },
        {
          id: secondQuestionId,
          externalId: `identity-second-${suffix}`,
          ownerId: userId,
          source: "private_test",
          visibility: "private",
          questionType: "discussion",
          topic: "technology",
          prompt: "Should schools replace printed books with digital devices?",
        },
      ]);
      await database.db.insert(trainingCycle).values([
        {
          id: firstCycleId,
          userId,
          questionId: firstQuestionId,
          status: "ATTEMPT_1_ACTIVE",
          schemaVersion: "1.0.0",
          timezone: "UTC",
          startedAt: new Date(),
        },
        {
          id: secondCycleId,
          userId,
          questionId: secondQuestionId,
          status: "QUESTION_READY",
          schemaVersion: "1.0.0",
          timezone: "UTC",
        },
      ]);
      await database.db.insert(writingAttempt).values({
        id: firstAttemptId,
        cycleId: firstCycleId,
        userId,
        kind: "version_1",
        revision: 1,
        content: "The already active first cycle must remain separate.",
        wordCount: 8,
      });
      await database.db.insert(writingAttemptRevision).values({
        attemptId: firstAttemptId,
        revision: 1,
        content: "The already active first cycle must remain separate.",
        wordCount: 8,
        branch: "canonical",
      });

      const fetchedPaths: string[] = [];
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        const pathname = new URL(url).pathname;
        fetchedPaths.push(pathname);
        const request = new Request(url, init);
        if (pathname === "/api/v1/today") return getToday(request);
        if (pathname === "/api/v1/providers")
          return Response.json({ providers: [] });
        for (const cycleId of [firstCycleId, secondCycleId]) {
          const cyclePath = `/api/v1/training-cycles/${cycleId}`;
          const context = { params: Promise.resolve({ id: cycleId }) };
          if (pathname === cyclePath && request.method === "GET")
            return getCycle(request, context);
          if (pathname === `${cyclePath}/start` && request.method === "POST")
            return startCycle(request, context);
        }
        throw new Error(`Unexpected request: ${request.method} ${pathname}`);
      });
      let idempotencySequence = 0;
      const client = new HttpLearningClient({
        baseUrl: "https://coach.test/api/v1",
        fetch: fetcher,
        idempotencyKey: () =>
          `http-identity-${suffix}-${(idempotencySequence += 1)}`,
        origin: "https://coach.test",
      });

      const today = await client.getToday();
      expect(today.nextTask.href).toBe(`/write?cycle=${firstCycleId}`);
      const todayCallsBeforeExplicitOpen = fetchedPaths.filter(
        (path) => path === "/api/v1/today",
      ).length;

      const opened = await client.getAttempt(1, secondCycleId);

      expect(opened).toMatchObject({
        cycleId: secondCycleId,
        draft: "",
        version: 1,
      });
      expect(opened.prompt.question).toContain(
        "replace printed books with digital devices",
      );
      expect(
        fetchedPaths.filter((path) => path === "/api/v1/today"),
      ).toHaveLength(todayCallsBeforeExplicitOpen);
      await expect(
        database.db.query.trainingCycle.findFirst({
          where: eq(trainingCycle.id, firstCycleId),
        }),
      ).resolves.toMatchObject({ status: "ATTEMPT_1_ACTIVE" });
      await expect(
        database.db.query.trainingCycle.findFirst({
          where: eq(trainingCycle.id, secondCycleId),
        }),
      ).resolves.toMatchObject({ status: "ATTEMPT_1_ACTIVE" });
      await expect(
        database.db.query.writingAttempt.findFirst({
          where: eq(writingAttempt.cycleId, secondCycleId),
        }),
      ).resolves.toMatchObject({ kind: "version_1", content: "" });
    });

    it("reschedules expired rewrite and transfer windows through the real client and routes", async () => {
      const suffix = newDomainId();
      const userId = `http-reschedule-${suffix}`;
      const rewriteQuestionId = newDomainId();
      const transferQuestionId = newDomainId();
      const rewriteCycleId = newDomainId();
      const transferCycleId = newDomainId();
      const rewriteTaskId = newDomainId();
      const transferTaskId = newDomainId();
      createdUsers.push(userId);
      routeState.actor.id = userId;
      routeState.actor.email = `${suffix}@example.test`;

      await database.db.insert(user).values({
        id: userId,
        name: routeState.actor.name,
        email: routeState.actor.email,
        role: "learner",
      });
      await database.db.insert(question).values([
        {
          id: rewriteQuestionId,
          externalId: `reschedule-rewrite-${suffix}`,
          ownerId: userId,
          source: "private_test",
          visibility: "private",
          questionType: "opinion",
          topic: "education",
          prompt: "Should a missed rewrite window be rescheduled?",
        },
        {
          id: transferQuestionId,
          externalId: `reschedule-transfer-${suffix}`,
          ownerId: userId,
          source: "private_test",
          visibility: "private",
          questionType: "discussion",
          topic: "technology",
          prompt: "Should a missed transfer window be rescheduled?",
        },
      ]);
      await database.db.insert(trainingCycle).values([
        {
          id: rewriteCycleId,
          userId,
          questionId: rewriteQuestionId,
          status: "REWRITE_READY",
          schemaVersion: "1.0.0",
          timezone: "UTC",
        },
        {
          id: transferCycleId,
          userId,
          questionId: transferQuestionId,
          status: "CORE_CYCLE_COMPLETED",
          schemaVersion: "1.0.0",
          timezone: "UTC",
          coreSkillId: "collocation_perspective",
          completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000),
        },
      ]);
      const expiredAt = new Date(Date.now() - 60 * 60 * 1_000);
      const availableAt = new Date(Date.now() - 25 * 60 * 60 * 1_000);
      await database.db.insert(rewriteTask).values({
        id: rewriteTaskId,
        cycleId: rewriteCycleId,
        userId,
        status: "READY",
        availableAt,
        expiresAt: expiredAt,
        abstractChecklist: ["Check the task."],
      });
      await database.db.insert(transferTask).values({
        id: transferTaskId,
        sourceCycleId: transferCycleId,
        userId,
        questionId: rewriteQuestionId,
        skillId: "collocation_perspective",
        status: "READY",
        availableAt,
        expiresAt: expiredAt,
      });

      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        const pathname = new URL(url).pathname;
        const request = new Request(url, init);
        if (pathname === `/api/v1/rewrite-tasks/${rewriteTaskId}/reschedule`) {
          return rescheduleRewriteRoute(request, {
            params: Promise.resolve({ id: rewriteTaskId }),
          });
        }
        if (
          pathname === `/api/v1/transfer-tasks/${transferTaskId}/reschedule`
        ) {
          return rescheduleTransferRoute(request, {
            params: Promise.resolve({ id: transferTaskId }),
          });
        }
        throw new Error(`Unexpected request: ${request.method} ${pathname}`);
      });
      let idempotencySequence = 0;
      const client = new HttpLearningClient({
        baseUrl: "https://coach.test/api/v1",
        fetch: fetcher,
        idempotencyKey: () =>
          `http-reschedule-${suffix}-${(idempotencySequence += 1)}`,
        origin: "https://coach.test",
      });

      await client.rescheduleRewrite(rewriteTaskId);
      await client.rescheduleTransfer(transferTaskId);

      await expect(
        database.db.query.rewriteTask.findFirst({
          where: eq(rewriteTask.id, rewriteTaskId),
        }),
      ).resolves.toMatchObject({
        status: "RESCHEDULED",
        contractDueAt: availableAt,
      });
      await expect(
        database.db.query.trainingCycle.findFirst({
          where: eq(trainingCycle.id, rewriteCycleId),
        }),
      ).resolves.toMatchObject({ status: "REWRITE_LOCKED" });
      await expect(
        database.db.query.transferTask.findFirst({
          where: eq(transferTask.id, transferTaskId),
        }),
      ).resolves.toMatchObject({
        status: "RESCHEDULED",
        contractDueAt: availableAt,
      });
    });
  },
);
