import { z } from "zod";

import { createProviderAdapter, validateProviderBaseUrl } from "@iwc/ai";
import { localModelAllowlist } from "@iwc/config";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseJsonBody } from "@/lib/server/request";
import { requireRole, requireSession } from "@/lib/server/session";
import { enforceRateLimit, protectMutation } from "@/lib/server/security";

const testSchema = z
  .object({
    kind: z.enum(["openai", "compatible", "mock"]),
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
  if (payload.kind === "compatible" && !payload.base_url) {
    throw new ApiProblem({
      title: "Base URL required",
      status: 422,
      code: "BASE_URL_REQUIRED",
      detail: "A compatible provider requires a base URL.",
    });
  }
  if (payload.kind !== "mock" && !payload.api_key) {
    throw new ApiProblem({
      title: "API key required",
      status: 422,
      code: "API_KEY_REQUIRED",
      detail: "Testing a new provider requires the complete API key.",
    });
  }
  if (payload.base_url)
    await validateProviderBaseUrl(
      payload.base_url,
      localModelAllowlist(environment),
    );
  const adapter = createProviderAdapter(payload.kind, {
    ...(payload.api_key === undefined ? {} : { apiKey: payload.api_key }),
    ...(payload.base_url === undefined ? {} : { baseUrl: payload.base_url }),
    localBaseUrlAllowlist: localModelAllowlist(environment),
  });
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
