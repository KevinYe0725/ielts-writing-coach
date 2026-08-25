import { z } from "zod";

import { BraveSearchAdapter } from "@iwc/search";

import { apiRoute, ApiProblem } from "@/lib/server/problem";
import { parseJsonBody } from "@/lib/server/request";
import { requireRole, requireSession } from "@/lib/server/session";
import { enforceRateLimit, protectMutation } from "@/lib/server/security";

const testSchema = z
  .object({ api_key: z.string().trim().min(1).max(2_000) })
  .strict();

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  await enforceRateLimit(request, {
    bucket: "search-connection-test",
    limit: 10,
    windowSeconds: 15 * 60,
    identity: actor.id,
  });
  const payload = await parseJsonBody(request, testSchema, {
    maximumBytes: 8 * 1_024,
  });
  const validation = await new BraveSearchAdapter({
    apiKey: payload.api_key,
  }).validateConnection();
  if (!validation.ok) {
    throw new ApiProblem({
      title: "Search connection test failed",
      status: 422,
      code: "SEARCH_CONNECTION_TEST_FAILED",
      detail: validation.safeMessage,
    });
  }
  return Response.json(
    {
      ok: true,
      latency_ms: validation.latencyMs,
      safe_message: validation.safeMessage,
    },
    { headers: { "cache-control": "no-store" } },
  );
});
