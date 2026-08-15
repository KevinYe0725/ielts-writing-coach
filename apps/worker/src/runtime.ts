import { and, eq, inArray, sql } from "drizzle-orm";

import {
  createProviderAdapter,
  decryptProviderSecret,
  getSessionProviderSecret,
  inferProviderVendor,
  normalizeProviderError,
  parseMasterKey,
  providerCredentialsForPreset,
  providerPresetNeedsApiKey,
  promptSnapshot,
  type AIProviderAdapter,
  type AITaskKind,
} from "@iwc/ai";
import { localModelAllowlist, readServerEnvironment } from "@iwc/config";
import {
  aiJob,
  createDatabase,
  modelRoute,
  newDomainId,
  providerConnection,
  user,
} from "@iwc/db";

import { safeRetryError, trustedInternalFailureCode } from "./failure-safety";

export const environment = readServerEnvironment();
export const databaseContext = createDatabase(environment.DATABASE_URL);

export interface ClaimedJob {
  id: string;
  ownerId: string;
  taskKind: AITaskKind;
  protectedReference: Record<string, string>;
  versionSnapshot: Record<string, string>;
  attemptCount: number;
}

type InstanceDeploymentMode = "personal" | "shared";
type UserRole = "owner" | "admin" | "learner";

export function providerConnectionAuthorizedForJob(input: {
  connectionOwnerId: string;
  connectionOwnerRole: UserRole | undefined;
  deploymentMode: InstanceDeploymentMode;
  jobOwnerId: string;
}): boolean {
  return input.deploymentMode === "personal"
    ? input.connectionOwnerId === input.jobOwnerId
    : input.connectionOwnerRole === "owner" ||
        input.connectionOwnerRole === "admin";
}

async function deploymentMode(): Promise<InstanceDeploymentMode> {
  const instance =
    await databaseContext.db.query.instanceConfiguration.findFirst({
      columns: { deploymentMode: true },
    });
  return instance?.deploymentMode ?? environment.DEPLOYMENT_MODE;
}

async function routeForJobOwner(
  jobOwnerId: string,
  taskKind: AITaskKind,
): Promise<{
  provider: typeof providerConnection.$inferSelect | undefined;
  route: typeof modelRoute.$inferSelect | undefined;
}> {
  const mode = await deploymentMode();
  let route: typeof modelRoute.$inferSelect | undefined;
  if (mode === "personal") {
    route = await databaseContext.db.query.modelRoute.findFirst({
      where: and(
        eq(modelRoute.ownerId, jobOwnerId),
        eq(modelRoute.taskKind, taskKind),
      ),
    });
  } else {
    const privilegedOwners = await databaseContext.db.query.user.findMany({
      columns: { id: true, role: true },
      where: inArray(user.role, ["owner", "admin"]),
    });
    if (privilegedOwners.length > 0) {
      const routes = await databaseContext.db.query.modelRoute.findMany({
        where: and(
          eq(modelRoute.taskKind, taskKind),
          inArray(
            modelRoute.ownerId,
            privilegedOwners.map((owner) => owner.id),
          ),
        ),
      });
      const roleByOwner = new Map(
        privilegedOwners.map((owner) => [owner.id, owner.role]),
      );
      routes.sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          (roleByOwner.get(left.ownerId) === roleByOwner.get(right.ownerId)
            ? 0
            : roleByOwner.get(left.ownerId) === "owner"
              ? -1
              : 1) ||
          left.ownerId.localeCompare(right.ownerId) ||
          left.id.localeCompare(right.id),
      );
      route = routes[0];
    }
  }
  const provider = route?.providerConnectionId
    ? await databaseContext.db.query.providerConnection.findFirst({
        where: and(
          eq(providerConnection.id, route.providerConnectionId),
          eq(providerConnection.ownerId, route.ownerId),
          eq(providerConnection.enabled, true),
        ),
      })
    : undefined;
  return { route, provider };
}

/**
 * LEASED/RUNNING are fenced against the same queue delivery. A strictly later
 * Graphile delivery may recover them after its previous worker disappeared;
 * startup recovery remains the path for leases with no surviving queue job.
 */
