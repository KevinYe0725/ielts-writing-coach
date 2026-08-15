import { extractJsonValue } from "./json";
import {
  assertNoReflectedProviderSecret,
  normalizeProviderError,
} from "./errors";
import {
  requestPinnedProvider,
  validateProviderBaseUrl,
  type ProviderAddressResolver,
} from "./ssrf";
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

interface ChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

const PROVIDER_REQUEST_TIMEOUT_MS = 60_000;

function boundedSignal(
  signal?: AbortSignal | null,
  timeoutMs = PROVIDER_REQUEST_TIMEOUT_MS,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export class CompatibleAdapter implements AIProviderAdapter {
  readonly kind = "compatible" as const;
  readonly #apiKey: string | undefined;
  readonly #baseUrl: string;
  readonly #localAllowlist: readonly string[];
  readonly #resolveAddresses: ProviderAddressResolver | undefined;
  readonly #authHeader: "authorization" | "api-key";
  readonly #validationModel: string | undefined;
  readonly #thinkingMode: "disabled" | "enabled" | undefined;
  readonly #jsonObjectMode: boolean;

  constructor(options: {
    apiKey?: string;
    baseUrl: string;
    localBaseUrlAllowlist?: readonly string[];
    addressResolver?: ProviderAddressResolver;
    authHeader?: "authorization" | "api-key";
    validationModel?: string;
    thinkingMode?: "disabled" | "enabled";
    jsonObjectMode?: boolean;
  }) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = options.baseUrl;
    this.#localAllowlist = options.localBaseUrlAllowlist ?? [];
    this.#resolveAddresses = options.addressResolver;
    this.#authHeader = options.authHeader ?? "authorization";
    this.#validationModel = options.validationModel;
    this.#thinkingMode = options.thinkingMode;
    this.#jsonObjectMode = options.jsonObjectMode ?? false;
  }

  #endpoint(path: "models" | "chat/completions"): string {
    const root = this.#baseUrl.replace(/\/+$/, "");
    return `${root}/${path}`;
  }

  async #request(
    path: "models" | "chat/completions",
    init: RequestInit,
  ): Promise<Response> {
    const safeBaseUrl = await validateProviderBaseUrl(
      this.#baseUrl,
      this.#localAllowlist,
      this.#resolveAddresses,
    );
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (this.#apiKey) {
      if (this.#authHeader === "api-key") headers.set("api-key", this.#apiKey);
      else headers.set("authorization", `Bearer ${this.#apiKey}`);
    }
    const response = await requestPinnedProvider(
      safeBaseUrl,
      new URL(this.#endpoint(path)),
      {
        method: init.method === "GET" ? "GET" : "POST",
        headers,
        ...(typeof init.body === "string" ? { body: init.body } : {}),
        signal: boundedSignal(init.signal),
      },
    );
    if (!response.ok) {
      const error = new Error(
        `Compatible provider request failed with HTTP ${response.status}.`,
      ) as Error & {
        status: number;
      };
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async validateConnection(
    signal?: AbortSignal,
  ): Promise<ConnectionValidation> {
    const started = performance.now();
    try {
      if (this.#validationModel) {
        await this.generateText({
          model: this.#validationModel,
          input: "Reply with OK.",
          maxOutputTokens: 64,
          ...(signal === undefined ? {} : { signal }),
        });
      } else await this.listModels(signal);
      return {
        ok: true,
        latencyMs: Math.round(performance.now() - started),
        safeMessage: "Compatible provider connection validated.",
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - started),
        safeMessage: this.normalizeError(error).safeMessage,
      };
    }
  }

  async listModels(signal?: AbortSignal): Promise<ModelDescriptor[]> {
    const response = await this.#request("models", {
      method: "GET",
      ...(signal === undefined ? {} : { signal }),
    });
    const rawBody = await response.text();
    assertNoReflectedProviderSecret(rawBody, [this.#apiKey]);
    const body = JSON.parse(rawBody) as {
      data?: Array<{ id?: string; owned_by?: string }>;
    };
    return (body.data ?? [])
      .filter(
        (model): model is { id: string; owned_by?: string } =>
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
    await this.generateStructured({
      model,
      input: "Return JSON with ok set to true.",
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
      structuredOutput: true,
      nativeJsonSchema: false,
      model,
      probedAt: new Date().toISOString(),
      notes: [
        "Structured JSON uses extraction, validation, and one repair attempt.",
      ],
    };
  }

  async #chat(
    request: TextGenerationRequest,
    extraSystem?: string,
    idempotencySuffix = "text",
    structured = false,
  ): Promise<GenerationResult<string>> {
    const messages = [
      ...(request.system || extraSystem
        ? [
            {
              role: "system",
              content: [request.system, extraSystem]
                .filter(Boolean)
                .join("\n\n"),
            },
          ]
        : []),
      { role: "user", content: request.input },
    ];
    const response = await this.#request("chat/completions", {
      method: "POST",
      ...(request.idempotencyKey === undefined
        ? {}
        : {
            headers: {
              "idempotency-key": `${request.idempotencyKey}:${idempotencySuffix}`,
            },
          }),
      signal: boundedSignal(request.signal, request.timeoutMs),
      body: JSON.stringify({
        model: request.model,
        messages,
        ...(request.maxOutputTokens === undefined
          ? {}
          : { max_tokens: request.maxOutputTokens }),
        ...(request.temperature === undefined
          ? {}
          : { temperature: request.temperature }),
        ...(this.#thinkingMode === undefined
          ? {}
          : { thinking: { type: this.#thinkingMode } }),
        ...(structured && this.#jsonObjectMode
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
    });
    const rawBody = await response.text();
    assertNoReflectedProviderSecret(rawBody, [this.#apiKey]);
    const body = JSON.parse(rawBody) as ChatResponse;
    const choice = body.choices?.[0];
    const value = choice?.message?.content;
    if (!value)
      throw new Error("The compatible provider returned an empty response.");
    const responseId =
      typeof body.id === "string" && body.id.length <= 500
        ? body.id
        : undefined;
    const responseModel =
      typeof body.model === "string" && body.model.length <= 500
        ? body.model
        : request.model;
    const finishReason =
      typeof choice.finish_reason === "string" &&
      choice.finish_reason.length <= 200
        ? choice.finish_reason
        : undefined;
    for (const metadata of [responseId, responseModel, finishReason]) {
      if (metadata !== undefined)
        assertNoReflectedProviderSecret(metadata, [this.#apiKey]);
    }
    return {
      value,
      model: responseModel,
      ...(responseId === undefined ? {} : { responseId }),
      usage: this.normalizeUsage(body.usage),
      ...(finishReason === undefined ? {} : { rawFinishReason: finishReason }),
    };
  }

  generateText(
    request: TextGenerationRequest,
  ): Promise<GenerationResult<string>> {
    return this.#chat(request);
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<GenerationResult<T>> {
    const schemaInstruction = `Return only one JSON value that conforms exactly to this JSON Schema:\n${JSON.stringify(request.schema)}`;
    const first = await this.#chat(
      request,
      schemaInstruction,
      "structured-initial",
      true,
    );
    let parsed: unknown;
    try {
      parsed = extractJsonValue(first.value);
    } catch {
      parsed = undefined;
    }
    if (request.validate(parsed)) return { ...first, value: parsed };

    const repaired = await this.#chat(
      {
        ...request,
        input: `Repair the following invalid response. Return only corrected JSON.\n\n${first.value.slice(0, 12_000)}`,
      },
      schemaInstruction,
      "structured-repair",
      true,
    );
    const repairedValue = extractJsonValue(repaired.value);
    if (!request.validate(repairedValue)) {
      throw Object.assign(
        new Error(
          "The compatible provider failed structured validation after one repair attempt.",
        ),
        { code: "INVALID_RESPONSE" },
      );
    }
    return {
      ...repaired,
      value: repairedValue,
      usage: {
        inputTokens: first.usage.inputTokens + repaired.usage.inputTokens,
        outputTokens: first.usage.outputTokens + repaired.usage.outputTokens,
        totalTokens: first.usage.totalTokens + repaired.usage.totalTokens,
      },
    };
  }

  normalizeUsage(raw: unknown): NormalizedUsage {
    const usage = raw as ChatResponse["usage"];
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
      ...(usage?.prompt_tokens_details?.cached_tokens === undefined
        ? {}
        : { cachedInputTokens: usage.prompt_tokens_details.cached_tokens }),
      ...(usage?.completion_tokens_details?.reasoning_tokens === undefined
        ? {}
        : {
            reasoningTokens: usage.completion_tokens_details.reasoning_tokens,
          }),
    };
  }

  normalizeError = normalizeProviderError;
}
