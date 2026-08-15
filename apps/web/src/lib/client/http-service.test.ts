import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DraftConflictError, LearningClientError } from "./errors";
import { HttpLearningClient } from "./http-service";
import { createLearningClient } from "./index";
import { AI_TASK_KINDS } from "./types";
import { renderTeachingPracticeAnalysisAtoms } from "@iwc/learning-contracts";
import {
  collocationControlTeachingFixture,
  mechanismChainTeachingFixture,
  MockLearningClient,
} from "./mock-service";
import type {
  FocusedTeachingData,
  TeachingPracticeAnalysis,
  TeachingPracticePrompt,
  TeachingPracticeResponseData,
} from "./types";

const tutorialShortTextPrompt: TeachingPracticePrompt = {
  id: "workplace-link",
  instructionZh: "用一句英文补出灵活工作与生产力之间的机制。",
  instructionEn: "Write one sentence that links flexible work to productivity.",
  promptEn: "Flexible schedules can improve employee productivity because …",
  responseMode: "SHORT_TEXT",
  context: "SAME_TOPIC",
  optionsEn: [],
  referenceAnswerEn:
    "Employees can reserve demanding tasks for the hours when they concentrate best.",
  referenceReasoningZh: "参考答案说明灵活时间如何改变任务安排。",
  referenceReasoningEn:
    "The reference shows how flexible time changes task scheduling.",
};

const tutorialAnswer =
  "Employees can protect longer periods for demanding work.";

const validPersonalizedAtoms = {
  kind: "PERSONALIZED_ATOMS_V1" as const,
  strengths: [
    { code: "SPECIFIC_MECHANISM" as const, evidence: "protect longer periods" },
  ],
  comparisons: [
    { code: "VALID_ALTERNATIVE_PATH" as const, evidence: "demanding work" },
  ],
  improvements: [
    { code: "MAKE_OUTCOME_SPECIFIC" as const, evidence: "demanding work" },
  ],
  uncertainty: "NONE" as const,
};

const validPersonalizedAnalysis: TeachingPracticeAnalysis =
  renderTeachingPracticeAnalysisAtoms(validPersonalizedAtoms);

const savedPersonalizedResponse: TeachingPracticeResponseData = {
  id: "019-safe-personalized",
  promptId: tutorialShortTextPrompt.id,
  submittedAnswer: tutorialAnswer,
  responseMode: "SHORT_TEXT",
  analysisState: "ANALYSIS_READY",
  analysis: validPersonalizedAnalysis,
};

describe("browser-safe core imports", () => {
  it("keeps the next-action wire guard out of the validator barrel", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./http-service.ts", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("const NEXT_ACTION_KINDS = [");
    expect(source).not.toContain('from "@iwc/learning-core"');
  });
});

describe("legacy practice recovery client", () => {
  it("returns a safe continuation state instead of waiting on a blocked replacement", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toContain("/lessons/lesson-legacy/replace");
      return jsonResponse({
        replacement_started: true,
        lesson_id: null,
        job_id: "legacy-recovery-job",
        job_status: "WAITING_FOR_CONSENT",
      });
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const result = (await client.replaceLegacyLesson(
      "lesson-legacy",
    )) as unknown;

    expect(result).toEqual({
      state: "CONTINUING_SAFELY",
      jobId: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns a safe continuation state without exposing the failed recovery details", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        replacement_started: false,
        lesson_id: null,
        job_id: null,
        job_status: "CONTINUING_SAFELY",
      }),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(client.replaceLegacyLesson("lesson-legacy")).resolves.toEqual({
      state: "CONTINUING_SAFELY",
      jobId: null,
    });
  });
});

function problem(status: number, code: string): Response {
  return jsonResponse(
    {
      title: "Tutorial request failed",
      status,
      detail: "The tutorial request could not be completed.",
      code,
    },
    { status },
  );
}

const adaptiveTeachingPayload: Omit<FocusedTeachingData, "id" | "cycleId"> = {
  format: "ADAPTIVE_ARTICLE_V1",
  titleZh: "把因果论证中间的一步讲清楚",
  titleEn: "Make the missing step in causal reasoning visible",
  introductionZh:
    "这篇教程集中训练如何解释一个原因经过什么过程产生可观察的结果。",
  introductionEn:
    "This tutorial focuses on showing how a cause produces an observable result.",
  estimatedMinutes: 16,
  sections: [
    {
      anchor: "understand-the-link",
      titleZh: "先理解什么是机制",
      titleEn: "Understand the mechanism",
      blocks: [
        {
          kind: "EXPLANATION",
          titleZh: "机制连接起点与终点",
          titleEn: "A mechanism connects the start and the result",
          paragraphsZh: [
            "原因说明起点，结果说明终点，而机制说明中间发生了什么变化。",
          ],
          paragraphsEn: [
            "A cause gives the starting condition, while a mechanism shows what changes before the result appears.",
          ],
          keyPointZh: "有效的机制会增加一个新的中间步骤。",
          keyPointEn: "An effective mechanism adds a new intermediate step.",
        },
        {
          kind: "REASONING",
          titleZh: "从直接变化推出最终影响",
          titleEn: "Reason from an immediate change to a final effect",
          scenarioZh: "为什么独立自行车道可以改善通勤？",
          scenarioEn: "Why can separated cycle lanes improve commuting?",
          steps: [
            {
              thinkingZh: "先找直接变化：骑行者不再与汽车争抢道路空间。",
              thinkingEn:
                "Find the immediate change: cyclists no longer compete with cars for the same space.",
            },
            {
              thinkingZh: "再找行为变化：更多人愿意骑车完成短途通勤。",
              thinkingEn:
                "Find the behavior change: more people are willing to cycle on short journeys.",
            },
          ],
          resultEn:
            "Separated lanes make short journeys feel safer, encouraging some commuters to replace car trips and reducing pressure on busy roads.",
          takeawayZh: "依次检查直接变化、行为变化和可观察结果。",
          takeawayEn:
            "Check the immediate change, behavior change, and observable result.",
        },
      ],
    },
    {
      anchor: "apply-the-method",
      titleZh: "换一个话题应用",
      titleEn: "Apply the method in a new topic",
      blocks: [
        {
          kind: "PRACTICE",
          titleZh: "主动补出中间机制",
          titleEn: "Generate the missing mechanism",
          prompts: [
            {
              id: "workplace-link",
              instructionZh: "用一句英文补出灵活工作与生产力之间的机制。",
              instructionEn:
                "Write one sentence that links flexible work to productivity.",
              promptEn:
                "Flexible schedules can improve employee productivity because …",
              responseMode: "SHORT_TEXT",
              context: "SAME_TOPIC",
              optionsEn: [],
              referenceAnswerEn:
                "Employees can reserve demanding tasks for the hours when they concentrate best.",
              referenceReasoningZh: "参考答案说明灵活时间如何改变任务安排。",
              referenceReasoningEn:
                "The reference shows how flexible time changes task scheduling.",
            },
            {
              id: "waste-transfer",
              instructionZh: "在环境话题中写出一条两句的机制链。",
              instructionEn:
                "Write a two-sentence mechanism chain for an environmental topic.",
              promptEn:
                "Explain how charging households for excess waste could reduce landfill use.",
              responseMode: "SHORT_TEXT",
              context: "UNSEEN_TOPIC",
              optionsEn: [],
              referenceAnswerEn:
                "A direct charge makes unnecessary disposal more expensive. Households therefore have a reason to reuse products and separate recyclable material.",
              referenceReasoningZh:
                "价格变化先影响家庭选择，再影响进入填埋场的废物量。",
              referenceReasoningEn:
                "The price change affects household choices before it changes landfill waste.",
            },
          ],
        },
        {
          kind: "SUMMARY",
          titleZh: "写作时只检查三件事",
          titleEn: "Three checks for the next essay",
          rulesZh: [
            "原因和结果之间增加新的中间步骤。",
            "让中间步骤回答影响如何发生。",
            "以可以观察的具体结果收束。",
          ],
          rulesEn: [
            "Add a new intermediate step.",
            "Make it explain how the effect happens.",
            "Finish with an observable result.",
          ],
          selfCheckZh: "删掉中间句后推理是否几乎没有变化？",
          selfCheckEn:
            "If the middle sentence disappears, does the reasoning remain almost unchanged?",
        },
      ],
    },
  ],
};

function jsonResponse(
  body: unknown,
  init: ResponseInit & { headers?: HeadersInit } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set(
    "content-type",
    headers.get("content-type") ?? "application/json",
  );
  return new Response(JSON.stringify(body), { ...init, headers });
}

function requestHeaders(call: unknown[]): Headers {
  const init = call[1] as RequestInit;
  return new Headers(init.headers);
}

