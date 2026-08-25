import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  auditEvent,
  aiJob,
  createDatabase,
  idempotencyRecord,
  mixedReviewTask,
  newDomainId,
  question,
  questionGenerationBatch,
  questionRecommendation,
  rewriteTask,
  trainingCycle,
  transferTask,
  user,
  writingAttempt,
  writingAttemptRevision,
} from "@iwc/db";
import { QUESTION_BANK } from "@iwc/question-bank";

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
import { POST as createRecommendation } from "../../app/api/v1/question-recommendations/route";
import { GET as getCycle } from "../../app/api/v1/training-cycles/[id]/route";
import { POST as startCycle } from "../../app/api/v1/training-cycles/[id]/start/route";
import { POST as rescheduleTransferRoute } from "../../app/api/v1/transfer-tasks/[id]/reschedule/route";
import { HttpLearningClient } from "./http-service";
import { deleteLearningRecord } from "../server/learning-record";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)(
  "HttpLearningClient → writing-attempt routes (PostgreSQL)",
  () => {
    const database = createDatabase(databaseUrl!);
    const createdUsers: string[] = [];
    const createdPublicQuestionExternalIds: string[] = [];

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

    async function waitForReservation(
      userId: string,
      key: string,
    ): Promise<void> {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const reservation = await database.db.query.idempotencyRecord.findFirst(
          {
            where: (table, operators) =>
              operators.and(
                operators.eq(table.userId, userId),
                operators.eq(table.key, key),
              ),
          },
        );
        if (reservation) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Timed out waiting for idempotency reservation ${key}`);
    }

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
        await database.db
          .delete(auditEvent)
          .where(eq(auditEvent.targetId, userId));
        await database.db.delete(user).where(eq(user.id, userId));
      }
      for (const externalId of createdPublicQuestionExternalIds.splice(0)) {
        await database.db
          .delete(question)
          .where(eq(question.externalId, externalId));
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

    it("serializes concurrent cycle creation so a learner never exceeds eight active essays", async () => {
      const suffix = newDomainId();
      const userId = `http-cycle-limit-${suffix}`;
      const questionIds = Array.from({ length: 9 }, () => newDomainId());
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
      await database.db.insert(trainingCycle).values(
        questionIds.slice(0, 7).map((questionId) => ({
          userId,
          questionId,
          status: "QUESTION_READY" as const,
          schemaVersion: "1.0.0",
          timezone: "UTC",
        })),
      );

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
        createCycle(makeRequest(externalIds[7]!, `cycle-limit-${suffix}-a`)),
        createCycle(makeRequest(externalIds[8]!, `cycle-limit-${suffix}-b`)),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      await expect(
        database.db.query.trainingCycle.findMany({
          where: eq(trainingCycle.userId, userId),
        }),
      ).resolves.toHaveLength(8);
      const conflict = responses.find((response) => response.status === 409)!;
      await expect(conflict.json()).resolves.toMatchObject({
        code: "ACTIVE_CYCLE_LIMIT",
        detail: expect.stringMatching(/eight essays/i),
      });
    });

    it("atomically marks a recommended start STARTED and replays one cycle", async () => {
      const suffix = newDomainId();
      const userId = `cycle-started-${suffix}`;
      const questionId = newDomainId();
      const recommendationId = newDomainId();
      const externalId = `cycle-started-question-${suffix}`;
      const shownAt = new Date("2026-08-25T12:00:00.000Z");
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
        externalId,
        ownerId: userId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach practical decision-making?",
      });
      await database.db.insert(questionRecommendation).values({
        id: recommendationId,
        userId,
        questionExternalId: externalId,
        action: "INITIAL",
        status: "READY",
        shownAt,
      });
      const makeRequest = (key: string, body: Record<string, unknown>) =>
        new Request("https://coach.test/api/v1/training-cycles", {
          body: JSON.stringify({ ...body, timezone: "UTC" }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
            origin: "https://coach.test",
          },
          method: "POST",
        });
      const key = `cycle-started-${suffix}`;
      const body = {
        question_id: externalId,
        recommendation_id: recommendationId,
      };

      const first = await createCycle(makeRequest(key, body));
      const replay = await createCycle(makeRequest(key, body));
      const terminalFallback = await createCycle(
        makeRequest(`cycle-started-fallback-${suffix}`, {
          question_id: externalId,
          abandon_recommendation_id: recommendationId,
        }),
      );
      const firstBody = (await first.json()) as { cycle: { id: string } };
      const replayBody = (await replay.json()) as { cycle: { id: string } };
      const expectedLocation = `/api/v1/training-cycles/${firstBody.cycle.id}`;

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.headers.get("idempotency-replayed")).toBe("true");
      expect(replayBody).toEqual(firstBody);
      expect(first.headers.get("location")).toBe(expectedLocation);
      expect(replay.headers.get("location")).toBe(expectedLocation);
      expect(terminalFallback.status).toBe(409);
      await expect(terminalFallback.json()).resolves.toMatchObject({
        code: "RECOMMENDATION_NOT_ABANDONABLE",
      });
      await expect(
        database.db.query.questionRecommendation.findFirst({
          where: eq(questionRecommendation.id, recommendationId),
        }),
      ).resolves.toMatchObject({
        status: "STARTED",
        questionExternalId: externalId,
        shownAt,
      });
      await expect(
        database.db.query.trainingCycle.findMany({
          where: eq(trainingCycle.userId, userId),
        }),
      ).resolves.toHaveLength(1);
    });

    it("treats abandon_recommendation_id with the exact READY question as STARTED", async () => {
      const suffix = newDomainId();
      const userId = `cycle-fallback-same-question-${suffix}`;
      const questionId = newDomainId();
      const recommendationId = newDomainId();
      const externalId = `cycle-fallback-same-question-${suffix}`;
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
        externalId,
        ownerId: userId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach practical decision-making?",
      });
      await database.db.insert(questionRecommendation).values({
        id: recommendationId,
        userId,
        questionExternalId: externalId,
        action: "INITIAL",
        status: "READY",
        shownAt: new Date(),
      });

      const response = await createCycle(
        new Request("https://coach.test/api/v1/training-cycles", {
          body: JSON.stringify({
            question_id: externalId,
            abandon_recommendation_id: recommendationId,
            timezone: "UTC",
          }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": `cycle-fallback-same-question-${suffix}`,
            origin: "https://coach.test",
          },
          method: "POST",
        }),
      );

      expect(response.status).toBe(201);
      await expect(
        database.db.query.questionRecommendation.findFirst({
          where: eq(questionRecommendation.id, recommendationId),
        }),
      ).resolves.toMatchObject({
        status: "STARTED",
        questionExternalId: externalId,
        shownAt: expect.any(Date),
      });
      await expect(
        database.db.query.trainingCycle.findMany({
          where: eq(trainingCycle.userId, userId),
        }),
      ).resolves.toHaveLength(1);
    });

    it("atomically abandons PENDING with a fallback cycle and replays once", async () => {
      const suffix = newDomainId();
      const userId = `cycle-abandoned-${suffix}`;
      const questionId = newDomainId();
      const recommendationId = newDomainId();
      const externalId = `cycle-abandoned-question-${suffix}`;
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
        externalId,
        ownerId: userId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach practical decision-making?",
      });
      await database.db.insert(questionRecommendation).values({
        id: recommendationId,
        userId,
        action: "INITIAL",
        status: "PENDING",
      });
      const key = `cycle-abandoned-${suffix}`;
      const makeRequest = () =>
        new Request("https://coach.test/api/v1/training-cycles", {
          body: JSON.stringify({
            question_id: externalId,
            abandon_recommendation_id: recommendationId,
            timezone: "UTC",
          }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
            origin: "https://coach.test",
          },
          method: "POST",
        });

      const first = await createCycle(makeRequest());
      const replay = await createCycle(makeRequest());

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.headers.get("idempotency-replayed")).toBe("true");
      await expect(
        database.db.query.questionRecommendation.findFirst({
          where: eq(questionRecommendation.id, recommendationId),
        }),
      ).resolves.toMatchObject({
        status: "ABANDONED",
        questionExternalId: null,
        shownAt: null,
      });
      await expect(
        database.db.query.trainingCycle.findMany({
          where: eq(trainingCycle.userId, userId),
        }),
      ).resolves.toHaveLength(1);
    });

    it.each([
      { initialStatus: "READY" as const, terminalStatus: "STARTED" as const },
      {
        initialStatus: "PENDING" as const,
        terminalStatus: "ABANDONED" as const,
      },
    ])(
      "rolls back cycle, $terminalStatus disposition, and D14 attachment when replay persistence fails",
      async ({ initialStatus, terminalStatus }) => {
        const suffix = newDomainId();
        const userId = `g1-cycle-atomic-${initialStatus.toLowerCase()}-${suffix}`;
        const questionId = newDomainId();
        const sourceQuestionId = newDomainId();
        const sourceCycleId = newDomainId();
        const recommendationId = newDomainId();
        const reviewId = newDomainId();
        const externalId = `g1-cycle-question-${suffix}`;
        const key = `g1-cycle-response-failure-${suffix}`;
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
            id: questionId,
            externalId,
            ownerId: userId,
            source: "private_test",
            visibility: "private",
            questionType: "opinion",
            topic: "education",
            prompt: "Should schools teach practical decision-making?",
          },
          {
            id: sourceQuestionId,
            externalId: `g1-cycle-source-${suffix}`,
            ownerId: userId,
            source: "private_test",
            visibility: "private",
            questionType: "discussion",
            topic: "health",
            prompt: "Should public health campaigns focus on prevention?",
          },
        ]);
        await database.db.insert(trainingCycle).values({
          id: sourceCycleId,
          userId,
          questionId: sourceQuestionId,
          status: "CORE_CYCLE_COMPLETED",
          schemaVersion: "1.0.0",
          timezone: "UTC",
        });
        await database.db.insert(mixedReviewTask).values({
          id: reviewId,
          userId,
          sourceCycleId,
          dueAt: new Date("2026-08-24T00:00:00.000Z"),
          status: "PLANNED",
        });
        await database.db.insert(questionRecommendation).values({
          id: recommendationId,
          userId,
          ...(initialStatus === "READY"
            ? {
                questionExternalId: externalId,
                shownAt: new Date("2026-08-25T12:00:00.000Z"),
              }
            : {}),
          action: "INITIAL",
          status: initialStatus,
        });
        const body = {
          question_id: externalId,
          ...(initialStatus === "READY"
            ? { recommendation_id: recommendationId }
            : { abandon_recommendation_id: recommendationId }),
          timezone: "UTC",
        };
        const makeRequest = () =>
          new Request("https://coach.test/api/v1/training-cycles", {
            body: JSON.stringify(body),
            headers: {
              "content-type": "application/json",
              "idempotency-key": key,
              origin: "https://coach.test",
            },
            method: "POST",
          });
        const dropFailureTrigger = async () => {
          await database.db.execute(
            sql`drop trigger if exists iwc_test_fail_cycle_idempotency_response on idempotency_record`,
          );
          await database.db.execute(
            sql`drop function if exists iwc_test_fail_cycle_idempotency_response()`,
          );
        };

        await dropFailureTrigger();
        await database.db.execute(sql`
          create function iwc_test_fail_cycle_idempotency_response()
          returns trigger
          language plpgsql
          as $$
          begin
            if new.key like 'g1-cycle-response-failure-%'
              and new.response_status = 201 then
              return null;
            end if;
            return new;
          end;
          $$
        `);
        await database.db.execute(sql`
          create trigger iwc_test_fail_cycle_idempotency_response
          before update on idempotency_record
          for each row
          execute function iwc_test_fail_cycle_idempotency_response()
        `);

        try {
          const failed = await createCycle(makeRequest());
          expect(failed.status).toBe(500);
          await expect(
            database.db.query.trainingCycle.findMany({
              where: eq(trainingCycle.userId, userId),
            }),
          ).resolves.toHaveLength(1);
          await expect(
            database.db.query.questionRecommendation.findFirst({
              where: eq(questionRecommendation.id, recommendationId),
            }),
          ).resolves.toMatchObject({ status: initialStatus });
          await expect(
            database.db.query.mixedReviewTask.findFirst({
              where: eq(mixedReviewTask.id, reviewId),
            }),
          ).resolves.toMatchObject({ status: "PLANNED", targetCycleId: null });
        } finally {
          await dropFailureTrigger();
        }

        const retried = await createCycle(makeRequest());
        const replay = await createCycle(makeRequest());
        const retriedBody = (await retried.json()) as {
          cycle: { id: string };
        };
        const replayBody = (await replay.json()) as { cycle: { id: string } };

        expect(retried.status).toBe(201);
        expect(replay.status).toBe(201);
        expect(replay.headers.get("idempotency-replayed")).toBe("true");
        expect(replayBody.cycle.id).toBe(retriedBody.cycle.id);
        await expect(
          database.db.query.trainingCycle.findMany({
            where: eq(trainingCycle.userId, userId),
          }),
        ).resolves.toHaveLength(2);
        await expect(
          database.db.query.questionRecommendation.findFirst({
            where: eq(questionRecommendation.id, recommendationId),
          }),
        ).resolves.toMatchObject({ status: terminalStatus });
        await expect(
          database.db.query.mixedReviewTask.findFirst({
            where: eq(mixedReviewTask.id, reviewId),
          }),
        ).resolves.toMatchObject({
          status: "READY",
          targetCycleId: retriedBody.cycle.id,
        });
      },
    );

    it("rolls back a public cycle when concurrent learning-data deletion removes its reserved key", async () => {
      const suffix = newDomainId();
      const userId = `g1-cycle-delete-race-${suffix}`;
      const cycleKey = `g1-cycle-delete-race-${suffix}`;
      const deletionKey = `g1-learning-delete-${suffix}`;
      const publicQuestionId = QUESTION_BANK[0]!.id;
      const existingPublicQuestion = await database.db.query.question.findFirst(
        {
          where: eq(question.externalId, publicQuestionId),
        },
      );
      if (!existingPublicQuestion)
        createdPublicQuestionExternalIds.push(publicQuestionId);
      createdUsers.push(userId);
      routeState.actor.id = userId;
      routeState.actor.email = `${suffix}@example.test`;
      await database.db.insert(user).values({
        id: userId,
        name: routeState.actor.name,
        email: routeState.actor.email,
        role: "learner",
      });
      const makeRequest = () =>
        new Request("https://coach.test/api/v1/training-cycles", {
          body: JSON.stringify({
            question_id: publicQuestionId,
            timezone: "UTC",
          }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": cycleKey,
            origin: "https://coach.test",
          },
          method: "POST",
        });
      let releaseCycleTransaction!: () => void;
      const cycleTransactionRelease = new Promise<void>((resolve) => {
        releaseCycleTransaction = resolve;
      });
      let cycleTransactionReached!: () => void;
      const cycleTransactionReady = new Promise<void>((resolve) => {
        cycleTransactionReached = resolve;
      });
      const originalContext = routeState.context as {
        db: typeof database.db;
        [key: string]: unknown;
      };
      const routeDatabase = new Proxy(database.db, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          if (property === "transaction" && typeof value === "function") {
            return async (...args: unknown[]) => {
              cycleTransactionReached();
              await cycleTransactionRelease;
              return Reflect.apply(value, target, args);
            };
          }
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      routeState.context = { ...originalContext, db: routeDatabase };
      try {
        const firstAttempt = createCycle(makeRequest());
        await cycleTransactionReady;
        await waitForReservation(userId, cycleKey);
        await deleteLearningRecord(database.db, userId, deletionKey);
        await expect(
          database.db.query.idempotencyRecord.findFirst({
            where: eq(idempotencyRecord.key, cycleKey),
          }),
        ).resolves.toBeUndefined();
        releaseCycleTransaction();
        const failed = await firstAttempt;

        expect(failed.status).toBe(500);
        await expect(
          database.db.query.trainingCycle.findMany({
            where: eq(trainingCycle.userId, userId),
          }),
        ).resolves.toHaveLength(0);
        await expect(
          database.db.query.idempotencyRecord.findFirst({
            where: eq(idempotencyRecord.key, cycleKey),
          }),
        ).resolves.toBeUndefined();

        const retried = await createCycle(makeRequest());
        const replay = await createCycle(makeRequest());
        const retriedBody = (await retried.json()) as {
          cycle: { id: string };
        };
        const replayBody = (await replay.json()) as { cycle: { id: string } };

        expect(retried.status).toBe(201);
        expect(replay.status).toBe(201);
        expect(replayBody).toEqual(retriedBody);
        expect(replay.headers.get("location")).toBe(
          `/api/v1/training-cycles/${retriedBody.cycle.id}`,
        );
        await expect(
          database.db.query.trainingCycle.findMany({
            where: eq(trainingCycle.userId, userId),
          }),
        ).resolves.toHaveLength(1);
      } finally {
        releaseCycleTransaction();
        routeState.context = originalContext;
      }
    });

    it("rejects conflicting disposition ids and another learner's fallback recommendation", async () => {
      const suffix = newDomainId();
      const actorId = `cycle-disposition-actor-${suffix}`;
      const ownerId = `cycle-disposition-owner-${suffix}`;
      const questionId = newDomainId();
      const recommendationId = newDomainId();
      const externalId = `cycle-disposition-manual-${suffix}`;
      createdUsers.push(actorId, ownerId);
      routeState.actor.id = actorId;
      routeState.actor.email = `${actorId}@example.test`;
      await database.db.insert(user).values([
        {
          id: actorId,
          name: routeState.actor.name,
          email: routeState.actor.email,
          role: "learner",
        },
        {
          id: ownerId,
          name: "Recommendation owner",
          email: `${ownerId}@example.test`,
          role: "learner",
        },
      ]);
      await database.db.insert(question).values({
        id: questionId,
        externalId,
        ownerId: actorId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach practical decision-making?",
      });
      await database.db.insert(questionRecommendation).values({
        id: recommendationId,
        userId: ownerId,
        questionExternalId: externalId,
        action: "INITIAL",
        status: "READY",
        shownAt: new Date(),
      });
      const makeRequest = (key: string, body: Record<string, unknown>) =>
        new Request("https://coach.test/api/v1/training-cycles", {
          body: JSON.stringify({ ...body, timezone: "UTC" }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
            origin: "https://coach.test",
          },
          method: "POST",
        });

      const conflicting = await createCycle(
        makeRequest(`cycle-disposition-conflict-${suffix}`, {
          question_id: externalId,
          recommendation_id: recommendationId,
          abandon_recommendation_id: recommendationId,
        }),
      );
      const otherOwned = await createCycle(
        makeRequest(`cycle-disposition-other-${suffix}`, {
          question_id: externalId,
          abandon_recommendation_id: recommendationId,
        }),
      );

      expect(conflicting.status).toBe(422);
      expect(otherOwned.status).toBe(404);
      await expect(
        database.db.query.trainingCycle.findMany({
          where: eq(trainingCycle.userId, actorId),
        }),
      ).resolves.toHaveLength(0);
    });

    it("rejects concurrent and replayed recommendations at the active-cycle limit without side effects", async () => {
      const suffix = newDomainId();
      const userId = `http-recommend-limit-${suffix}`;
      const questionId = newDomainId();
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
        externalId: `recommend-limit-${suffix}`,
        ownerId: userId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach practical decision-making?",
      });
      await database.db.insert(trainingCycle).values(
        Array.from({ length: 8 }, () => ({
          userId,
          questionId,
          status: "QUESTION_READY" as const,
          schemaVersion: "1.0.0",
          timezone: "UTC",
        })),
      );

      const makeRequest = (key: string) =>
        new Request("https://coach.test/api/v1/question-recommendations", {
          body: JSON.stringify({ action: "INITIAL" }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
            origin: "https://coach.test",
          },
          method: "POST",
        });
      const firstKey = `recommend-limit-${suffix}-a`;
      const responses = await Promise.all([
        createRecommendation(makeRequest(firstKey)),
        createRecommendation(makeRequest(`recommend-limit-${suffix}-b`)),
      ]);
      const replay = await createRecommendation(makeRequest(firstKey));

      expect(responses.map((response) => response.status)).toEqual([409, 409]);
      for (const response of [...responses, replay]) {
        await expect(response.clone().json()).resolves.toMatchObject({
          code: "ACTIVE_CYCLE_LIMIT",
          status: 409,
        });
      }
      expect(replay.status).toBe(409);
      expect(replay.headers.get("idempotency-replayed")).toBe("true");
      await expect(
        database.db.query.questionRecommendation.findMany({
          where: eq(questionRecommendation.userId, userId),
        }),
      ).resolves.toHaveLength(0);
      await expect(
        database.db.query.questionGenerationBatch.findMany({
          where: eq(questionGenerationBatch.triggeredByUserId, userId),
        }),
      ).resolves.toHaveLength(0);
      await expect(
        database.db.query.aiJob.findMany({ where: eq(aiJob.ownerId, userId) }),
      ).resolves.toHaveLength(0);
      await expect(
        database.db.query.trainingCycle.findMany({
          where: eq(trainingCycle.userId, userId),
        }),
      ).resolves.toHaveLength(8);
      await expect(
        database.db.query.writingAttempt.findMany({
          where: eq(writingAttempt.userId, userId),
        }),
      ).resolves.toHaveLength(0);
      await expect(
        database.db
          .select({ id: writingAttemptRevision.id })
          .from(writingAttemptRevision)
          .innerJoin(
            writingAttempt,
            eq(writingAttemptRevision.attemptId, writingAttempt.id),
          )
          .where(eq(writingAttempt.userId, userId)),
      ).resolves.toHaveLength(0);
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
