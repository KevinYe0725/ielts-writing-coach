import { eq } from "drizzle-orm";

import {
  createProviderAdapter,
  decryptProviderSecret,
  inferProviderVendor,
  parseMasterKey,
  providerCredentialsForPreset,
  providerPresetNeedsApiKey,
  type AIProviderAdapter,
} from "@iwc/ai";
import { localModelAllowlist } from "@iwc/config";
import { providerConnection, user } from "@iwc/db";

import { getServerContext } from "./context";
import { ApiProblem } from "./problem";
import { getSessionProviderSecret } from "./session-secrets";

export function providerConnectionAuthorizedForActor(input: {
  actorId: string;
  connectionOwnerId: string;
  connectionOwnerRole: "owner" | "admin" | "learner" | undefined;
  deploymentMode: "personal" | "shared";
}): boolean {
  return input.deploymentMode === "personal"
    ? input.connectionOwnerId === input.actorId
    : input.connectionOwnerRole === "owner" ||
        input.connectionOwnerRole === "admin";
}

export async function adapterForConnection(
  actorId: string,
  connectionId: string,
  deploymentModeOverride?: "personal" | "shared",
): Promise<AIProviderAdapter> {
  const { db, environment } = getServerContext();
  if (connectionId === "environment-openai") {
    if (!environment.OPENAI_API_KEY) {
      throw new ApiProblem({
        title: "Provider unavailable",
        status: 409,
        code: "PROVIDER_SECRET_UNAVAILABLE",
        detail: "The environment OpenAI key is not configured.",
      });
    }
    return createProviderAdapter("openai", {
      apiKey: environment.OPENAI_API_KEY,
    });
  }
  const connection = await db.query.providerConnection.findFirst({
    where: eq(providerConnection.id, connectionId),
  });
  const [instance, connectionOwner] = await Promise.all([
    db.query.instanceConfiguration.findFirst({
      columns: { deploymentMode: true },
    }),
    connection
      ? db.query.user.findFirst({
          columns: { role: true },
          where: eq(user.id, connection.ownerId),
        })
      : undefined,
  ]);
  const deploymentMode =
    deploymentModeOverride ??
    instance?.deploymentMode ??
    environment.DEPLOYMENT_MODE;
  const authorized =
    connection &&
    providerConnectionAuthorizedForActor({
      actorId,
      connectionOwnerId: connection.ownerId,
      connectionOwnerRole: connectionOwner?.role,
      deploymentMode,
    });
  if (!connection || !authorized || !connection.enabled) {
    throw new ApiProblem({
      title: "Provider not found",
      status: 404,
      code: "PROVIDER_NOT_FOUND",
      detail: "The provider connection does not exist.",
    });
  }
  let apiKey: string | undefined;
  if (deploymentMode === "shared" && connection.secretMode === "session_only") {
    throw new ApiProblem({
      title: "Provider blocked",
      status: 409,
      code: "SESSION_ONLY_UNAVAILABLE",
      detail: "Shared instances cannot use an in-memory provider key.",
    });
  }
  if (connection.kind === "mock") return createProviderAdapter("mock", {});
  if (connection.secretMode === "encrypted") {
    const vendor = inferProviderVendor(connection.kind, connection.vendor);
    const hasEncryptedSecret = Boolean(
      connection.secretCiphertext &&
        connection.secretNonce &&
        connection.keyVersion,
    );
    if (hasEncryptedSecret) {
      if (!environment.APP_ENCRYPTION_KEY)
        throw new ApiProblem({
          title: "Provider blocked",
          status: 409,
          code: "PROVIDER_SECRET_UNAVAILABLE",
          detail:
            "The encrypted provider secret cannot be opened by this instance.",
        });
      apiKey = decryptProviderSecret(
        {
          ciphertext: connection.secretCiphertext!,
          nonce: connection.secretNonce!,
          keyVersion: connection.keyVersion!,
        },
        parseMasterKey(environment.APP_ENCRYPTION_KEY),
        `provider:${connection.ownerId}:${connection.id}`,
      );
    } else if (providerPresetNeedsApiKey(vendor))
      throw new ApiProblem({
        title: "Provider blocked",
        status: 409,
        code: "PROVIDER_SECRET_UNAVAILABLE",
        detail:
          "The encrypted provider secret cannot be opened by this instance.",
      });
  } else if (connection.secretMode === "session_only") {
    apiKey = getSessionProviderSecret(connection.id);
    const vendor = inferProviderVendor(connection.kind, connection.vendor);
    if (!apiKey && providerPresetNeedsApiKey(vendor)) {
      throw new ApiProblem({
        title: "Session key expired",
        status: 409,
        code: "SESSION_KEY_EXPIRED",
        detail:
          "Re-enter the provider key. It was intentionally kept only in server memory.",
      });
    }
  } else if (connection.secretMode === "environment") {
    apiKey = environment.OPENAI_API_KEY;
  }
  const resolved = providerCredentialsForPreset({
    vendor: inferProviderVendor(connection.kind, connection.vendor),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(connection.baseUrl === null ? {} : { baseUrl: connection.baseUrl }),
    localBaseUrlAllowlist: localModelAllowlist(environment),
  });
  return createProviderAdapter(resolved.kind, resolved.credentials);
}
