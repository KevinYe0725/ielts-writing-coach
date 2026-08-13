import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  createProviderAdapter,
  encryptProviderSecret,
  parseMasterKey,
} from "@iwc/ai";
import { localModelAllowlist, sessionOnlyProviderAllowed } from "@iwc/config";
import { auditEvent, providerConnection, user } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseJsonBody } from "@/lib/server/request";
import { requireRole, requireSession } from "@/lib/server/session";
import {
  resolveInstanceDeploymentMode,
  resumeBlockedAIJobsForProvider,
} from "@/lib/server/jobs";
import {
  deleteSessionProviderSecret,
  getSessionProviderSecret,
  setSessionProviderSecret,
} from "@/lib/server/session-secrets";
import {
  completeIdempotentResponse,
  enforceRateLimit,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const replaceSecretSchema = z
  .object({
    api_key: z.string().min(1).max(2_000),
    secret_mode: z.enum(["encrypted", "session_only"]).default("encrypted"),
    test_model: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const PATCH = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    requireRole(actor, ["owner", "admin"]);
    await enforceRateLimit(request, {
      bucket: "provider-replace",
      identity: actor.id,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    const { id } = await context.params;
    if (id === "environment-openai") {
      throw new ApiProblem({
        title: "Read-only provider",
        status: 409,
        code: "ENVIRONMENT_PROVIDER_READ_ONLY",
        detail:
          "Environment provider keys can only be replaced by the instance operator.",
      });
    }
    const payload = await parseJsonBody(request, replaceSecretSchema, {
      maximumBytes: 8 * 1_024,
    });
    const { db, environment } = getServerContext();
    const deploymentMode =
      (
        await db.query.instanceConfiguration.findFirst({
          columns: { deploymentMode: true },
        })
      )?.deploymentMode ?? environment.DEPLOYMENT_MODE;
    const privilegedOwnerIds =
      deploymentMode === "shared"
        ? (
            await db.query.user.findMany({
              columns: { id: true },
              where: inArray(user.role, ["owner", "admin"]),
            })
          ).map((entry) => entry.id)
        : [actor.id];
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      providerId: id,
      ...payload,
    });
    if (reservation.replay) return reservation.replay;
    const previousSessionSecret = getSessionProviderSecret(id);
    let sessionRegistryChanged = false;

    try {
      const connection = await db.query.providerConnection.findFirst({
        where: and(
          eq(providerConnection.id, id),
          inArray(providerConnection.ownerId, privilegedOwnerIds),
        ),
      });
      if (!connection) {
        throw new ApiProblem({
          title: "Provider not found",
          status: 404,
          code: "PROVIDER_NOT_FOUND",
          detail: "The provider connection does not exist.",
        });
      }
      if (
        payload.secret_mode === "session_only" &&
        (!sessionOnlyProviderAllowed(environment) ||
          deploymentMode === "shared")
      ) {
        throw new ApiProblem({
          title: "Session-only unavailable",
          status: 422,
          code: "SESSION_ONLY_UNAVAILABLE",
          detail:
            "Session-only keys require personal mode, one Web replica, and the embedded executor.",
        });
      }
      const adapter = createProviderAdapter(connection.kind, {
        apiKey: payload.api_key,
        ...(connection.baseUrl === null ? {} : { baseUrl: connection.baseUrl }),
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
      const capabilities = payload.test_model
        ? await adapter.probeCapabilities(payload.test_model)
        : connection.capabilities;
      const persistedCapabilities = capabilities ? { ...capabilities } : null;
      const encrypted =
        payload.secret_mode === "encrypted"
          ? (() => {
              if (!environment.APP_ENCRYPTION_KEY) {
                throw new ApiProblem({
                  title: "Encryption unavailable",
                  status: 503,
                  code: "ENCRYPTION_NOT_CONFIGURED",
                  detail:
                    "APP_ENCRYPTION_KEY is required to persist provider keys.",
                });
              }
              return encryptProviderSecret(
                payload.api_key,
                parseMasterKey(environment.APP_ENCRYPTION_KEY),
                environment.APP_ENCRYPTION_KEY_VERSION,
                `provider:${connection.ownerId}:${id}`,
              );
            })()
          : undefined;

      const responseBody = {
        provider: {
          id,
          name: connection.name,
          kind: connection.kind,
          base_url: connection.baseUrl,
          secret_mode: payload.secret_mode,
          tested: true,
          capabilities: persistedCapabilities,
        },
      };
      let resumedJobs = 0;
      if (payload.secret_mode === "session_only") {
        setSessionProviderSecret(id, payload.api_key);
      } else {
        deleteSessionProviderSecret(id);
      }
      sessionRegistryChanged = true;
      await db.transaction(async (transaction) => {
        await transaction
          .update(providerConnection)
          .set({
            secretMode: payload.secret_mode,
            secretCiphertext: encrypted?.ciphertext ?? null,
            secretNonce: encrypted?.nonce ?? null,
            keyVersion: encrypted?.keyVersion ?? null,
            capabilities: persistedCapabilities,
            lastTestedAt: new Date(),
            enabled: true,
          })
          .where(eq(providerConnection.id, id));
        await transaction.insert(auditEvent).values({
          actorId: actor.id,
          action: "provider.secret.replace",
          targetType: "provider_connection",
          targetId: id,
          result: "success",
          metadata: {
            kind: connection.kind,
            previousSecretMode: connection.secretMode,
            secretMode: payload.secret_mode,
          },
        });
        resumedJobs = await resumeBlockedAIJobsForProvider(
          transaction,
          {
            actorId: actor.id,
            deploymentMode: await resolveInstanceDeploymentMode(
              transaction,
              deploymentMode,
            ),
          },
          id,
        );
        const completedBody = {
          ...responseBody,
          resumed_jobs: resumedJobs,
        };
        await completeIdempotentResponse(
          transaction,
          actor.id,
          reservation.key,
          200,
          completedBody,
        );
      });

      return Response.json(
        { ...responseBody, resumed_jobs: resumedJobs },
        {
          headers: { "cache-control": "no-store" },
        },
      );
    } catch (error) {
      if (sessionRegistryChanged) {
        if (previousSessionSecret === undefined) {
          deleteSessionProviderSecret(id);
        } else {
          setSessionProviderSecret(id, previousSessionSecret);
        }
      }
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);

export const DELETE = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    requireRole(actor, ["owner", "admin"]);
    const { id } = await context.params;
    if (id === "environment-openai") {
      throw new ApiProblem({
        title: "Read-only provider",
        status: 409,
        code: "ENVIRONMENT_PROVIDER_READ_ONLY",
        detail:
          "Environment provider settings can only be changed by the instance operator.",
      });
    }
    const { db, environment } = getServerContext();
    const deploymentMode =
      (
        await db.query.instanceConfiguration.findFirst({
          columns: { deploymentMode: true },
        })
      )?.deploymentMode ?? environment.DEPLOYMENT_MODE;
    const privilegedOwnerIds =
      deploymentMode === "shared"
        ? (
            await db.query.user.findMany({
              columns: { id: true },
              where: inArray(user.role, ["owner", "admin"]),
            })
          ).map((entry) => entry.id)
        : [actor.id];
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      providerId: id,
    });
    if (reservation.replay) return reservation.replay;
    try {
      await db.transaction(async (transaction) => {
        const revoked = await transaction
          .update(providerConnection)
          .set({
            enabled: false,
            secretCiphertext: null,
            secretNonce: null,
            keyVersion: null,
          })
          .where(
            and(
              eq(providerConnection.id, id),
              inArray(providerConnection.ownerId, privilegedOwnerIds),
            ),
          )
          .returning({ id: providerConnection.id });
        if (revoked.length === 0) {
          throw new ApiProblem({
            title: "Provider not found",
            status: 404,
            code: "PROVIDER_NOT_FOUND",
            detail: "The provider connection does not exist.",
          });
        }
        await transaction.insert(auditEvent).values({
          actorId: actor.id,
          action: "provider.revoke",
          targetType: "provider_connection",
          targetId: id,
          result: "success",
          metadata: {},
        });
        await completeIdempotentResponse(
          transaction,
          actor.id,
          reservation.key,
          204,
          { revoked: true },
        );
      });
      deleteSessionProviderSecret(id);
      return new Response(null, { status: 204 });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
