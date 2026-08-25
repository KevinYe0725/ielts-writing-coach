import {
  decryptProviderSecret,
  encryptProviderSecret,
  parseMasterKey,
} from "@iwc/ai";
import {
  auditEvent,
  newDomainId,
  searchConnection,
  type Database,
} from "@iwc/db";
import { and, eq } from "drizzle-orm";
import { BraveSearchAdapter } from "@iwc/search";

import { getServerContext } from "./context";
import { ApiProblem } from "./problem";
import { requireRole, type SessionActor } from "./session";

interface SearchConnectionRecord {
  id: string;
  configuredByUserId: string | null;
  kind: "BRAVE";
  encryptedApiKey: string;
  encryptedApiKeyNonce: string;
  encryptionKeyVersion: number;
  status: "ACTIVE" | "INVALID" | "REVOKED";
  testedAt: Date | null;
  createdAt: Date;
  configuredByUser: { id: string; role: "owner" | "admin" | "learner" } | null;
}

export interface SearchConnectionProjection {
  kind: "brave";
  status: "ACTIVE" | "INVALID" | "REVOKED";
  tested_at: string | null;
}

function assertSearchAdministrator(actor: SessionActor): void {
  requireRole(actor, ["owner", "admin"]);
}

function projectConnection(
  connection: Pick<SearchConnectionRecord, "kind" | "status" | "testedAt">,
): SearchConnectionProjection {
  return {
    kind: connection.kind.toLowerCase() as "brave",
    status: connection.status,
    tested_at: connection.testedAt?.toISOString() ?? null,
  };
}

function validateApiKey(apiKey: string): string {
  const normalized = apiKey.trim();
  if (normalized.length === 0 || normalized.length > 2_000) {
    throw new ApiProblem({
      title: "Invalid search API key",
      status: 422,
      code: "SEARCH_API_KEY_INVALID",
      detail: "Supply a non-empty Brave Search API key.",
    });
  }
  return normalized;
}

async function activeConnections(
  db: Database,
): Promise<SearchConnectionRecord[]> {
  return (await db.query.searchConnection.findMany({
    where: eq(searchConnection.status, "ACTIVE"),
    with: {
      configuredByUser: {
        columns: { id: true, role: true },
      },
    },
  })) as SearchConnectionRecord[];
}

async function canonicalConnection(
  db: Database,
  actor: SessionActor,
): Promise<SearchConnectionRecord | undefined> {
  const { environment } = getServerContext();
  const deploymentMode =
    (
      await db.query.instanceConfiguration.findFirst({
        columns: { deploymentMode: true },
      })
    )?.deploymentMode ?? environment.DEPLOYMENT_MODE;
  const candidates = (await activeConnections(db)).filter((connection) =>
    deploymentMode === "personal"
      ? connection.configuredByUserId === actor.id
      : connection.configuredByUser?.role === "owner" ||
        connection.configuredByUser?.role === "admin",
  );
  return candidates.sort((left, right) => {
    if (deploymentMode === "shared") {
      const leftPriority = left.configuredByUser?.role === "owner" ? 0 : 1;
      const rightPriority = right.configuredByUser?.role === "owner" ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    }
    const createdDifference =
      right.createdAt.getTime() - left.createdAt.getTime();
    if (createdDifference !== 0) return createdDifference;
    const ownerDifference = (left.configuredByUserId ?? "").localeCompare(
      right.configuredByUserId ?? "",
    );
    if (ownerDifference !== 0) return ownerDifference;
    return left.id.localeCompare(right.id);
  })[0];
}

export async function getSearchConnectionProjection(
  db: Database,
  actor: SessionActor,
): Promise<SearchConnectionProjection | null> {
  assertSearchAdministrator(actor);
  const connection = await canonicalConnection(db, actor);
  return connection ? projectConnection(connection) : null;
}

export async function saveSearchConnection(
  db: Database,
  actor: SessionActor,
  apiKey: string,
): Promise<SearchConnectionProjection> {
  assertSearchAdministrator(actor);
  const normalizedApiKey = validateApiKey(apiKey);
  const validation = await new BraveSearchAdapter({
    apiKey: normalizedApiKey,
  }).validateConnection();
  if (!validation.ok) {
    throw new ApiProblem({
      title: "Search connection test failed",
      status: 422,
      code: "SEARCH_CONNECTION_TEST_FAILED",
      detail: validation.safeMessage,
    });
  }

  const { environment } = getServerContext();
  if (!environment.APP_ENCRYPTION_KEY) {
    throw new ApiProblem({
      title: "Encryption unavailable",
      status: 503,
      code: "ENCRYPTION_NOT_CONFIGURED",
      detail: "APP_ENCRYPTION_KEY is required to save search credentials.",
    });
  }
  const id = newDomainId();
  const additionalData = `search:${actor.id}:${id}`;
  const masterKey = parseMasterKey(environment.APP_ENCRYPTION_KEY);
  const encrypted = encryptProviderSecret(
    normalizedApiKey,
    masterKey,
    environment.APP_ENCRYPTION_KEY_VERSION,
    additionalData,
  );
  // Verify the same owner-bound AAD used by future workers before committing
  // the envelope. This keeps a malformed crypto configuration out of storage.
  if (
    decryptProviderSecret(encrypted, masterKey, additionalData) !==
    normalizedApiKey
  ) {
    throw new ApiProblem({
      title: "Encryption unavailable",
      status: 503,
      code: "ENCRYPTION_NOT_CONFIGURED",
      detail: "The encrypted search credential could not be verified.",
    });
  }
  const testedAt = new Date();
  await db.transaction(async (transaction) => {
    await transaction
      .update(searchConnection)
      .set({ status: "REVOKED" })
      .where(
        and(
          eq(searchConnection.configuredByUserId, actor.id),
          eq(searchConnection.status, "ACTIVE"),
        ),
      );
    await transaction.insert(searchConnection).values({
      id,
      configuredByUserId: actor.id,
      kind: "BRAVE",
      encryptedApiKey: encrypted.ciphertext,
      encryptedApiKeyNonce: encrypted.nonce,
      encryptionKeyVersion: encrypted.keyVersion,
      status: "ACTIVE",
      testedAt,
    });
    await transaction.insert(auditEvent).values({
      actorId: actor.id,
      action: "search_connection.save",
      targetType: "search_connection",
      targetId: id,
      result: "success",
      metadata: { kind: "brave" },
    });
  });
  return { kind: "brave", status: "ACTIVE", tested_at: testedAt.toISOString() };
}

export async function revokeSearchConnection(
  db: Database,
  actor: SessionActor,
): Promise<boolean> {
  assertSearchAdministrator(actor);
  const connection = await canonicalConnection(db, actor);
  if (!connection) return false;
  await db.transaction(async (transaction) => {
    await transaction
      .update(searchConnection)
      .set({ status: "REVOKED" })
      .where(
        and(
          eq(searchConnection.id, connection.id),
          eq(searchConnection.status, "ACTIVE"),
        ),
      );
    await transaction.insert(auditEvent).values({
      actorId: actor.id,
      action: "search_connection.revoke",
      targetType: "search_connection",
      targetId: connection.id,
      result: "success",
      metadata: { kind: "brave" },
    });
  });
  return true;
}
