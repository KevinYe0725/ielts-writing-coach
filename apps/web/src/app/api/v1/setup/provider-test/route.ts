import { count } from "drizzle-orm";
import { z } from "zod";

import {
  createProviderAdapter,
  providerVendorIds,
  validateProviderBaseUrl,
} from "@iwc/ai";
import { digestOpaqueToken, tokenMatchesDigest } from "@iwc/auth";
import { localModelAllowlist } from "@iwc/config";
import { instanceConfiguration, user } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import {
  providerNeedsApiKey,
  resolveProviderConfig,
} from "@/lib/server/provider-config";
import { parseJsonBody } from "@/lib/server/request";
import { enforceRateLimit, protectMutation } from "@/lib/server/security";

const setupProviderTestSchema = z
  .object({
    setup_token: z.string().min(16).max(512),
    kind: z.enum(["openai", "compatible", "mock"]).optional(),
    vendor: z.enum(providerVendorIds).optional(),
    api_key: z.string().max(2_000).optional(),
    base_url: z.url().optional(),
    model: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

/** A setup-token-scoped fixed-sample probe. It never persists the credential. */
export const POST = apiRoute(async (request) => {
  protectMutation(request);
  await enforceRateLimit(request, {
    bucket: "setup-provider-test",
    limit: 10,
    windowSeconds: 15 * 60,
  });
  const payload = await parseJsonBody(request, setupProviderTestSchema, {
    maximumBytes: 8 * 1_024,
  });
  const { db, environment } = getServerContext();
  if (
    !environment.SETUP_TOKEN ||
    !tokenMatchesDigest(
      payload.setup_token,
      digestOpaqueToken(environment.SETUP_TOKEN),
    )
  ) {
    throw new ApiProblem({
      title: "Invalid setup token",
      status: 401,
      code: "INVALID_SETUP_TOKEN",
      detail: "The one-time setup token is invalid.",
    });
  }
  const [[users], configuration] = await Promise.all([
    db.select({ count: count() }).from(user),
    db.query.instanceConfiguration.findFirst(),
  ]);
  if ((users?.count ?? 0) > 0 || configuration?.setupCompletedAt) {
    throw new ApiProblem({
      title: "Setup already completed",
      status: 409,
      code: "SETUP_ALREADY_COMPLETED",
      detail: "Use the authenticated provider settings after initial setup.",
    });
  }
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
      detail: "Testing a provider requires the complete API key.",
    });
  }
  if (resolved.credentials.baseUrl) {
    await validateProviderBaseUrl(
      resolved.credentials.baseUrl,
      localModelAllowlist(environment),
    );
  }
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
