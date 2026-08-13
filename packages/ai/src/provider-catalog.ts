import type { ProviderCredentials, ProviderKind } from "./types";

export const providerVendorIds = [
  "openai",
  "anthropic",
  "google_gemini",
  "deepseek",
  "qwen_china",
  "qwen_international",
  "moonshot",
  "zhipu",
  "minimax",
  "mistral",
  "xai",
  "groq",
  "openrouter",
  "together",
  "fireworks",
  "perplexity",
  "siliconflow",
  "nvidia_nim",
  "cerebras",
  "azure_openai",
  "ollama",
  "lm_studio",
  "custom",
  "mock",
] as const;

export type ProviderVendor = (typeof providerVendorIds)[number];
export type ProviderRegion = "global" | "china" | "local" | "custom";

export interface ProviderPreset {
  id: ProviderVendor;
  label: string;
  labelZh: string;
  kind: ProviderKind;
  region: ProviderRegion;
  baseUrl: string | null;
  defaultModel: string;
  apiKeyPlaceholder: string;
  configurableBaseUrl: boolean;
  authHeader: "authorization" | "api-key";
  docsUrl: string | null;
  compatibilityNoteZh: string;
  compatibilityNoteEn: string;
}

const compatible = (
  preset: Omit<ProviderPreset, "kind" | "authHeader" | "configurableBaseUrl"> &
    Partial<Pick<ProviderPreset, "authHeader" | "configurableBaseUrl">>,
): ProviderPreset => ({
  ...preset,
  kind: "compatible",
  authHeader: preset.authHeader ?? "authorization",
  configurableBaseUrl: preset.configurableBaseUrl ?? false,
});

/**
 * Product-facing presets. Fixed hosted endpoints are authoritative on the
 * server; only explicit enterprise/local/custom presets accept a user URL.
 * Model IDs remain editable because providers change their catalog often.
 */
