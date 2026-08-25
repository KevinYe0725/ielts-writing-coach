import {
  encryptProviderSecret,
  parseMasterKey,
  type AIProviderAdapter,
} from "@iwc/ai";
import {
  aiJob,
  newDomainId,
  question,
  questionGenerationBatch,
  questionRecommendation,
  user,
} from "@iwc/db";
import type { SearchAdapter, SearchQuery } from "@iwc/search";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ClaimedJob } from "../runtime";
import { databaseContext } from "../runtime";
import { runAIJob } from "./ai";
import {
  databaseQuestionSupplyStore,
  refillQuestionBank,
  type QuestionSupplyDependencies,
  type QuestionSupplyStore,
  type StoredGenerationBatch,
  type WorkerSearchConnection,
} from "./question-supply";

const masterKey = Buffer.alloc(32, 11).toString("base64");

function proposal(index = 0) {
  return {
    type: "opinion" as const,
    topic: "government" as const,
    track: "academic" as const,
    prompt: `Local councils should reserve budget category ${index + 1} for maintaining shared neighbourhood spaces before funding new monuments. Do you agree or disagree?`,
    internalRationale: `A durable civic trade-off number ${index + 1}.`,
  };
}

function publishableQuestion(externalId: string, index: number) {
  return {
    externalId,
    source: "AI_GENERATED" as const,
    visibility: "public" as const,
    ownerId: null,
    ieltsTrack: "academic" as const,
    questionType: "opinion" as const,
    topic: "government" as const,
    prompt: `Concurrent generated prompt ${index} asks residents to compare two distinct local budget priorities. Do you agree or disagree?`,
    attribution: "IWC validated AI-generated question",
    bankVersion: "dynamic-1.0.0",
  };
}

function claimedJob(batchId: string): ClaimedJob {
  return {
    id: newDomainId(),
    ownerId: "learner-trigger",
    taskKind: "question_bank_refill",
    protectedReference: { generationBatchId: batchId },
    versionSnapshot: {
      model: "test-model",
      promptVersion: "1.0.0",
      rubricVersion: "iwc-question-bank-refill-1.0.0",
      providerKind: "mock",
      providerConnectionId: "mock",
    },
    attemptCount: 1,
  };
}

class MemoryStore implements QuestionSupplyStore {
  readonly transitions: string[] = [];
  readonly published: Array<{
    externalId: string;
    source: string;
    prompt: string;
  }> = [];
  readonly invalidatedConnections: string[] = [];
  readonly unavailableUsers: string[] = [];
  batch: StoredGenerationBatch;
  connection?: WorkerSearchConnection;
  existingQuestions: Array<{
    type: "opinion";
    topic: "government";
    prompt: string;
  }> = [];

  constructor(batchId: string) {
    this.batch = {
      id: batchId,
      triggeredByUserId: "learner-trigger",
      status: "QUEUED",
      mode: "WEB_RESEARCH",
      targetMix: [{ questionType: "opinion", topic: "government", count: 2 }],
      researchSources: [],
      searchConnectionId: null,
      aiJobId: null,
      acceptedCount: 0,
      rejectedCount: 0,
      safeFailureCode: null,
    };
  }

  async loadBatch(batchId: string): Promise<StoredGenerationBatch | undefined> {
    return this.batch.id === batchId ? { ...this.batch } : undefined;
  }

  async loadCanonicalSearchConnection(): Promise<
    WorkerSearchConnection | undefined
  > {
    return this.connection;
  }

  async transitionBatch(
    _batchId: string,
    _fence: { aiJobId: string; attemptCount: number },
    update: Partial<StoredGenerationBatch>,
  ): Promise<boolean> {
    if (this.batch.status === "SUCCEEDED" || this.batch.status === "FAILED")
      return false;
    this.batch = { ...this.batch, ...update };
    if (update.status) this.transitions.push(update.status);
    return true;
  }

  async loadExistingQuestions() {
    return this.existingQuestions;
  }

  async invalidateSearchConnection(connectionId: string): Promise<void> {
    this.invalidatedConnections.push(connectionId);
  }

  async publish(
    _batchId: string,
    _fence: { aiJobId: string; attemptCount: number },
    questions: readonly {
      externalId: string;
      source: string;
      prompt: string;
    }[],
    rejectedCount: number,
  ): Promise<number> {
    if (this.batch.status === "SUCCEEDED" || this.batch.status === "FAILED")
      return this.batch.acceptedCount;
    for (const question of questions) {
      if (
        !this.published.some(
          (saved) => saved.externalId === question.externalId,
        )
      )
        this.published.push({ ...question });
    }
    this.batch = {
      ...this.batch,
      status: this.published.length > 0 ? "SUCCEEDED" : "FAILED",
      acceptedCount: this.published.length,
      rejectedCount,
      safeFailureCode:
        this.published.length > 0 ? null : "QUESTION_VALIDATION_REJECTED",
    };
    this.transitions.push(this.batch.status);
    return this.published.length;
  }

  async fail(
    _batchId: string,
    _fence: { aiJobId: string; attemptCount: number },
    safeFailureCode: string,
  ): Promise<boolean> {
    if (this.batch.status === "SUCCEEDED" || this.batch.status === "FAILED")
      return false;
    this.batch = { ...this.batch, status: "FAILED", safeFailureCode };
    this.transitions.push("FAILED");
    if (this.batch.triggeredByUserId)
      this.unavailableUsers.push(this.batch.triggeredByUserId);
    return true;
  }
}

