export type ProviderKind = "openai" | "compatible" | "mock";

export interface ProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
  localBaseUrlAllowlist?: readonly string[];
  /** Selected only by a server-owned preset; custom callers cannot set headers. */
  authHeader?: "authorization" | "api-key";
  /** Uses a fixed harmless generation for providers without a models endpoint. */
  validationModel?: string;
  /** Server-owned preset option for providers with a hybrid reasoning mode. */
  thinkingMode?: "disabled" | "enabled";
  /** Server-owned option for compatible providers that support JSON-object mode. */
  jsonObjectMode?: boolean;
}

export interface ModelDescriptor {
  id: string;
  ownedBy?: string;
}

export interface ProviderCapabilities {
  text: boolean;
  structuredOutput: boolean;
  nativeJsonSchema: boolean;
  model: string;
  probedAt: string;
  notes: string[];
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface TextGenerationRequest {
  model: string;
  system?: string;
  input: string;
  /** Stable per logical operation so a transport retry is not billed twice. */
  idempotencyKey?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface StructuredGenerationRequest<T> extends TextGenerationRequest {
  schemaName: string;
  schema: Record<string, unknown>;
  validate: (value: unknown) => value is T;
}

export interface GenerationResult<T> {
  value: T;
  model: string;
  responseId?: string;
  usage: NormalizedUsage;
  rawFinishReason?: string;
}

export interface ConnectionValidation {
  ok: boolean;
  latencyMs: number;
  safeMessage: string;
}

export interface NormalizedProviderError {
  code:
    | "AUTHENTICATION"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "CONNECTION"
    | "INVALID_RESPONSE"
    | "CONTENT_REFUSED"
    | "UNSUPPORTED"
    | "UNKNOWN";
  safeMessage: string;
  retryable: boolean;
  status?: number;
}

export interface AIProviderAdapter {
  readonly kind: ProviderKind;
  validateConnection(signal?: AbortSignal): Promise<ConnectionValidation>;
  listModels(signal?: AbortSignal): Promise<ModelDescriptor[]>;
  probeCapabilities(
    model: string,
    signal?: AbortSignal,
  ): Promise<ProviderCapabilities>;
  generateText(
    request: TextGenerationRequest,
  ): Promise<GenerationResult<string>>;
  generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<GenerationResult<T>>;
  normalizeUsage(raw: unknown): NormalizedUsage;
  normalizeError(error: unknown): NormalizedProviderError;
}
