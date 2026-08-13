import { desc, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  createProviderAdapter,
  encryptProviderSecret,
  parseMasterKey,
  providerVendorIds,
  validateProviderBaseUrl,
} from "@iwc/ai";
import { localModelAllowlist, sessionOnlyProviderAllowed } from "@iwc/config";
import { auditEvent, newDomainId, providerConnection, user } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import {
  providerNeedsApiKey,
  resolveProviderConfig,
} from "@/lib/server/provider-config";
import { parseJsonBody } from "@/lib/server/request";
import { requireRole, requireSession } from "@/lib/server/session";
import { setSessionProviderSecret } from "@/lib/server/session-secrets";
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
  const { db, environment } = getServerContext();
  const reservation = await reserveIdempotencyKey(
    db,
    actor.id,
    request,
    payload,
  );
  if (reservation.replay) return reservation.replay;
  try {
    const resolved = resolveProviderConfig({
      vendor: payload.vendor,
      kind: payload.kind,
      baseUrl: payload.base_url,
      apiKey: payload.api_key,
      model: payload.test_model,
      localBaseUrlAllowlist: localModelAllowlist(environment),
    });
    if (providerNeedsApiKey(resolved.vendor) && !payload.api_key) {
      throw new ApiProblem({
        title: "API key required",
        status: 422,
        code: "API_KEY_REQUIRED",
        detail: "Supply an API key. It is submitted only to this instance.",
      });
    }
    if (
      payload.secret_mode === "session_only" &&
      (!sessionOnlyProviderAllowed(environment) ||
        (
          await db.query.instanceConfiguration.findFirst({
            columns: { deploymentMode: true },
          })
        )?.deploymentMode === "shared")
    ) {
      throw new ApiProblem({
        title: "Session-only unavailable",
        status: 422,
        code: "SESSION_ONLY_UNAVAILABLE",
        detail:
          "Session-only keys require personal mode, one Web replica, and the embedded executor.",
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
    const capabilities = payload.test_model
      ? await adapter.probeCapabilities(payload.test_model)
      : undefined;
    const id = newDomainId();
    const encrypted =
      payload.secret_mode === "encrypted" && payload.api_key
        ? (() => {
            if (!environment.APP_ENCRYPTION_KEY) {
              throw new ApiProblem({
                title: "Encryption unavailable",
                status: 503,
                code: "ENCRYPTION_NOT_CONFIGURED",
                detail: "APP_ENCRYPTION_KEY is required to save provider keys.",
              });
            }
            return encryptProviderSecret(
              payload.api_key,
              parseMasterKey(environment.APP_ENCRYPTION_KEY),
              environment.APP_ENCRYPTION_KEY_VERSION,
              `provider:${actor.id}:${id}`,
            );
          })()
        : undefined;
    const connectionValues: typeof providerConnection.$inferInsert = {
      id,
      ownerId: actor.id,
      name: resolved.preset.label,
      kind: resolved.kind,
      vendor: resolved.vendor,
      ...(resolved.credentials.baseUrl === undefined
        ? {}
        : { baseUrl: resolved.credentials.baseUrl }),
      secretMode: payload.secret_mode,
      ...(encrypted === undefined
        ? {}
        : {
            secretCiphertext: encrypted.ciphertext,
            secretNonce: encrypted.nonce,
            keyVersion: encrypted.keyVersion,
          }),
      lastTestedAt: new Date(),
      ...(capabilities === undefined
        ? {}
        : { capabilities: { ...capabilities } }),
    };
    const responseBody = {
      provider: {
        id,
        name: resolved.preset.label,
        kind: resolved.kind,
        vendor: resolved.vendor,
        base_url: resolved.credentials.baseUrl ?? null,
        secret_mode: payload.secret_mode,
        tested: true,
        capabilities: capabilities ?? null,
      },
    };
    await db.transaction(async (transaction) => {
      await transaction.insert(providerConnection).values(connectionValues);
      await transaction.insert(auditEvent).values({
        actorId: actor.id,
        action: "provider.create",
        targetType: "provider_connection",
        targetId: id,
        result: "success",
        metadata: {
          kind: resolved.kind,
          vendor: resolved.vendor,
          secretMode: payload.secret_mode,
        },
      });
      await completeIdempotentResponse(
        transaction,
        actor.id,
        reservation.key,
        201,
        responseBody,
      );
    });
    if (payload.secret_mode === "session_only" && payload.api_key)
      setSessionProviderSecret(id, payload.api_key);
    return Response.json(responseBody, {
      status: 201,
      headers: {
        location: `/api/v1/providers/${id}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
