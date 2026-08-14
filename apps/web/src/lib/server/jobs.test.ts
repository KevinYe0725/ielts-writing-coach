import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  aiJob,
  createDatabase,
  evaluation,
  exerciseAttempt,
  exerciseItem,
  instanceConfiguration,
  learningObjective,
  lessonPlan,
  modelRoute,
  newDomainId,
  providerConnection,
  question,
  trainingCycle,
  user,
} from "@iwc/db";

import {
  enqueueAIJob,
  recoverFailedFocusedGeneration,
  requeueFailedAIJob,
  resolveAIJobRoute,
  resumeBlockedAIJobsForProvider,
  resumeWaitingAIJobsForRoutes,
  unconfiguredJobDecision,
} from "./jobs";

const integration = process.env.DATABASE_URL
  ? describe.sequential
  : describe.skip;

describe("AI job routing without an explicit model route", () => {
  it("waits for consent and never silently selects Mock", () => {
    expect(unconfiguredJobDecision({})).toEqual({
      status: "WAITING_FOR_CONSENT",
      providerKind: "unconfigured",
      providerConnectionId: "unconfigured",
      model: "unconfigured",
    });
  });

  it("uses the explicit server-side OpenAI environment connection", () => {
    expect(
      unconfiguredJobDecision({
        environmentApiKey: "test-only-value",
        environmentModel: "gpt-test",
      }),
    ).toEqual({
      status: "QUEUED",
      providerKind: "openai",
      providerConnectionId: "environment-openai",
      model: "gpt-test",
    });
  });
});

integration("single-item AI job retry", () => {
  const database = createDatabase(process.env.DATABASE_URL!);
  const suffix = newDomainId();
  const userId = `item-retry-${suffix}`;
  const jobId = newDomainId();
  const priorEvaluationJobId = newDomainId();
  const questionId = newDomainId();
  const cycleId = newDomainId();
  const objectiveId = newDomainId();
  const lessonId = newDomainId();
  const itemId = newDomainId();
  const attemptId = newDomainId();
  const firstEventId = newDomainId();
  const oldKey = `ai-job:${jobId}`;
  const retryKey = `ai-job:${jobId}:manual:1`;

  beforeAll(async () => {
    await database.db.insert(user).values({
      id: userId,
      name: "Item retry test",
      email: `${userId}@example.test`,
      role: "learner",
    });
    await database.db.insert(question).values({
      id: questionId,
      externalId: `item-retry-${suffix}`,
      ownerId: userId,
      source: "retry_test",
      visibility: "private",
      questionType: "opinion",
      topic: "education",
      prompt: "Should a failed evaluation preserve its original answer?",
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
      firstAttemptEventId: firstEventId,
      finalAttemptEventId: firstEventId,
      contractAttempts: [
        {
          id: firstEventId,
          answer: "The immutable first answer.",
          submittedAt: "2026-08-13T10:00:00.000Z",
          elapsedSeconds: 20,
          hintLevel: "NONE",
          referenceAnswerSeen: false,
        },
      ],
      firstAnswer: "The immutable first answer.",
      finalAnswer: "The immutable first answer.",
    });
    await database.db.insert(aiJob).values({
      id: priorEvaluationJobId,
      ownerId: userId,
      taskKind: "open_sentence_evaluation",
      status: "SUCCEEDED",
      protectedReference: {
        exerciseAttemptId: attemptId,
        exerciseItemId: itemId,
      },
      versionSnapshot: { providerKind: "mock", providerConnectionId: "mock" },
      idempotencyKey: `prior-evaluation:${attemptId}`,
      completedAt: new Date("2026-08-13T10:01:00.000Z"),
    });
    await database.db.insert(evaluation).values({
      aiJobId: priorEvaluationJobId,
      exerciseAttemptId: attemptId,
      responseAttemptId: firstEventId,
      passed: false,
      confidence: 0.9,
      feedback: { outcome: "FAIL", firstAttemptPassed: "false" },
      versionSnapshot: { providerKind: "mock" },
    });
    await database.db.insert(aiJob).values({
      id: jobId,
      ownerId: userId,
      taskKind: "open_sentence_evaluation",
      status: "FAILED",
      protectedReference: {
        exerciseAttemptId: attemptId,
        exerciseItemId: itemId,
      },
      versionSnapshot: {
        providerKind: "mock",
        providerConnectionId: "mock",
      },
      idempotencyKey: `evaluation:${jobId}`,
      graphileJobKey: oldKey,
      attemptCount: 5,
      lastErrorCode: "UPSTREAM",
      lastErrorSafeMessage: "The one item could not be evaluated.",
    });
  });

  afterAll(async () => {
    await database.db.execute(
      sql`select graphile_worker.remove_job(${retryKey})`,
    );
    await database.db.delete(user).where(eq(user.id, userId));
    await database.pool.end();
  });

  it("requeues the same frozen item job without changing its protected answer reference", async () => {
    const beforeAttempt = await database.db.query.exerciseAttempt.findFirst({
      where: eq(exerciseAttempt.id, attemptId),
    });
    const beforeEvaluations = await database.db.query.evaluation.findMany({
      where: eq(evaluation.exerciseAttemptId, attemptId),
    });
    const result = await database.db.transaction(async (transaction) => {
      const job = await transaction.query.aiJob.findFirst({
        where: eq(aiJob.id, jobId),
      });
      expect(job).toBeDefined();
      return requeueFailedAIJob(transaction, job!);
    });
    const stored = await database.db.query.aiJob.findFirst({
      where: eq(aiJob.id, jobId),
    });
    expect(result).toMatchObject({ id: jobId, status: "QUEUED" });
    expect(stored).toMatchObject({
      id: jobId,
      status: "QUEUED",
      idempotencyKey: `evaluation:${jobId}`,
      graphileJobKey: retryKey,
      attemptCount: 5,
      protectedReference: {
        exerciseAttemptId: expect.any(String),
        exerciseItemId: expect.any(String),
      },
      versionSnapshot: { manualRetryCount: "1" },
    });
    const afterAttempt = await database.db.query.exerciseAttempt.findFirst({
      where: eq(exerciseAttempt.id, attemptId),
    });
    const afterEvaluations = await database.db.query.evaluation.findMany({
      where: eq(evaluation.exerciseAttemptId, attemptId),
    });
    expect(afterAttempt?.firstAnswer).toEqual(beforeAttempt?.firstAnswer);
    expect(afterAttempt?.contractAttempts).toEqual(
      beforeAttempt?.contractAttempts,
    );
    expect(afterEvaluations).toEqual(beforeEvaluations);
  });
});

