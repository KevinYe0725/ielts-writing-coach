import OpenAI from "openai";

import {
  assertNoReflectedProviderSecret,
  normalizeProviderError,
} from "./errors";
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

const PROVIDER_REQUEST_TIMEOUT_MS = 60_000;

function boundedSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function safeSchemaName(value: string): string {
  return (
    value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "structured_response"
  );
}

export class OpenAIAdapter implements AIProviderAdapter {
  readonly kind = "openai" as const;
  readonly #client: OpenAI;
  readonly #apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("An OpenAI API key is required.");
    this.#apiKey = apiKey;
    this.#client = new OpenAI({ apiKey });
  }

  async validateConnection(
    signal?: AbortSignal,
  ): Promise<ConnectionValidation> {
    const started = performance.now();
    try {
      await this.#client.models.list({ signal: boundedSignal(signal) });
      return {
        ok: true,
        latencyMs: Math.round(performance.now() - started),
        safeMessage: "OpenAI connection validated.",
      };
    } catch (error) {
      const normalized = this.normalizeError(error);
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - started),
        safeMessage: normalized.safeMessage,
      };
    }
  }

  async listModels(signal?: AbortSignal): Promise<ModelDescriptor[]> {
    const page = await this.#client.models.list({
      signal: boundedSignal(signal),
    });
    assertNoReflectedProviderSecret(page.data, [this.#apiKey]);
    return page.data
      .filter(
        (model) =>
          typeof model.id === "string" &&
          model.id.length > 0 &&
          model.id.length <= 500,
      )
      .map((model) => ({
        id: model.id,
        ...(typeof model.owned_by === "string" && model.owned_by.length <= 500
          ? { ownedBy: model.owned_by }
          : {}),
      }));
  }

  async probeCapabilities(
    model: string,
    signal?: AbortSignal,
  ): Promise<ProviderCapabilities> {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["ok"],
      properties: { ok: { type: "boolean" } },
    };
    const result = await this.generateStructured({
      model,
      input:
        "Return true to confirm that strict structured output is available.",
      schemaName: "capability_probe",
      schema,
      validate: (value): value is { ok: boolean } =>
        typeof value === "object" &&
        value !== null &&
        (value as { ok?: unknown }).ok === true,
      ...(signal === undefined ? {} : { signal }),
      maxOutputTokens: 64,
    });
    return {
      text: true,
      structuredOutput: result.value.ok,
      nativeJsonSchema: result.value.ok,
      model,
      probedAt: new Date().toISOString(),
      notes: [],
    };
  }

  async generateText(
    request: TextGenerationRequest,
  ): Promise<GenerationResult<string>> {
    const response = await this.#client.responses.create(
      {
        model: request.model,
        input: request.system
          ? [
              { role: "developer", content: request.system },
              { role: "user", content: request.input },
            ]
          : request.input,
        ...(request.maxOutputTokens === undefined
          ? {}
          : { max_output_tokens: request.maxOutputTokens }),
        ...(request.temperature === undefined
          ? {}
          : { temperature: request.temperature }),
      },
      {
        signal: boundedSignal(request.signal),
        ...(request.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.idempotencyKey }),
      },
    );
    assertNoReflectedProviderSecret(response, [this.#apiKey]);
    const value = response.output_text;
    if (!value) throw new Error("OpenAI returned an empty text response.");
    assertNoReflectedProviderSecret(value, [this.#apiKey]);
    assertNoReflectedProviderSecret(response.model, [this.#apiKey]);
    assertNoReflectedProviderSecret(response.id, [this.#apiKey]);
    return {
      value,
      model: response.model,
      responseId: response.id,
      usage: this.normalizeUsage(response.usage),
      ...(response.incomplete_details?.reason === undefined
        ? {}
        : { rawFinishReason: response.incomplete_details.reason }),
    };
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<GenerationResult<T>> {
    const response = await this.#client.responses.create(
      {
        model: request.model,
        input: request.system
          ? [
              { role: "developer", content: request.system },
              { role: "user", content: request.input },
            ]
          : request.input,
        text: {
          format: {
            type: "json_schema",
            name: safeSchemaName(request.schemaName),
            schema: request.schema,
            strict: true,
          },
        },
        ...(request.maxOutputTokens === undefined
          ? {}
          : { max_output_tokens: request.maxOutputTokens }),
        ...(request.temperature === undefined
          ? {}
          : { temperature: request.temperature }),
      },
      {
        signal: boundedSignal(request.signal),
        ...(request.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.idempotencyKey }),
      },
    );
    assertNoReflectedProviderSecret(response, [this.#apiKey]);
    if (!response.output_text)
      throw new Error("OpenAI returned an empty structured response.");
    assertNoReflectedProviderSecret(response.output_text, [this.#apiKey]);
    assertNoReflectedProviderSecret(response.model, [this.#apiKey]);
    assertNoReflectedProviderSecret(response.id, [this.#apiKey]);
    const value: unknown = JSON.parse(response.output_text);
    if (!request.validate(value))
      throw new Error(
        "OpenAI returned JSON that did not match the required schema.",
      );
    return {
      value,
      model: response.model,
      responseId: response.id,
      usage: this.normalizeUsage(response.usage),
      ...(response.incomplete_details?.reason === undefined
        ? {}
        : { rawFinishReason: response.incomplete_details.reason }),
    };
  }

  normalizeUsage(raw: unknown): NormalizedUsage {
    const usage = raw as {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
      output_tokens_details?: { reasoning_tokens?: number };
    } | null;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
      ...(usage?.input_tokens_details?.cached_tokens === undefined
        ? {}
        : { cachedInputTokens: usage.input_tokens_details.cached_tokens }),
      ...(usage?.output_tokens_details?.reasoning_tokens === undefined
        ? {}
        : { reasoningTokens: usage.output_tokens_details.reasoning_tokens }),
    };
  }

  normalizeError = normalizeProviderError;
}
