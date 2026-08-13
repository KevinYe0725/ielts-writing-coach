import {
  getProviderPreset,
  inferProviderVendor,
  isProviderVendor,
  providerCredentialsForPreset,
  providerPresetNeedsApiKey,
  type ProviderKind,
  type ProviderVendor,
} from "@iwc/ai";

import { ApiProblem } from "./problem";

export interface ProviderConfigInput {
  vendor?: string | null | undefined;
  kind?: ProviderKind | null | undefined;
  baseUrl?: string | null | undefined;
  apiKey?: string | undefined;
  model?: string | undefined;
  localBaseUrlAllowlist?: readonly string[] | undefined;
}

export function resolveProviderConfig(input: ProviderConfigInput) {
  const vendor: ProviderVendor = input.vendor
    ? isProviderVendor(input.vendor)
      ? input.vendor
      : (() => {
          throw new ApiProblem({
            title: "Unknown provider",
            status: 422,
            code: "UNKNOWN_PROVIDER_VENDOR",
            detail:
              "Select a supported provider preset or Custom OpenAI-compatible.",
          });
        })()
    : inferProviderVendor(input.kind ?? "openai");
  const preset = getProviderPreset(vendor);
  if (input.kind && input.kind !== preset.kind) {
    throw new ApiProblem({
      title: "Provider protocol mismatch",
      status: 422,
      code: "PROVIDER_PROTOCOL_MISMATCH",
      detail: "The selected provider does not use the submitted protocol.",
    });
  }
  let resolved: ReturnType<typeof providerCredentialsForPreset>;
  try {
    resolved = providerCredentialsForPreset({
      vendor,
      ...(input.baseUrl == null ? {} : { baseUrl: input.baseUrl }),
      ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
      ...(input.model === undefined ? {} : { validationModel: input.model }),
      ...(input.localBaseUrlAllowlist === undefined
        ? {}
        : { localBaseUrlAllowlist: input.localBaseUrlAllowlist }),
    });
  } catch (error) {
    throw new ApiProblem({
      title: "Provider configuration invalid",
      status: 422,
      code: "PROVIDER_CONFIGURATION_INVALID",
      detail:
        error instanceof Error
          ? error.message
          : "The provider configuration is invalid.",
    });
  }
  return { vendor, preset, ...resolved };
}

export function providerNeedsApiKey(vendor: ProviderVendor): boolean {
  return providerPresetNeedsApiKey(vendor);
}