integration("focused-generation recovery", () => {
  const database = createDatabase(process.env.DATABASE_URL!);
  const suffix = newDomainId();
  const userId = `focused-recovery-${suffix}`;
  const providerId = newDomainId();
  const routeId = newDomainId();
  const failedJobId = newDomainId();

  beforeAll(async () => {
    await database.db.insert(user).values({
      id: userId,
      name: "Focused recovery test",
      email: `${userId}@example.test`,
      role: "owner",
    });
    await database.db.insert(providerConnection).values({
      id: providerId,
      ownerId: userId,
      name: "Focused recovery mock",
      kind: "mock",
      secretMode: "encrypted",
    });
    await database.db.insert(modelRoute).values({
      id: routeId,
      ownerId: userId,
      taskKind: "exercise_generation",
      providerConnectionId: providerId,
      model: "mock-deterministic-v1",
      routeVersion: 3,
    });
    await database.db.insert(aiJob).values({
      id: failedJobId,
      ownerId: userId,
      taskKind: "exercise_generation",
      status: "FAILED",
      protectedReference: {
        attemptId: newDomainId(),
        assessmentId: newDomainId(),
        cycleId: newDomainId(),
        skillId: "collocation_perspective",
      },
      versionSnapshot: {
        model: "obsolete-model",
        providerKind: "compatible",
        providerConnectionId: "obsolete-provider",
        manualRetryCount: "2",
      },
      idempotencyKey: `focused-failed:${suffix}`,
      graphileJobKey: `ai-job:${failedJobId}:manual:2`,
      attemptCount: 5,
      lastErrorCode: "INVALID_RESPONSE",
      lastErrorSafeMessage: "The practice material could not be prepared.",
    });
  });

  afterAll(async () => {
    const jobs = await database.db.query.aiJob.findMany({
      columns: { graphileJobKey: true },
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
    await database.pool.end();
  });

  it("creates one fresh recovery job without mutating an exhausted failed job", async () => {
    const first = await database.db.transaction(async (transaction) => {
      const [failed] = await transaction
        .select()
        .from(aiJob)
        .where(eq(aiJob.id, failedJobId))
        .for("update");
      return recoverFailedFocusedGeneration(transaction, failed!);
    });
    const second = await database.db.transaction(async (transaction) => {
      const [failed] = await transaction
        .select()
        .from(aiJob)
        .where(eq(aiJob.id, failedJobId))
        .for("update");
      return recoverFailedFocusedGeneration(transaction, failed!);
    });

    const failed = await database.db.query.aiJob.findFirst({
      where: eq(aiJob.id, failedJobId),
    });
    const recovery = await database.db.query.aiJob.findFirst({
      where: eq(aiJob.id, first.id),
    });
    const jobs = await database.db.query.aiJob.findMany({
      where: eq(aiJob.ownerId, userId),
    });

    expect(first).toMatchObject({ status: "QUEUED" });
    expect(first.id).not.toBe(failedJobId);
    expect(second).toEqual(first);
    expect(jobs).toHaveLength(2);
    expect(failed).toMatchObject({
      status: "FAILED",
      versionSnapshot: { manualRetryCount: "2" },
      lastErrorCode: "INVALID_RESPONSE",
    });
    expect(recovery).toMatchObject({
      ownerId: userId,
      taskKind: "exercise_generation",
      status: "QUEUED",
      providerConnectionId: providerId,
      modelRouteId: routeId,
      protectedReference: {
        recoveryOfJobId: failedJobId,
        recoveryOrdinal: "1",
        skillId: "collocation_perspective",
      },
      versionSnapshot: {
        model: "mock-deterministic-v1",
        providerKind: "mock",
      },
    });
  });
});

integration("AI job repair integration", () => {
  const database = createDatabase(process.env.DATABASE_URL!);
  const userId = `job-test-${newDomainId()}`;
  const providerId = newDomainId();
  const routeId = newDomainId();
  const jobId = newDomainId();
  const graphileJobKey = `ai-job:${jobId}`;

  beforeAll(async () => {
    await database.db.insert(user).values({
      id: userId,
      name: "Job test",
      email: `${userId}@example.test`,
      role: "owner",
    });
    await database.db.insert(providerConnection).values({
      id: providerId,
      ownerId: userId,
      name: "Explicit mock test route",
      kind: "mock",
      secretMode: "encrypted",
    });
    await database.db.insert(modelRoute).values({
      id: routeId,
      ownerId: userId,
      taskKind: "ielts_assessment",
      providerConnectionId: providerId,
      model: "mock-deterministic-v1",
    });
    await database.db.insert(aiJob).values({
      id: jobId,
      ownerId: userId,
      taskKind: "ielts_assessment",
      status: "WAITING_FOR_CONSENT",
      protectedReference: { attemptId: newDomainId() },
      versionSnapshot: {
        providerKind: "unconfigured",
        providerConnectionId: "unconfigured",
      },
      idempotencyKey: `assessment:${jobId}`,
      graphileJobKey,
    });
  });

  afterAll(async () => {
    await database.db.execute(
      sql`select graphile_worker.remove_job(${graphileJobKey})`,
    );
    await database.db.delete(user).where(eq(user.id, userId));
    await database.pool.end();
  });

  it("resumes the same durable job once without creating a duplicate", async () => {
    const binding = {
      taskKind: "ielts_assessment" as const,
      routeId,
      providerConnectionId: providerId,
      providerKind: "mock" as const,
      model: "mock-deterministic-v1",
      routeVersion: 1,
      fallbackEnabled: false,
    };
    const first = await database.db.transaction((transaction) =>
      resumeWaitingAIJobsForRoutes(
        transaction,
        { actorId: userId, deploymentMode: "personal" },
        [binding],
      ),
    );
    const second = await database.db.transaction((transaction) =>
      resumeWaitingAIJobsForRoutes(
        transaction,
        { actorId: userId, deploymentMode: "personal" },
        [binding],
      ),
    );
    const jobs = await database.db.query.aiJob.findMany({
      where: eq(aiJob.ownerId, userId),
    });
    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe(jobId);
    expect(jobs[0]?.versionSnapshot.providerKind).toBe("mock");
  });
});

integration("shared-instance AI job routing and repair", () => {
  const database = createDatabase(process.env.DATABASE_URL!);
  const suffix = newDomainId();
  const ownerId = `shared-route-owner-${suffix}`;
  const adminId = `shared-route-admin-${suffix}`;
  const learnerId = `shared-route-learner-${suffix}`;
  const providerId = newDomainId();
  const adminProviderId = newDomainId();
  const routeId = newDomainId();
  const adminRouteId = newDomainId();
  const waitingJobId = newDomainId();
  const blockedJobId = newDomainId();
  const personalJobId = newDomainId();
  const fallbackInstanceId = newDomainId();
  let testInstanceId = "";
  let createdTestInstance = false;

  beforeAll(async () => {
    const existingInstance =
      await database.db.query.instanceConfiguration.findFirst();
    if (existingInstance) {
      testInstanceId = existingInstance.id;
    } else {
      testInstanceId = fallbackInstanceId;
      createdTestInstance = true;
      await database.db.insert(instanceConfiguration).values({
        id: testInstanceId,
        deploymentMode: "personal",
        defaultLocale: "zh-CN",
      });
    }
    await database.db.insert(user).values([
      {
        id: ownerId,
        name: "Shared route owner",
        email: `${ownerId}@example.test`,
        role: "owner",
      },
      {
        id: adminId,
        name: "Shared route admin",
        email: `${adminId}@example.test`,
        role: "admin",
      },
      {
        id: learnerId,
        name: "Shared route learner",
        email: `${learnerId}@example.test`,
        role: "learner",
      },
    ]);
    await database.db.insert(providerConnection).values([
      {
        id: providerId,
        ownerId,
        name: "Owner shared mock",
        kind: "mock",
        secretMode: "encrypted",
      },
      {
        id: adminProviderId,
        ownerId: adminId,
        name: "Admin shared mock",
        kind: "mock",
        secretMode: "encrypted",
      },
    ]);
    await database.db.insert(modelRoute).values([
      {
        id: routeId,
        ownerId,
        taskKind: "issue_classification",
        providerConnectionId: providerId,
        model: "owner-shared-model",
      },
      {
        id: adminRouteId,
        ownerId: adminId,
        taskKind: "issue_classification",
        providerConnectionId: adminProviderId,
        model: "admin-shared-model",
      },
    ]);
    await database.db.insert(aiJob).values([
      {
        id: waitingJobId,
        ownerId: learnerId,
        taskKind: "issue_classification",
        status: "WAITING_FOR_CONSENT",
        protectedReference: { attemptId: newDomainId() },
        versionSnapshot: {
          providerKind: "unconfigured",
          providerConnectionId: "unconfigured",
        },
        idempotencyKey: `shared-waiting:${suffix}`,
      },
      {
        id: blockedJobId,
        ownerId: learnerId,
        taskKind: "ielts_assessment",
        status: "AI_BLOCKED",
        providerConnectionId: providerId,
        protectedReference: { attemptId: newDomainId() },
        versionSnapshot: {
          providerKind: "mock",
          providerConnectionId: providerId,
        },
        idempotencyKey: `shared-blocked:${suffix}`,
        lastErrorCode: "AUTHENTICATION",
      },
      {
        id: personalJobId,
        ownerId: learnerId,
        taskKind: "paragraph_evaluation",
        status: "WAITING_FOR_CONSENT",
        protectedReference: { attemptId: newDomainId() },
        versionSnapshot: {
          providerKind: "unconfigured",
          providerConnectionId: "unconfigured",
        },
        idempotencyKey: `personal-waiting:${suffix}`,
      },
    ]);
  });

  afterAll(async () => {
    const jobs = await database.db.query.aiJob.findMany({
      columns: { graphileJobKey: true },
      where: eq(aiJob.ownerId, learnerId),
    });
    for (const job of jobs) {
      if (job.graphileJobKey)
        await database.db.execute(
          sql`select graphile_worker.remove_job(${job.graphileJobKey})`,
        );
    }
    await database.db.delete(aiJob).where(eq(aiJob.ownerId, learnerId));
    await database.db.delete(user).where(eq(user.id, ownerId));
    await database.db.delete(user).where(eq(user.id, adminId));
    await database.db.delete(user).where(eq(user.id, learnerId));
    if (createdTestInstance) {
      await database.db
        .delete(instanceConfiguration)
        .where(eq(instanceConfiguration.id, testInstanceId));
    }
    await database.pool.end();
  });

  it("resolves the privileged instance route while preserving learner job ownership", async () => {
    const shared = await database.db.transaction(async (transaction) => {
      const resolved = await resolveAIJobRoute(transaction, {
        deploymentMode: "shared",
        jobOwnerId: learnerId,
        taskKind: "issue_classification",
      });
      expect(resolved.route?.id).toBe(routeId);
      expect(resolved.provider?.id).toBe(providerId);

      const instance = await transaction.query.instanceConfiguration.findFirst({
        where: eq(instanceConfiguration.id, testInstanceId),
      });
      expect(instance).toBeDefined();
      await transaction
        .update(instanceConfiguration)
        .set({ deploymentMode: "shared" })
        .where(eq(instanceConfiguration.id, instance!.id));
      const enqueued = await enqueueAIJob(transaction, {
        ownerId: learnerId,
        taskKind: "issue_classification",
        protectedReference: { attemptId: newDomainId() },
        idempotencyKey: `shared-enqueue:${suffix}`,
      });
      await transaction
        .update(instanceConfiguration)
        .set({ deploymentMode: instance!.deploymentMode })
        .where(eq(instanceConfiguration.id, instance!.id));
      return enqueued;
    });

    expect(shared.status).toBe("QUEUED");
    const job = await database.db.query.aiJob.findFirst({
      where: eq(aiJob.id, shared.id),
    });
    expect(job).toMatchObject({
      ownerId: learnerId,
      providerConnectionId: providerId,
      modelRouteId: routeId,
      status: "QUEUED",
    });
    expect(job?.versionSnapshot.model).toBe("owner-shared-model");
  });

  it("makes an Admin change to the canonical shared route visible to later Learner jobs", async () => {
    await database.db.transaction(async (transaction) => {
      const canonical = await resolveAIJobRoute(transaction, {
        deploymentMode: "shared",
        jobOwnerId: adminId,
        taskKind: "issue_classification",
      });
      expect(canonical.route?.id).toBe(routeId);
      await transaction
        .update(modelRoute)
        .set({ model: "admin-updated-shared-model", routeVersion: 2 })
        .where(eq(modelRoute.id, canonical.route!.id));
    });
    const learnerResolution = await database.db.transaction((transaction) =>
      resolveAIJobRoute(transaction, {
        deploymentMode: "shared",
        jobOwnerId: learnerId,
        taskKind: "issue_classification",
      }),
    );
    expect(learnerResolution.route).toMatchObject({
      id: routeId,
      model: "admin-updated-shared-model",
      routeVersion: 2,
    });
  });

  it("never borrows a privileged route in personal mode", async () => {
    const resolved = await database.db.transaction((transaction) =>
      resolveAIJobRoute(transaction, {
        deploymentMode: "personal",
        jobOwnerId: learnerId,
        taskKind: "ielts_assessment",
      }),
    );
    expect(resolved.route).toBeUndefined();
    expect(resolved.provider).toBeUndefined();
  });

  it("repairs matching learner jobs instance-wide only in shared mode", async () => {
    const binding = {
      taskKind: "issue_classification" as const,
      routeId,
      providerConnectionId: providerId,
      providerKind: "mock" as const,
      model: "owner-shared-model",
      routeVersion: 1,
      fallbackEnabled: false,
    };
    const personalRepair = await database.db.transaction((transaction) =>
      resumeWaitingAIJobsForRoutes(
        transaction,
        { actorId: ownerId, deploymentMode: "personal" },
        [binding],
      ),
    );
    const sharedRepair = await database.db.transaction((transaction) =>
      resumeWaitingAIJobsForRoutes(
        transaction,
        { actorId: ownerId, deploymentMode: "shared" },
        [binding],
      ),
    );
    const blockedRepair = await database.db.transaction((transaction) =>
      resumeBlockedAIJobsForProvider(
        transaction,
        { actorId: ownerId, deploymentMode: "shared" },
        providerId,
      ),
    );
    expect(personalRepair).toBe(0);
    expect(sharedRepair).toBe(1);
    expect(blockedRepair).toBe(1);
    expect(
      await database.db.query.aiJob.findFirst({
        where: eq(aiJob.id, personalJobId),
      }),
    ).toMatchObject({ status: "WAITING_FOR_CONSENT" });
  });
});
