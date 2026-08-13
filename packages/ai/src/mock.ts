import { createHash } from "node:crypto";

import { mockValueFromSchema } from "./json";
import { normalizeProviderError } from "./errors";
import type {
  AIProviderAdapter,
  ConnectionValidation,
  GenerationResult,
  ModelDescriptor,
  NormalizedUsage,
  ProviderCapabilities,
  StructuredGenerationRequest,
  TextGenerationRequest,
} from "./types";

const MODEL = "mock-deterministic-v1";

function section(input: string, label: string): string {
  const line = input
    .split("\n")
    .find((candidate) => candidate.startsWith(`${label}: `));
  if (!line) return "";
  const serialized = line.slice(label.length + 2);
  try {
    const value: unknown = JSON.parse(serialized);
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return serialized;
  }
}

function mockStructuredValue(
  request: StructuredGenerationRequest<unknown>,
): unknown {
  const generated = mockValueFromSchema(request.schema);
  if (request.schemaName === "iwc_exercise_evaluation_v1") {
    const answer = section(request.input, "Learner first answer").trim();
    const passed = answer.length >= 40;
    const canonicalTarget = section(
      request.input,
      "Canonical target and evidence opportunity",
    );
    let criterionIds = ["target"];
    try {
      const canonical = JSON.parse(canonicalTarget) as {
        grading?: { criteria?: Array<{ id?: unknown }> };
        criteria?: Array<{ objectiveId?: unknown; skillId?: unknown }>;
      };
      criterionIds = Array.from(
        new Set([
          ...(canonical.grading?.criteria ?? []).flatMap((criterion) =>
            typeof criterion.id === "string" ? [criterion.id] : [],
          ),
          ...(canonical.criteria ?? []).flatMap((criterion) =>
            typeof criterion.objectiveId === "string" &&
            typeof criterion.skillId === "string"
              ? [`${criterion.objectiveId}:${criterion.skillId}`]
              : [],
          ),
        ]),
      );
      if (criterionIds.length === 0) criterionIds = ["target"];
    } catch {
      // Keep the deterministic fallback criterion for malformed demo input.
    }
    const evidence = passed
      ? answer.slice(0, 180)
      : "No sufficiently developed answer was found.";
    return {
      ...(generated as Record<string, unknown>),
      passed,
      firstAttemptPassed: passed,
      confidence: 0.95,
      feedbackZh: passed
        ? "Mock 演示已确认回答具备足够长度与独立输出形式；请使用真实模型获得语言质量判断。"
        : "回答过短，尚不足以形成可验证的独立输出证据。",
      evidenceEn: passed
        ? "The response contains a complete independent answer."
        : "The response is too short for the deterministic demo gate.",
      dimensionScores: {
        targetCorrectness: passed ? 0.9 : 0.4,
        meaningPreservation: passed ? 0.9 : 0.4,
        naturalness: passed ? 0.9 : 0.4,
      },
      criterionResults: criterionIds.map((id) => ({
        id,
        score: passed ? 0.9 : 0.4,
        userAnswerEvidence: [evidence],
      })),
      userAnswerEvidence: [evidence],
      mostImportantSuggestionZh: passed
        ? "连接真实模型后复核语言准确性与自然度。"
        : "先写出一个意思完整、可独立判断的英文句子。",
      naturalOpportunity: true,
      coreErrorRecurred: !passed,
    };
  }
  if (request.schemaName === "iwc_version_comparison_v1") {
    const marker = "\n\nV2 before self-check:\n";
    const version2 = request.input.split(marker)[1]?.trim() ?? "";
    const targetApplied = version2.length >= 100;
    return {
      ...(generated as Record<string, unknown>),
      targetApplied,
      naturalOpportunity: true,
      confidence: 0.95,
      improvementsZh: targetApplied
        ? ["Version 2 在闭卷条件下完成了足够展开的独立写作。"]
        : [],
      regressionsZh: targetApplied
        ? []
        : ["Version 2 过短，Mock 演示无法确认目标能力得到保留。"],
      evidenceV2: version2.slice(0, 240),
      coreIssueSpansV1: [],
      coreIssueSpansV2: [],
      modelEssay:
        version2.length >= 200
          ? version2
          : "Mock Provider does not generate a scored reference essay. Configure a real AI provider for a task-specific model.",
    };
  }
  if (request.schemaName === "iwc_transfer_evaluation_v1") {
    const answer = section(
      request.input,
      "Learner immutable first answer",
    ).trim();
    const completeDemoResponse = answer.length >= 80;
    return {
      ...(generated as Record<string, unknown>),
      targetApplied: completeDemoResponse,
      naturalOpportunity: true,
      confidence: 0.99,
      feedbackZh: completeDemoResponse
        ? "Mock 仅确认流程中存在一段完整首答；它没有评价英语质量，也不会授予 transferred。"
        : "Mock 仅检测到首答内容不足以演示完整流程；它没有评价英语质量。",
      feedbackEn: completeDemoResponse
        ? "Mock confirmed only that a developed first answer exists. It did not score language and cannot award transferred."
        : "Mock found too little text for the workflow demo. It did not score language.",
      evidenceEn: completeDemoResponse
        ? answer.slice(0, 240)
        : "No developed first answer was available for the workflow demo.",
      dimensionScores: {
        targetCorrectness: 0,
        meaningPreservation: 0,
        naturalness: 0,
      },
      userAnswerEvidence: completeDemoResponse ? [answer.slice(0, 240)] : [],
      mostImportantSuggestionZh:
        "连接真实语言模型后，才能判断目标能力是否在陌生话题中自然、准确地出现。",
    };
  }
  return generated;
}