function searchConnection(): WorkerSearchConnection {
  const id = newDomainId();
  const configuredByUserId = "owner-search";
  const encrypted = encryptProviderSecret(
    "brave-test-key",
    parseMasterKey(masterKey),
    1,
    `search:${configuredByUserId}:${id}`,
  );
  return {
    id,
    configuredByUserId,
    configuredByUserRole: "owner",
    kind: "BRAVE",
    encryptedApiKey: encrypted.ciphertext,
    encryptedApiKeyNonce: encrypted.nonce,
    encryptionKeyVersion: encrypted.keyVersion,
    createdAt: new Date(),
  };
}

function fakeSearch(
  behavior: (
    input: SearchQuery,
  ) => Promise<readonly { title: string; url: string; snippet: string }[]>,
): SearchAdapter {
  return {
    validateConnection: vi.fn(),
    search: vi.fn(behavior),
  };
}

function dependencies(
  store: QuestionSupplyStore,
  options: {
    search?: SearchAdapter;
    generation?: unknown;
    semantic?: unknown;
    semanticSequence?: readonly unknown[];
    aiError?: Error;
    capturedSearchKey?: string[];
  } = {},
): QuestionSupplyDependencies {
  let structuredCall = 0;
  return {
    store,
    encryptionKey: masterKey,
    createSearchAdapter(apiKey) {
      options.capturedSearchKey?.push(apiKey);
      return (
        options.search ??
        fakeSearch(async () => [
          {
            title: "Public space maintenance",
            url: "https://example.test/public-space",
            snippet:
              "Cities compare routine maintenance with landmark projects.",
          },
          {
            title: "Neighbourhood budgets",
            url: "https://example.test/budgets",
            snippet: "Residents debate stable funding for common facilities.",
          },
          {
            title: "Civic priorities",
            url: "https://example.test/priorities",
            snippet:
              "Local authorities balance visible projects and daily services.",
          },
        ])
      );
    },
    async resolveAIAdapter() {
      const adapter: AIProviderAdapter = {
        kind: "mock" as const,
        validateConnection: vi.fn(),
        listModels: vi.fn(),
        probeCapabilities: vi.fn(),
        generateText: vi.fn(),
        async generateStructured<T>() {
          if (options.aiError) throw options.aiError;
          structuredCall += 1;
          const generatedValue =
            structuredCall === 1
              ? (options.generation ?? { proposals: [proposal()] })
              : (options.semanticSequence?.[structuredCall - 2] ??
                options.semantic ?? {
                  duplicate: false,
                  confidence: 0.95,
                  rationale:
                    "The underlying issue and requested comparison are distinct.",
                });
          if (generatedValue instanceof Error) throw generatedValue;
          return {
            value: generatedValue as T,
            model: "test-model",
            usage: {
              inputTokens: 2,
              outputTokens: 3,
              totalTokens: 5,
            },
          };
        },
        normalizeUsage: vi.fn(),
        normalizeError: vi.fn((error: unknown) => {
          const code = (error as { code?: unknown } | null)?.code;
          const status = (error as { status?: unknown } | null)?.status;
          if (code === "AUTHENTICATION") {
            return {
              code: "AUTHENTICATION" as const,
              safeMessage: "The provider rejected the credentials.",
              retryable: false,
            };
          }
          if (status === 503) {
            return {
              code: "CONNECTION" as const,
              safeMessage: "The provider is temporarily unavailable.",
              retryable: true,
              status,
            };
          }
          return {
            code: "UNKNOWN" as const,
            safeMessage: "AI provider request failed.",
            retryable: false,
          };
        }),
      };
      vi.spyOn(adapter, "generateStructured");
      return adapter;
    },
  };
}

const helpers = { job: { attempts: 1 } } as never;

