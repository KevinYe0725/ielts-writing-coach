import { describe, expect, it } from "vitest";

import { safeRetryError, trustedInternalFailureCode } from "./failure-safety";

describe("worker failure safety", () => {
  it("does not trust an arbitrary provider error code as a database field", () => {
    const sentinel = "credential-with-an-unusual-format-£-秘密-987";
    expect(trustedInternalFailureCode({ code: sentinel })).toBeUndefined();
    expect(trustedInternalFailureCode({ code: "PROVIDER_NOT_FOUND" })).toBe(
      "PROVIDER_NOT_FOUND",
    );
  });

  it("throws only normalized text back to the queue logger", () => {
    const sentinel = "credential-with-an-unusual-format-£-秘密-987";
    const retry = safeRetryError({
      code: "CONNECTION",
      safeMessage: "The provider is temporarily unavailable.",
      retryable: true,
      status: 503,
    });
    expect(retry.name).toBe("RetryableProviderError");
    expect(retry.code).toBe("CONNECTION");
    expect(
      JSON.stringify({
        name: retry.name,
        message: retry.message,
        code: retry.code,
      }),
    ).not.toContain(sentinel);
  });
});
