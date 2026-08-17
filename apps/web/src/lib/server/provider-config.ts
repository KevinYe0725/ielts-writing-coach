import {
  createProviderAdapter,
  getProviderPreset,
  inferProviderVendor,
  isProviderVendor,
  providerCredentialsForPreset,
  providerPresetNeedsApiKey,
  validateProviderBaseUrl,
  type ConnectionValidation,
  type ProviderCapabilities,
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

/**
 * Validates the resolved provider credentials: base URL policy (SSRF checks),
 * a fixed-sample connection probe, and an optional structured-output
 * capability probe. Every provider-side failure — including DNS problems,
 * refused credentials, timeouts, malformed responses, and blocked base URLs —
 * is surfaced as a 422 problem so the learner sees an actionable message
 * instead of an opaque 500.
 */
export async function probeProviderConnection(
  resolved: ReturnType<typeof resolveProviderConfig>,
  options: {
    localBaseUrlAllowlist?: readonly string[];
    model?: string | undefined;
  },
): Promise<{
  validation: ConnectionValidation;
  capabilities: ProviderCapabilities | undefined;
}> {
  if (resolved.credentials.baseUrl) {
    try {
      await validateProviderBaseUrl(
        resolved.credentials.baseUrl,
        options.localBaseUrlAllowlist ?? [],
      );
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "The provider base URL is not allowed.";
      // The SSRF layer already explains fake-IP/proxy and private-address
      // rejections. Only the local-model cases need the allowlist guidance.
      const allowlistHint = /allowlist|HTTPS|https/i.test(reason)
        ? " To permit an exact local model URL, add it to the LOCAL_MODEL_BASE_URL_ALLOWLIST environment variable and restart."
        : "";
      throw new ApiProblem({
        title: "Provider URL rejected",
        status: 422,
        code: "PROVIDER_BASE_URL_REJECTED",
        detail: `${reason}${allowlistHint}`,
      });
    }
  }

  let adapter: ReturnType<typeof createProviderAdapter>;
  try {
    adapter = createProviderAdapter(resolved.kind, resolved.credentials);
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

  let validation: ConnectionValidation;
  try {
    validation = await adapter.validateConnection();
  } catch (error) {
    validation = {
      ok: false,
      latencyMs: 0,
      safeMessage: adapter.normalizeError(error).safeMessage,
    };
  }
  if (!validation.ok) {
    throw new ApiProblem({
      title: "Provider test failed",
      status: 422,
      code: "PROVIDER_TEST_FAILED",
      detail: validation.safeMessage,
    });
  }

  let capabilities: ProviderCapabilities | undefined;
  if (options.model) {
    try {
      capabilities = await adapter.probeCapabilities(options.model);
    } catch (error) {
      throw new ApiProblem({
        title: "Provider test failed",
        status: 422,
        code: "PROVIDER_TEST_FAILED",
        detail: adapter.normalizeError(error).safeMessage,
      });
    }
  }
  return { validation, capabilities };
}
