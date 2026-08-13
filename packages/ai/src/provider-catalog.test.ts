import { describe, expect, it } from "vitest";

import {
  getProviderPreset,
  providerCatalog,
  providerCredentialsForPreset,
  providerVendorIds,
  resolveProviderPreset,
} from "./provider-catalog";

describe("provider catalog", () => {
  it("defines one unique preset for every public vendor ID", () => {
    expect(new Set(providerVendorIds).size).toBe(providerVendorIds.length);
    expect(providerCatalog.map((entry) => entry.id)).toEqual(providerVendorIds);
  });

  it("uses authoritative fixed hosted endpoints", () => {
    expect(
      resolveProviderPreset({
        vendor: "google_gemini",
        baseUrl: "https://attacker.invalid/v1",
      }),
    ).toMatchObject({
      kind: "compatible",
      vendor: "google_gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    });
  });

  it("keeps exact custom and Azure roots without appending a version", () => {
    expect(
      resolveProviderPreset({
        vendor: "custom",
        baseUrl: "https://models.example/api/v42",
      }).baseUrl,
    ).toBe("https://models.example/api/v42");
    expect(
      providerCredentialsForPreset({
        vendor: "azure_openai",
        baseUrl: "https://example.openai.azure.com/openai/v1",
      }).credentials.authHeader,
    ).toBe("api-key");
  });

  it("exposes non-empty defaults and bilingual guidance", () => {
    for (const preset of providerCatalog) {
      expect(getProviderPreset(preset.id).defaultModel.length).toBeGreaterThan(
        0,
      );
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.labelZh.length).toBeGreaterThan(0);
      expect(preset.compatibilityNoteEn.length).toBeGreaterThan(0);
      expect(preset.compatibilityNoteZh.length).toBeGreaterThan(0);
    }
  });
});
