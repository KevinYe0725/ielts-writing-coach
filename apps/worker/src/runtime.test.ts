import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encryptProviderSecret, parseMasterKey } from "@iwc/ai";
import {
  aiJob,
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
  adapterForJob,
  claimAIJob,
  claimableAIJobDelivery,
  createChildJob,
  databaseContext,
  environment,
  providerConnectionAuthorizedForJob,
} from "./runtime";

describe("AI job claim fence", () => {
  it("never treats an active lease as a new claim", () => {
    expect(claimableAIJobDelivery("QUEUED", 0, 1)).toBe(true);
    expect(claimableAIJobDelivery("RETRY_SCHEDULED", 2, 1)).toBe(true);
    expect(claimableAIJobDelivery("LEASED", 1, 1)).toBe(false);
    expect(claimableAIJobDelivery("RUNNING", 1, 1)).toBe(false);
    expect(claimableAIJobDelivery("SUCCEEDED", 1, 2)).toBe(false);
  });

  it("allows only a later queue delivery to recover an interrupted run", () => {
    expect(claimableAIJobDelivery("RUNNING", 1, 2)).toBe(true);
    expect(claimableAIJobDelivery("LEASED", 3, 4)).toBe(true);
  });
});

describe("provider connection ownership policy", () => {
  it("keeps personal connections actor-owned and shared connections privileged", () => {
    expect(
      providerConnectionAuthorizedForJob({
        connectionOwnerId: "learner-a",
        connectionOwnerRole: "learner",
        deploymentMode: "personal",
        jobOwnerId: "learner-a",
      }),
    ).toBe(true);
    expect(
      providerConnectionAuthorizedForJob({
        connectionOwnerId: "owner-a",
        connectionOwnerRole: "owner",
        deploymentMode: "personal",
        jobOwnerId: "learner-a",
      }),
    ).toBe(false);
    expect(
      providerConnectionAuthorizedForJob({
        connectionOwnerId: "owner-a",
        connectionOwnerRole: "owner",
        deploymentMode: "shared",
        jobOwnerId: "learner-a",
      }),
    ).toBe(true);
    expect(
      providerConnectionAuthorizedForJob({
        connectionOwnerId: "learner-b",
        connectionOwnerRole: "learner",
        deploymentMode: "shared",
        jobOwnerId: "learner-a",
      }),
    ).toBe(false);
  });
});

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("AI job lease and result idempotency", () => {
  const suffix = newDomainId();
  const userId = `worker-idempotency-${suffix}`;
  const queuedJobId = newDomainId();
  const resultJobId = newDomainId();
  const questionId = newDomainId();
  const cycleId = newDomainId();
  const objectiveId = newDomainId();
  const lessonId = newDomainId();
  const itemId = newDomainId();
  const attemptId = newDomainId();
  const responseEventId = newDomainId();
  const sharedLearnerId = `worker-shared-learner-${suffix}`;
  const sharedProviderId = newDomainId();
  const encryptedProviderId = newDomainId();
  const sharedRouteId = newDomainId();
  const fallbackInstanceId = newDomainId();
  const testMasterKey = Buffer.alloc(32, 7).toString("base64");
  let testInstanceId = "";
  let createdTestInstance = false;

  beforeAll(async () => {
    const existingInstance =
      await databaseContext.db.query.instanceConfiguration.findFirst();
    if (existingInstance) {
      testInstanceId = existingInstance.id;
    } else {
      testInstanceId = fallbackInstanceId;
      createdTestInstance = true;
      await databaseContext.db.insert(instanceConfiguration).values({
        id: testInstanceId,
        deploymentMode: "personal",
        defaultLocale: "zh-CN",
      });
    }
    await databaseContext.db.insert(user).values({
      id: userId,
      name: "Worker idempotency test",
      email: `${userId}@example.test`,
      role: "owner",
    });
    await databaseContext.db.insert(user).values({
      id: sharedLearnerId,
      name: "Worker shared learner",
      email: `${sharedLearnerId}@example.test`,
      role: "learner",
    });
    const encrypted = encryptProviderSecret(
      "worker-test-secret",
      parseMasterKey(testMasterKey),
      1,
      `provider:${userId}:${encryptedProviderId}`,
    );
    await databaseContext.db.insert(providerConnection).values([
      {
        id: sharedProviderId,
        ownerId: userId,
        name: "Worker shared mock provider",
        kind: "mock",
        secretMode: "encrypted",
      },
      {
        id: encryptedProviderId,
        ownerId: userId,
        name: "Worker shared encrypted provider",
        kind: "compatible",
        baseUrl: "https://compatible.example.test/v1",
        secretMode: "encrypted",
        secretCiphertext: encrypted.ciphertext,
        secretNonce: encrypted.nonce,
        keyVersion: encrypted.keyVersion,
      },
    ]);
    await databaseContext.db.insert(modelRoute).values({
      id: sharedRouteId,
      ownerId: userId,
      taskKind: "version_comparison",
      providerConnectionId: sharedProviderId,
      model: "worker-shared-model",
    });
    await databaseContext.db.insert(question).values({
      id: questionId,
      externalId: `worker-idempotency-${suffix}`,
      ownerId: userId,
      visibility: "private",
      questionType: "opinion",
      topic: "education",
      prompt: "Test prompt",
    });
    await databaseContext.db.insert(trainingCycle).values({
      id: cycleId,
      userId,
      questionId,
      schemaVersion: "1.0.0",
      timezone: "UTC",
    });
    await databaseContext.db.insert(learningObjective).values({
      id: objectiveId,
      cycleId,
      skillId: "mechanism_chain",
      role: "CORE",
      sourceEvidenceIds: [],
      priority: 1,
      successCriterion: "Test criterion",
    });
    await databaseContext.db.insert(lessonPlan).values({
      id: lessonId,
      cycleId,
      coreSkillId: "mechanism_chain",
      schemaVersion: "1.0.0",
      coreMinutes: 45,
      activeOutputRatio: 0.7,
      selectionRatio: 0.2,
      stages: [],
    });
    await databaseContext.db.insert(exerciseItem).values({
      id: itemId,
      lessonPlanId: lessonId,
      learningObjectiveId: objectiveId,
      ordinal: 1,
      itemType: "CONSTRAINED_REWRITE",
      prompt: { promptEn: "Rewrite." },
      evaluationContract: {},
      expectedMinutes: 3,
    });
    await databaseContext.db.insert(exerciseAttempt).values({
      id: attemptId,
      exerciseItemId: itemId,
      userId,
      firstAttemptEventId: responseEventId,
      finalAttemptEventId: responseEventId,
      contractAttempts: [
        {
          id: responseEventId,
          answer: "A test answer.",
          submittedAt: new Date().toISOString(),
          elapsedSeconds: 10,
          hintLevel: "NONE",
          referenceAnswerSeen: false,
        },
      ],
      firstAnswer: "A test answer.",
      finalAnswer: "A test answer.",
    });
    await databaseContext.db.insert(aiJob).values([
      {
        id: queuedJobId,
        ownerId: userId,
        taskKind: "open_sentence_evaluation",
        status: "QUEUED",
        protectedReference: { exerciseAttemptId: attemptId },
        versionSnapshot: { providerKind: "mock" },
        idempotencyKey: `claim:${suffix}`,
      },
      {
        id: resultJobId,
        ownerId: userId,
        taskKind: "open_sentence_evaluation",
        status: "RUNNING",
        protectedReference: { exerciseAttemptId: attemptId },
        versionSnapshot: { providerKind: "mock" },
        idempotencyKey: `result:${suffix}`,
      },
    ]);
  });

  afterAll(async () => {
    await databaseContext.db.delete(user).where(eq(user.id, sharedLearnerId));
    await databaseContext.db.delete(user).where(eq(user.id, userId));
    if (createdTestInstance) {
      await databaseContext.db
        .delete(instanceConfiguration)
        .where(eq(instanceConfiguration.id, testInstanceId));
    }
    await databaseContext.pool.end();
  });

  it("grants exactly one claim when duplicate callbacks race", async () => {
    const claims = await Promise.all([
      claimAIJob(queuedJobId, 1),
      claimAIJob(queuedJobId, 1),
      claimAIJob(queuedJobId, 1),
    ]);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    expect(await claimAIJob(queuedJobId, 1)).toBeNull();

    const stored = await databaseContext.db.query.aiJob.findFirst({
      where: eq(aiJob.id, queuedJobId),
    });
    expect(stored).toMatchObject({ status: "RUNNING", attemptCount: 1 });

    const recovered = await claimAIJob(queuedJobId, 2);
    expect(recovered).toMatchObject({ id: queuedJobId, attemptCount: 2 });
    expect(await claimAIJob(queuedJobId, 2)).toBeNull();
  });

  it("allows one result per durable job but a later explicit job may append", async () => {
    const base = {
      exerciseAttemptId: attemptId,
      responseAttemptId: responseEventId,
      passed: true,
      confidence: 0.95,
      feedback: { en: "Test", zh: "测试" },
      versionSnapshot: { providerKind: "mock" },
    };
    await databaseContext.db.insert(evaluation).values({
      ...base,
      aiJobId: resultJobId,
    });
    const duplicate = await databaseContext.db
      .insert(evaluation)
      .values({ ...base, aiJobId: resultJobId })
      .catch((error: unknown) => error);
    expect(duplicate).toBeInstanceOf(Error);
    expect(duplicate).toMatchObject({
      cause: { code: "23505", constraint: "evaluation_ai_job_unique" },
    });

    const explicitReevaluationJobId = newDomainId();
    await databaseContext.db.insert(aiJob).values({
      id: explicitReevaluationJobId,
      ownerId: userId,
      taskKind: "open_sentence_evaluation",
      status: "RUNNING",
      protectedReference: { exerciseAttemptId: attemptId },
      versionSnapshot: { providerKind: "mock" },
      idempotencyKey: `result-second:${suffix}`,
    });
    await databaseContext.db.insert(evaluation).values({
      ...base,
      aiJobId: explicitReevaluationJobId,
    });
    const rows = await databaseContext.db.query.evaluation.findMany({
      where: eq(evaluation.exerciseAttemptId, attemptId),
    });
    expect(rows).toHaveLength(2);
  });

  it("instantiates a frozen Owner provider for a Learner only in shared mode", async () => {
    const instance =
      await databaseContext.db.query.instanceConfiguration.findFirst({
        where: eq(instanceConfiguration.id, testInstanceId),
      });
    expect(instance).toBeDefined();
    const frozenJob = {
      id: newDomainId(),
      ownerId: sharedLearnerId,
      taskKind: "ielts_assessment" as const,
      protectedReference: { attemptId: newDomainId() },
      versionSnapshot: {
        providerKind: "mock",
        providerConnectionId: sharedProviderId,
      },
      attemptCount: 1,
    };

    try {
      await databaseContext.db
        .update(instanceConfiguration)
        .set({ deploymentMode: "shared" })
        .where(eq(instanceConfiguration.id, instance!.id));
      await expect(adapterForJob(frozenJob)).resolves.toMatchObject({
        kind: "mock",
      });
      const previousMasterKey = environment.APP_ENCRYPTION_KEY;
      environment.APP_ENCRYPTION_KEY = testMasterKey;
      try {
        await expect(
          adapterForJob({
            ...frozenJob,
            versionSnapshot: {
              providerKind: "compatible",
              providerConnectionId: encryptedProviderId,
            },
          }),
        ).resolves.toMatchObject({ kind: "compatible" });
      } finally {
        environment.APP_ENCRYPTION_KEY = previousMasterKey;
      }
      const child = await createChildJob(frozenJob, "version_comparison", {
        comparisonId: newDomainId(),
      });
      await expect(
        databaseContext.db.query.aiJob.findFirst({
          where: eq(aiJob.id, child.id),
        }),
      ).resolves.toMatchObject({
        modelRouteId: sharedRouteId,
        ownerId: sharedLearnerId,
        providerConnectionId: sharedProviderId,
        status: "QUEUED",
      });

      await databaseContext.db
        .update(instanceConfiguration)
        .set({ deploymentMode: "personal" })
        .where(eq(instanceConfiguration.id, instance!.id));
      await expect(adapterForJob(frozenJob)).rejects.toMatchObject({
        code: "PROVIDER_NOT_FOUND",
      });
    } finally {
      await databaseContext.db
        .update(instanceConfiguration)
        .set({ deploymentMode: instance!.deploymentMode })
        .where(eq(instanceConfiguration.id, instance!.id));
    }
  });
});
