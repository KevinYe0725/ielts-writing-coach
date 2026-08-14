import { beforeEach, describe, expect, it, vi } from "vitest";

const workerState = vi.hoisted(() => ({
  job: null as null | {
    id: string;
    ownerId: string;
    taskKind: string;
    protectedReference: Record<string, string>;
    versionSnapshot: Record<string, string>;
    attemptCount: number;
  },
  response: null as null | {
    id: string;
    lessonPlanId: string;
    userId: string;
    promptId: string;
    submittedAnswer: string;
    responseMode: "SHORT_TEXT" | "CHOICE";
    status: string;
    aiJobId: string | null;
    analysis: Record<string, unknown> | null;
  },
  responseVisible: true,
  lessonPlan: null as null | {
    id: string;
    paperContent: Record<string, unknown> | null;
  },
  providerValue: null as unknown,
  providerError: undefined as unknown,
  providerRequests: [] as Array<Record<string, unknown>>,
  updatedTables: [] as unknown[],
  insertedTables: [] as unknown[],
  transactionCalls: 0,
  casAffected: true,
  failure: undefined as unknown,
  succeeded: 0,
  responseQueryArgs: undefined as unknown,
}));

vi.mock("../runtime", () => ({
  adapterForJob: vi.fn(async () => ({
    generateStructured: vi.fn(async (request: Record<string, unknown>) => {
      workerState.providerRequests.push(request);
      if (workerState.providerError !== undefined)
        throw workerState.providerError;
      const validate = request.validate as
        | ((value: unknown) => boolean)
        | undefined;
      if (validate && !validate(workerState.providerValue))
        throw new TypeError("Provider value did not match the typed schema.");
      return {
        value: workerState.providerValue,
        model: "test-model",
        responseId: "provider-response-1",
        usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
      };
    }),
  })),
  claimAIJob: vi.fn(async () => workerState.job),
  createChildJob: vi.fn(),
  databaseContext: {
    db: {
      query: {
        teachingPracticeResponse: {
          findFirst: vi.fn(async (args: unknown) => {
            workerState.responseQueryArgs = args;
            return workerState.responseVisible
              ? workerState.response
              : undefined;
          }),
        },
        lessonPlan: {
          findFirst: vi.fn(async () => workerState.lessonPlan),
        },
      },
      update: vi.fn((table: unknown) => {
        workerState.updatedTables.push(table);
        return {
          set: vi.fn((values: Record<string, unknown>) => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => {
                if (
                  !workerState.casAffected ||
                  !workerState.response ||
                  workerState.response.aiJobId !== workerState.job?.id
                )
                  return [];
                Object.assign(workerState.response, values);
                return [{ id: workerState.response.id }];
              }),
            })),
          })),
        };
      }),
      insert: vi.fn((table: unknown) => {
        workerState.insertedTables.push(table);
        throw new Error("Tutorial analysis must not insert domain rows.");
      }),
      transaction: vi.fn(async () => {
        workerState.transactionCalls += 1;
        throw new Error("Tutorial analysis must not mutate learning state.");
      }),
    },
  },
  markJobFailure: vi.fn(async (_job: unknown, error: unknown) => {
    workerState.failure = error;
  }),
  markJobSucceeded: vi.fn(async () => {
    workerState.succeeded += 1;
  }),
}));

import { teachingPracticeResponse } from "@iwc/db";

import { runAIJob } from "./ai";

const IMMUTABLE_ANSWER =
  "Protected lanes reduce perceived danger, so more commuters choose bicycles for daily journeys.";
const TIMED_PAPER_SENTINEL = "PRIVATE_TIMED_PAPER_ANSWER_SENTINEL";
const PRIVATE_PROMPT_SENTINEL = "PRIVATE_PROMPT_FIELD_SENTINEL";