describe("HttpLearningClient protocol", () => {
  it("returns a saved tutorial answer immediately without reading an AI job", async () => {
    const safeResponse = {
      id: "019teaching-response",
      promptId: tutorialShortTextPrompt.id,
      submittedAnswer:
        "Employees can plan demanding work for their most productive hours.",
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_PENDING",
      analysis: null,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ response: safeResponse }, { status: 202 }),
      );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "tutorial-submit-1",
      origin: "https://coach.test",
    });

    await expect(
      client.submitTeachingPracticeAnswer(
        "lesson-1",
        tutorialShortTextPrompt,
        safeResponse.submittedAnswer,
      ),
    ).resolves.toEqual(safeResponse);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://coach.test/api/v1/lessons/lesson-1/teaching-practice/workplace-link/responses",
    );
    expect(
      fetcher.mock.calls.some(([input]) => String(input).includes("/ai-jobs/")),
    ).toBe(false);
    expect(
      JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body)),
    ).toEqual({
      answer: safeResponse.submittedAnswer,
    });
  });

  it("routes a newly configured provider to every learner task including tutorial analysis", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ provider: { id: "provider-tutorial" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ routes: [] }));
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "provider-all-tasks",
      origin: "https://coach.test",
    });

    await client.configureAiConnection({
      provider: "compatible",
      providerVendor: "custom",
      baseUrl: "https://models.example.test/v1",
      apiKey: "test-only",
      model: "custom-model",
      secretSource: "encrypted",
    });
    const routeBody = JSON.parse(
      String((fetcher.mock.calls[1]?.[1] as RequestInit).body),
    );
    expect(routeBody.tasks).toEqual([...AI_TASK_KINDS]);
    expect(routeBody.tasks).toContain("teaching_practice_analysis");
    expect(new Set(routeBody.tasks).size).toBe(routeBody.tasks.length);
  });

  it("restores through the safe response resource and retries through the dedicated endpoint", async () => {
    const saved = {
      id: "019teaching-response",
      promptId: tutorialShortTextPrompt.id,
      submittedAnswer: "A saved immutable answer.",
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_UNAVAILABLE",
      analysis: null,
    } as const;
    const pending = { ...saved, analysisState: "ANALYSIS_PENDING" as const };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ response: saved }))
      .mockResolvedValueOnce(
        jsonResponse({ response: pending }, { status: 202 }),
      );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "tutorial-retry-1",
      origin: "https://coach.test",
    });

    await expect(
      client.getTeachingPracticeResponse(
        "lesson-1",
        tutorialShortTextPrompt.id,
      ),
    ).resolves.toEqual(saved);
    await expect(client.retryTeachingPracticeAnalysis(saved)).resolves.toEqual(
      pending,
    );
    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
      "https://coach.test/api/v1/lessons/lesson-1/teaching-practice/workplace-link/responses",
      "https://coach.test/api/v1/teaching-practice-responses/019teaching-response/retry",
    ]);
    expect(
      fetcher.mock.calls.some(([input]) => String(input).includes("/ai-jobs/")),
    ).toBe(false);
  });

  it("keeps the exact answer usable when tutorial analysis cannot be reached", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "tutorial-offline-1",
      origin: "https://coach.test",
      sleep: async () => undefined,
    });
    const answer = "  My exact answer remains visible.  ";

    await expect(
      client.submitTeachingPracticeAnswer(
        "lesson-1",
        tutorialShortTextPrompt,
        answer,
      ),
    ).resolves.toMatchObject({
      promptId: tutorialShortTextPrompt.id,
      submittedAnswer: answer,
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_UNAVAILABLE",
      analysis: null,
    });
  });

  it("recovers a malformed completed analysis as unavailable without discarding the answer", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        response: {
          id: "019-safe-malformed",
          promptId: tutorialShortTextPrompt.id,
          submittedAnswer: "The answer must remain visible.",
          responseMode: "SHORT_TEXT",
          analysisState: "ANALYSIS_READY",
          analysis: null,
        },
      }),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(
      client.getTeachingPracticeResponse(
        "lesson-1",
        tutorialShortTextPrompt.id,
      ),
    ).resolves.toMatchObject({
      submittedAnswer: "The answer must remain visible.",
      analysisState: "ANALYSIS_UNAVAILABLE",
      analysis: null,
    });
  });

  it("accepts one strictly projected personalized analysis and drops internal fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        response: {
          ...savedPersonalizedResponse,
          jobId: "private-job",
          model: "private-model",
          analysis: validPersonalizedAtoms,
        },
      }),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const result = await client.getTeachingPracticeResponse(
      "lesson-1",
      tutorialShortTextPrompt.id,
    );
    expect(result).toEqual(savedPersonalizedResponse);
    expect(Object.keys(result ?? {}).sort()).toEqual([
      "analysis",
      "analysisState",
      "id",
      "promptId",
      "responseMode",
      "submittedAnswer",
    ]);
    expect(result?.analysis).not.toHaveProperty("confidence");
    expect(result?.analysis).not.toHaveProperty("score");
  });

  it.each([
    {
      label: "empty strength evidence",
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_READY",
      analysis: {
        ...validPersonalizedAnalysis,
        strengths: [
          {
            zh: "无证据判断",
            en: "Unsupported judgment",
            userAnswerEvidence: [],
          },
        ],
      },
    },
    {
      label: "standalone rewrite",
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_READY",
      analysis: {
        ...validPersonalizedAnalysis,
        keyImprovement: undefined,
        improvedAnswerEn: "A rewrite without a supported improvement.",
      },
    },
    {
      label: "judgment-bearing demo",
      responseMode: "SHORT_TEXT",
      analysisState: "DEMO_ONLY",
      analysis: {
        kind: "DEMO_ONLY",
        summary: { zh: "演示", en: "Demo" },
        strengths: [
          {
            zh: "语法很好",
            en: "Your grammar is strong",
            userAnswerEvidence: ["Employees"],
          },
        ],
        comparisonPoints: [],
        improvedAnswerEn: "A rewritten answer.",
        nextCheck: { zh: "检查", en: "Check" },
        uncertainty: {
          zh: "这里只演示流程。",
          en: "This only demonstrates the flow.",
        },
      },
    },
    {
      label: "demo without uncertainty",
      responseMode: "SHORT_TEXT",
      analysisState: "DEMO_ONLY",
      analysis: {
        kind: "DEMO_ONLY",
        summary: { zh: "演示", en: "Demo" },
        strengths: [],
        comparisonPoints: [],
        nextCheck: { zh: "检查", en: "Check" },
      },
    },
    {
      label: "too many strengths",
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_READY",
      analysis: {
        ...validPersonalizedAnalysis,
        strengths: [
          validPersonalizedAnalysis.strengths[0],
          validPersonalizedAnalysis.strengths[0],
          validPersonalizedAnalysis.strengths[0],
        ],
      },
    },
    {
      label: "too many comparisons",
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_READY",
      analysis: {
        ...validPersonalizedAnalysis,
        comparisonPoints: [
          validPersonalizedAnalysis.comparisonPoints[0],
          validPersonalizedAnalysis.comparisonPoints[0],
          validPersonalizedAnalysis.comparisonPoints[0],
          validPersonalizedAnalysis.comparisonPoints[0],
        ],
      },
    },
    {
      label: "too many evidence spans",
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_READY",
      analysis: {
        ...validPersonalizedAnalysis,
        strengths: [
          {
            ...validPersonalizedAnalysis.strengths[0],
            userAnswerEvidence: [
              "Employees",
              "protect",
              "longer",
              "periods",
              "demanding work",
            ],
          },
        ],
      },
    },
    {
      label: "invented learner evidence",
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_READY",
      analysis: {
        ...validPersonalizedAnalysis,
        strengths: [
          {
            ...validPersonalizedAnalysis.strengths[0],
            userAnswerEvidence: ["words absent from the learner answer"],
          },
        ],
      },
    },
    {
      label: "personalized analysis on choice response",
      responseMode: "CHOICE",
      analysisState: "ANALYSIS_READY",
      analysis: validPersonalizedAnalysis,
    },
    {
      label: "deterministic analysis on short text response",
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_READY",
      analysis: {
        ...validPersonalizedAnalysis,
        kind: "DETERMINISTIC_CHOICE",
      },
    },
    {
      label: "ready analysis while state is pending",
      responseMode: "SHORT_TEXT",
      analysisState: "ANALYSIS_PENDING",
      analysis: validPersonalizedAnalysis,
    },
    {
      label: "choice response marked pending without analysis",
      responseMode: "CHOICE",
      analysisState: "ANALYSIS_PENDING",
      analysis: null,
    },
    {
      label: "choice response marked reference-ready without analysis",
      responseMode: "CHOICE",
      analysisState: "REFERENCE_READY",
      analysis: null,
    },
  ])(
    "collapses malformed analysis to an unavailable non-judgmental resource: $label",
    async ({ responseMode, analysisState, analysis }) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
        jsonResponse({
          response: {
            id: "019-malformed-present",
            promptId: tutorialShortTextPrompt.id,
            submittedAnswer: tutorialAnswer,
            responseMode,
            analysisState,
            analysis,
          },
        }),
      );
      const client = new HttpLearningClient({
        baseUrl: "https://coach.test/api/v1",
        fetch: fetcher,
        origin: "https://coach.test",
      });

      await expect(
        client.getTeachingPracticeResponse(
          "lesson-1",
          tutorialShortTextPrompt.id,
        ),
      ).resolves.toEqual({
        id: "019-malformed-present",
        promptId: tutorialShortTextPrompt.id,
        submittedAnswer: tutorialAnswer,
        responseMode,
        analysisState: "ANALYSIS_UNAVAILABLE",
        analysis: null,
      });
    },
  );

  it("neutralizes a structurally valid demo instead of trusting learner judgments in its text", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        response: {
          id: "019-demo-neutral",
          promptId: tutorialShortTextPrompt.id,
          submittedAnswer: tutorialAnswer,
          responseMode: "SHORT_TEXT",
          analysisState: "DEMO_ONLY",
          analysis: {
            kind: "DEMO_ONLY",
            summary: { zh: "你的语法很好。", en: "Your grammar is excellent." },
            strengths: [],
            comparisonPoints: [],
            nextCheck: { zh: "你已经掌握。", en: "You have mastered this." },
            uncertainty: { zh: "置信度很高。", en: "Confidence is high." },
          },
        },
      }),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const result = await client.getTeachingPracticeResponse(
      "lesson-1",
      tutorialShortTextPrompt.id,
    );
    expect(result).toMatchObject({
      analysisState: "DEMO_ONLY",
      analysis: {
        kind: "DEMO_ONLY",
        strengths: [],
        comparisonPoints: [],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /grammar is excellent|语法很好|mastered|已经掌握|confidence is high|置信度很高/i,
    );
  });

  it.each([
    { label: "network", kind: "network" },
    { label: "rate limit", kind: "status", status: 429 },
    { label: "server failure", kind: "status", status: 500 },
    { label: "temporary outage", kind: "status", status: 503 },
    { label: "malformed success", kind: "malformed" },
  ])(
    "keeps the exact local submission on recoverable $label failure",
    async ({ kind, status }) => {
      const fetcher = vi.fn<typeof fetch>();
      if (kind === "network") fetcher.mockRejectedValue(new Error("offline"));
      else if (kind === "malformed")
        fetcher.mockResolvedValue(jsonResponse({ response: { broken: true } }));
      else
        fetcher.mockResolvedValue(
          problem(status ?? 500, `RECOVERABLE_${status ?? 500}`),
        );
      const client = new HttpLearningClient({
        baseUrl: "https://coach.test/api/v1",
        fetch: fetcher,
        idempotencyKey: () => `submit-recovery-${kind}-${status ?? "none"}`,
        origin: "https://coach.test",
        sleep: async () => undefined,
      });

      await expect(
        client.submitTeachingPracticeAnswer(
          "lesson-1",
          tutorialShortTextPrompt,
          tutorialAnswer,
        ),
      ).resolves.toEqual({
        id: `local:lesson-1:${tutorialShortTextPrompt.id}`,
        promptId: tutorialShortTextPrompt.id,
        submittedAnswer: tutorialAnswer,
        responseMode: "SHORT_TEXT",
        analysisState: "ANALYSIS_UNAVAILABLE",
        analysis: null,
      });
    },
  );

  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "TEACHING_PRACTICE_RESPONSE_NOT_FOUND"],
    [409, "IDEMPOTENCY_CONFLICT"],
    [422, "TEACHING_PRACTICE_CHOICE_INVALID"],
  ])("does not hide semantic submit error HTTP %i", async (status, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(problem(status, code));
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => `semantic-submit-${status}`,
      origin: "https://coach.test",
    });

    await expect(
      client.submitTeachingPracticeAnswer(
        "lesson-1",
        tutorialShortTextPrompt,
        tutorialAnswer,
      ),
    ).rejects.toMatchObject({ status, code });
  });

  it.each([
    { label: "network", kind: "network" },
    { label: "rate limit", kind: "status", status: 429 },
    { label: "server failure", kind: "status", status: 500 },
    { label: "temporary outage", kind: "status", status: 503 },
    { label: "malformed success", kind: "malformed" },
  ])(
    "sanitizes a known restore fallback on recoverable $label failure",
    async ({ kind, status }) => {
      const fetcher = vi.fn<typeof fetch>();
      if (kind === "network") fetcher.mockRejectedValue(new Error("offline"));
      else if (kind === "malformed")
        fetcher.mockResolvedValue(jsonResponse({ response: { broken: true } }));
      else
        fetcher.mockResolvedValue(
          problem(status ?? 500, `RECOVERABLE_${status ?? 500}`),
        );
      const client = new HttpLearningClient({
        baseUrl: "https://coach.test/api/v1",
        fetch: fetcher,
        origin: "https://coach.test",
      });

      await expect(
        client.getTeachingPracticeResponse(
          "lesson-1",
          tutorialShortTextPrompt.id,
          savedPersonalizedResponse,
        ),
      ).resolves.toEqual({
        ...savedPersonalizedResponse,
        analysisState: "ANALYSIS_UNAVAILABLE",
        analysis: null,
      });
    },
  );

  it.each([
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [409, "IDEMPOTENCY_CONFLICT"],
    [422, "VALIDATION_ERROR"],
  ])(
    "does not hide semantic restore error HTTP %i even with a fallback",
    async (status, code) => {
      const client = new HttpLearningClient({
        baseUrl: "https://coach.test/api/v1",
        fetch: vi.fn<typeof fetch>().mockResolvedValue(problem(status, code)),
        origin: "https://coach.test",
      });
      await expect(
        client.getTeachingPracticeResponse(
          "lesson-1",
          tutorialShortTextPrompt.id,
          savedPersonalizedResponse,
        ),
      ).rejects.toMatchObject({ status, code });
    },
  );

  it("keeps a true restore 404 as null with or without a fallback", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        problem(404, "TEACHING_PRACTICE_RESPONSE_NOT_FOUND"),
      );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });
    await expect(
      client.getTeachingPracticeResponse(
        "lesson-1",
        tutorialShortTextPrompt.id,
      ),
    ).resolves.toBeNull();
    await expect(
      client.getTeachingPracticeResponse(
        "lesson-1",
        tutorialShortTextPrompt.id,
        savedPersonalizedResponse,
      ),
    ).resolves.toBeNull();
  });

  it.each([
    { label: "network", kind: "network" },
    { label: "rate limit", kind: "status", status: 429 },
    { label: "server failure", kind: "status", status: 500 },
    { label: "temporary outage", kind: "status", status: 503 },
    { label: "malformed success", kind: "malformed" },
  ])(
    "sanitizes retry fallback on recoverable $label failure",
    async ({ kind, status }) => {
      const fetcher = vi.fn<typeof fetch>();
      if (kind === "network") fetcher.mockRejectedValue(new Error("offline"));
      else if (kind === "malformed")
        fetcher.mockResolvedValue(jsonResponse({ response: { broken: true } }));
      else
        fetcher.mockResolvedValue(
          problem(status ?? 500, `RECOVERABLE_${status ?? 500}`),
        );
      const client = new HttpLearningClient({
        baseUrl: "https://coach.test/api/v1",
        fetch: fetcher,
        idempotencyKey: () => `retry-recovery-${kind}-${status ?? "none"}`,
        origin: "https://coach.test",
        sleep: async () => undefined,
      });

      await expect(
        client.retryTeachingPracticeAnalysis(savedPersonalizedResponse),
      ).resolves.toEqual({
        ...savedPersonalizedResponse,
        analysisState: "ANALYSIS_UNAVAILABLE",
        analysis: null,
      });
    },
  );

  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "TEACHING_PRACTICE_RESPONSE_NOT_FOUND"],
    [409, "IDEMPOTENCY_CONFLICT"],
    [422, "VALIDATION_ERROR"],
  ])("does not hide semantic retry error HTTP %i", async (status, code) => {
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(problem(status, code)),
      idempotencyKey: () => `semantic-retry-${status}`,
      origin: "https://coach.test",
    });
    await expect(
      client.retryTeachingPracticeAnalysis(savedPersonalizedResponse),
    ).rejects.toMatchObject({ status, code });
  });

  it("keeps one immutable Mock answer and labels short-text analysis as demonstration only", async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => values.set(key, value),
          removeItem: (key: string) => values.delete(key),
        },
        setTimeout: (callback: () => void) => {
          callback();
          return 0;
        },
      },
    });
    try {
      const client = new MockLearningClient();
      const first = await client.submitTeachingPracticeAnswer(
        "lesson-demo",
        tutorialShortTextPrompt,
        "The first exact answer.",
      );
      const second = await client.submitTeachingPracticeAnswer(
        "lesson-demo",
        tutorialShortTextPrompt,
        "A later replacement attempt.",
      );
      expect(first).toEqual(second);
      expect(first).toMatchObject({
        submittedAnswer: "The first exact answer.",
        analysisState: "DEMO_ONLY",
        analysis: {
          kind: "DEMO_ONLY",
          strengths: [],
          comparisonPoints: [],
        },
      });
      expect(first.analysis).not.toHaveProperty("keyImprovement");
      expect(first.analysis).not.toHaveProperty("improvedAnswerEn");
      await expect(
        client.retryTeachingPracticeAnalysis(first),
      ).resolves.toEqual(first);
    } finally {
      if (previousWindow)
        Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("projects tampered Mock persistence before submit, restore, or retry can return it", async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    const values = new Map<string, string>();
    const storageKey = "iwc.demo.teaching-practice-responses";
    values.set(
      storageKey,
      JSON.stringify({
        [`lesson-demo:${tutorialShortTextPrompt.id}`]: {
          id: "demo:lesson-demo:workplace-link",
          promptId: tutorialShortTextPrompt.id,
          submittedAnswer: "The first tampered answer must remain immutable.",
          responseMode: "SHORT_TEXT",
          analysisState: "DEMO_ONLY",
          analysis: {
            kind: "DEMO_ONLY",
            summary: { zh: "你的语法很好。", en: "Your grammar is excellent." },
            strengths: [
              {
                zh: "虚构优点",
                en: "Fabricated strength",
                userAnswerEvidence: [],
              },
            ],
            comparisonPoints: [],
            improvedAnswerEn: "A fabricated rewrite.",
            nextCheck: { zh: "已经掌握", en: "Already mastered" },
          },
          jobId: "private-job",
          provider: "private-provider",
          score: 100,
        },
      }),
    );
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => values.set(key, value),
          removeItem: (key: string) => values.delete(key),
        },
        setTimeout: (callback: () => void) => {
          callback();
          return 0;
        },
      },
    });
    try {
      const client = new MockLearningClient();
      const submitted = await client.submitTeachingPracticeAnswer(
        "lesson-demo",
        tutorialShortTextPrompt,
        "A replacement attempt must not overwrite the stored first answer.",
      );
      const restored = await client.getTeachingPracticeResponse(
        "lesson-demo",
        tutorialShortTextPrompt.id,
      );
      const retried = await client.retryTeachingPracticeAnalysis(submitted);
      for (const result of [submitted, restored, retried]) {
        expect(result).toEqual({
          id: "demo:lesson-demo:workplace-link",
          promptId: tutorialShortTextPrompt.id,
          submittedAnswer: "The first tampered answer must remain immutable.",
          responseMode: "SHORT_TEXT",
          analysisState: "ANALYSIS_UNAVAILABLE",
          analysis: null,
        });
        expect(Object.keys(result ?? {}).sort()).toEqual([
          "analysis",
          "analysisState",
          "id",
          "promptId",
          "responseMode",
          "submittedAnswer",
        ]);
        expect(JSON.stringify(result)).not.toMatch(
          /private-job|private-provider|fabricated|grammar is excellent|语法很好|mastered|已经掌握|score/i,
        );
      }
    } finally {
      if (previousWindow)
        Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("loads an adaptive teaching article without starting the timed paper", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/training-cycles/cycle-teaching"))
        return jsonResponse({
          cycle: {
            id: "cycle-teaching",
            lessonPlans: [{ id: "lesson-teaching" }],
          },
        });
      if (url.endsWith("/lessons/lesson-teaching/teaching"))
        return jsonResponse({
          teaching: adaptiveTeachingPayload,
        });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(
      client.getFocusedTeaching("cycle-teaching", "lesson-teaching"),
    ).resolves.toMatchObject({
      id: "lesson-teaching",
      cycleId: "cycle-teaching",
      format: "ADAPTIVE_ARTICLE_V1",
      titleZh: "把因果论证中间的一步讲清楚",
      sections: [
        { anchor: "understand-the-link" },
        { anchor: "apply-the-method" },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.some(([input]) => String(input).endsWith("/start")),
    ).toBe(false);
  });

  it("serves the demo as a dynamic article instead of a fixed lesson template", async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    const sessionValues = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        dispatchEvent: () => true,
        sessionStorage: {
          getItem: (key: string) => sessionValues.get(key) ?? null,
          setItem: (key: string, value: string) =>
            sessionValues.set(key, value),
        },
        setTimeout: globalThis.setTimeout,
      },
    });

    try {
      const teaching = await new MockLearningClient().getFocusedTeaching(
        "cycle-demo",
        "lesson-demo",
      );

      expect(teaching).toMatchObject({
        format: "ADAPTIVE_ARTICLE_V1",
        id: "lesson-demo",
        cycleId: "cycle-demo",
      });
      expect(teaching.sections.map((section) => section.anchor)).toEqual([
        "see-the-missing-link",
        "build-one-step-at-a-time",
        "try-and-check",
      ]);
      expect(teaching).not.toHaveProperty("currentPattern");
      expect(teaching).not.toHaveProperty("knowledgeCards");
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, "window", previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  it("provides a structurally different fixture without adding fixed chapters", () => {
    const blockKinds = (teaching: FocusedTeachingData) =>
      teaching.sections.flatMap((section) =>
        section.blocks.map((block) => block.kind),
      );

    expect(mechanismChainTeachingFixture.sections).toHaveLength(3);
    expect(collocationControlTeachingFixture.sections).toHaveLength(2);
    expect(blockKinds(mechanismChainTeachingFixture)).toEqual([
      "EXPLANATION",
      "CONTRAST",
      "REASONING",
      "TOOLKIT",
      "PITFALLS",
      "PRACTICE",
      "SUMMARY",
    ]);
    expect(blockKinds(collocationControlTeachingFixture)).toEqual([
      "EXPLANATION",
      "TOOLKIT",
      "PITFALLS",
      "CONTRAST",
      "PRACTICE",
      "SUMMARY",
    ]);
    expect(
      collocationControlTeachingFixture.sections.map(
        (section) => section.titleZh,
      ),
    ).not.toEqual(
      mechanismChainTeachingFixture.sections.map((section) => section.titleZh),
    );
  });

  it("uses HTTP by default and selects the local demo only when explicit", () => {
    expect(createLearningClient()).toBeInstanceOf(HttpLearningClient);
    expect(createLearningClient({ demoMode: true })).toBeInstanceOf(
      MockLearningClient,
    );
  });

  it("requires an explicit in-memory setup token and never reads the browser URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ setup_required: true }));
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });
    const previousWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          href: "https://coach.test/setup?token=must-not-be-read",
          origin: "https://coach.test",
        },
      },
    });

    try {
      const error = await client
        .testConnection({ model: "model-test", provider: "openai" })
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "SETUP_TOKEN_REQUIRED" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, "window", previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  it("saves the tested AI connection atomically inside the initial setup", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ setup_required: true }))
      .mockResolvedValueOnce(jsonResponse({ setup_complete: true }))
      .mockResolvedValueOnce(jsonResponse({ redirect: false }));
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await client.completeBootstrap({
      deploymentMode: "personal",
      adminName: "Owner",
      email: "owner@example.test",
      password: "long-enough-password",
      provider: "compatible",
      providerVendor: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-secret-test-key",
      model: "deepseek-v4-flash",
      secretSource: "encrypted",
      setupToken: "opaque-setup-token-1234567890",
      configureAi: true,
    });

    const urls = fetcher.mock.calls.map((call) => String(call[0]));
    const setupCall = fetcher.mock.calls.find((call) =>
      String(call[0]).endsWith("/setup"),
    );
    expect(setupCall).toBeDefined();
    expect(
      JSON.parse(String(setupCall?.[1]?.body)) as Record<string, unknown>,
    ).toMatchObject({
      provider: {
        api_key: "sk-secret-test-key",
        base_url: "https://api.deepseek.com/v1",
        kind: "compatible",
        model: "deepseek-v4-flash",
        secret_mode: "encrypted",
        vendor: "deepseek",
      },
    });
    // The provider and its routes live inside /setup now — no separate calls.
    expect(
      urls.filter(
        (url) => url.endsWith("/providers") || url.endsWith("/model-routes"),
      ),
    ).toHaveLength(0);
  });

  it("omits the provider block when AI configuration is skipped", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ setup_required: true }))
      .mockResolvedValueOnce(jsonResponse({ setup_complete: true }))
      .mockResolvedValueOnce(jsonResponse({ redirect: false }));
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await client.completeBootstrap({
      deploymentMode: "personal",
      adminName: "Owner",
      email: "owner@example.test",
      password: "long-enough-password",
      provider: "openai",
      providerVendor: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-5-mini",
      secretSource: "encrypted",
      setupToken: "opaque-setup-token-1234567890",
      configureAi: false,
    });

    const setupCall = fetcher.mock.calls.find((call) =>
      String(call[0]).endsWith("/setup"),
    );
    const body = JSON.parse(String(setupCall?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(body.provider).toBeUndefined();
  });

  it("uses the same-origin mutation contract and an idempotency key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ setup_required: false }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          latency_ms: 42,
          safe_message: "ready",
          capabilities: {
            contextWindow: true,
            structuredOutput: true,
          },
        }),
      );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "idem-provider-test",
      origin: "https://coach.test",
    });

    await client.testConnection({
      apiKey: "secret-test-key",
      model: "model-test",
      provider: "openai",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://coach.test/api/v1/providers/test",
    );
    const init = fetcher.mock.calls[1]?.[1] as RequestInit;
    const headers = requestHeaders(fetcher.mock.calls[1] ?? []);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(headers.get("origin")).toBe("https://coach.test");
    expect(headers.get("idempotency-key")).toBe("idem-provider-test");
    expect(JSON.parse(String(init.body))).toMatchObject({
      api_key: "secret-test-key",
      kind: "openai",
      model: "model-test",
    });
  });

  it("encodes Today's authoritative cycle and entity identity in the next link", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/today"))
        return jsonResponse({
          cycle: {
            id: "cycle-identity",
            status: "REWRITE_READY",
            question: { prompt: "Identity-safe rewrite" },
          },
          next_action: {
            kind: "START_REWRITE",
            entityId: "rewrite-identity",
            dueAt: null,
          },
        });
      if (url.endsWith("/providers")) return jsonResponse({ providers: [] });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(client.getToday()).resolves.toMatchObject({
      nextTask: {
        id: "rewrite-identity",
        href: "/rewrite?cycle=cycle-identity&task=rewrite-identity",
      },
    });
  });

  it("loads each active essay with its own authoritative action and rejects malformed workspace items", async () => {
    const validFetcher = vi.fn<typeof fetch>(async (input) => {
      if (!String(input).endsWith("/essays"))
        throw new Error(`Unexpected URL: ${input}`);
      return jsonResponse({
        active_count: 2,
        active_limit: 8,
        essays: [
          {
            id: "cycle-one",
            prompt: "Should schools teach practical decision-making?",
            topic: "education",
            status: "ATTEMPT_1_ACTIVE",
            updated_at: "2026-08-14T13:00:00.000Z",
            next_action: {
              kind: "CONTINUE_ATTEMPT_1",
              entity_id: "cycle-one",
              reason: "Resume the saved first draft.",
              due_at: null,
              overdue: false,
            },
            resources: {
              cycle_id: "cycle-one",
              writing_available: true,
              feedback_available: false,
              lesson_id: null,
              rewrite_task_id: null,
              comparison_available: false,
              transfer_task_id: null,
            },
          },
          {
            id: "cycle-two",
            prompt: "Should digital devices replace printed books?",
            topic: "technology",
            status: "QUESTION_READY",
            updated_at: "2026-08-14T12:00:00.000Z",
            next_action: {
              kind: "START_ATTEMPT_1",
              entity_id: "cycle-two",
              reason: "The first timed draft is ready.",
              due_at: null,
              overdue: false,
            },
            resources: {
              cycle_id: "cycle-two",
              writing_available: false,
              feedback_available: false,
              lesson_id: null,
              rewrite_task_id: null,
              comparison_available: false,
              transfer_task_id: null,
            },
          },
        ],
      });
    });
    const validClient = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: validFetcher,
      origin: "https://coach.test",
    });

    await expect(validClient.getEssayWorkspace()).resolves.toMatchObject({
      activeCount: 2,
      activeLimit: 8,
      essays: [
        { id: "cycle-one", resources: { cycleId: "cycle-one" } },
        { id: "cycle-two", resources: { cycleId: "cycle-two" } },
      ],
    });

    const malformedClient = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: async () =>
        jsonResponse({ active_count: 1, active_limit: 8, essays: [{}] }),
      origin: "https://coach.test",
    });
    await expect(malformedClient.getEssayWorkspace()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("keeps Demo drafts separate when two essays are open", async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          removeItem: (key: string) => values.delete(key),
          setItem: (key: string, value: string) => values.set(key, value),
        },
        setTimeout: globalThis.setTimeout,
      },
    });
    try {
      const client = new MockLearningClient();
      const first = await client.getAttempt(1, "cycle-demo");
      const second = await client.getAttempt(1, "cycle-demo-second");

      await client.saveDraft(first.id, "First essay stays here.");
      await client.saveDraft(second.id, "Second essay stays here.");

      await expect(client.getAttempt(1, "cycle-demo")).resolves.toMatchObject({
        draft: "First essay stays here.",
      });
      await expect(
        client.getAttempt(1, "cycle-demo-second"),
      ).resolves.toMatchObject({ draft: "Second essay stays here." });
    } finally {
      if (previousWindow)
        Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("uses authoritative growth metrics on Today and preserves unavailable values as unknown", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/today"))
        return jsonResponse({
          cycle: null,
          next_action: {
            kind: "START_NEW_CYCLE",
            entityId: "question-bank",
            dueAt: null,
          },
        });
      if (url.endsWith("/providers")) return jsonResponse({ providers: [] });
      if (url.endsWith("/growth"))
        return jsonResponse({
          summary: {
            essays_completed: 3,
            independent_non_recurrence_rate: null,
            recorded_learning_minutes: 87,
          },
        });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(client.getToday()).resolves.toMatchObject({
      week: {
        focusedMinutes: 87,
        completedActions: 3,
        repeatedErrorReduction: null,
      },
    });
  });

  it("surfaces a failed assessment job as an actionable retry task", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/today"))
        return jsonResponse({
          cycle: {
            id: "cycle-1",
            status: "ANALYZING",
            question: { prompt: "Feedback pending identity" },
            resources: {
              pending_job: {
                id: "job-1",
                status: "FAILED",
                task_kind: "ielts_assessment",
                error_code: "INVALID_RESPONSE",
                error_safe_message:
                  "The provider returned an invalid structured response.",
              },
            },
          },
          next_action: {
            kind: "WAIT_FOR_ASSESSMENT",
            entityId: "cycle-1",
            dueAt: null,
          },
        });
      if (url.endsWith("/providers")) return jsonResponse({ providers: [] });
      if (url.endsWith("/growth"))
        return jsonResponse({ summary: { essays_completed: 1 } });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(client.getToday()).resolves.toMatchObject({
      nextTask: {
        titleZh: "重试批改",
        descriptionEn: expect.stringContaining("Last failure"),
      },
      pendingJob: { id: "job-1", status: "FAILED" },
    });
  });

  it("directs an AI-blocked assessment job to the AI settings", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/today"))
        return jsonResponse({
          cycle: {
            id: "cycle-2",
            status: "ANALYZING",
            question: { prompt: "Blocked feedback identity" },
            resources: {
              pending_job: {
                id: "job-2",
                status: "AI_BLOCKED",
                task_kind: "ielts_assessment",
                error_code: "AUTHENTICATION",
                error_safe_message: "The provider rejected the credentials.",
              },
            },
          },
          next_action: {
            kind: "WAIT_FOR_ASSESSMENT",
            entityId: "cycle-2",
            dueAt: null,
          },
        });
      if (url.endsWith("/providers")) return jsonResponse({ providers: [] });
      if (url.endsWith("/growth"))
        return jsonResponse({ summary: { essays_completed: 1 } });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(client.getToday()).resolves.toMatchObject({
      nextTask: {
        titleEn: "Repair the AI connection to continue",
        actionEn: "Review AI connection",
      },
      pendingJob: { id: "job-2", status: "AI_BLOCKED" },
    });
  });

  it("maps authoritative missed-window actions and posts explicit reschedules", async () => {
    let todayCalls = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/providers")) return jsonResponse({ providers: [] });
      if (url.endsWith("/today")) {
        todayCalls += 1;
        return jsonResponse({
          cycle: {
            id: `cycle-${todayCalls}`,
            status: todayCalls === 1 ? "REWRITE_READY" : "CORE_CYCLE_COMPLETED",
            question: { prompt: "Missed-window identity" },
          },
          next_action: {
            kind:
              todayCalls === 1 ? "RESCHEDULE_REWRITE" : "RESCHEDULE_TRANSFER",
            entityId: todayCalls === 1 ? "rewrite-expired" : "transfer-expired",
            dueAt: "2026-08-12T08:00:00.000Z",
          },
        });
      }
      if (
        url.endsWith("/rewrite-tasks/rewrite-expired/reschedule") ||
        url.endsWith("/transfer-tasks/transfer-expired/reschedule")
      ) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({});
        return jsonResponse({ status: "RESCHEDULED" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "idem-reschedule",
      origin: "https://coach.test",
    });

    await expect(client.getToday()).resolves.toMatchObject({
      nextTask: {
        href: "/rewrite?cycle=cycle-1&task=rewrite-expired",
        actionEn: "Reschedule",
      },
    });
    await client.rescheduleRewrite("rewrite-expired");
    await expect(client.getToday()).resolves.toMatchObject({
      nextTask: {
        href: "/transfer?cycle=cycle-2&task=transfer-expired",
        actionEn: "Reschedule",
      },
    });
    await client.rescheduleTransfer("transfer-expired");

    const mutations = fetcher.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(mutations).toHaveLength(2);
    for (const mutation of mutations) {
      expect(requestHeaders(mutation).get("idempotency-key")).toBe(
        "idem-reschedule",
      );
      expect(requestHeaders(mutation).get("origin")).toBe("https://coach.test");
    }
  });

  it("loads the current ETag and sends it in If-Match when saving", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            attempt: {
              content: "",
              id: "attempt-1",
              kind: "version_1",
              revision: 7,
            },
          },
          { headers: { etag: 'W/"7"' } },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { attempt: { id: "attempt-1", revision: 8 } },
          { headers: { etag: 'W/"8"' } },
        ),
      );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await client.saveDraft("attempt-1", "A revised IELTS paragraph.");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toContain("/writing-attempts/attempt-1");
    const patch = fetcher.mock.calls[1] ?? [];
    const headers = requestHeaders(patch);
    expect((patch[1] as RequestInit).method).toBe("PATCH");
    expect(headers.get("if-match")).toBe('W/"7"');
    expect(headers.get("idempotency-key")).toBeTruthy();
    expect(headers.get("origin")).toBe("https://coach.test");
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toMatchObject({
      content: "A revised IELTS paragraph.",
    });
  });

  it("reuses one idempotency key when a draft request loses its connection", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            attempt: {
              content: "",
              id: "attempt-retry",
              kind: "version_1",
              revision: 1,
            },
          },
          { headers: { etag: 'W/"1"' } },
        ),
      )
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(
        jsonResponse({ attempt: { id: "attempt-retry", revision: 2 } }),
      );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "same-draft-operation",
      origin: "https://coach.test",
      sleep: async () => undefined,
    });

    await client.saveDraft("attempt-retry", "A locally journalled draft.");

    const firstPatch = requestHeaders(fetcher.mock.calls[1] ?? []);
    const retriedPatch = requestHeaders(fetcher.mock.calls[2] ?? []);
    expect(firstPatch.get("idempotency-key")).toBe("same-draft-operation");
    expect(retriedPatch.get("idempotency-key")).toBe("same-draft-operation");
  });

  it("surfaces RFC 9457-style API problems as typed errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ setup_required: false }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: "PROVIDER_TEST_FAILED",
            detail: "The provider rejected the credentials.",
            status: 422,
            title: "Provider test failed",
            type: "https://coach.test/problems/provider-test-failed",
          },
          { status: 422 },
        ),
      );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const error = await client
      .testConnection({ model: "bad", provider: "openai" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LearningClientError);
    expect(error).toMatchObject({
      code: "PROVIDER_TEST_FAILED",
      retryable: false,
      status: 422,
    });
  });

  it("preserves both draft branches in a typed optimistic-concurrency conflict", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            attempt: {
              content: "Server version six",
              id: "attempt-conflict",
              kind: "version_1",
              revision: 6,
            },
          },
          { headers: { etag: 'W/"6"' } },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            client: {
              base_revision: 6,
              conflict_id: "branch-client",
              content: "Client branch",
              word_count: 2,
            },
            code: "DRAFT_REVISION_CONFLICT",
            detail: "Both drafts were preserved.",
            server: {
              content: "Server branch",
              revision: 7,
              word_count: 2,
            },
            status: 409,
            title: "Draft conflict",
            type: "https://coach.test/problems/draft-revision-conflict",
          },
          { status: 409 },
        ),
      );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const error = await client
      .saveDraft("attempt-conflict", "Client branch")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DraftConflictError);
    expect(error).toMatchObject({
      clientDraft: { conflict_id: "branch-client", content: "Client branch" },
      code: "DRAFT_REVISION_CONFLICT",
      serverDraft: { content: "Server branch", revision: 7 },
    });
  });

  it("falls back from a disconnected SSE stream to bounded job polling", async () => {
    const callsByPath = new Map<string, number>();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      callsByPath.set(url, (callsByPath.get(url) ?? 0) + 1);
      if (
        url.endsWith("/writing-attempts/attempt-job") &&
        init?.method === "GET"
      )
        return jsonResponse(
          {
            attempt: {
              content: "",
              id: "attempt-job",
              kind: "version_1",
              revision: 2,
            },
          },
          { headers: { etag: 'W/"2"' } },
        );
      if (
        url.endsWith("/writing-attempts/attempt-job") &&
        init?.method === "PATCH"
      )
        return jsonResponse(
          { attempt: { id: "attempt-job", revision: 3 } },
          { headers: { etag: 'W/"3"' } },
        );
      if (url.endsWith("/writing-attempts/attempt-job/submit"))
        return jsonResponse({ job_id: "job-1", job_status: "QUEUED" });
      if (url.endsWith("/ai-jobs/job-1")) {
        const count = callsByPath.get(url) ?? 0;
        return jsonResponse({
          job: { id: "job-1", status: count === 1 ? "RUNNING" : "SUCCEEDED" },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    let eventUrl = "";
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      eventSourceFactory: (url) => {
        eventUrl = url;
        const source = {
          addEventListener: vi.fn(),
          close: vi.fn(),
          onerror: null as ((event: Event) => void) | null,
        };
        queueMicrotask(() => source.onerror?.(new Event("error")));
        return source;
      },
      fetch: fetcher,
      idempotencyKey: () => "idem-submit",
      maxJobWaitMs: 1_000,
      origin: "https://coach.test",
      pollIntervalMs: 0,
      sleep: async () => undefined,
    });

    const submission = await client.submitAttempt(
      "attempt-job",
      "This draft is saved before its idempotent submission.",
    );

    expect(submission).toEqual({
      feedbackReady: true,
      jobId: "job-1",
      jobStatus: "QUEUED",
    });

    expect(eventUrl).toBe("https://coach.test/api/v1/ai-jobs/job-1/events");
    expect(callsByPath.get("https://coach.test/api/v1/ai-jobs/job-1")).toBe(2);
    const submitCall = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith("/submit"),
    );
    expect(JSON.parse(String((submitCall?.[1] as RequestInit).body))).toEqual(
      {},
    );
    expect(requestHeaders(submitCall ?? []).get("idempotency-key")).toBe(
      "idem-submit",
    );
  });

  it("returns a truthful deferred-feedback result when no AI route has consent", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/writing-attempts/attempt-waiting")) {
        if (init?.method === "PATCH")
          return jsonResponse(
            { attempt: { id: "attempt-waiting", revision: 2 } },
            { headers: { etag: 'W/"2"' } },
          );
        return jsonResponse(
          {
            attempt: {
              id: "attempt-waiting",
              kind: "version_1",
              revision: 1,
              content: "",
            },
          },
          { headers: { etag: 'W/"1"' } },
        );
      }
      if (url.endsWith("/writing-attempts/attempt-waiting/submit"))
        return jsonResponse({
          job_id: "job-waiting",
          job_status: "WAITING_FOR_CONSENT",
        });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "idem-waiting",
      origin: "https://coach.test",
    });

    await expect(
      client.submitAttempt(
        "attempt-waiting",
        "The draft remains safely stored until an administrator configures AI.",
      ),
    ).resolves.toEqual({
      feedbackReady: false,
      jobId: "job-waiting",
      jobStatus: "WAITING_FOR_CONSENT",
    });
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes("/ai-jobs/")),
    ).toBe(false);
  });

  it("returns the server's canonical lesson evaluation without client language grading", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (
        url.endsWith("/exercise-items/item-1/responses") &&
        init?.method === "POST"
      ) {
        expect(JSON.parse(String(init.body))).toMatchObject({
          first_answer:
            "A valid answer with none of the old hard-coded keywords.",
          final_answer:
            "A valid answer with none of the old hard-coded keywords.",
        });
        return jsonResponse({
          response: {
            id: "00000000-0000-7000-8000-000000000001",
            first_answer_saved: true,
          },
          job_id: "job-lesson",
          job_status: "QUEUED",
        });
      }
      if (url.endsWith("/ai-jobs/job-lesson"))
        return jsonResponse({ job: { id: "job-lesson", status: "SUCCEEDED" } });
      if (url.includes("/exercise-items/item-1/responses?response_id="))
        return jsonResponse({
          response: {
            id: "00000000-0000-7000-8000-000000000001",
            evaluation: {
              passed: true,
              first_attempt_passed: true,
              confidence: 0.91,
              feedback_zh: "服务端确认答案达到目标。",
              feedback_en:
                "The server confirmed that the answer meets the target.",
              evidence: ["valid answer"],
              suggestion_zh: "",
              valid_for_evidence: true,
              demo_only: false,
            },
          },
        });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
      pollIntervalMs: 0,
      sleep: async () => undefined,
    });

    const result = await client.saveLessonProgress("lesson-1", 0, {
      itemId: "item-1",
      firstAnswer: "A valid answer with none of the old hard-coded keywords.",
      finalAnswer: "A valid answer with none of the old hard-coded keywords.",
      hintsUsed: 0,
      hintLevel: "NONE",
      referenceAnswerSeen: false,
      elapsedSeconds: 18,
    });

    expect(result).toMatchObject({
      outcome: "PASS",
      passed: true,
      validForEvidence: true,
      demoOnly: false,
    });
  });

  it("consumes authoritative same-rubric comparison deltas and normalized recurrence", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/today")) {
        return jsonResponse({
          cycle: { id: "cycle-comparison", status: "CORE_CYCLE_COMPLETED" },
          next_action: {
            entityId: "transfer-1",
            kind: "TRANSFER",
          },
        });
      }
      if (url.endsWith("/training-cycles/cycle-comparison")) {
        return jsonResponse({
          cycle: {
            id: "cycle-comparison",
            question: { prompt: "Compare this prompt." },
            writingAttempts: [
              {
                id: "attempt-v1",
                kind: "version_1",
                content: "Version one.",
                wordCount: 250,
                assessment: {
                  schemaVersion: "1.0.0",
                  overallBand: 6,
                  criterionScores: {
                    taskResponse: 6,
                    coherenceCohesion: 5.5,
                    lexicalResource: 6,
                    grammar: 6,
                  },
                  issues: [],
                  versionSnapshot: {
                    task: "ielts_assessment",
                    promptVersion: "1.0.0",
                    rubricVersion: "iwc-task2-rubric-1.0.0",
                    model: "frozen-model",
                  },
                },
              },
              {
                id: "attempt-v2",
                kind: "version_2",
                content: "Version two.",
                wordCount: 275,
                assessment: {
                  schemaVersion: "1.0.0",
                  overallBand: 6.5,
                  criterionScores: {
                    taskResponse: 6.5,
                    coherenceCohesion: 6,
                    lexicalResource: 6.5,
                    grammar: 6.5,
                  },
                  versionSnapshot: {
                    task: "ielts_assessment",
                    promptVersion: "1.0.0",
                    rubricVersion: "iwc-task2-rubric-1.0.0",
                    model: "frozen-model",
                  },
                },
              },
            ],
            comparisonEvidence: {
              valid: true,
              payload: {
                evidenceV2: "Version two evidence.",
                comparisonMetrics: {
                  scoringVersion: {
                    schemaVersion: "1.0.0",
                    promptVersion: "1.0.0",
                    rubricVersion: "iwc-task2-rubric-1.0.0",
                    model: "frozen-model",
                  },
                  overall: { v1: 6, v2: 6.5, delta: 0.5 },
                  criteria: {
                    TR: { v1: 6, v2: 6.5, delta: 0.5 },
                    CC: { v1: 5.5, v2: 6, delta: 0.5 },
                    LR: { v1: 6, v2: 6.5, delta: 0.5 },
                    GRA: { v1: 6, v2: 6.5, delta: 0.5 },
                  },
                  wordCounts: { v1: 250, v2: 275, v2Blind: 260 },
                  coreIssueRecurrence: {
                    v1Occurrences: 2,
                    v2Occurrences: 1,
                    v1Per100Words: 0.8,
                    v2Per100Words: 0.38,
                    deltaPer100Words: -0.42,
                    recurred: true,
                    evidenceVerified: true,
                  },
                },
              },
            },
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const comparison = await client.getComparison("cycle-comparison");

    expect(comparison).toMatchObject({
      v1Score: 6,
      v2Score: 6.5,
      overallDelta: 0.5,
      v1Words: 250,
      v2Words: 275,
      scoringVersion: { rubricVersion: "iwc-task2-rubric-1.0.0" },
      recurrence: {
        v1Per100Words: 0.8,
        v2Per100Words: 0.38,
        deltaPer100Words: -0.42,
        recurred: true,
      },
    });
    expect(comparison.criterionDeltas).toHaveLength(4);
    expect(comparison.criterionDeltas.map((item) => item.delta)).toEqual([
      0.5, 0.5, 0.5, 0.5,
    ]);
  });

  it("maps a deterministic unscored branch and sends targeted self-check confirmations", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toMatchObject({
          self_check_confirmations: ["Check the target", "Submit a revision"],
        });
        return jsonResponse({
          response: { id: "00000000-0000-7000-8000-000000000031" },
          job_id: null,
          job_ids: [],
          job_status: "DETERMINISTIC_COMPLETE",
          batch: null,
        });
      }
      if (url.includes("responses?response_id="))
        return jsonResponse({
          response: {
            id: "00000000-0000-7000-8000-000000000031",
            evaluation: {
              outcome: "NEUTRAL",
              passed: false,
              first_attempt_passed: false,
              confidence: 1,
              feedback_zh: "已记录主要意思。",
              feedback_en: "Meaning branch saved.",
              accepted_answers: ["lighter_workload", "easier_courses"],
              dimension_scores: {},
              criterion_results: [],
              evidence: ["lighter_workload"],
              valid_for_evidence: false,
              demo_only: false,
            },
          },
        });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });
    const result = await client.saveLessonProgress("lesson-1", 0, {
      itemId: "meaning-fork",
      firstAnswer: "lighter_workload",
      finalAnswer: "lighter_workload",
      hintsUsed: 0,
      hintLevel: "NONE",
      referenceAnswerSeen: false,
      elapsedSeconds: 12,
      selfCheckConfirmations: ["Check the target", "Submit a revision"],
    });
    expect(result).toMatchObject({
      outcome: "NEUTRAL",
      passed: false,
      acceptedAnswers: ["lighter_workload", "easier_courses"],
      validForEvidence: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("seals the first blind answer and releases one unified group feedback result", async () => {
    let submission = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes("/exercise-items/") && init?.method === "POST") {
        submission += 1;
        if (submission === 1)
          return jsonResponse({
            response: { id: "00000000-0000-7000-8000-000000000011" },
            job_id: null,
            job_ids: [],
            job_status: "BATCH_PENDING",
            batch: {
              groupId: "blind-1",
              submitted: 1,
              required: 2,
              pending: true,
            },
          });
        return jsonResponse({
          response: { id: "00000000-0000-7000-8000-000000000012" },
          job_id: "batch-job-1",
          job_ids: ["batch-job-1", "batch-job-2"],
          job_status: "QUEUED",
          batch: {
            groupId: "blind-1",
            submitted: 2,
            required: 2,
            pending: false,
          },
        });
      }
      if (
        url.endsWith("/ai-jobs/batch-job-1") ||
        url.endsWith("/ai-jobs/batch-job-2")
      )
        return jsonResponse({ job: { status: "SUCCEEDED" } });
      if (url.includes("responses?response_id="))
        return jsonResponse({
          response: {
            id: "00000000-0000-7000-8000-000000000012",
            evaluation: {
              passed: true,
              first_attempt_passed: true,
              confidence: 0.93,
              feedback_zh: "第二个答案达到目标。",
            },
            batch: {
              feedback_ready: true,
              feedback: [
                { item_id: "blind-a", passed: false, feedback_zh: "先补救。" },
                { item_id: "blind-b", passed: true, feedback_zh: "达到目标。" },
              ],
            },
            remediation_active: true,
          },
        });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
      pollIntervalMs: 0,
      sleep: async () => undefined,
    });
    const base = {
      firstAnswer: "Independent answer",
      finalAnswer: "Independent answer",
      hintsUsed: 0,
      hintLevel: "NONE" as const,
      referenceAnswerSeen: false,
      elapsedSeconds: 30,
    };
    const pending = await client.saveLessonProgress("lesson-1", 0, {
      ...base,
      itemId: "blind-a",
    });
    expect(pending).toMatchObject({ outcome: "BATCH_PENDING", passed: null });
    const released = await client.saveLessonProgress("lesson-1", 1, {
      ...base,
      itemId: "blind-b",
    });
    expect(released).toMatchObject({
      outcome: "BATCH_COMPLETE",
      remediationActive: true,
    });
    expect(released?.batchFeedback).toHaveLength(2);
  });

  it("allows unconfigured practice to continue without inventing evidence", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        response: { id: "00000000-0000-7000-8000-000000000021" },
        job_id: "waiting-job",
        job_ids: ["waiting-job"],
        job_status: "WAITING_FOR_CONSENT",
      }),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });
    const result = await client.saveLessonProgress("lesson-1", 0, {
      itemId: "item-unconfigured",
      firstAnswer: "Saved without evaluation.",
      finalAnswer: "Saved without evaluation.",
      hintsUsed: 0,
      hintLevel: "NONE",
      referenceAnswerSeen: false,
      elapsedSeconds: 15,
    });
    expect(result).toMatchObject({
      outcome: "UNASSESSED",
      validForEvidence: false,
      passed: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("persists a timebox split with the current draft and revision", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        runtime: {
          status: "TIMEBOX_EXPIRED",
          revision: 9,
          startedAt: "2026-08-13T10:00:00.000Z",
          effectiveElapsedSeconds: 3_600,
          productiveSeconds: 2_700,
          segmentLimitSeconds: 3_600,
          timeboxExpired: true,
          state: { split: "SCHEDULED", refresher: "NOT_REQUIRED" },
        },
        server_draft: {
          itemId: "00000000-0000-7000-8000-000000000041",
          answer: "Unsubmitted sentence kept for the next segment.",
          firstAnswer: "",
          attempts: 0,
          hintLevel: 0,
          revealed: false,
          updatedAt: "2026-08-13T11:00:00.000Z",
        },
      }),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const runtime = await client.updateLessonRuntime(
      "00000000-0000-7000-8000-000000000040",
      {
        revision: 8,
        action: "SCHEDULE_SPLIT",
        draft: {
          lessonId: "00000000-0000-7000-8000-000000000040",
          itemId: "00000000-0000-7000-8000-000000000041",
          answer: "Unsubmitted sentence kept for the next segment.",
          firstAnswer: "",
          attempts: 0,
          hintLevel: 0,
          revealed: false,
          updatedAt: "2026-08-13T11:00:00.000Z",
        },
      },
    );

    const call = fetcher.mock.calls[0] ?? [];
    expect(call[0]).toContain(
      "/lessons/00000000-0000-7000-8000-000000000040/progress",
    );
    expect(requestHeaders(call).get("if-match")).toBe('W/"8"');
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({
      revision: 8,
      action: "SCHEDULE_SPLIT",
      draft: {
        item_id: "00000000-0000-7000-8000-000000000041",
        answer: "Unsubmitted sentence kept for the next segment.",
      },
    });
    expect(runtime).toMatchObject({
      status: "TIMEBOX_EXPIRED",
      revision: 9,
      split: "SCHEDULED",
      refresher: "NOT_REQUIRED",
      serverDraft: {
        answer: "Unsubmitted sentence kept for the next segment.",
      },
    });
  });

  it("records only an explicitly classified abnormal interruption", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        runtime: {
          status: "PAUSED",
          revision: 5,
          effectiveElapsedSeconds: 300,
          productiveSeconds: 120,
          segmentLimitSeconds: 3_600,
          timeboxExpired: false,
          state: {
            split: "NONE",
            refresher: "NOT_REQUIRED",
            interruptions: [
              { at: "2026-08-13T10:05:00.000Z", kind: "NETWORK" },
            ],
          },
        },
      }),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const runtime = await client.updateLessonRuntime(
      "00000000-0000-7000-8000-000000000040",
      {
        revision: 4,
        action: "REPORT_INTERRUPTION",
        interruptionKind: "NETWORK",
      },
    );

    const call = fetcher.mock.calls[0] ?? [];
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      action: "REPORT_INTERRUPTION",
      interruption_kind: "NETWORK",
      revision: 4,
    });
    expect(runtime.interruptionCount).toBe(1);
  });

  it("retries only the failed lesson-generation job and waits for that same job", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/ai-jobs/generation-job/retry")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({});
        return jsonResponse({
          job_id: "generation-job",
          job_status: "QUEUED",
        });
      }
      if (url.endsWith("/ai-jobs/generation-job")) {
        return jsonResponse({
          job: { id: "generation-job", status: "SUCCEEDED" },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
      pollIntervalMs: 0,
      sleep: async () => undefined,
    });

    await expect(
      client.retryLessonGeneration("generation-job"),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("starts the skipped-prerequisite rewrite without granting lesson credit", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://coach.test/api/v1/lessons/lesson-skip/skip",
      );
      expect(init?.method).toBe("POST");
      return jsonResponse({
        skipped: true,
        lesson_status: "USER_SKIPPED",
        mastery_evidence_created: false,
        retained_evidence_allowed: false,
        rewrite_task: { id: "rewrite-prerequisite-skipped" },
      });
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(client.skipLesson("lesson-skip")).resolves.toBe(
      "rewrite-prerequisite-skipped",
    );
  });

  it("reports practice-only lesson completion without inventing a rewrite", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://coach.test/api/v1/lessons/lesson-practice/complete",
      );
      expect(init?.method).toBe("POST");
      return jsonResponse({
        completed: true,
        cycle_status: "LESSON_RESOLVED",
        rewrite_task: null,
        completion_mode: "PRACTICE_ONLY",
        mastery_evidence_created: false,
      });
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });
    await expect(client.completeLesson("lesson-practice")).resolves.toEqual({
      completionMode: "PRACTICE_ONLY",
      masteryEvidenceCreated: false,
      rewriteScheduled: false,
      segmentScheduled: false,
    });
  });

  it("maps every lesson presentation contract to the corresponding UI control data", async () => {
    const presentations = [
      {
        id: "spotlight",
        itemType: "ERROR_LOCATION",
        stage: "notice",
        prompt: {
          source: "Children learns a language quickly.",
          presentation: { form: "SPOTLIGHT", responseMode: "span" },
        },
      },
      {
        id: "meaning-fork",
        itemType: "MEANING_FORK",
        stage: "understand",
        prompt: {
          choices: [
            {
              id: "pressure",
              labelZh: "学业压力",
              labelEn: "academic pressure",
            },
            { id: "workload", labelZh: "课业量", labelEn: "workload" },
          ],
          presentation: { form: "MEANING_FORK", responseMode: "choice" },
        },
      },
      {
        id: "expression-map",
        itemType: "EXPRESSION_MAP",
        stage: "control",
        prompt: {
          presentation: {
            form: "EXPRESSION_MAP",
            responseMode: "mapping",
            mappingPairs: [
              { left: "承受压力", right: "face pressure" },
              { left: "课业量较小", right: "have a lighter workload" },
            ],
          },
        },
      },
      {
        id: "minimal-contrast",
        itemType: "MINIMAL_PAIR",
        stage: "understand",
        prompt: {
          choices: [
            { id: "a", label: "face pressure" },
            { id: "b", label: "make pressure" },
          ],
          presentation: { form: "MINIMAL_CONTRAST", responseMode: "choice" },
        },
      },
      {
        id: "skeleton",
        itemType: "SKELETON_COMPLETION",
        stage: "produce",
        prompt: {
          presentation: {
            form: "SKELETON",
            responseMode: "slots",
            slotLabels: ["subject", "collocation", "comparison target"],
          },
        },
      },
      {
        id: "open-generation",
        itemType: "SENTENCE_GENERATION",
        stage: "produce",
        prompt: {
          presentation: { form: "OPEN_GENERATION", responseMode: "sentence" },
        },
      },
      {
        id: "argument-chain",
        itemType: "CAUSAL_CHAIN",
        stage: "produce",
        prompt: {
          presentation: {
            form: "ARGUMENT_CHAIN",
            responseMode: "chain",
            slotLabels: ["claim", "reason", "mechanism", "result"],
          },
        },
      },
      {
        id: "paragraph-lab",
        itemType: "INTEGRATED_APPLICATION",
        stage: "near_transfer",
        prompt: {
          presentation: {
            form: "PARAGRAPH_LAB",
            responseMode: "paragraph",
            minimumWords: 80,
            maximumWords: 120,
          },
        },
      },
      {
        id: "targeted-self-check",
        itemType: "SELF_CHECK",
        stage: "self_check",
        prompt: {
          revisionBaseline: "The first paragraph version.",
          presentation: {
            form: "TARGETED_SELF_CHECK",
            responseMode: "revision",
            minimumWords: 80,
            maximumWords: 120,
            revisionSourceItemId: "paragraph-lab",
            selfCheckPrompts: [
              "Check the core target.",
              "Make one targeted revision.",
            ],
          },
        },
      },
    ];
    const items = presentations.map((fixture, index) => ({
      id: fixture.id,
      ordinal: index,
      itemType: fixture.itemType,
      expectedMinutes: 6,
      prompt: fixture.prompt,
      evaluationContract: {
        path: "CORE",
        presentation: fixture.prompt.presentation,
        canonicalItem: {
          stage: fixture.stage,
          grading: {
            mode: "RUBRIC",
            criteria: [
              {
                id: `${fixture.id}:criterion`,
                description: `Criterion for ${fixture.id}`,
                passingScore: 0.8,
              },
            ],
          },
        },
      },
    }));
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/today"))
        return jsonResponse({
          cycle: { id: "cycle-forms" },
          next_action: {
            kind: "LESSON",
            entityId: "lesson-forms",
            dueAt: null,
          },
        });
      if (url.endsWith("/training-cycles/cycle-forms"))
        return jsonResponse({
          cycle: {
            id: "cycle-forms",
            status: "LESSON_ACTIVE",
            lessonPlans: [
              { id: "lesson-forms", coreSkillId: "collocation_perspective" },
            ],
          },
        });
      if (url.endsWith("/lessons/lesson-forms/start"))
        return jsonResponse({
          lesson_id: "lesson-forms",
          cycle_id: "cycle-forms",
          cycle_status: "LESSON_ACTIVE",
        });
      if (url.endsWith("/lessons/lesson-forms"))
        return jsonResponse({
          lesson: {
            id: "lesson-forms",
            coreSkillId: "collocation_perspective",
            plannedMinutes: 60,
            items,
          },
          progress: {
            completed_item_ids: [],
            next_core_index: 0,
            responses: {},
          },
          runtime: {
            status: "ACTIVE",
            revision: 1,
            effectiveElapsedSeconds: 0,
            productiveSeconds: 0,
            segmentLimitSeconds: 3_600,
            timeboxExpired: false,
            state: { split: "NONE", refresher: "NOT_REQUIRED" },
          },
        });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const lesson = await client.getLesson("cycle-forms", "lesson-forms");

    expect(
      lesson.items.map(({ form, responseMode }) => ({ form, responseMode })),
    ).toEqual([
      { form: "SPOTLIGHT", responseMode: "span" },
      { form: "MEANING_FORK", responseMode: "choice" },
      { form: "EXPRESSION_MAP", responseMode: "mapping" },
      { form: "MINIMAL_CONTRAST", responseMode: "choice" },
      { form: "SKELETON", responseMode: "slots" },
      { form: "OPEN_GENERATION", responseMode: "sentence" },
      { form: "ARGUMENT_CHAIN", responseMode: "chain" },
      { form: "PARAGRAPH_LAB", responseMode: "paragraph" },
      { form: "TARGETED_SELF_CHECK", responseMode: "revision" },
    ]);
    expect(lesson.items[0]).toMatchObject({
      source: "Children learns a language quickly.",
    });
    expect(lesson.items[1]?.choices).toHaveLength(2);
    expect(lesson.items[2]?.mappingPairs).toEqual([
      { left: "承受压力", right: "face pressure" },
      { left: "课业量较小", right: "have a lighter workload" },
    ]);
    expect(lesson.items[4]?.slotLabels).toEqual([
      "subject",
      "collocation",
      "comparison target",
    ]);
    expect(lesson.items[6]?.slotLabels).toEqual([
      "claim",
      "reason",
      "mechanism",
      "result",
    ]);
    expect(lesson.items[7]).toMatchObject({
      minimumWords: 80,
      maximumWords: 120,
      criteria: [
        {
          id: "paragraph-lab:criterion",
          description: "Criterion for paragraph-lab",
          passingScore: 0.8,
        },
      ],
    });
    expect(lesson.items[8]).toMatchObject({
      revisionBaseline: "The first paragraph version.",
      revisionSourceItemId: "paragraph-lab",
      selfCheckPrompts: [
        "Check the core target.",
        "Make one targeted revision.",
      ],
    });
  });

  it("resumes a focused lesson from server-backed evaluated progress", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/today"))
        return jsonResponse({
          cycle: { id: "cycle-lesson" },
          next_action: { kind: "LESSON", entityId: "lesson-1", dueAt: null },
        });
      if (url.endsWith("/training-cycles/cycle-lesson"))
        return jsonResponse({
          cycle: {
            id: "cycle-lesson",
            status: "LESSON_ACTIVE",
            lessonPlans: [
              { id: "lesson-1", coreSkillId: "LEXICAL_COLLOCATION" },
            ],
          },
        });
      if (url.endsWith("/lessons/lesson-1/start"))
        return jsonResponse({
          lesson_id: "lesson-1",
          cycle_id: "cycle-lesson",
          cycle_status: "LESSON_ACTIVE",
        });
      if (url.endsWith("/lessons/lesson-1"))
        return jsonResponse({
          lesson: {
            id: "lesson-1",
            coreSkillId: "LEXICAL_COLLOCATION",
            plannedMinutes: 60,
            items: [
              {
                id: "item-1",
                ordinal: 0,
                itemType: "CONTROLLED_REPAIR",
                prompt: {},
                evaluationContract: { path: "CORE" },
              },
              {
                id: "item-2",
                ordinal: 1,
                itemType: "INDEPENDENT_GENERATION",
                prompt: {},
                evaluationContract: { path: "CORE" },
              },
            ],
          },
          progress: {
            completed_item_ids: ["item-1"],
            next_core_index: 1,
            responses: {
              "item-2": {
                response_id: "00000000-0000-7000-8000-000000000002",
                first_answer: "Saved baseline",
                final_answer: "Saved revision",
                attempt_count: 2,
                hints_used: 1,
                hint_level: "KEYWORD",
                reference_answer_seen: false,
                evaluation: {
                  passed: false,
                  feedback_zh: "再修改一次。",
                  feedback_en: "Revise once more.",
                },
              },
            },
          },
          runtime: {
            status: "ACTIVE",
            revision: 7,
            effectiveElapsedSeconds: 420,
            productiveSeconds: 300,
            segmentLimitSeconds: 3_600,
            timeboxExpired: false,
            state: { split: "NONE", refresher: "NOT_REQUIRED" },
            server_draft: {
              itemId: "item-2",
              answer: "Cross-device unsubmitted draft",
              firstAnswer: "Saved baseline",
              responseId: "00000000-0000-7000-8000-000000000002",
              attempts: 2,
              hintLevel: 1,
              revealed: false,
              updatedAt: "2026-08-13T10:00:00.000Z",
            },
          },
        });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const lesson = await client.getLesson("cycle-lesson", "lesson-1");

    expect(lesson.initialItemIndex).toBe(1);
    expect(lesson.initialResponse).toMatchObject({
      itemId: "item-2",
      responseId: "00000000-0000-7000-8000-000000000002",
      firstAnswer: "Saved baseline",
      finalAnswer: "Saved revision",
      attempts: 2,
      hintLevel: "KEYWORD",
      evaluation: { outcome: "RETRY" },
    });
    expect(lesson.runtime).toMatchObject({
      revision: 7,
      effectiveElapsedSeconds: 420,
      productiveSeconds: 300,
      serverDraft: { answer: "Cross-device unsubmitted draft" },
    });
  });

  it("submits an immutable transfer first answer without grading it locally", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://coach.test/api/v1/transfer-tasks/transfer-1/responses",
      );
      expect(init?.method).toBe("POST");
      return jsonResponse(
        {
          transfer_task_id: "transfer-1",
          response_id: "response-1",
          first_answer_saved: true,
          job_id: "job-transfer-1",
          job_status: "QUEUED",
        },
        { status: 202 },
      );
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "idem-transfer",
      origin: "https://coach.test",
    });

    const result = await client.submitTransferResponse("transfer-1", {
      firstAnswer:
        "A new topic gives the learner a genuine chance to produce the target independently.",
      elapsedSeconds: 93,
      startedAt: "2026-08-18T08:00:00.000Z",
    });

    expect(result).toEqual({
      transferTaskId: "transfer-1",
      responseId: "response-1",
      firstAnswerSaved: true,
      jobId: "job-transfer-1",
      jobStatus: "QUEUED",
    });
    const request = fetcher.mock.calls[0];
    expect(requestHeaders(request ?? []).get("idempotency-key")).toBe(
      "idem-transfer",
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      elapsed_seconds: 93,
      first_answer:
        "A new topic gives the learner a genuine chance to produce the target independently.",
      started_at: "2026-08-18T08:00:00.000Z",
    });
  });

  it("maps server transfer evidence and provider failure as distinct states", async () => {
    let requestNumber = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      requestNumber += 1;
      if (requestNumber === 1) {
        return jsonResponse({
          transfer_tasks: [
            {
              id: "transfer-pass",
              source_cycle_id: "cycle-1",
              status: "COMPLETED",
              available_at: "2026-08-18T08:00:00.000Z",
              expires_at: "2026-08-20T08:00:00.000Z",
              target_hint_hidden: true,
              question: {
                id: "question-health",
                prompt: "A new health topic prompt long enough for mapping.",
                questionType: "opinion",
                topic: "health",
              },
              result: {
                outcome: "PASS",
                confidence: 0.94,
                feedback_zh: "服务端证据通过。",
                feedback_en: "The server evidence passed.",
                evidence: "qualifying learner span",
                status: "QUALIFYING_CROSS_TOPIC_EVIDENCE",
                transferred: true,
                gate_missing: [],
                mock_language_scoring: false,
              },
            },
          ],
        });
      }
      return jsonResponse({
        transfer_tasks: [
          {
            id: "transfer-error",
            source_cycle_id: "cycle-2",
            status: "READY",
            available_at: "2026-08-18T08:00:00.000Z",
            target_hint_hidden: true,
            question: {
              id: "question-government",
              prompt: "A government topic prompt long enough for mapping.",
              questionType: "discussion",
              topic: "government",
            },
            evaluation_error: {
              code: "PROVIDER_UNAVAILABLE",
              safe_message: "The configured evaluator is unavailable.",
            },
          },
        ],
      });
    });
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const passed = await client.getTransferTask("transfer-pass", "cycle-1");
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://coach.test/api/v1/transfer-tasks?task_id=transfer-pass",
    );
    expect(passed.result).toMatchObject({
      outcome: "PASS",
      transferred: true,
      evidenceStatus: "QUALIFYING_CROSS_TOPIC_EVIDENCE",
    });
    expect(passed.evaluationError).toBeNull();

    const failed = await client.getTransferTask("transfer-error", "cycle-2");
    expect(failed.result).toBeNull();
    expect(failed.evaluationError).toEqual({
      code: "PROVIDER_UNAVAILABLE",
      safeMessage: "The configured evaluator is unavailable.",
    });
  });

  it("reads growth only from the canonical server metric response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        summary: {
          essays_completed: 3,
          recorded_learning_minutes: 121,
          current_estimated_band: 6.5,
          target_band: 7,
          independent_non_recurrence_rate: 75,
        },
        score_history: [
          { assessed_at: "2026-08-01T00:00:00.000Z", score: 6 },
          { assessed_at: "2026-08-10T00:00:00.000Z", score: 6.5 },
        ],
        skills: [
          {
            skill_id: "collocation_perspective",
            definition: {
              dimension: "LR",
              name_zh: "自然搭配与表达视角",
              description_en: "Natural collocation and perspective",
            },
            state: "retained",
            evidence_count: 5,
            recurrence_rate: 25,
          },
        ],
      }),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(client.getGrowth()).resolves.toMatchObject({
      essaysCompleted: 3,
      learningMinutes: 121,
      currentBand: 6.5,
      targetBand: 7,
      independentNonRecurrenceRate: 75,
      weeklyScores: [
        { label: "E1", score: 6 },
        { label: "E2", score: 6.5 },
      ],
      skills: [
        {
          id: "collocation_perspective",
          category: "LR",
          state: "retained",
          evidenceCount: 5,
          recurrenceRate: 25,
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://coach.test/api/v1/growth");
  });

  it("keeps an absent AI estimate unknown instead of displaying Band 0", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        summary: {
          essays_completed: 1,
          recorded_learning_minutes: 40,
          current_estimated_band: null,
          target_band: 7,
          independent_non_recurrence_rate: null,
        },
        score_history: [{ assessed_at: "2026-08-01", score: null }],
        skills: [],
      }),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(client.getGrowth()).resolves.toMatchObject({
      currentBand: null,
      weeklyScores: [],
    });
  });

  it("uploads CycleBundle bytes with the actual media type and idempotency", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        imported: true,
        idempotent: false,
        cycle_id: "cycle-imported",
        bundle_id: "bundle-imported",
        conflicts: [],
      }),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "idem-import",
      origin: "https://coach.test",
    });
    const file = new File(["{}"], "cycle.json", {
      type: "application/octet-stream",
    });

    await expect(client.importLearningBundle(file)).resolves.toMatchObject({
      imported: true,
      cycleId: "cycle-imported",
      bundleId: "bundle-imported",
      conflicts: [],
    });
    const call = fetcher.mock.calls[0] ?? [];
    const init = call[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(call[0]).toBe("https://coach.test/api/v1/imports");
    expect(init.body).toBe(file);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("idempotency-key")).toBe("idem-import");
    expect(headers.get("origin")).toBe("https://coach.test");
  });

  it("preserves CycleBundle conflicts returned as Problem Details", async () => {
    const conflict = { id: "conflict-1", status: "UNRESOLVED" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        {
          title: "Import conflict",
          status: 409,
          detail: "Neither version was overwritten.",
          code: "BUNDLE_CONFLICT",
          conflicts: [conflict],
        },
        { status: 409 },
      ),
    );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    const error = await client
      .importLearningBundle(new File(["{}"], "cycle.json"))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LearningClientError);
    expect(error).toMatchObject({
      code: "BUNDLE_CONFLICT",
      problem: { conflicts: [conflict] },
    });
  });

  it("loads and updates explicit per-task model routes", async () => {
    const route = {
      id: "route-1",
      taskKind: "ielts_assessment",
      providerConnectionId: "provider-1",
      model: "gpt-route",
      fallbackEnabled: false,
      routeVersion: 2,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ routes: [route] }))
      .mockResolvedValueOnce(jsonResponse({ routes: [route] }));
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "idem-route",
      origin: "https://coach.test",
    });

    await expect(client.getModelRoutes()).resolves.toEqual([route]);
    await expect(
      client.updateModelRoute({
        taskKind: "ielts_assessment",
        providerConnectionId: "provider-1",
        model: "gpt-route",
      }),
    ).resolves.toEqual(route);
    const update = fetcher.mock.calls[1] ?? [];
    expect((update[1] as RequestInit).method).toBe("PUT");
    expect(JSON.parse(String((update[1] as RequestInit).body))).toEqual({
      tasks: ["ielts_assessment"],
      provider_connection_id: "provider-1",
      model: "gpt-route",
      fallback_enabled: false,
    });
  });

  it("deletes only the explicitly selected provider connection", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ deleted: true }));
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      idempotencyKey: () => "idem-delete-provider",
      origin: "https://coach.test",
    });

    await client.deleteAiConnection("provider-selected");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://coach.test/api/v1/providers/provider-selected",
    );
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).method).toBe("DELETE");
    await expect(
      client.deleteAiConnection("environment-openai"),
    ).rejects.toMatchObject({ code: "ENVIRONMENT_PROVIDER_READ_ONLY" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("downloads a selected TrainingCycle through the exchange endpoint", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          cycles: [
            {
              id: "cycle-export",
              status: "LESSON_READY",
              createdAt: "2026-08-01T00:00:00.000Z",
              question: { prompt: "A portable writing question." },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([80, 75]), {
          headers: {
            "content-type": "application/vnd.ielts-writing-coach.bundle+zip",
          },
        }),
      );
    const client = new HttpLearningClient({
      baseUrl: "https://coach.test/api/v1",
      fetch: fetcher,
      origin: "https://coach.test",
    });

    await expect(client.getCycleExportOptions()).resolves.toEqual([
      {
        id: "cycle-export",
        status: "LESSON_READY",
        prompt: "A portable writing question.",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    await expect(client.downloadCycleBundle("cycle-export")).resolves.toBe(
      undefined,
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://coach.test/api/v1/training-cycles/cycle-export/export",
    );
  });
});