describe("question-bank refill pipeline", () => {
  it("decrypts the canonical Brave key and advances SEARCHING through SUCCEEDED", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    const connection = searchConnection();
    store.connection = connection;
    const capturedSearchKey: string[] = [];

    const usage = await refillQuestionBank(
      claimedJob(batchId),
      helpers,
      dependencies(store, { capturedSearchKey }),
    );

    expect(capturedSearchKey).toEqual(["brave-test-key"]);
    expect(store.transitions).toEqual([
      "SEARCHING",
      "GENERATING",
      "VALIDATING",
      "SUCCEEDED",
    ]);
    expect(store.batch.mode).toBe("WEB_RESEARCH");
    expect(store.batch.searchConnectionId).toBe(connection.id);
    expect(store.batch.researchSources).toHaveLength(3);
    expect(store.published).toHaveLength(1);
    expect(store.published[0]?.source).toBe("AI_RESEARCHED");
    expect(store.published[0]?.externalId).toBe(
      "iwc-dynamic-a17b28afe74d6d3099b3945254c7f14725015928fa293570985d020b630f4820",
    );
    expect(usage).toEqual({ inputTokens: 2, outputTokens: 3, totalTokens: 5 });
  });

  it("uses OFFLINE generation automatically when no search connection exists", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);

    await refillQuestionBank(claimedJob(batchId), helpers, dependencies(store));

    expect(store.batch.mode).toBe("OFFLINE");
    expect(store.batch.researchSources).toEqual([]);
    expect(store.published[0]?.source).toBe("AI_GENERATED");
  });

  it("treats an undecryptable active connection as unavailable and never constructs a search adapter", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    store.connection = {
      ...searchConnection(),
      encryptedApiKey: "not-an-encrypted-envelope",
    };
    const capturedSearchKey: string[] = [];

    await refillQuestionBank(
      claimedJob(batchId),
      helpers,
      dependencies(store, { capturedSearchKey }),
    );

    expect(capturedSearchKey).toEqual([]);
    expect(store.batch.mode).toBe("OFFLINE");
    expect(store.published).toHaveLength(1);
  });

  it("builds no more than eight generic topic searches without private target text", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    store.connection = searchConnection();
    store.batch.targetMix = [
      { questionType: "opinion", topic: "education", count: 1 },
      { questionType: "discussion", topic: "technology", count: 1 },
      {
        questionType: "advantages_disadvantages",
        topic: "environment",
        count: 1,
      },
      { questionType: "problems_solutions", topic: "health", count: 1 },
      { questionType: "two_part", topic: "government", count: 1 },
      { questionType: "opinion", topic: "work_economy", count: 1 },
      { questionType: "discussion", topic: "society_culture", count: 1 },
      { questionType: "opinion", topic: "urban_transport", count: 1 },
      {
        questionType: "opinion",
        topic: "private learner essay text",
        count: 1,
      },
    ];
    const search = fakeSearch(async (_input) => [
      {
        title: "One safe result",
        url: `https://example.test/${newDomainId()}`,
        snippet: "A generic public-policy theme.",
      },
    ]);

    await refillQuestionBank(
      claimedJob(batchId),
      helpers,
      dependencies(store, { search }),
    );

    expect(search.search).toHaveBeenCalledTimes(8);
    for (const [request] of vi.mocked(search.search).mock.calls) {
      expect(request.query).not.toContain("private learner essay text");
      expect(request).toMatchObject({
        count: 5,
        language: "en",
        safeSearch: "strict",
        timeoutMs: 15_000,
      });
    }
  });

  it.each([
    [
      "401",
      Object.assign(new Error("secret provider body"), {
        code: "AUTHENTICATION",
      }),
    ],
    [
      "429",
      Object.assign(new Error("quota details"), { code: "RATE_LIMITED" }),
    ],
    [
      "timeout",
      Object.assign(new Error("request address"), { code: "TIMEOUT" }),
    ],
  ])(
    "falls back to OFFLINE generation after safe search %s",
    async (_name, error) => {
      const batchId = newDomainId();
      const store = new MemoryStore(batchId);
      store.connection = searchConnection();

      await refillQuestionBank(
        claimedJob(batchId),
        helpers,
        dependencies(store, {
          search: fakeSearch(async () => {
            throw error;
          }),
        }),
      );

      expect(store.batch.mode).toBe("OFFLINE");
      expect(store.batch.safeFailureCode).toBeNull();
      expect(store.published).toHaveLength(1);
      if ((error as { code?: string }).code === "AUTHENTICATION")
        expect(store.invalidatedConnections).toEqual([store.connection.id]);
    },
  );

  it("discards too-little research and continues in OFFLINE mode", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    store.connection = searchConnection();

    await refillQuestionBank(
      claimedJob(batchId),
      helpers,
      dependencies(store, {
        search: fakeSearch(async () => [
          {
            title: "Only source",
            url: "https://example.test/only",
            snippet: "One result is not enough to ground a research batch.",
          },
        ]),
      }),
    );

    expect(store.batch.mode).toBe("OFFLINE");
    expect(store.batch.researchSources).toEqual([]);
  });

  it("waits for the bounded search phase to settle before falling back after one query fails", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    store.batch.targetMix = [
      { questionType: "opinion", topic: "government", count: 1 },
      { questionType: "opinion", topic: "education", count: 1 },
    ];
    store.connection = searchConnection();
    let releaseSecond!: () => void;
    const secondFinished = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const search = fakeSearch(async (input) => {
      if (input.query.includes("government")) {
        throw Object.assign(new Error("provider failed"), {
          code: "RATE_LIMITED",
        });
      }
      await secondFinished;
      return [];
    });

    let settled = false;
    const refill = refillQuestionBank(
      claimedJob(batchId),
      helpers,
      dependencies(store, { search }),
    ).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(search.search).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(settled).toBe(false);

    releaseSecond();
    await refill;
    expect(store.batch.mode).toBe("OFFLINE");
  });

  it("marks AI failure safely and inserts no question", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    const unsafe = Object.assign(new Error("provider-key-and-body"), {
      code: "AUTHENTICATION",
    });

    await expect(
      refillQuestionBank(
        claimedJob(batchId),
        helpers,
        dependencies(store, { aiError: unsafe }),
      ),
    ).rejects.toBe(unsafe);

    expect(store.batch.status).toBe("FAILED");
    expect(store.batch.safeFailureCode).toBe("AI_UNAVAILABLE");
    expect(store.published).toEqual([]);
    expect(store.unavailableUsers).toEqual(["learner-trigger"]);
  });

  it("keeps a batch non-terminal while a retryable AI outage still has queue attempts", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    const outage = Object.assign(new Error("private upstream response"), {
      status: 503,
    });
    const job = claimedJob(batchId);
    job.attemptCount = 1;

    await expect(
      refillQuestionBank(
        job,
        helpers,
        dependencies(store, { aiError: outage }),
      ),
    ).rejects.toBe(outage);

    expect(store.batch.status).toBe("GENERATING");
    expect(store.batch.safeFailureCode).toBeNull();
    expect(store.published).toEqual([]);
    expect(store.unavailableUsers).toEqual([]);
  });

  it("marks the batch failed when a retryable AI outage exhausts the fifth queue attempt", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    const outage = Object.assign(new Error("private upstream response"), {
      status: 503,
    });
    const job = claimedJob(batchId);
    job.attemptCount = 5;

    await expect(
      refillQuestionBank(
        job,
        helpers,
        dependencies(store, { aiError: outage }),
      ),
    ).rejects.toBe(outage);

    expect(store.batch).toMatchObject({
      status: "FAILED",
      safeFailureCode: "AI_UNAVAILABLE",
    });
    expect(store.published).toEqual([]);
    expect(store.unavailableUsers).toEqual(["learner-trigger"]);
  });

  it("requests no more than fifteen proposals and publishes no more than twelve", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    const proposals = Array.from({ length: 15 }, (_, index) => proposal(index));

    await refillQuestionBank(
      claimedJob(batchId),
      helpers,
      dependencies(store, { generation: { proposals } }),
    );

    expect(store.published).toHaveLength(12);
    expect(store.batch.acceptedCount).toBe(12);
    expect(store.batch.rejectedCount).toBe(3);
  });

  it("obtains a typed semantic judgment before publishing a shortlisted proposal", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    store.existingQuestions = [
      {
        type: "opinion",
        topic: "government",
        prompt:
          "National governments should pay for every local cultural festival. Do you agree or disagree?",
      },
    ];
    const deps = dependencies(store);
    const adapter = await deps.resolveAIAdapter(claimedJob(batchId));
    deps.resolveAIAdapter = async () => adapter;

    await refillQuestionBank(claimedJob(batchId), helpers, deps);

    expect(adapter.generateStructured).toHaveBeenCalledTimes(2);
    expect(store.published).toHaveLength(1);
  });

  it("rejects a low-confidence semantic judgment rather than publishing", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    store.existingQuestions = [
      {
        type: "opinion",
        topic: "government",
        prompt:
          "National governments should pay for every local cultural festival. Do you agree or disagree?",
      },
    ];

    await refillQuestionBank(
      claimedJob(batchId),
      helpers,
      dependencies(store, {
        semantic: {
          duplicate: false,
          confidence: 0.4,
          rationale: "Uncertain.",
        },
      }),
    );

    expect(store.published).toEqual([]);
    expect(store.batch.status).toBe("FAILED");
    expect(store.batch.safeFailureCode).toBe("QUESTION_VALIDATION_REJECTED");
  });

  it("rejects when only a dynamic candidate beyond shortlist index twenty is semantically duplicate", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    store.existingQuestions = Array.from({ length: 21 }, (_, index) => ({
      type: "opinion" as const,
      topic: "government" as const,
      prompt:
        index === 20
          ? "Municipal authorities ought to prioritise caring for communal neighbourhood areas over constructing symbolic attractions. Do you agree or disagree?"
          : `Public authorities should consider civic programme ${index + 1} when planning services for residents in different districts. Do you agree or disagree?`,
    }));
    const deps = dependencies(store, {
      semanticSequence: [
        {
          duplicate: false,
          confidence: 0.97,
          rationale: "No duplicate appears in the first bounded chunk.",
        },
        {
          duplicate: true,
          confidence: 0.96,
          rationale:
            "The tail item asks the same policy trade-off using paraphrased wording.",
        },
      ],
    });
    const adapter = await deps.resolveAIAdapter(claimedJob(batchId));
    deps.resolveAIAdapter = async () => adapter;

    await refillQuestionBank(claimedJob(batchId), helpers, deps);

    expect(adapter.generateStructured).toHaveBeenCalledTimes(3);
    expect(store.published).toEqual([]);
    expect(store.batch).toMatchObject({
      status: "FAILED",
      safeFailureCode: "QUESTION_VALIDATION_REJECTED",
    });
  });

  it.each([
    ["schema-invalid", {}],
    ["missing", new Error("semantic chunk unavailable")],
  ])(
    "fails the proposal closed when the tail semantic chunk is %s",
    async (_label, tailJudgment) => {
      const batchId = newDomainId();
      const store = new MemoryStore(batchId);
      store.existingQuestions = Array.from({ length: 21 }, (_, index) => ({
        type: "opinion" as const,
        topic: "government" as const,
        prompt: `Government policy comparison ${index + 1} concerns a different durable civic service priority. Do you agree or disagree?`,
      }));
      const deps = dependencies(store, {
        semanticSequence: [
          {
            duplicate: false,
            confidence: 0.97,
            rationale: "The first chunk contains no semantic duplicate.",
          },
          tailJudgment,
        ],
      });
      const adapter = await deps.resolveAIAdapter(claimedJob(batchId));
      deps.resolveAIAdapter = async () => adapter;

      await refillQuestionBank(claimedJob(batchId), helpers, deps);

      expect(adapter.generateStructured).toHaveBeenCalledTimes(3);
      expect(store.published).toEqual([]);
      expect(store.batch.status).toBe("FAILED");
    },
  );

  it("treats duplicate delivery of a succeeded batch as a no-op", async () => {
    const batchId = newDomainId();
    const store = new MemoryStore(batchId);
    const deps = dependencies(store);
    const job = claimedJob(batchId);

    await refillQuestionBank(job, helpers, deps);
    await refillQuestionBank(job, helpers, deps);

    expect(store.published).toHaveLength(1);
    expect(store.transitions).toEqual([
      "SEARCHING",
      "GENERATING",
      "VALIDATING",
      "SUCCEEDED",
    ]);
  });
});