function canonicalPaperContent(): Record<string, unknown> {
  return {
    teachingModule: {
      format: "ADAPTIVE_ARTICLE_V1",
      blueprint: {
        coreAbilityZh: "解释原因如何通过中间机制产生具体结果",
        coreAbilityEn:
          "Explain how a cause produces a concrete result through a mechanism",
        completionStandardZh: "独立写出原因、机制和具体结果。",
        completionStandardEn:
          "Independently state a cause, mechanism, and concrete result.",
        privatePlanningNote: "PRIVATE_BLUEPRINT_SENTINEL",
      },
      sections: [
        {
          anchor: "practice",
          blocks: [
            {
              kind: "PRACTICE",
              prompts: [
                {
                  id: "bike-lanes",
                  instructionZh: "用英文解释自行车道如何改变通勤者的选择。",
                  instructionEn:
                    "Explain in English how protected bicycle lanes can change commuters' choices.",
                  promptEn:
                    "A city adds protected bicycle lanes to several busy roads.",
                  responseMode: "SHORT_TEXT",
                  context: "UNSEEN_TOPIC",
                  optionsEn: [],
                  referenceAnswerEn:
                    "Protected lanes reduce perceived risk, which encourages more people to cycle.",
                  referenceReasoningZh:
                    "这只是一个可能路径：先降低风险感受，再改变通勤选择。",
                  referenceReasoningEn:
                    "This is one possible route: lower perceived risk before changing commuter choice.",
                  privateTeacherNote: PRIVATE_PROMPT_SENTINEL,
                },
              ],
            },
          ],
        },
      ],
    },
    paper: {
      items: [
        { id: "timed-question", acceptedAnswers: [TIMED_PAPER_SENTINEL] },
      ],
    },
  };
}

function judgment(overrides: Record<string, unknown> = {}) {
  return {
    disposition: "SUPPORTED",
    strengths: [
      { code: "EXPLICIT_CAUSAL_LINK", evidence: "reduce perceived danger" },
    ],
    comparisons: [
      { code: "VALID_ALTERNATIVE_PATH", evidence: "daily journeys" },
    ],
    improvements: [],
    confidence: 0.94,
    ...overrides,
  };
}

async function run(): Promise<void> {
  await runAIJob({ jobId: workerState.job?.id }, {
    job: { attempts: 1 },
  } as never);
}

function analysis(): Record<string, unknown> {
  if (!workerState.response?.analysis)
    throw new Error("Expected persisted analysis atoms.");
  return workerState.response.analysis;
}

beforeEach(() => {
  vi.clearAllMocks();
  workerState.job = {
    id: "job-teaching-analysis-1",
    ownerId: "learner-1",
    taskKind: "teaching_practice_analysis",
    protectedReference: {
      teachingPracticeResponseId: "teaching-response-1",
    },
    versionSnapshot: {
      model: "test-model",
      providerKind: "openai",
    },
    attemptCount: 1,
  };
  workerState.response = {
    id: "teaching-response-1",
    lessonPlanId: "lesson-1",
    userId: "learner-1",
    promptId: "bike-lanes",
    submittedAnswer: IMMUTABLE_ANSWER,
    responseMode: "SHORT_TEXT",
    status: "ANALYSIS_PENDING",
    aiJobId: "job-teaching-analysis-1",
    analysis: null,
  };
  workerState.responseVisible = true;
  workerState.lessonPlan = {
    id: "lesson-1",
    paperContent: canonicalPaperContent(),
  };
  workerState.providerValue = judgment();
  workerState.providerError = undefined;
  workerState.providerRequests = [];
  workerState.updatedTables = [];
  workerState.insertedTables = [];
  workerState.transactionCalls = 0;
  workerState.casAffected = true;
  workerState.failure = undefined;
  workerState.succeeded = 0;
  workerState.responseQueryArgs = undefined;
});

