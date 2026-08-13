import { describe, expect, it } from "vitest";

import { resolveProviderConfig } from "./provider-config";

describe("provider preset resolution", () => {
  it("does not let a client override a managed provider endpoint", () => {
    const result = resolveProviderConfig({
      vendor: "deepseek",
      kind: "compatible",
      baseUrl: "https://attacker.invalid/v1",
      apiKey: "test-key",
      model: "deepseek-v4-flash",
    });
    expect(result.credentials.baseUrl).toBe("https://api.deepseek.com");
    expect(result.credentials.validationModel).toBe("deepseek-v4-flash");
  });

  it("accepts an exact custom endpoint while retaining Bearer auth", () => {
    const result = resolveProviderConfig({
      vendor: "custom",
      kind: "compatible",
      baseUrl: "https://models.example/company/api/v2",
      model: "company-model",
    });
    expect(result.credentials).toMatchObject({
      authHeader: "authorization",
      baseUrl: "https://models.example/company/api/v2",
      validationModel: "company-model",
    });
  });

  it("rejects a forged protocol for a known vendor", () => {
    expect(() =>
      resolveProviderConfig({ vendor: "google_gemini", kind: "openai" }),
    ).toThrow("selected provider does not use the submitted protocol");
  });
});
