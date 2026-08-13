import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  aiJob,
  createDatabase,
  evaluation,
  exerciseAttempt,
  exerciseItem,
  learningObjective,
  lessonPlan,
  newDomainId,
  question,
  trainingCycle,
  user,
} from "@iwc/db";

const routeState = vi.hoisted(() => ({
  actor: {
    id: "",
    email: "",
    name: "Lesson recovery route",
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

import { POST as retryExercise } from "../../app/api/v1/exercise-items/[id]/retry/route";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("lesson recovery routes (PostgreSQL)", () => {
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

  it("appends one bounded neutral re-evaluation without replacing the first answer or old evaluation", async () => {
    const suffix = newDomainId();
    const userId = `neutral-retry-${suffix}`;
    const questionId = newDomainId();
    const cycleId = newDomainId();
    const objectiveId = newDomainId();
    const lessonId = newDomainId();
    const itemId = newDomainId();
    const attemptId = newDomainId();
    const responseEventId = newDomainId();
    const initialJobId = newDomainId();
    const initialEvaluationId = newDomainId();
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
      externalId: `neutral-retry-${suffix}`,
      ownerId: userId,
      source: "route_test",
      visibility: "private",
      questionType: "opinion",
      topic: "education",
      prompt: "Should uncertain feedback be re-evaluated once?",
    });
    await database.db.insert(trainingCycle).values({
      id: cycleId,
      userId,
      questionId,
      status: "LESSON_ACTIVE",
      schemaVersion: "1.0.0",
      timezone: "UTC",
      coreSkillId: "collocation_perspective",
    });
    await database.db.insert(learningObjective).values({
      id: objectiveId,
      cycleId,
      skillId: "collocation_perspective",
      role: "CORE",
      sourceEvidenceIds: [newDomainId()],
      priority: 1,
      successCriterion: "Use the target independently.",
    });
    await database.db.insert(lessonPlan).values({
      id: lessonId,
      cycleId,
      coreSkillId: "collocation_perspective",
      schemaVersion: "1.0.0",
      coreMinutes: 45,
      activeOutputRatio: 0.7,
      selectionRatio: 0.1,
      remediationMinutes: 15,
      stages: [],
      runtimeStatus: "ACTIVE",
    });
    await database.db.insert(exerciseItem).values({
      id: itemId,
      lessonPlanId: lessonId,
      learningObjectiveId: objectiveId,
      ordinal: 1,
      itemType: "SENTENCE_GENERATION",
      prompt: { promptEn: "Write one sentence." },
      evaluationContract: {
        path: "CORE",
        canonicalItem: { evidenceOpportunity: "INDEPENDENT_GENERATION" },
      },
      expectedMinutes: 5,
    });
    await database.db.insert(exerciseAttempt).values({
      id: attemptId,
      exerciseItemId: itemId,
      userId,
      firstAttemptEventId: responseEventId,
      finalAttemptEventId: responseEventId,
      contractAttempts: [
        {
          id: responseEventId,
          answer: "The immutable first answer.",
          submittedAt: "2026-08-13T10:00:00.000Z",
          elapsedSeconds: 22,
          hintLevel: "NONE",
          referenceAnswerSeen: false,
        },
      ],
      firstAnswer: "The immutable first answer.",
      finalAnswer: "The immutable first answer.",
    });
    await database.db.insert(aiJob).values({
      id: initialJobId,
      ownerId: userId,
      taskKind: "open_sentence_evaluation",
      status: "SUCCEEDED",
      protectedReference: {
        exerciseAttemptId: attemptId,
        exerciseItemId: itemId,
      },
      versionSnapshot: {
        providerKind: "mock",
        providerConnectionId: "mock",
      },
      idempotencyKey: `initial-neutral:${attemptId}`,
      completedAt: new Date("2026-08-13T10:01:00.000Z"),
    });
    await database.db.insert(evaluation).values({
      id: initialEvaluationId,
      aiJobId: initialJobId,
      exerciseAttemptId: attemptId,
      responseAttemptId: responseEventId,
      passed: false,
      confidence: 0.4,
      feedback: { outcome: "NEUTRAL", firstAttemptPassed: "false" },
      versionSnapshot: { providerKind: "mock" },
      validForEvidence: false,
    });
    const beforeAttempt = await database.db.query.exerciseAttempt.findFirst({
      where: eq(exerciseAttempt.id, attemptId),
    });

    const request = new Request(
      `https://coach.test/api/v1/exercise-items/${itemId}/retry`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `neutral-retry-${suffix}`,
          origin: "https://coach.test",
        },
        body: "{}",
      },
    );
    const context = { params: Promise.resolve({ id: itemId }) };
    const replayRequest = request.clone();
    const first = await retryExercise(request, context);
    const firstBody = (await first.json()) as {
      job_id: string;
      retry_kind: string;
    };
    expect(first.status).toBe(202);
    expect(firstBody.retry_kind).toBe("LOW_CONFIDENCE_REEVALUATION");

    const replay = await retryExercise(replayRequest, context);
    expect(replay.status).toBe(202);
    await expect(replay.json()).resolves.toMatchObject(firstBody);

    const afterAttempt = await database.db.query.exerciseAttempt.findFirst({
      where: eq(exerciseAttempt.id, attemptId),
    });
    const storedEvaluations = await database.db.query.evaluation.findMany({
      where: eq(evaluation.exerciseAttemptId, attemptId),
    });
    const retryJobs = await database.db.query.aiJob.findMany({
      where: eq(aiJob.ownerId, userId),
    });
    expect(afterAttempt?.firstAnswer).toEqual(beforeAttempt?.firstAnswer);
    expect(afterAttempt?.contractAttempts).toEqual(
      beforeAttempt?.contractAttempts,
    );
    expect(
      storedEvaluations.some(
        (candidate) => candidate.id === initialEvaluationId,
      ),
    ).toBe(true);
    expect(retryJobs).toHaveLength(2);
    const retryJob = retryJobs.find(
      (candidate) => candidate.id === firstBody.job_id,
    );
    expect(retryJob).toMatchObject({
      protectedReference: {
        exerciseAttemptId: attemptId,
        exerciseItemId: itemId,
        reevaluationOfEvaluationId: initialEvaluationId,
      },
    });
    expect([
      "WAITING_FOR_CONSENT",
      "QUEUED",
      "LEASED",
      "RUNNING",
      "RETRY_SCHEDULED",
      "AI_BLOCKED",
      "FAILED",
      "SUCCEEDED",
    ]).toContain(retryJob?.status);

    const secondRequest = new Request(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `neutral-retry-second-${suffix}`,
        origin: "https://coach.test",
      },
      body: "{}",
    });
    const bounded = await retryExercise(secondRequest, context);
    expect(bounded.status).toBe(409);
    await expect(bounded.json()).resolves.toMatchObject({
      code: "EXERCISE_REEVALUATION_LIMIT_REACHED",
    });
  });
});
