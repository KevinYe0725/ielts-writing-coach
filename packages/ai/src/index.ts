import type {
  AIProviderAdapter,
  ProviderCredentials,
  ProviderKind,
} from "./types";
import { CompatibleAdapter } from "./compatible";
import { MockAdapter } from "./mock";
import { OpenAIAdapter } from "./openai";

export function createProviderAdapter(
  kind: ProviderKind,
  credentials: ProviderCredentials,
): AIProviderAdapter {
  switch (kind) {
    case "openai":
      return new OpenAIAdapter(credentials.apiKey ?? "");
    case "compatible":
      if (!credentials.baseUrl)
        throw new Error("A compatible provider requires a base URL.");
      return new CompatibleAdapter({
        baseUrl: credentials.baseUrl,
        ...(credentials.apiKey === undefined
          ? {}
          : { apiKey: credentials.apiKey }),
        ...(credentials.localBaseUrlAllowlist === undefined
          ? {}
          : { localBaseUrlAllowlist: credentials.localBaseUrlAllowlist }),
      });
    case "mock":
      return new MockAdapter();
  }
}

export * from "./compatible";
export * from "./crypto";
export * from "./errors";
export * from "./mock";
export * from "./openai";
export * from "./prompts";
export * from "./session-secrets";
export * from "./ssrf";
export * from "./types";