export function claimableAIJobDelivery(
  status: string,
  shadowAttemptCount: number,
  queueDeliveryAttempt: number,
): boolean {
  if (status === "QUEUED" || status === "RETRY_SCHEDULED") return true;
  // Graphile increments `attempts` while atomically taking its own row lock.
  // The same delivery cannot re-enter an active shadow job, but a later
  // delivery after a process crash can safely resume the logical operation.
  return (
    (status === "LEASED" || status === "RUNNING") &&
    queueDeliveryAttempt > shadowAttemptCount
  );
}

export async function claimAIJob(
  jobId: string,
  queueDeliveryAttempt = 1,
): Promise<ClaimedJob | null> {
  return databaseContext.db.transaction(async (transaction) => {
    const [job] = await transaction
      .select()
      .from(aiJob)
      .where(eq(aiJob.id, jobId))
      .for("update");
    if (!job || job.status === "SUCCEEDED") return null;
    // Graphile Worker already owns the queue-level lease.  The shadow row is
    // a second, durable fence for duplicate callbacks and manual retries: an
    // active LEASED/RUNNING operation cannot be claimed by the same queue
    // delivery; only Graphile's strictly later attempt number may recover it.
    if (
      !claimableAIJobDelivery(
        job.status,
        job.attemptCount,
        queueDeliveryAttempt,
      )
    )
      return null;
    const attemptCount = Math.max(job.attemptCount + 1, queueDeliveryAttempt);
    await transaction
      .update(aiJob)
      .set({ status: "LEASED", leasedAt: new Date(), attemptCount })
      .where(eq(aiJob.id, job.id));
    await transaction
      .update(aiJob)
      .set({ status: "RUNNING", startedAt: new Date() })
      .where(eq(aiJob.id, job.id));
    return {
      id: job.id,
      ownerId: job.ownerId,
      taskKind: job.taskKind as AITaskKind,
      protectedReference: job.protectedReference,
      versionSnapshot: job.versionSnapshot,
      attemptCount,
    };
  });
}

