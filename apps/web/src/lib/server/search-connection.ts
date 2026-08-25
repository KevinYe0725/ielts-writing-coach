import {
  decryptProviderSecret,
  encryptProviderSecret,
  parseMasterKey,
} from "@iwc/ai";
import {
  auditEvent,
  newDomainId,
  searchConnection,
  user,
  type Database,
} from "@iwc/db";
import { and, eq, inArray, sql } from "drizzle-orm";
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

type SearchConnectionTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
type SearchConnectionDatabase = Database | SearchConnectionTransaction;
type DeploymentMode = "personal" | "shared";

export interface SearchConnectionPersistenceOptions {
  afterPersist?: (
    transaction: SearchConnectionTransaction,
    projection: SearchConnectionProjection | undefined,
  ) => Promise<void>;
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

/** Worker supply may use only verified active credentials. */
async function activeConnectionsForWorker(
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

/** Settings may expose and revoke an invalid credential, but never a revoked one. */
async function nonRevokedConnections(
  db: SearchConnectionDatabase,
): Promise<SearchConnectionRecord[]> {
  return (await db.query.searchConnection.findMany({
    where: inArray(searchConnection.status, ["ACTIVE", "INVALID"]),
    with: {
      configuredByUser: {
        columns: { id: true, role: true },
      },
    },
  })) as SearchConnectionRecord[];
}

async function deploymentMode(
  db: SearchConnectionDatabase,
): Promise<DeploymentMode> {
  const { environment } = getServerContext();
  return (
    (
      await db.query.instanceConfiguration.findFirst({
        columns: { deploymentMode: true },
      })
    )?.deploymentMode ?? environment.DEPLOYMENT_MODE
  );
}

function selectCanonicalConnection(
  candidates: SearchConnectionRecord[],
  actor: SessionActor,
  mode: DeploymentMode,
): SearchConnectionRecord | undefined {
  const eligible = candidates.filter((connection) =>
    mode === "personal"
      ? connection.configuredByUserId === actor.id
      : connection.configuredByUser?.role === "owner" ||
        connection.configuredByUser?.role === "admin",
  );
  return eligible.sort((left, right) => {
    if (mode === "shared") {
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

async function canonicalConnection(
  db: SearchConnectionDatabase,
  actor: SessionActor,
  mode?: DeploymentMode,
): Promise<SearchConnectionRecord | undefined> {
  const resolvedMode = mode ?? (await deploymentMode(db));
  return selectCanonicalConnection(
    await nonRevokedConnections(db),
    actor,
    resolvedMode,
  );
}

/**
 * Search mutations linearize when they acquire this transaction lock. Personal
 * mode is actor-scoped; shared mode is instance-scoped so privileged actors
 * cannot race each other's canonical replacement or revocation. Every caller
 * acquires this lock before search-connection row locks.
 */
async function lockMutationScope(
  transaction: SearchConnectionTransaction,
  actor: SessionActor,
  mode: DeploymentMode,
): Promise<void> {
  const lockScope = mode === "shared" ? "search-connection:instance" : actor.id;
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext(${lockScope}))`,
  );
}

async function lockedCanonicalConnection(
  transaction: SearchConnectionTransaction,
  actor: SessionActor,
  mode: DeploymentMode,
): Promise<SearchConnectionRecord | undefined> {
  const rows = await transaction
    .select({
      id: searchConnection.id,
      configuredByUserId: searchConnection.configuredByUserId,
      kind: searchConnection.kind,
      encryptedApiKey: searchConnection.encryptedApiKey,
      encryptedApiKeyNonce: searchConnection.encryptedApiKeyNonce,
      encryptionKeyVersion: searchConnection.encryptionKeyVersion,
      status: searchConnection.status,
      testedAt: searchConnection.testedAt,
      createdAt: searchConnection.createdAt,
      configuredByUserIdFromJoin: user.id,
      configuredByUserRole: user.role,
    })
    .from(searchConnection)
    .leftJoin(user, eq(user.id, searchConnection.configuredByUserId))
    .where(
      and(
        inArray(searchConnection.status, ["ACTIVE", "INVALID"]),
        mode === "personal"
          ? eq(searchConnection.configuredByUserId, actor.id)
          : inArray(user.role, ["owner", "admin"]),
      ),
    )
    .for("update", { of: searchConnection });
  return selectCanonicalConnection(
    rows.map((row) => ({
      id: row.id,
      configuredByUserId: row.configuredByUserId,
      kind: row.kind,
      encryptedApiKey: row.encryptedApiKey,
      encryptedApiKeyNonce: row.encryptedApiKeyNonce,
      encryptionKeyVersion: row.encryptionKeyVersion,
      status: row.status,
      testedAt: row.testedAt,
      createdAt: row.createdAt,
      configuredByUser:
        row.configuredByUserIdFromJoin && row.configuredByUserRole
          ? {
              id: row.configuredByUserIdFromJoin,
              role: row.configuredByUserRole,
            }
          : null,
    })),
    actor,
    mode,
  );
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
  options: SearchConnectionPersistenceOptions = {},
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
  const projection = {
    kind: "brave" as const,
    status: "ACTIVE" as const,
    tested_at: testedAt.toISOString(),
  };
  await db.transaction(async (transaction) => {
    const mode = await deploymentMode(transaction);
    await lockMutationScope(transaction, actor, mode);
    await transaction
      .update(searchConnection)
      .set({ status: "REVOKED" })
      .where(
        and(
          eq(searchConnection.configuredByUserId, actor.id),
          inArray(searchConnection.status, ["ACTIVE", "INVALID"]),
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
    await options.afterPersist?.(transaction, projection);
  });
  return projection;
}

export async function revokeSearchConnection(
  db: Database,
  actor: SessionActor,
  options: SearchConnectionPersistenceOptions = {},
): Promise<boolean> {
  assertSearchAdministrator(actor);
  return db.transaction(async (transaction) => {
    const mode = await deploymentMode(transaction);
    await lockMutationScope(transaction, actor, mode);
    const connection = await lockedCanonicalConnection(
      transaction,
      actor,
      mode,
    );
    if (!connection) {
      await options.afterPersist?.(transaction, undefined);
      return false;
    }
    await transaction
      .update(searchConnection)
      .set({ status: "REVOKED" })
      .where(
        and(
          eq(searchConnection.id, connection.id),
          inArray(searchConnection.status, ["ACTIVE", "INVALID"]),
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
    await options.afterPersist?.(transaction, undefined);
    return true;
  });
}
