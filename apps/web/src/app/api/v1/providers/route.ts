import { desc, inArray } from "drizzle-orm";
import { z } from "zod";

import { providerVendorIds } from "@iwc/ai";
import { providerConnection, user } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { saveProviderConnection } from "@/lib/server/provider-save";
import { parseJsonBody } from "@/lib/server/request";
import { requireRole, requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  enforceRateLimit,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const providerSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["openai", "compatible", "mock"]).optional(),
    vendor: z.enum(providerVendorIds).optional(),
    base_url: z.url().optional(),
    api_key: z.string().max(2_000).optional(),
    secret_mode: z.enum(["encrypted", "session_only"]).default("encrypted"),
    test_model: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  const { db, environment } = getServerContext();
  const deploymentMode =
    (
      await db.query.instanceConfiguration.findFirst({
        columns: { deploymentMode: true },
      })
    )?.deploymentMode ?? environment.DEPLOYMENT_MODE;
  const privilegedOwners =
    deploymentMode === "shared"
      ? await db.query.user.findMany({
          columns: { id: true },
          where: inArray(user.role, ["owner", "admin"]),
        })
      : [{ id: actor.id }];
  const records = await db
    .select({
      id: providerConnection.id,
      name: providerConnection.name,
      kind: providerConnection.kind,
      vendor: providerConnection.vendor,
      baseUrl: providerConnection.baseUrl,
      secretMode: providerConnection.secretMode,
      enabled: providerConnection.enabled,
      lastTestedAt: providerConnection.lastTestedAt,
      capabilities: providerConnection.capabilities,
      createdAt: providerConnection.createdAt,
    })
    .from(providerConnection)
    .where(
      inArray(
        providerConnection.ownerId,
        privilegedOwners.map((owner) => owner.id),
      ),
    )
    .orderBy(desc(providerConnection.createdAt));
  const environmentConnection = environment.OPENAI_API_KEY
    ? [
        {
          id: "environment-openai",
          name: "OpenAI (environment)",
          kind: "openai",
          vendor: "openai",
          baseUrl: null,
          secretMode: "environment",
          enabled: true,
          lastTestedAt: null,
          capabilities: null,
          createdAt: null,
        },
      ]
    : [];
  return Response.json(
    { providers: [...environmentConnection, ...records] },
    { headers: { "cache-control": "no-store" } },
  );
});

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  await enforceRateLimit(request, {
    bucket: "provider-save",
    limit: 10,
    windowSeconds: 60 * 60,
    identity: actor.id,
  });
  const payload = await parseJsonBody(request, providerSchema, {
    maximumBytes: 16 * 1_024,
  });
  const { db } = getServerContext();
  const reservation = await reserveIdempotencyKey(
    db,
    actor.id,
    request,
    payload,
  );
  if (reservation.replay) return reservation.replay;
  try {
    const responseBody = await saveProviderConnection(db, actor.id, {
      vendor: payload.vendor,
      kind: payload.kind,
      baseUrl: payload.base_url,
      apiKey: payload.api_key,
      model: payload.test_model,
      secretMode: payload.secret_mode,
      name: payload.name,
    });
    await db.transaction(async (transaction) => {
      await completeIdempotentResponse(
        transaction,
        actor.id,
        reservation.key,
        201,
        responseBody,
      );
    });
    return Response.json(responseBody, {
      status: 201,
      headers: {
        location: `/api/v1/providers/${responseBody.provider.id}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