export const providerCatalog: readonly ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    labelZh: "OpenAI",
    kind: "openai",
    region: "global",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.4-mini",
    apiKeyPlaceholder: "sk-…",
    configurableBaseUrl: false,
    authHeader: "authorization",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    compatibilityNoteZh: "官方 Responses API 与原生结构化输出。",
    compatibilityNoteEn:
      "Official Responses API with native structured output.",
  },
  compatible({
    id: "anthropic",
    label: "Anthropic Claude",
    labelZh: "Anthropic Claude",
    region: "global",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-opus-5",
    apiKeyPlaceholder: "sk-ant-…",
    docsUrl: "https://platform.claude.com/docs/en/api/openai-sdk",
    compatibilityNoteZh:
      "使用 Anthropic 官方 OpenAI SDK 兼容层；保存前会验证结构化结果。",
    compatibilityNoteEn:
      "Uses Anthropic's official OpenAI SDK compatibility layer and probes structured results before saving.",
  }),
  compatible({
    id: "google_gemini",
    label: "Google Gemini",
    labelZh: "Google Gemini",
    region: "global",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.6-flash",
    apiKeyPlaceholder: "AIza…",
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
    compatibilityNoteZh: "使用 Google 官方 OpenAI 兼容入口。",
    compatibilityNoteEn: "Uses Google's official OpenAI-compatible endpoint.",
  }),
  compatible({
    id: "deepseek",
    label: "DeepSeek",
    labelZh: "DeepSeek",
    region: "china",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    apiKeyPlaceholder: "sk-…",
    docsUrl: "https://api-docs.deepseek.com/",
    compatibilityNoteZh: "使用 DeepSeek 官方 OpenAI 兼容入口。",
    compatibilityNoteEn: "Uses DeepSeek's official OpenAI-compatible endpoint.",
  }),
  compatible({
    id: "qwen_china",
    label: "Alibaba Qwen (China)",
    labelZh: "阿里云通义千问（中国）",
    region: "china",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    apiKeyPlaceholder: "sk-…",
    docsUrl:
      "https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope",
    compatibilityNoteZh: "阿里云百炼中国站兼容入口。",
    compatibilityNoteEn:
      "Alibaba Model Studio's OpenAI-compatible China endpoint.",
  }),
  compatible({
    id: "qwen_international",
    label: "Alibaba Qwen (International)",
    labelZh: "阿里云通义千问（国际）",
    region: "global",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    apiKeyPlaceholder: "sk-…",
    docsUrl:
      "https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope",
    compatibilityNoteZh: "阿里云百炼国际站兼容入口。",
    compatibilityNoteEn:
      "Alibaba Model Studio's OpenAI-compatible international endpoint.",
  }),
  compatible({
    id: "moonshot",
    label: "Moonshot Kimi",
    labelZh: "月之暗面 Kimi",
    region: "china",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k3",
    apiKeyPlaceholder: "sk-…",
    docsUrl: "https://platform.moonshot.cn/docs/api/chat",
    compatibilityNoteZh: "使用 Moonshot 官方兼容入口。",
    compatibilityNoteEn: "Uses Moonshot's official compatible endpoint.",
  }),
  compatible({
    id: "zhipu",
    label: "Zhipu GLM",
    labelZh: "智谱 GLM",
    region: "china",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    apiKeyPlaceholder: "API key",
    docsUrl: "https://docs.bigmodel.cn/cn/guide/develop/openai/introduction",
    compatibilityNoteZh: "使用智谱官方 OpenAI 兼容入口。",
    compatibilityNoteEn: "Uses Zhipu's official OpenAI-compatible endpoint.",
  }),
  compatible({
    id: "minimax",
    label: "MiniMax",
    labelZh: "MiniMax",
    region: "china",
    baseUrl: "https://api.minimax.io/v1",
    defaultModel: "MiniMax-M3",
    apiKeyPlaceholder: "API key",
    docsUrl: "https://platform.minimax.io/docs/api-reference/text-openai-api",
    compatibilityNoteZh: "使用 MiniMax 的 OpenAI 兼容文本入口。",
    compatibilityNoteEn: "Uses MiniMax's OpenAI-compatible text endpoint.",
  }),
  compatible({
    id: "mistral",
    label: "Mistral AI",
    labelZh: "Mistral AI",
    region: "global",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    apiKeyPlaceholder: "API key",
    docsUrl: "https://docs.mistral.ai/api/",
    compatibilityNoteZh: "使用 Mistral 官方 Chat Completions 入口。",
    compatibilityNoteEn: "Uses Mistral's official Chat Completions endpoint.",
  }),
  compatible({
    id: "xai",
    label: "xAI Grok",
    labelZh: "xAI Grok",
    region: "global",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    apiKeyPlaceholder: "xai-…",
    docsUrl: "https://docs.x.ai/docs/guides/openai-sdk",
    compatibilityNoteZh: "使用 xAI 官方 OpenAI 兼容入口。",
    compatibilityNoteEn: "Uses xAI's official OpenAI-compatible endpoint.",
  }),
  compatible({
    id: "groq",
    label: "Groq",
    labelZh: "Groq",
    region: "global",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    apiKeyPlaceholder: "gsk_…",
    docsUrl: "https://console.groq.com/docs/openai",
    compatibilityNoteZh: "使用 Groq 官方 OpenAI 兼容入口。",
    compatibilityNoteEn: "Uses Groq's official OpenAI-compatible endpoint.",
  }),
  compatible({
    id: "openrouter",
    label: "OpenRouter",
    labelZh: "OpenRouter 聚合平台",
    region: "global",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    apiKeyPlaceholder: "sk-or-…",
    docsUrl: "https://openrouter.ai/docs/api-reference/overview",
    compatibilityNoteZh: "模型 ID 需包含供应商前缀。",
    compatibilityNoteEn: "Model IDs must include the provider prefix.",
  }),
  compatible({
    id: "together",
    label: "Together AI",
    labelZh: "Together AI",
    region: "global",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    apiKeyPlaceholder: "API key",
    docsUrl: "https://docs.together.ai/docs/openai-api-compatibility",
    compatibilityNoteZh: "使用 Together 官方兼容入口。",
    compatibilityNoteEn: "Uses Together's official compatible endpoint.",
  }),
  compatible({
    id: "fireworks",
    label: "Fireworks AI",
    labelZh: "Fireworks AI",
    region: "global",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    apiKeyPlaceholder: "fw_…",
    docsUrl: "https://docs.fireworks.ai/tools-sdks/openai-compatibility",
    compatibilityNoteZh: "模型 ID 通常包含 accounts 路径。",
    compatibilityNoteEn: "Model IDs commonly include an accounts path.",
  }),
  compatible({
    id: "perplexity",
    label: "Perplexity",
    labelZh: "Perplexity",
    region: "global",
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar",
    apiKeyPlaceholder: "pplx-…",
    docsUrl: "https://docs.perplexity.ai/guides/chat-completions-guide",
    compatibilityNoteZh: "使用 Perplexity Chat Completions 入口。",
    compatibilityNoteEn: "Uses Perplexity's Chat Completions endpoint.",
  }),
  compatible({
    id: "siliconflow",
    label: "SiliconFlow",
    labelZh: "硅基流动 SiliconFlow",
    region: "china",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    apiKeyPlaceholder: "sk-…",
    docsUrl:
      "https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions",
    compatibilityNoteZh: "使用硅基流动官方兼容入口。",
    compatibilityNoteEn: "Uses SiliconFlow's official compatible endpoint.",
  }),
  compatible({
    id: "nvidia_nim",
    label: "NVIDIA NIM",
    labelZh: "NVIDIA NIM",
    region: "global",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.3-70b-instruct",
    apiKeyPlaceholder: "nvapi-…",
    docsUrl: "https://docs.api.nvidia.com/nim/reference/llm-apis",
    compatibilityNoteZh: "使用 NVIDIA 托管 NIM 兼容入口。",
    compatibilityNoteEn: "Uses NVIDIA's hosted NIM-compatible endpoint.",
  }),
  compatible({
    id: "cerebras",
    label: "Cerebras",
    labelZh: "Cerebras",
    region: "global",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama-3.3-70b",
    apiKeyPlaceholder: "csk-…",
    docsUrl:
      "https://inference-docs.cerebras.ai/api-reference/chat-completions",
    compatibilityNoteZh: "使用 Cerebras 官方兼容入口。",
    compatibilityNoteEn: "Uses Cerebras's official compatible endpoint.",
  }),
  compatible({
    id: "azure_openai",
    label: "Azure OpenAI",
    labelZh: "Azure OpenAI",
    region: "custom",
    baseUrl: null,
    defaultModel: "deployment-name",
    apiKeyPlaceholder: "Azure API key",
    configurableBaseUrl: true,
    authHeader: "api-key",
    docsUrl:
      "https://learn.microsoft.com/azure/ai-foundry/openai/api-version-lifecycle",
    compatibilityNoteZh: "填写资源的 OpenAI v1 根地址；模型 ID 使用部署名称。",
    compatibilityNoteEn:
      "Enter the resource's OpenAI v1 root URL; use the deployment name as the model ID.",
  }),
  compatible({
    id: "ollama",
    label: "Ollama",
    labelZh: "Ollama 本地模型",
    region: "local",
    baseUrl: "http://host.docker.internal:11434/v1",
    defaultModel: "llama3.2",
    apiKeyPlaceholder: "Optional",
    configurableBaseUrl: true,
    docsUrl: "https://docs.ollama.com/api/openai-compatibility",
    compatibilityNoteZh: "本地地址必须由实例管理员加入精确 allowlist。",
    compatibilityNoteEn:
      "The instance operator must add local URLs to the exact allowlist.",
  }),
  compatible({
    id: "lm_studio",
    label: "LM Studio",
    labelZh: "LM Studio 本地模型",
    region: "local",
    baseUrl: "http://host.docker.internal:1234/v1",
    defaultModel: "local-model",
    apiKeyPlaceholder: "Optional",
    configurableBaseUrl: true,
    docsUrl: "https://lmstudio.ai/docs/developer/openai-compat",
    compatibilityNoteZh: "本地地址必须由实例管理员加入精确 allowlist。",
    compatibilityNoteEn:
      "The instance operator must add local URLs to the exact allowlist.",
  }),
  compatible({
    id: "custom",
    label: "Custom OpenAI-compatible",
    labelZh: "自定义 OpenAI-compatible",
    region: "custom",
    baseUrl: null,
    defaultModel: "your-model-id",
    apiKeyPlaceholder: "API key (optional for local)",
    configurableBaseUrl: true,
    docsUrl: null,
    compatibilityNoteZh: "填写精确 API 根地址；系统不会自动追加 /v1。",
    compatibilityNoteEn:
      "Enter the exact API root; the system does not append /v1 automatically.",
  }),
  {
    id: "mock",
    label: "Mock (demo only)",
    labelZh: "Mock（仅演示）",
    kind: "mock",
    region: "local",
    baseUrl: null,
    defaultModel: "mock-ielts-demo",
    apiKeyPlaceholder: "",
    configurableBaseUrl: false,
    authHeader: "authorization",
    docsUrl: null,
    compatibilityNoteZh: "确定性演示数据，不进行语言评分或能力晋级。",
    compatibilityNoteEn:
      "Deterministic demo data; no language scoring or mastery transition.",
  },
] as const;

