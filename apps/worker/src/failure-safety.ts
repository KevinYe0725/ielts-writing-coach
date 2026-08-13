import type { NormalizedProviderError } from "@iwc/ai";

const internalFailureCodes = new Set([
  "PROVIDER_SECRET_UNAVAILABLE",
  "PROVIDER_NOT_FOUND",
  "SESSION_KEY_EXPIRED",
]);

export function trustedInternalFailureCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && internalFailureCodes.has(code)
    ? code
    : undefined;
}

export function safeRetryError(
  normalized: NormalizedProviderError,
): Error & { code: string } {
  const error = new Error(normalized.safeMessage) as Error & { code: string };
  error.name = "RetryableProviderError";
  error.code = normalized.code;
  return error;
}
