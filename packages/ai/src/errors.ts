import type { NormalizedProviderError } from "./types";

const secretPatterns = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~-]+/gi,
  /api[_-]?key["'\s:=]+[^\s,"']+/gi,
];

/**
 * Reject a provider payload that reflects a credential sent to that provider.
 *
 * Pattern redaction is useful for diagnostics, but it cannot recognize every
 * custom key format. Exact comparison against the credential used for this
 * request closes that gap before provider-controlled text can reach a job
 * result, database row, UI response, or learner export.
 */
export function assertNoReflectedProviderSecret(
  value: unknown,
  secrets: readonly (string | undefined)[],
): void {
  const candidates = secrets.filter(
    (secret): secret is string =>
      typeof secret === "string" && secret.length > 0,
  );
  const visited = new WeakSet<object>();

  function containsSecret(input: unknown): boolean {
    if (typeof input === "string") {
      return candidates.some((secret) => input.includes(secret));
    }
    if (!input || typeof input !== "object") return false;
    if (visited.has(input)) return false;
    visited.add(input);
    if (Array.isArray(input)) return input.some(containsSecret);
    return Object.entries(input as Record<string, unknown>).some(
      ([key, item]) => containsSecret(key) || containsSecret(item),
    );
  }

  const reflected = candidates.length > 0 && containsSecret(value);
  if (reflected) {
    const error = new Error(
      "The provider returned an invalid response containing protected credential material.",
    ) as Error & { code: string };
    error.code = "INVALID_RESPONSE";
    throw error;
  }
}

export function redactSensitiveText(value: string): string {
  return secretPatterns.reduce(
    (result, pattern) => result.replace(pattern, "[REDACTED]"),
    value,
  );
}

export function normalizeProviderError(
  error: unknown,
): NormalizedProviderError {
  const record = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const candidate = record(error);
  const nested = record(candidate.error);
  const status =
    typeof candidate.status === "number" &&
    Number.isInteger(candidate.status) &&
    candidate.status >= 100 &&
    candidate.status <= 599
      ? candidate.status
      : undefined;
  const code =
    typeof candidate.code === "string"
      ? candidate.code
      : typeof nested.code === "string"
        ? nested.code
        : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const rawMessage =
    typeof candidate.message === "string"
      ? candidate.message
      : typeof nested.message === "string"
        ? nested.message
        : "The provider request failed.";
  const safeMessage = redactSensitiveText(rawMessage).slice(0, 500);
  const optionalStatus = status === undefined ? {} : { status };

  if (status === 401 || status === 403 || /auth|invalid_api_key/i.test(code)) {
    return {
      code: "AUTHENTICATION",
      safeMessage: "The provider rejected the credentials.",
      retryable: false,
      ...optionalStatus,
    };
  }
  if (status === 429 || /rate/i.test(code)) {
    return {
      code: "RATE_LIMITED",
      safeMessage: "The provider rate limit was reached.",
      retryable: true,
      ...optionalStatus,
    };
  }
  if (
    name === "AbortError" ||
    /timeout|timed out/i.test(`${code} ${safeMessage}`)
  ) {
    return {
      code: "TIMEOUT",
      safeMessage: "The provider request timed out.",
      retryable: true,
      ...optionalStatus,
    };
  }
  if (/refus|content_filter/i.test(`${code} ${safeMessage}`)) {
    return {
      code: "CONTENT_REFUSED",
      safeMessage: "The provider declined to produce this response.",
      retryable: false,
      ...optionalStatus,
    };
  }
  if (status !== undefined && status >= 500) {
    return {
      code: "CONNECTION",
      safeMessage: "The provider is temporarily unavailable.",
      retryable: true,
      ...optionalStatus,
    };
  }
  if (/json|schema|parse|invalid response/i.test(`${code} ${safeMessage}`)) {
    return {
      code: "INVALID_RESPONSE",
      safeMessage: "The provider returned an invalid structured response.",
      retryable: false,
      ...optionalStatus,
    };
  }

  // Provider bodies are untrusted and may reflect credentials in formats that
  // no pattern-based redactor can anticipate. Use them only for local
  // classification; never persist or return the raw text.
  return {
    code: "UNKNOWN",
    safeMessage: "The provider request failed.",
    retryable: false,
    ...(status === undefined ? {} : { status }),
  };
}