const integration = process.env.DATABASE_URL
  ? describe.sequential
  : describe.skip;

integration("question-bank refill PostgreSQL publication", () => {
  const suffix = newDomainId();
  const userId = `question-supply-${suffix}`;
  const successBatchId = newDomainId();
  const successJobId = newDomainId();
  const failedBatchId = newDomainId();
  const failedJobId = newDomainId();
  const recommendationId = newDomainId();
  const rejectedBatchId = newDomainId();
  const rejectedJobId = newDomainId();
  const rejectedRecommendationId = newDomainId();
  const sharedWaitingRecommendationId = newDomainId();
  const collisionBatchId = newDomainId();
  const collisionJobId = newDomainId();
  const collisionQuestionId = newDomainId();
  const collisionExternalId =
    "iwc-dynamic-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  const dispatchBatchId = newDomainId();
  const dispatchJobId = newDomainId();
  const concurrentSuccessBatchId = newDomainId();
  const concurrentSuccessJobId = newDomainId();
  const recoveredRaceBatchId = newDomainId();
  const recoveredRaceJobId = newDomainId();
  const terminalRaceBatchId = newDomainId();
  const terminalRaceJobId = newDomainId();
  const transitionRecoveryBatchId = newDomainId();
  const transitionRecoveryJobId = newDomainId();

  beforeAll(async () => {
    await databaseContext.db.insert(user).values({
      id: userId,
      name: "Question supply integration",
      email: `${userId}@example.test`,
      role: "learner",
    });
    await databaseContext.db.insert(aiJob).values([
      {
        id: successJobId,
        ownerId: userId,
        taskKind: "question_bank_refill",
        status: "RUNNING",
        protectedReference: { generationBatchId: successBatchId },
        versionSnapshot: {
          model: "test-model",
          promptVersion: "1.0.0",
          providerKind: "mock",
          providerConnectionId: "mock",
        },
        idempotencyKey: `question-bank-refill:${successBatchId}`,
        attemptCount: 1,
      },
      {
        id: failedJobId,
        ownerId: userId,
        taskKind: "question_bank_refill",
        status: "RUNNING",
        protectedReference: { generationBatchId: failedBatchId },
        versionSnapshot: {
          model: "test-model",
          promptVersion: "1.0.0",
          providerKind: "mock",
          providerConnectionId: "mock",
        },
        idempotencyKey: `question-bank-refill:${failedBatchId}`,
        attemptCount: 1,
      },
      {
        id: rejectedJobId,
        ownerId: userId,
        taskKind: "question_bank_refill",
        status: "RUNNING",
        protectedReference: { generationBatchId: rejectedBatchId },
        versionSnapshot: {
          model: "test-model",
          promptVersion: "1.0.0",
          providerKind: "mock",
          providerConnectionId: "mock",
        },
        idempotencyKey: `question-bank-refill:${rejectedBatchId}`,
        attemptCount: 1,
      },
      {
        id: dispatchJobId,
        ownerId: userId,
        taskKind: "question_bank_refill",
        status: "QUEUED",
        protectedReference: { generationBatchId: dispatchBatchId },
        versionSnapshot: {
          model: "mock-deterministic-v1",
          promptVersion: "1.0.0",
          providerKind: "mock",
          providerConnectionId: "mock",
        },
        idempotencyKey: `question-bank-refill:${dispatchBatchId}`,
      },
      {
        id: concurrentSuccessJobId,
        ownerId: userId,
        taskKind: "question_bank_refill",
        status: "RUNNING",
        protectedReference: { generationBatchId: concurrentSuccessBatchId },
        versionSnapshot: { providerKind: "mock", providerConnectionId: "mock" },
        idempotencyKey: `question-bank-refill:${concurrentSuccessBatchId}`,
        attemptCount: 2,
      },
      {
        id: collisionJobId,
        ownerId: userId,
        taskKind: "question_bank_refill",
        status: "RUNNING",
        protectedReference: { generationBatchId: collisionBatchId },
        versionSnapshot: { providerKind: "mock", providerConnectionId: "mock" },
        idempotencyKey: `question-bank-refill:${collisionBatchId}`,
        attemptCount: 2,
      },
      {
        id: recoveredRaceJobId,
        ownerId: userId,
        taskKind: "question_bank_refill",
        status: "RUNNING",
        protectedReference: { generationBatchId: recoveredRaceBatchId },
        versionSnapshot: { providerKind: "mock", providerConnectionId: "mock" },
        idempotencyKey: `question-bank-refill:${recoveredRaceBatchId}`,
        attemptCount: 2,
      },
      {
        id: terminalRaceJobId,
        ownerId: userId,
        taskKind: "question_bank_refill",
        status: "RUNNING",
        protectedReference: { generationBatchId: terminalRaceBatchId },
        versionSnapshot: { providerKind: "mock", providerConnectionId: "mock" },
        idempotencyKey: `question-bank-refill:${terminalRaceBatchId}`,
        attemptCount: 2,
      },
      {
        id: transitionRecoveryJobId,
        ownerId: userId,
        taskKind: "question_bank_refill",
        status: "RUNNING",
        protectedReference: {
          generationBatchId: transitionRecoveryBatchId,
        },
        versionSnapshot: { providerKind: "mock", providerConnectionId: "mock" },
        idempotencyKey: `question-bank-refill:${transitionRecoveryBatchId}`,
        attemptCount: 1,
      },
    ]);
    await databaseContext.db.insert(questionGenerationBatch).values([
      {
        id: successBatchId,
        triggeredByUserId: userId,
        status: "QUEUED",
        mode: "OFFLINE",
        targetMix: [{ questionType: "opinion", topic: "government", count: 1 }],
        aiJobId: successJobId,
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
      {
        id: failedBatchId,
        triggeredByUserId: userId,
        status: "QUEUED",
        mode: "OFFLINE",
        targetMix: [{ questionType: "opinion", topic: "government", count: 1 }],
        aiJobId: failedJobId,
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
      {
        id: rejectedBatchId,
        triggeredByUserId: userId,
        status: "QUEUED",
        mode: "OFFLINE",
        targetMix: [{ questionType: "opinion", topic: "government", count: 1 }],
        aiJobId: rejectedJobId,
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
      {
        id: dispatchBatchId,
        triggeredByUserId: userId,
        status: "QUEUED",
        mode: "OFFLINE",
        targetMix: [{ questionType: "opinion", topic: "government", count: 1 }],
        aiJobId: dispatchJobId,
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
      {
        id: concurrentSuccessBatchId,
        triggeredByUserId: userId,
        status: "VALIDATING",
        mode: "OFFLINE",
        targetMix: [
          { questionType: "opinion", topic: "government", count: 12 },
        ],
        aiJobId: concurrentSuccessJobId,
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
      {
        id: recoveredRaceBatchId,
        triggeredByUserId: userId,
        status: "VALIDATING",
        mode: "OFFLINE",
        targetMix: [{ questionType: "opinion", topic: "government", count: 1 }],
        aiJobId: recoveredRaceJobId,
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
      {
        id: terminalRaceBatchId,
        triggeredByUserId: userId,
        status: "VALIDATING",
        mode: "OFFLINE",
        targetMix: [{ questionType: "opinion", topic: "government", count: 1 }],
        aiJobId: terminalRaceJobId,
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
      {
        id: transitionRecoveryBatchId,
        triggeredByUserId: userId,
        status: "SEARCHING",
        mode: "OFFLINE",
        targetMix: [{ questionType: "opinion", topic: "government", count: 1 }],
        aiJobId: transitionRecoveryJobId,
        promptVersion: "1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
      },
    ]);
    await databaseContext.db.insert(questionRecommendation).values({
      id: recommendationId,
      userId,
      generationBatchId: failedBatchId,
      action: "INITIAL",
      status: "PENDING",
    });
  });

  afterAll(async () => {
    await databaseContext.db
      .delete(question)
      .where(
        inArray(question.generationBatchId, [
          successBatchId,
          concurrentSuccessBatchId,
          recoveredRaceBatchId,
          terminalRaceBatchId,
        ]),
      );
    await databaseContext.db
      .delete(question)
      .where(eq(question.externalId, collisionExternalId));
    await databaseContext.db
      .delete(questionGenerationBatch)
      .where(eq(questionGenerationBatch.triggeredByUserId, userId));
    await databaseContext.db.delete(aiJob).where(eq(aiJob.ownerId, userId));
    await databaseContext.db.delete(user).where(eq(user.id, userId));
    await databaseContext.pool.end();
  });

  it("atomically publishes one hash-identified public question and makes duplicate delivery a no-op", async () => {
    const job = {
      ...claimedJob(successBatchId),
      id: successJobId,
      ownerId: userId,
    };
    const deps = dependencies(databaseQuestionSupplyStore);

    await refillQuestionBank(job, helpers, deps);
    await refillQuestionBank(job, helpers, deps);

    const [batch, saved] = await Promise.all([
      databaseContext.db.query.questionGenerationBatch.findFirst({
        where: eq(questionGenerationBatch.id, successBatchId),
      }),
      databaseContext.db.query.question.findMany({
        where: eq(question.generationBatchId, successBatchId),
      }),
    ]);
    expect(batch).toMatchObject({
      status: "SUCCEEDED",
      mode: "OFFLINE",
      acceptedCount: 1,
      rejectedCount: 0,
      safeFailureCode: null,
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      ownerId: null,
      visibility: "public",
      source: "AI_GENERATED",
      generationBatchId: successBatchId,
    });
    expect(saved[0]?.externalId).toMatch(/^iwc-dynamic-[a-f0-9]{64}$/u);
  });

  it("marks the batch and pending recommendation unavailable without inserting on AI failure", async () => {
    const job = {
      ...claimedJob(failedBatchId),
      id: failedJobId,
      ownerId: userId,
    };
    const failure = new Error("private provider failure body");
    await databaseContext.db.insert(questionRecommendation).values({
      id: sharedWaitingRecommendationId,
      userId,
      generationBatchId: rejectedBatchId,
      action: "INITIAL",
      status: "PENDING",
    });

    await expect(
      refillQuestionBank(
        job,
        helpers,
        dependencies(databaseQuestionSupplyStore, { aiError: failure }),
      ),
    ).rejects.toBe(failure);

    const [batch, recommendation, sharedWaiting, saved] = await Promise.all([
      databaseContext.db.query.questionGenerationBatch.findFirst({
        where: eq(questionGenerationBatch.id, failedBatchId),
      }),
      databaseContext.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, recommendationId),
      }),
      databaseContext.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, sharedWaitingRecommendationId),
      }),
      databaseContext.db.query.question.findMany({
        where: eq(question.generationBatchId, failedBatchId),
      }),
    ]);
    expect(batch).toMatchObject({
      status: "FAILED",
      safeFailureCode: "AI_UNAVAILABLE",
      acceptedCount: 0,
    });
    expect(recommendation).toMatchObject({
      status: "UNAVAILABLE",
      safeFailureCode: "AI_UNAVAILABLE",
    });
    expect(sharedWaiting).toMatchObject({
      status: "PENDING",
      safeFailureCode: null,
    });
    expect(saved).toEqual([]);
  });

  it("fails closed and releases pending recommendations when every proposal is rejected", async () => {
    await databaseContext.db.insert(questionRecommendation).values({
      id: rejectedRecommendationId,
      userId,
      generationBatchId: rejectedBatchId,
      action: "SWAP",
      status: "PENDING",
    });
    const job = {
      ...claimedJob(rejectedBatchId),
      id: rejectedJobId,
      ownerId: userId,
    };
    await refillQuestionBank(
      job,
      helpers,
      dependencies(databaseQuestionSupplyStore, {
        semantic: {
          duplicate: false,
          confidence: 0.4,
          rationale: "Uncertain.",
        },
      }),
    );

    const [batch, recommendation, saved] = await Promise.all([
      databaseContext.db.query.questionGenerationBatch.findFirst({
        where: eq(questionGenerationBatch.id, rejectedBatchId),
      }),
      databaseContext.db.query.questionRecommendation.findFirst({
        where: eq(questionRecommendation.id, rejectedRecommendationId),
      }),
      databaseContext.db.query.question.findMany({
        where: eq(question.generationBatchId, rejectedBatchId),
      }),
    ]);
    expect(batch).toMatchObject({
      status: "FAILED",
      acceptedCount: 0,
      rejectedCount: 1,
      safeFailureCode: "QUESTION_VALIDATION_REJECTED",
    });
    expect(recommendation).toMatchObject({
      status: "UNAVAILABLE",
      safeFailureCode: "QUESTION_VALIDATION_REJECTED",
    });
    expect(saved).toEqual([]);
  });

  it("atomically counts a publication-time hash conflict as rejected", async () => {
    await databaseContext.db.insert(questionGenerationBatch).values({
      id: collisionBatchId,
      triggeredByUserId: userId,
      status: "VALIDATING",
      mode: "OFFLINE",
      targetMix: [{ questionType: "opinion", topic: "government", count: 1 }],
      aiJobId: collisionJobId,
      promptVersion: "1.0.0",
      rubricVersion: "iwc-question-bank-refill-1.0.0",
    });
    await databaseContext.db.insert(question).values({
      id: collisionQuestionId,
      externalId: collisionExternalId,
      source: "AI_GENERATED",
      visibility: "public",
      ieltsTrack: "academic",
      questionType: "opinion",
      topic: "government",
      prompt:
        "Existing concurrent prompt that already owns this canonical external identity. Do you agree or disagree?",
    });

    await databaseQuestionSupplyStore.publish(
      collisionBatchId,
      { aiJobId: collisionJobId, attemptCount: 2 },
      [
        {
          externalId: collisionExternalId,
          source: "AI_GENERATED",
          visibility: "public",
          ownerId: null,
          ieltsTrack: "academic",
          questionType: "opinion",
          topic: "government",
          prompt:
            "Concurrent proposal that loses the canonical external identity race. Do you agree or disagree?",
          attribution: "IWC validated AI-generated question",
          bankVersion: "dynamic-1.0.0",
        },
      ],
      0,
    );

    expect(
      await databaseContext.db.query.questionGenerationBatch.findFirst({
        where: eq(questionGenerationBatch.id, collisionBatchId),
      }),
    ).toMatchObject({
      status: "FAILED",
      acceptedCount: 0,
      rejectedCount: 1,
      safeFailureCode: "QUESTION_VALIDATION_REJECTED",
    });
  });

  it("serializes overlapping successful deliveries and caps batch-linked rows at twelve", async () => {
    const first = Array.from({ length: 12 }, (_, index) =>
      publishableQuestion(
        `iwc-dynamic-${"a".repeat(62)}${index.toString(16).padStart(2, "0")}`,
        index,
      ),
    );
    const second = Array.from({ length: 12 }, (_, index) =>
      publishableQuestion(
        `iwc-dynamic-${"b".repeat(62)}${index.toString(16).padStart(2, "0")}`,
        index + 20,
      ),
    );
    const fence = { aiJobId: concurrentSuccessJobId, attemptCount: 2 };

    await Promise.all([
      databaseQuestionSupplyStore.publish(
        concurrentSuccessBatchId,
        fence,
        first,
        0,
      ),
      databaseQuestionSupplyStore.publish(
        concurrentSuccessBatchId,
        fence,
        second,
        0,
      ),
    ]);

    const [batch, rows] = await Promise.all([
      databaseContext.db.query.questionGenerationBatch.findFirst({
        where: eq(questionGenerationBatch.id, concurrentSuccessBatchId),
      }),
      databaseContext.db.query.question.findMany({
        where: eq(question.generationBatchId, concurrentSuccessBatchId),
      }),
    ]);
    expect(rows).toHaveLength(12);
    expect(batch).toMatchObject({
      status: "SUCCEEDED",
      acceptedCount: 12,
    });
  });

  it("lets the current recovered success win over a concurrent stale failure", async () => {
    const currentFence = { aiJobId: recoveredRaceJobId, attemptCount: 2 };
    const staleFence = { aiJobId: recoveredRaceJobId, attemptCount: 1 };

    await Promise.all([
      databaseQuestionSupplyStore.publish(
        recoveredRaceBatchId,
        currentFence,
        [publishableQuestion(`iwc-dynamic-${"c".repeat(64)}`, 100)],
        0,
      ),
      databaseQuestionSupplyStore.fail(
        recoveredRaceBatchId,
        staleFence,
        "AI_UNAVAILABLE",
      ),
    ]);

    const [batch, rows] = await Promise.all([
      databaseContext.db.query.questionGenerationBatch.findFirst({
        where: eq(questionGenerationBatch.id, recoveredRaceBatchId),
      }),
      databaseContext.db.query.question.findMany({
        where: eq(question.generationBatchId, recoveredRaceBatchId),
      }),
    ]);
    expect(batch).toMatchObject({
      status: "SUCCEEDED",
      acceptedCount: 1,
      safeFailureCode: null,
    });
    expect(rows).toHaveLength(1);
  });

  it("allows only one terminal winner when current success and failure overlap", async () => {
    const fence = { aiJobId: terminalRaceJobId, attemptCount: 2 };
    await Promise.all([
      databaseQuestionSupplyStore.publish(
        terminalRaceBatchId,
        fence,
        [publishableQuestion(`iwc-dynamic-${"d".repeat(64)}`, 101)],
        0,
      ),
      databaseQuestionSupplyStore.fail(
        terminalRaceBatchId,
        fence,
        "AI_UNAVAILABLE",
      ),
    ]);

    const [batch, rows] = await Promise.all([
      databaseContext.db.query.questionGenerationBatch.findFirst({
        where: eq(questionGenerationBatch.id, terminalRaceBatchId),
      }),
      databaseContext.db.query.question.findMany({
        where: eq(question.generationBatchId, terminalRaceBatchId),
      }),
    ]);
    expect(["SUCCEEDED", "FAILED"]).toContain(batch?.status);
    if (batch?.status === "SUCCEEDED") {
      expect(batch).toMatchObject({ acceptedCount: 1, safeFailureCode: null });
      expect(rows).toHaveLength(1);
    } else {
      expect(batch).toMatchObject({
        acceptedCount: 0,
        safeFailureCode: "AI_UNAVAILABLE",
      });
      expect(rows).toHaveLength(0);
    }
  });

  it("blocks a stale transition behind recovery and no-ops after the attempt advances", async () => {
    let releaseRecovery!: () => void;
    let recoveryAdvanced!: () => void;
    const recoveryRelease = new Promise<void>((resolve) => {
      releaseRecovery = resolve;
    });
    const recoveryReady = new Promise<void>((resolve) => {
      recoveryAdvanced = resolve;
    });
    const recovery = databaseContext.db.transaction(async (transaction) => {
      await transaction
        .select({ id: aiJob.id })
        .from(aiJob)
        .where(eq(aiJob.id, transitionRecoveryJobId))
        .for("update");
      await transaction
        .update(aiJob)
        .set({ attemptCount: 2 })
        .where(eq(aiJob.id, transitionRecoveryJobId));
      recoveryAdvanced();
      await recoveryRelease;
    });
    await recoveryReady;

    let staleSettled = false;
    const staleTransition = databaseQuestionSupplyStore
      .transitionBatch(
        transitionRecoveryBatchId,
        { aiJobId: transitionRecoveryJobId, attemptCount: 1 },
        { status: "VALIDATING" },
      )
      .then((applied) => {
        staleSettled = true;
        return applied;
      });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const settledBeforeRecoveryCommit = staleSettled;
    releaseRecovery();
    await recovery;

    expect(settledBeforeRecoveryCommit).toBe(false);
    await expect(staleTransition).resolves.toBe(false);
    expect(
      await databaseQuestionSupplyStore.transitionBatch(
        transitionRecoveryBatchId,
        { aiJobId: transitionRecoveryJobId, attemptCount: 2 },
        { status: "GENERATING" },
      ),
    ).toBe(true);
    expect(
      await databaseContext.db.query.questionGenerationBatch.findFirst({
        where: eq(questionGenerationBatch.id, transitionRecoveryBatchId),
      }),
    ).toMatchObject({ status: "GENERATING" });
  });

  it("dispatches question_bank_refill through runAIJob instead of the removed fail-closed placeholder", async () => {
    await runAIJob({ jobId: dispatchJobId }, { job: { attempts: 1 } } as never);

    const [job, batch] = await Promise.all([
      databaseContext.db.query.aiJob.findFirst({
        where: eq(aiJob.id, dispatchJobId),
      }),
      databaseContext.db.query.questionGenerationBatch.findFirst({
        where: eq(questionGenerationBatch.id, dispatchBatchId),
      }),
    ]);
    expect(job).toMatchObject({
      status: "SUCCEEDED",
      lastErrorCode: null,
      lastErrorSafeMessage: null,
    });
    expect(batch?.status).not.toBe("QUEUED");
    expect(batch?.safeFailureCode).not.toBe(
      "QUESTION_BANK_REFILL_NOT_IMPLEMENTED",
    );
  });
});