export function getProviderPreset(vendor: ProviderVendor): ProviderPreset {
  const preset = providerCatalog.find((entry) => entry.id === vendor);
  if (!preset) throw new Error(`Unknown provider vendor: ${vendor}`);
  return preset;
}

export function isProviderVendor(value: unknown): value is ProviderVendor {
  return (
    typeof value === "string" &&
    (providerVendorIds as readonly string[]).includes(value)
  );
}

export function providerPresetNeedsApiKey(vendor: ProviderVendor): boolean {
  return !["mock", "ollama", "lm_studio", "custom"].includes(vendor);
}

export function inferProviderVendor(
  kind: ProviderKind,
  storedVendor?: string | null,
): ProviderVendor {
  if (isProviderVendor(storedVendor)) return storedVendor;
  if (kind === "openai") return "openai";
  if (kind === "mock") return "mock";
  return "custom";
}

export function resolveProviderPreset(input: {
  vendor: ProviderVendor;
  baseUrl?: string | null;
}): {
  kind: ProviderKind;
  vendor: ProviderVendor;
  baseUrl?: string;
  authHeader: "authorization" | "api-key";
} {
  const preset = getProviderPreset(input.vendor);
  const requested = input.baseUrl?.trim() || undefined;
  const baseUrl = preset.configurableBaseUrl ? requested : preset.baseUrl;
  if (preset.kind === "compatible" && !baseUrl)
    throw new Error(`${preset.label} requires a base URL.`);
  return {
    kind: preset.kind,
    vendor: preset.id,
    ...(baseUrl ? { baseUrl } : {}),
    authHeader: preset.authHeader,
  };
}

export function providerCredentialsForPreset(input: {
  vendor: ProviderVendor;
  baseUrl?: string | null;
  apiKey?: string;
  localBaseUrlAllowlist?: readonly string[];
  validationModel?: string;
}): { kind: ProviderKind; credentials: ProviderCredentials } {
  const resolved = resolveProviderPreset(input);
  return {
    kind: resolved.kind,
    credentials: {
      ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
      ...(resolved.baseUrl === undefined ? {} : { baseUrl: resolved.baseUrl }),
      ...(input.localBaseUrlAllowlist === undefined
        ? {}
        : { localBaseUrlAllowlist: input.localBaseUrlAllowlist }),
      authHeader: resolved.authHeader,
      ...(input.validationModel === undefined
        ? {}
        : { validationModel: input.validationModel }),
    },
  };
}
