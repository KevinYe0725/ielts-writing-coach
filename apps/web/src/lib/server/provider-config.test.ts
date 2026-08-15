import { describe, expect, it } from "vitest";

import { ApiProblem } from "./problem";
import {
  probeProviderConnection,
  resolveProviderConfig,
} from "./provider-config";

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
    expect(result.credentials.thinkingMode).toBe("disabled");
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

describe("provider connection probing", () => {
  it("rejects a local HTTP base URL as a 422 problem with allowlist guidance", async () => {
    const resolved = resolveProviderConfig({
      vendor: "custom",
      kind: "compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "local-key",
      model: "local-model",
    });
    await expect(
      probeProviderConnection(resolved, {
        localBaseUrlAllowlist: [],
        model: "local-model",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiProblem);
      const problem = (error as ApiProblem).problem;
      expect(problem.status).toBe(422);
      expect(problem.code).toBe("PROVIDER_BASE_URL_REJECTED");
      expect(problem.detail).toContain("LOCAL_MODEL_BASE_URL_ALLOWLIST");
      return true;
    });
  });

  it("probes the deterministic mock provider without network access", async () => {
    const resolved = resolveProviderConfig({
      vendor: "mock",
      kind: "mock",
      model: "mock-deterministic-v1",
    });
    const probe = await probeProviderConnection(resolved, {
      localBaseUrlAllowlist: [],
      model: "mock-deterministic-v1",
    });
    expect(probe.validation.ok).toBe(true);
    expect(probe.capabilities?.structuredOutput).toBe(true);
  });

  it("turns a blocked base URL into a 422 problem, not a crash", async () => {
    const resolved = resolveProviderConfig({
      vendor: "custom",
      kind: "compatible",
      baseUrl: "https://127.0.0.1:9/v1",
      apiKey: "unreachable-key",
      model: "unreachable-model",
    });
    // Loopback is blocked by the SSRF policy before any network attempt, so
    // this exercises the same problem surface without external dependencies.
    await expect(
      probeProviderConnection(resolved, {
        localBaseUrlAllowlist: [],
        model: "unreachable-model",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiProblem);
      expect((error as ApiProblem).problem.status).toBe(422);
      return true;
    });
  });
});
