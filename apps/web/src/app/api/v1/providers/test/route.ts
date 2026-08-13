import { z } from "zod";

import {
  createProviderAdapter,
  providerVendorIds,
  validateProviderBaseUrl,
} from "@iwc/ai";
import { localModelAllowlist } from "@iwc/config";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import {
  providerNeedsApiKey,
  resolveProviderConfig,
} from "@/lib/server/provider-config";
import { parseJsonBody } from "@/lib/server/request";
import { requireRole, requireSession } from "@/lib/server/session";
import { enforceRateLimit, protectMutation } from "@/lib/server/security";

const testSchema = z
  .object({
    kind: z.enum(["openai", "compatible", "mock"]).optional(),
    vendor: z.enum(providerVendorIds).optional(),
    api_key: z.string().max(2_000).optional(),
    base_url: z.url().optional(),
    model: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  await enforceRateLimit(request, {
    bucket: "provider-test",
    limit: 10,
    windowSeconds: 15 * 60,
    identity: actor.id,
  });
  const payload = await parseJsonBody(request, testSchema, {
    maximumBytes: 8 * 1_024,
  });
  const { environment } = getServerContext();
  const resolved = resolveProviderConfig({
    vendor: payload.vendor,
    kind: payload.kind,
    baseUrl: payload.base_url,
    apiKey: payload.api_key,
    model: payload.model,
    localBaseUrlAllowlist: localModelAllowlist(environment),
  });
  if (providerNeedsApiKey(resolved.vendor) && !payload.api_key) {
    throw new ApiProblem({
      title: "API key required",
      status: 422,
      code: "API_KEY_REQUIRED",
      detail: "Testing a new provider requires the complete API key.",
    });
  }
  if (resolved.credentials.baseUrl)
    await validateProviderBaseUrl(
      resolved.credentials.baseUrl,
      localModelAllowlist(environment),
    );
  const adapter = createProviderAdapter(resolved.kind, resolved.credentials);
  const validation = await adapter.validateConnection();
  if (!validation.ok) {
    throw new ApiProblem({
      title: "Provider test failed",
      status: 422,
      code: "PROVIDER_TEST_FAILED",
      detail: validation.safeMessage,
    });
  }
  const capabilities = payload.model
    ? await adapter.probeCapabilities(payload.model)
    : undefined;
  return Response.json(
    {
      ok: true,
      latency_ms: validation.latencyMs,
      safe_message: validation.safeMessage,
      capabilities: capabilities ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
});