export async function adapterForJob(
  job: ClaimedJob,
): Promise<AIProviderAdapter> {
  const providerKind = job.versionSnapshot.providerKind as
    | "openai"
    | "compatible"
    | "mock";
  const connectionId = job.versionSnapshot.providerConnectionId;
  if (
    providerKind === "mock" &&
    (connectionId === undefined || connectionId === "mock")
  )
    return createProviderAdapter("mock", {});
  if (connectionId === "environment-openai") {
    if (!environment.OPENAI_API_KEY)
      throw Object.assign(
        new Error("The environment OpenAI key is unavailable."),
        { code: "PROVIDER_SECRET_UNAVAILABLE" },
      );
    return createProviderAdapter("openai", {
      apiKey: environment.OPENAI_API_KEY,
    });
  }
  if (!connectionId)
    throw Object.assign(
      new Error("The provider connection snapshot is incomplete."),
      { code: "PROVIDER_NOT_FOUND" },
    );
  const connection =
    await databaseContext.db.query.providerConnection.findFirst({
      where: eq(providerConnection.id, connectionId),
    });
  const [mode, connectionOwner] = await Promise.all([
    deploymentMode(),
    connection
      ? databaseContext.db.query.user.findFirst({
          columns: { role: true },
          where: eq(user.id, connection.ownerId),
        })
      : undefined,
  ]);
  if (
    !connection ||
    !connection.enabled ||
    connection.kind !== providerKind ||
    !providerConnectionAuthorizedForJob({
      connectionOwnerId: connection.ownerId,
      connectionOwnerRole: connectionOwner?.role,
      deploymentMode: mode,
      jobOwnerId: job.ownerId,
    })
  )
    throw Object.assign(
      new Error("The frozen provider connection is unavailable."),
      { code: "PROVIDER_NOT_FOUND" },
    );
  if (mode === "shared" && connection.secretMode === "session_only") {
    throw Object.assign(
      new Error("Shared instances cannot use an in-memory provider key."),
      { code: "SESSION_ONLY_UNAVAILABLE" },
    );
  }
  if (connection.kind === "mock") return createProviderAdapter("mock", {});
  if (connection.secretMode === "session_only") {
    const sessionSecret = getSessionProviderSecret(connection.id);
    const vendor = inferProviderVendor(connection.kind, connection.vendor);
    if (!sessionSecret && providerPresetNeedsApiKey(vendor)) {
      throw Object.assign(
        new Error(
          "The session-only key was lost or cannot be used outside its embedded Web process.",
        ),
        { code: "SESSION_KEY_EXPIRED" },
      );
    }
    const resolved = providerCredentialsForPreset({
      vendor,
      ...(sessionSecret === undefined ? {} : { apiKey: sessionSecret }),
      ...(connection.baseUrl === null ? {} : { baseUrl: connection.baseUrl }),
      localBaseUrlAllowlist: localModelAllowlist(environment),
    });
    return createProviderAdapter(resolved.kind, resolved.credentials);
  }
  let apiKey: string | undefined;
  if (connection.secretMode === "environment")
    apiKey = environment.OPENAI_API_KEY;
  if (connection.secretMode === "encrypted") {
    const vendor = inferProviderVendor(connection.kind, connection.vendor);
    const hasEncryptedSecret = Boolean(
      connection.secretCiphertext &&
        connection.secretNonce &&
        connection.keyVersion,
    );
    if (hasEncryptedSecret) {
      if (!environment.APP_ENCRYPTION_KEY)
        throw Object.assign(
          new Error("The encrypted provider key cannot be opened."),
          { code: "PROVIDER_SECRET_UNAVAILABLE" },
        );
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
      throw Object.assign(
        new Error("The encrypted provider key cannot be opened."),
        { code: "PROVIDER_SECRET_UNAVAILABLE" },
      );
  }
  const resolved = providerCredentialsForPreset({
    vendor: inferProviderVendor(connection.kind, connection.vendor),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(connection.baseUrl === null ? {} : { baseUrl: connection.baseUrl }),
    localBaseUrlAllowlist: localModelAllowlist(environment),
  });
  return createProviderAdapter(resolved.kind, resolved.credentials);
}

export async function markJobSucceeded(
  jobId: string,
  usage: Record<string, number> = {},
): Promise<void> {
  await databaseContext.db
    .update(aiJob)
    .set({
      status: "SUCCEEDED",
      completedAt: new Date(),
      usage,
      lastErrorCode: null,
      lastErrorSafeMessage: null,
    })
    .where(eq(aiJob.id, jobId));
}

export async function markJobFailure(
  job: ClaimedJob,
  error: unknown,
): Promise<never | void> {
  const internalCode = trustedInternalFailureCode(error);
  const normalized = normalizeProviderError(error);
  const blocked =
    [
      "PROVIDER_SECRET_UNAVAILABLE",
      "PROVIDER_NOT_FOUND",
      "SESSION_KEY_EXPIRED",
      "SESSION_ONLY_UNAVAILABLE",
    ].includes(internalCode ?? "") || normalized.code === "AUTHENTICATION";
  const retry = !blocked && normalized.retryable && job.attemptCount < 5;
  const status = blocked ? "AI_BLOCKED" : retry ? "RETRY_SCHEDULED" : "FAILED";
  await databaseContext.db
    .update(aiJob)
    .set({
      status,
      availableAt: retry
        ? new Date(Date.now() + Math.min(60_000, 1_000 * 2 ** job.attemptCount))
        : new Date(),
      completedAt: retry ? null : new Date(),
      lastErrorCode: internalCode ?? normalized.code,
      lastErrorSafeMessage: normalized.safeMessage,
    })
    .where(eq(aiJob.id, job.id));
  // Graphile Worker records thrown errors. Never hand an untrusted provider
  // body back to its logger because upstreams can reflect arbitrary secrets.
  if (retry) throw safeRetryError(normalized);
}

export async function recoverInterruptedJobs(): Promise<number> {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  const staleJobs = await databaseContext.db
    .select({
      id: aiJob.id,
      graphileJobKey: aiJob.graphileJobKey,
      providerConnectionId: aiJob.providerConnectionId,
    })
    .from(aiJob)
    .where(
      and(
        inArray(aiJob.status, ["LEASED", "RUNNING"]),
        sql`${aiJob.leasedAt} < ${staleBefore}`,
      ),
    );
  for (const job of staleJobs) {
    const connection = job.providerConnectionId
      ? await databaseContext.db.query.providerConnection.findFirst({
          where: eq(providerConnection.id, job.providerConnectionId),
        })
      : undefined;
    const sessionOnly = connection?.secretMode === "session_only";
    await databaseContext.db
      .update(aiJob)
      .set({
        status: sessionOnly ? "AI_BLOCKED" : "RETRY_SCHEDULED",
        availableAt: new Date(),
        completedAt: sessionOnly ? new Date() : null,
        lastErrorCode: sessionOnly
          ? "SESSION_KEY_EXPIRED"
          : "WORKER_INTERRUPTED",
        lastErrorSafeMessage: sessionOnly
          ? "The in-memory provider key was lost when the instance restarted."
          : "The worker was interrupted; the idempotent job was scheduled again.",
      })
      .where(eq(aiJob.id, job.id));
    if (!sessionOnly && job.graphileJobKey) {
      // The crashed worker's queue lease survives the process for up to four
      // hours inside Graphile itself. Release it explicitly so the shadow row
      // above is picked up on the next poll instead of hours later.
      await databaseContext.db.execute(
        sql`update graphile_worker._private_jobs
            set locked_at = null, locked_by = null, run_at = now()
            where key = ${job.graphileJobKey} and locked_by is not null`,
      );
    }
  }
  return staleJobs.length;
}

/**
 * Keeps the interrupted-job sweep running while the process lives. Startup
 * still sweeps once synchronously; this timer covers crashes that happen
 * after startup so no job waits for the next restart to resume.
 */
export function startInterruptedJobRecovery(intervalMs = 60_000): {
  stop(): void;
} {
  const timer = setInterval(() => {
    void recoverInterruptedJobs().catch((error: unknown) => {
      console.error("Interrupted-job recovery sweep failed.", error);
    });
  }, intervalMs);
  timer.unref();
  return {
    stop() {
      clearInterval(timer);
    },
  };
}

export async function createChildJob(
  parent: ClaimedJob,
  taskKind: AITaskKind,
  protectedReference: Record<string, string>,
): Promise<{ id: string; graphileJobKey: string }> {
  const { route, provider: routeProvider } = await routeForJobOwner(
    parent.ownerId,
    taskKind,
  );
  const inheritedProviderKind = parent.versionSnapshot.providerKind;
  if (
    !route &&
    !["openai", "compatible", "mock"].includes(inheritedProviderKind ?? "")
  ) {
    throw new Error(
      "The parent job does not contain a valid frozen provider snapshot.",
    );
  }
  const providerKind =
    routeProvider?.kind ??
    (route
      ? "openai"
      : (inheritedProviderKind as "openai" | "compatible" | "mock"));
  const providerConnectionId =
    route?.providerConnectionId ??
    (route
      ? "environment-openai"
      : parent.versionSnapshot.providerConnectionId);
  if (!providerConnectionId) {
    throw new Error(
      "The parent job does not contain a frozen provider connection.",
    );
  }
  const model = route?.model ?? parent.versionSnapshot.model;
  if (!model) {
    throw new Error("The parent job does not contain a frozen model.");
  }
  const idempotencyKey = `${taskKind}:${Object.values(protectedReference).join(":")}`;
  const existing = await databaseContext.db.query.aiJob.findFirst({
    where: and(
      eq(aiJob.ownerId, parent.ownerId),
      eq(aiJob.idempotencyKey, idempotencyKey),
    ),
  });
  if (existing)
    return {
      id: existing.id,
      graphileJobKey: existing.graphileJobKey ?? `ai-job:${existing.id}`,
    };
  const id = newDomainId();
  const graphileJobKey = `ai-job:${id}`;
  await databaseContext.db.insert(aiJob).values({
    id,
    ownerId: parent.ownerId,
    taskKind,
    status: "QUEUED",
    providerConnectionId: route?.providerConnectionId,
    modelRouteId: route?.id,
    protectedReference,
    versionSnapshot: {
      ...promptSnapshot(taskKind, model, route?.routeVersion ?? 1),
      schemaVersion: "1.0.0",
      providerKind,
      providerConnectionId,
      fallbackEnabled: String(route?.fallbackEnabled ?? false),
    },
    idempotencyKey,
    graphileJobKey,
  });
  return { id, graphileJobKey };
}