describe("teaching-practice typed analysis worker", () => {
  it.each([
    {},
    {
      teachingPracticeResponseId: "teaching-response-1",
      submittedAnswer: "PROTECTED_REFERENCE_ANSWER_SENTINEL",
    },
  ])(
    "rejects a non-minimal protected reference",
    async (protectedReference) => {
      if (!workerState.job) throw new Error("Missing job fixture.");
      workerState.job.protectedReference = protectedReference;

      await run();

      expect(workerState.providerRequests).toHaveLength(0);
      expect(workerState.updatedTables).toHaveLength(0);
      expect(workerState.failure).toBeInstanceOf(Error);
    },
  );

  it("requires the protected response to belong to the job owner", async () => {
    if (!workerState.response) throw new Error("Missing response fixture.");
    workerState.response.userId = "different-learner";

    await run();

    expect(workerState.providerRequests).toHaveLength(0);
    expect(workerState.updatedTables).toHaveLength(0);
  });

  it("requests only typed atoms and persists exact evidence without provider prose", async () => {
    await run();

    const request = workerState.providerRequests[0] as {
      input: string;
      schemaName: string;
      schema: Record<string, unknown>;
    };
    expect(request.schemaName).toBe("iwc_teaching_practice_analysis_v2");
    expect(request.input).toContain(IMMUTABLE_ANSWER);
    expect(request.input).toContain(
      "Return only the allowed disposition and atom codes",
    );
    expect(request.input).not.toContain(TIMED_PAPER_SENTINEL);
    expect(request.input).not.toContain(PRIVATE_PROMPT_SENTINEL);
    expect(request.input).not.toContain("PRIVATE_BLUEPRINT_SENTINEL");
    expect(JSON.stringify(request.schema)).not.toContain("summaryEn");
    expect(JSON.stringify(request.schema)).not.toContain("improvedAnswerEn");
    expect(workerState.response?.status).toBe("ANALYSIS_READY");
    expect(analysis()).toEqual({
      kind: "PERSONALIZED_ATOMS_V1",
      strengths: [
        { code: "EXPLICIT_CAUSAL_LINK", evidence: "reduce perceived danger" },
      ],
      comparisons: [
        { code: "VALID_ALTERNATIVE_PATH", evidence: "daily journeys" },
      ],
      improvements: [],
      uncertainty: "NONE",
    });
    expect(JSON.stringify(analysis())).not.toMatch(
      /summary|feedback|rewrite|improvedAnswer|nextCheck|provider|model/i,
    );
    expect(workerState.updatedTables).toEqual([teachingPracticeResponse]);
    expect(workerState.insertedTables).toEqual([]);
    expect(workerState.transactionCalls).toBe(0);
  });

  it("keeps assessment wording only as an exact learner-owned quotation", async () => {
    if (!workerState.response) throw new Error("Missing response fixture.");
    workerState.response.submittedAnswer =
      "The paragraph explains why test scores should not define ability.";
    workerState.providerValue = judgment({
      strengths: [{ code: "DIRECT_RESPONSE", evidence: "test scores" }],
      comparisons: [],
    });

    await run();

    expect(analysis()).toMatchObject({
      strengths: [{ code: "DIRECT_RESPONSE", evidence: "test scores" }],
    });
  });

  it("keeps one supported improvement atom and never accepts a provider rewrite", async () => {
    workerState.providerValue = judgment({
      improvements: [
        { code: "MAKE_OUTCOME_SPECIFIC", evidence: "daily journeys" },
      ],
    });

    await run();

    expect(analysis()).toMatchObject({
      improvements: [
        { code: "MAKE_OUTCOME_SPECIFIC", evidence: "daily journeys" },
      ],
    });
    expect(analysis()).not.toHaveProperty("improvedAnswerEn");
  });

  it("drops unsupported atoms and records only fixed partial-evidence state", async () => {
    workerState.providerValue = judgment({
      strengths: [
        { code: "DIRECT_RESPONSE", evidence: "INVENTED EVIDENCE" },
        { code: "EXPLICIT_CAUSAL_LINK", evidence: "reduce perceived danger" },
      ],
      comparisons: [{ code: "DIFFERENT_FOCUS", evidence: "Daily Journeys" }],
      improvements: [
        { code: "MAKE_OUTCOME_SPECIFIC", evidence: "daily journeys" },
      ],
    });

    await run();

    expect(analysis()).toEqual({
      kind: "PERSONALIZED_ATOMS_V1",
      strengths: [
        { code: "EXPLICIT_CAUSAL_LINK", evidence: "reduce perceived danger" },
      ],
      comparisons: [],
      improvements: [
        { code: "MAKE_OUTCOME_SPECIFIC", evidence: "daily journeys" },
      ],
      uncertainty: "PARTIAL_EVIDENCE",
    });
  });

  it.each([
    {
      label: "SUPPORTED with no attempted atom",
      value: judgment({ strengths: [], comparisons: [], improvements: [] }),
    },
    {
      label: "SUPPORTED after every attempted evidence span is rejected",
      value: judgment({
        strengths: [{ code: "DIRECT_RESPONSE", evidence: "invented span" }],
        comparisons: [],
        improvements: [],
      }),
    },
    {
      label: "NO_CLEAR_IMPROVEMENT with no supported observation",
      value: judgment({
        disposition: "NO_CLEAR_IMPROVEMENT",
        strengths: [],
        comparisons: [],
        improvements: [],
      }),
    },
  ])(
    "keeps $label retryable instead of presenting an evidence-free judgment",
    async ({ value }) => {
      workerState.providerValue = value;

      await run();

      expect(workerState.response?.status).toBe("ANALYSIS_UNAVAILABLE");
      expect(analysis()).toEqual({
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [],
        comparisons: [],
        improvements: [],
        uncertainty: "PARTIAL_EVIDENCE",
      });
    },
  );

  it("allows NO_CLEAR_IMPROVEMENT only when an exact supported observation remains", async () => {
    workerState.providerValue = judgment({
      disposition: "NO_CLEAR_IMPROVEMENT",
      strengths: [
        { code: "EXPLICIT_CAUSAL_LINK", evidence: "reduce perceived danger" },
      ],
      comparisons: [],
      improvements: [],
    });

    await run();

    expect(workerState.response?.status).toBe("ANALYSIS_READY");
    expect(analysis()).toMatchObject({
      strengths: [
        { code: "EXPLICIT_CAUSAL_LINK", evidence: "reduce perceived danger" },
      ],
      improvements: [],
    });
  });

  it("does not retain an improvement for NO_CLEAR_IMPROVEMENT", async () => {
    workerState.providerValue = judgment({
      disposition: "NO_CLEAR_IMPROVEMENT",
      improvements: [
        { code: "MAKE_OUTCOME_SPECIFIC", evidence: "daily journeys" },
      ],
    });

    await run();

    expect(analysis()).toMatchObject({
      improvements: [],
      uncertainty: "PARTIAL_EVIDENCE",
    });
  });

  it.each([
    { disposition: "INSUFFICIENT_EVIDENCE", confidence: 0.9 },
    { disposition: "SUPPORTED", confidence: 0.1 },
  ])(
    "keeps $disposition or low-confidence analysis retryable",
    async ({ disposition, confidence }) => {
      workerState.providerValue = judgment({ disposition, confidence });

      await run();

      expect(workerState.response?.status).toBe("ANALYSIS_UNAVAILABLE");
      expect(analysis()).toEqual({
        kind: "PERSONALIZED_ATOMS_V1",
        strengths: [],
        comparisons: [],
        improvements: [],
        uncertainty: "PARTIAL_EVIDENCE",
      });
      await run();
      expect(workerState.providerRequests).toHaveLength(1);
    },
  );

  it("rejects provider-authored prose at schema validation", async () => {
    workerState.providerValue = {
      ...judgment(),
      summaryEn: "Your answer receives a passing grade.",
    };

    await run();

    expect(workerState.failure).toBeInstanceOf(TypeError);
    expect(workerState.response?.analysis).toBeNull();
    expect(workerState.updatedTables).toEqual([]);
  });

  it("derives a non-judgmental DEMO_ONLY projection from the mock provider", async () => {
    if (!workerState.job) throw new Error("Missing job fixture.");
    workerState.job.versionSnapshot.providerKind = "mock";
    workerState.providerValue = {
      disposition: "INSUFFICIENT_EVIDENCE",
      strengths: [],
      comparisons: [],
      improvements: [],
      confidence: 0,
    };

    await run();

    expect(workerState.response?.status).toBe("DEMO_ONLY");
    expect(analysis()).toMatchObject({
      kind: "DEMO_ONLY",
      strengths: [],
      comparisonPoints: [],
    });
    expect(JSON.stringify(analysis())).not.toMatch(/score|grade|band|passed/i);
  });

  it("does not invoke the provider or write when this job is stale", async () => {
    if (!workerState.response) throw new Error("Missing response fixture.");
    workerState.response.aiJobId = "newer-retry-job";

    await run();

    expect(workerState.providerRequests).toHaveLength(0);
    expect(workerState.updatedTables).toHaveLength(0);
  });

  it("cannot overwrite a newer retry when compare-and-set loses the race", async () => {
    workerState.casAffected = false;

    await run();

    expect(workerState.providerRequests).toHaveLength(1);
    expect(workerState.response?.analysis).toBeNull();
    expect(workerState.response?.status).toBe("ANALYSIS_PENDING");
  });

  it("is idempotent when the same completed job is delivered again", async () => {
    await run();
    const first = structuredClone(analysis());

    await run();

    expect(workerState.providerRequests).toHaveLength(1);
    expect(analysis()).toEqual(first);
  });

  it("uses only durable job failure handling when the provider fails", async () => {
    workerState.providerError = new Error("provider unavailable");

    await run();

    expect(workerState.failure).toBe(workerState.providerError);
    expect(workerState.response?.analysis).toBeNull();
    expect(workerState.updatedTables).toEqual([]);
    expect(workerState.transactionCalls).toBe(0);
  });

  it("does not analyze or mutate when the canonical tutorial prompt is malformed", async () => {
    workerState.lessonPlan = {
      id: "lesson-1",
      paperContent: { teachingModule: { sections: [] } },
    };

    await run();

    expect(workerState.providerRequests).toHaveLength(0);
    expect(workerState.updatedTables).toHaveLength(0);
    expect(workerState.failure).toBeInstanceOf(Error);
  });
});
