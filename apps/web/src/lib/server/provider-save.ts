import {
  AI_TASK_KINDS,
  encryptProviderSecret,
  parseMasterKey,
  type ProviderKind,
} from "@iwc/ai";
import { localModelAllowlist, sessionOnlyProviderAllowed } from "@iwc/config";
import { and, eq } from "drizzle-orm";
import {
  auditEvent,
  modelRoute,
  newDomainId,
  providerConnection,
} from "@iwc/db";
import type { Database } from "@iwc/db";

import { getServerContext } from "./context";
import { ApiProblem } from "./problem";
import {
  probeProviderConnection,
  providerNeedsApiKey,
  resolveProviderConfig,
} from "./provider-config";
import { setSessionProviderSecret } from "./session-secrets";

export interface SaveProviderInput {
  vendor?: string | undefined;
  kind?: ProviderKind | undefined;
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  model?: string | undefined;
  secretMode?: "encrypted" | "session_only" | undefined;
  name?: string | undefined;
}

export interface SavedProvider {
  provider: {
    id: string;
    name: string;
    kind: ProviderKind;
    vendor: string;
    base_url: string | null;
    secret_mode: "encrypted" | "session_only";
    tested: boolean;
    capabilities: unknown;
  };
}

/**
 * Validates, probes, encrypts, and persists one provider connection for the
 * actor, then records the audit event. Shared by the settings endpoint and
 * the initial setup wizard so the account and its AI connection either both
 * exist or the setup can be retried cleanly.
 */
export async function saveProviderConnection(
  db: Database,
  actorId: string,
  input: SaveProviderInput,
): Promise<SavedProvider> {
  const { environment } = getServerContext();
  const secretMode = input.secretMode ?? "encrypted";
  const resolved = resolveProviderConfig({
    vendor: input.vendor,
    kind: input.kind,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    localBaseUrlAllowlist: localModelAllowlist(environment),
  });
  if (providerNeedsApiKey(resolved.vendor) && !input.apiKey) {
    throw new ApiProblem({
      title: "API key required",
      status: 422,
      code: "API_KEY_REQUIRED",
      detail: "Supply an API key. It is submitted only to this instance.",
    });
  }
  if (
    secretMode === "session_only" &&
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
  const probe = await probeProviderConnection(resolved, {
    localBaseUrlAllowlist: localModelAllowlist(environment),
    model: input.model,
  });
  const id = newDomainId();
  const encrypted =
    secretMode === "encrypted" && input.apiKey
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
            input.apiKey,
            parseMasterKey(environment.APP_ENCRYPTION_KEY),
            environment.APP_ENCRYPTION_KEY_VERSION,
            `provider:${actorId}:${id}`,
          );
        })()
      : undefined;
  const name = input.name?.trim() || resolved.preset.label;
  const connectionValues: typeof providerConnection.$inferInsert = {
    id,
    ownerId: actorId,
    name,
    kind: resolved.kind,
    vendor: resolved.vendor,
    ...(resolved.credentials.baseUrl === undefined
      ? {}
      : { baseUrl: resolved.credentials.baseUrl }),
    secretMode,
    ...(encrypted === undefined
      ? {}
      : {
          secretCiphertext: encrypted.ciphertext,
          secretNonce: encrypted.nonce,
          keyVersion: encrypted.keyVersion,
        }),
    lastTestedAt: new Date(),
    ...(probe.capabilities === undefined
      ? {}
      : { capabilities: { ...probe.capabilities } }),
  };
  await db.transaction(async (transaction) => {
    await transaction.insert(providerConnection).values(connectionValues);
    await transaction.insert(auditEvent).values({
      actorId,
      action: "provider.create",
      targetType: "provider_connection",
      targetId: id,
      result: "success",
      metadata: {
        kind: resolved.kind,
        vendor: resolved.vendor,
        secretMode,
      },
    });
  });
  if (secretMode === "session_only" && input.apiKey)
    setSessionProviderSecret(id, input.apiKey);
  return {
    provider: {
      id,
      name,
      kind: resolved.kind,
      vendor: resolved.vendor,
      base_url: resolved.credentials.baseUrl ?? null,
      secret_mode: secretMode,
      tested: true,
      capabilities: probe.capabilities ?? null,
    },
  };
}

/**
 * Assigns the given provider + model to every AI task kind for the actor.
 * Used by the setup wizard so the very first essay already has a scoring
 * route and never sits in WAITING_FOR_CONSENT.
 */
export async function assignDefaultModelRoutes(
  db: Database,
  actorId: string,
  input: { providerConnectionId: string; model: string },
): Promise<void> {
  await db.transaction(async (transaction) => {
    for (const taskKind of AI_TASK_KINDS) {
      const existing = await transaction.query.modelRoute.findFirst({
        where: and(
          eq(modelRoute.ownerId, actorId),
          eq(modelRoute.taskKind, taskKind),
        ),
      });
      if (existing) {
        await transaction
          .update(modelRoute)
          .set({
            providerConnectionId: input.providerConnectionId,
            model: input.model,
            routeVersion: existing.routeVersion + 1,
          })
          .where(eq(modelRoute.id, existing.id));
      } else {
        await transaction.insert(modelRoute).values({
          ownerId: actorId,
          taskKind,
          providerConnectionId: input.providerConnectionId,
          model: input.model,
        });
      }
    }
    await transaction.insert(auditEvent).values({
      actorId,
      action: "model_routes.update",
      targetType: "model_route",
      result: "success",
      metadata: { source: "setup" },
    });
  });
}