function usageFor(input: string, output: string): NormalizedUsage {
  const inputTokens = Math.max(1, Math.ceil(input.length / 4));
  const outputTokens = Math.max(1, Math.ceil(output.length / 4));
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

export class MockAdapter implements AIProviderAdapter {
  readonly kind = "mock" as const;

  async validateConnection(): Promise<ConnectionValidation> {
    return {
      ok: true,
      latencyMs: 0,
      safeMessage: "Deterministic Mock Provider is ready.",
    };
  }

  async listModels(): Promise<ModelDescriptor[]> {
    return [{ id: MODEL, ownedBy: "ielts-writing-coach" }];
  }

  async probeCapabilities(model: string): Promise<ProviderCapabilities> {
    return {
      text: true,
      structuredOutput: true,
      nativeJsonSchema: true,
      model,
      probedAt: new Date().toISOString(),
      notes: [
        "Deterministic and free; intended for demos and automated tests.",
      ],
    };
  }

  async generateText(
    request: TextGenerationRequest,
  ): Promise<GenerationResult<string>> {
    const digest = createHash("sha256")
      .update(request.input)
      .digest("hex")
      .slice(0, 12);
    const value = `Mock Provider response (${digest}). Configure a real provider for language feedback.`;
    return {
      value,
      model: request.model || MODEL,
      responseId: `mock_${digest}`,
      usage: usageFor(request.input, value),
    };
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<GenerationResult<T>> {
    const value = mockStructuredValue(
      request as StructuredGenerationRequest<unknown>,
    );
    if (!request.validate(value)) {
      throw new Error(
        `The deterministic mock could not satisfy schema ${request.schemaName}.`,
      );
    }
    const serialized = JSON.stringify(value);
    const digest = createHash("sha256")
      .update(`${request.schemaName}:${request.input}`)
      .digest("hex")
      .slice(0, 12);
    return {
      value,
      model: request.model || MODEL,
      responseId: `mock_${digest}`,
      usage: usageFor(request.input, serialized),
    };
  }

  normalizeUsage(raw: unknown): NormalizedUsage {
    const usage = raw as Partial<NormalizedUsage>;
    return {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens:
        usage.totalTokens ??
        (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
      ...(usage.cachedInputTokens === undefined
        ? {}
        : { cachedInputTokens: usage.cachedInputTokens }),
      ...(usage.reasoningTokens === undefined
        ? {}
        : { reasoningTokens: usage.reasoningTokens }),
    };
  }

  normalizeError = normalizeProviderError;
}
