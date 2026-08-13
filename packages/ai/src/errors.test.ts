import { describe, expect, it } from "vitest";

import {
  assertNoReflectedProviderSecret,
  normalizeProviderError,
  redactSensitiveText,
} from "./errors";

describe("provider error redaction", () => {
  it("redacts known credential shapes", () => {
    const text = redactSensitiveText(
      "Bearer abc.def.ghi api_key=secret-value sk-example123456",
    );
    expect(text).not.toContain("abc.def.ghi");
    expect(text).not.toContain("secret-value");
    expect(text).not.toContain("sk-example123456");
  });

  it("never exposes an arbitrary reflected credential from an unknown provider", () => {
    const sentinel = "credential-with-an-unusual-format-£-秘密-987";
    const normalized = normalizeProviderError({
      status: 418,
      code: "provider_teapot",
      message: `The upstream reflected ${sentinel}`,
    });
    expect(normalized).toEqual({
      code: "UNKNOWN",
      safeMessage: "The provider request failed.",
      retryable: false,
      status: 418,
    });
    expect(JSON.stringify(normalized)).not.toContain(sentinel);
  });

  it("rejects an exact custom-format credential before provider output is used", () => {
    const sentinel = "credential-with-an-unusual-format-£-秘密-987";
    expect(() =>
      assertNoReflectedProviderSecret(
        `A syntactically valid result that reflects ${sentinel}`,
        [sentinel],
      ),
    ).toThrow("invalid response");
    expect(() =>
      assertNoReflectedProviderSecret("A safe provider result", [sentinel]),
    ).not.toThrow();
  });

  it("scans structured provider payloads without relying on JSON escaping", () => {
    const sentinel = "credential-with\n-control-£-秘密-987";
    expect(() =>
      assertNoReflectedProviderSecret(
        { output: [{ nested: `reflected:${sentinel}` }] },
        [sentinel],
      ),
    ).toThrow("invalid response");

    const cyclic: { child?: unknown } = {};
    cyclic.child = cyclic;
    expect(() =>
      assertNoReflectedProviderSecret(cyclic, [sentinel]),
    ).not.toThrow();
  });

  it("normalizes malformed thrown values without throwing or reflecting fields", () => {
    const sentinel = "malformed-field-sentinel-£-秘密-987";
    for (const value of [
      null,
      sentinel,
      { status: sentinel, code: { value: sentinel }, message: [sentinel] },
      { error: { code: 42, message: { value: sentinel } } },
    ]) {
      const normalized = normalizeProviderError(value);
      expect(normalized).toMatchObject({
        code: "UNKNOWN",
        safeMessage: "The provider request failed.",
        retryable: false,
      });
      expect(JSON.stringify(normalized)).not.toContain(sentinel);
    }
  });
});
