import { and, eq, inArray, sql } from "drizzle-orm";

import { promptSnapshot, type AITaskKind } from "@iwc/ai";
import {
  aiJob,
  instanceConfiguration,
  modelRoute,
  newDomainId,
  providerConnection,
  user,
  type Database,
} from "@iwc/db";

import { getServerContext } from "./context";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export interface EnqueuedAIJob {
  id: string;
  status: "QUEUED" | "WAITING_FOR_CONSENT";
  location: string;
}

export interface JobRouteBinding {
  taskKind: AITaskKind;
  routeId: string;
  providerConnectionId: string | null;
  providerKind: "openai" | "compatible" | "mock";
  model: string;
  routeVersion: number;
  fallbackEnabled: boolean;
}

export type InstanceDeploymentMode = "personal" | "shared";

export interface AIJobRepairScope {
  actorId: string;
  deploymentMode: InstanceDeploymentMode;
}

export interface ResolvedAIJobRoute {
  deploymentMode: InstanceDeploymentMode;
  provider: typeof providerConnection.$inferSelect | undefined;
  route: typeof modelRoute.$inferSelect | undefined;
}

export async function resolveInstanceDeploymentMode(
  transaction: DatabaseTransaction,
  fallback: InstanceDeploymentMode,
): Promise<InstanceDeploymentMode> {
  const instance = await transaction.query.instanceConfiguration.findFirst({
    columns: { deploymentMode: true },
  });
  return instance?.deploymentMode ?? fallback;
}

/**
 * Personal instances keep routes actor-owned. Shared instances use an
 * instance route owned by a privileged user. The most recently updated route
 * is canonical; role, owner id, and route id make equal-timestamp ordering
 * deterministic.
 */
export async function resolveAIJobRoute(
  transaction: DatabaseTransaction,
  input: {
    deploymentMode: InstanceDeploymentMode;
    jobOwnerId: string;
    taskKind: AITaskKind;
  },
): Promise<ResolvedAIJobRoute> {
  let route: typeof modelRoute.$inferSelect | undefined;
  if (input.deploymentMode === "personal") {
    route = await transaction.query.modelRoute.findFirst({
      where: and(
        eq(modelRoute.ownerId, input.jobOwnerId),
        eq(modelRoute.taskKind, input.taskKind),
      ),
    });
  } else {
    const privilegedOwners = await transaction.query.user.findMany({
      columns: { id: true, role: true },
      where: inArray(user.role, ["owner", "admin"]),
    });
    if (privilegedOwners.length > 0) {
      const routes = await transaction.query.modelRoute.findMany({
        where: and(
          eq(modelRoute.taskKind, input.taskKind),
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
    ? await transaction.query.providerConnection.findFirst({
        where: and(
          eq(providerConnection.id, route.providerConnectionId),
          eq(providerConnection.ownerId, route.ownerId),
          eq(providerConnection.enabled, true),
        ),
      })
    : undefined;
  return { deploymentMode: input.deploymentMode, route, provider };
}

export function unconfiguredJobDecision(input: {
  environmentApiKey?: string;
  environmentModel?: string;
}): {
  status: "QUEUED" | "WAITING_FOR_CONSENT";
  providerKind: "openai" | "unconfigured";
  providerConnectionId: "environment-openai" | "unconfigured";
  model: string;
} {
  if (input.environmentApiKey) {
    return {
      status: "QUEUED",
      providerKind: "openai",
      providerConnectionId: "environment-openai",
      model: input.environmentModel ?? "gpt-5-mini",
    };
  }
  return {
    status: "WAITING_FOR_CONSENT",
    providerKind: "unconfigured",
    providerConnectionId: "unconfigured",
    model: "unconfigured",
  };
}

async function addGraphileJob(
  transaction: DatabaseTransaction,
  jobId: string,
  graphileJobKey: string,
): Promise<void> {
  await transaction.execute(
    sql`select graphile_worker.add_job(
      'run_ai_job',
      ${JSON.stringify({ jobId })}::json,
      max_attempts := 5,
      job_key := ${graphileJobKey},
      job_key_mode := 'preserve_run_at'
    )`,
  );
}

export async function requeueFailedAIJob(
  transaction: DatabaseTransaction,
  job: typeof aiJob.$inferSelect,
): Promise<{ id: string; status: "QUEUED"; location: string }> {
  const manualRetryCount = Math.max(
    0,
    Number.parseInt(job.versionSnapshot.manualRetryCount ?? "0", 10) || 0,
  );
  if (job.status !== "FAILED") {
    throw Object.assign(new Error("Only a failed AI job can be retried."), {
      code: "AI_JOB_RETRY_NOT_AVAILABLE",
    });
  }
  if (manualRetryCount >= 2) {
    throw Object.assign(
      new Error(
        "This generated or scored item reached its manual retry limit.",
      ),
      { code: "AI_JOB_RETRY_LIMIT_REACHED" },
    );
  }
  const nextRetry = manualRetryCount + 1;
  const graphileJobKey = `ai-job:${job.id}:manual:${nextRetry}`;
  await transaction
    .update(aiJob)
    .set({
      status: "QUEUED",
      graphileJobKey,
      availableAt: new Date(),
      leasedAt: null,
      startedAt: null,
      completedAt: null,
      lastErrorCode: null,
      lastErrorSafeMessage: null,
      versionSnapshot: {
        ...job.versionSnapshot,
        manualRetryCount: String(nextRetry),
      },
    })
    .where(eq(aiJob.id, job.id));
  await addGraphileJob(transaction, job.id, graphileJobKey);
  return {
    id: job.id,
    status: "QUEUED",
    location: `/api/v1/ai-jobs/${job.id}`,
  };
}

/**
 * A failed focused-generation job is a durable audit record.  Do not reset it
 * in place: a provider or package-shape change can make its frozen request
 * unrecoverable even after the learner fixes their connection.  Instead, make
 * one fresh child job from the same protected learning references and resolve
 * the learner's currently configured route.
 */
export async function recoverFailedFocusedGeneration(
  transaction: DatabaseTransaction,
  failedJob: typeof aiJob.$inferSelect,
): Promise<{
  id: string;
  status: (typeof aiJob.$inferSelect)["status"];
  location: string;
}> {
  if (
    failedJob.taskKind !== "exercise_generation" ||
    failedJob.status !== "FAILED"
  ) {
    throw Object.assign(
      new Error("Only a failed focused practice generation can be recovered."),
      { code: "FOCUSED_GENERATION_RECOVERY_NOT_AVAILABLE" },
    );
  }

  const recoveryReference = sql`${aiJob.protectedReference}->>'recoveryOfJobId' = ${failedJob.id}`;
  const activeRecovery = await transaction.query.aiJob.findFirst({
    where: and(
      eq(aiJob.ownerId, failedJob.ownerId),
      eq(aiJob.taskKind, "exercise_generation"),
      recoveryReference,
      inArray(aiJob.status, [
        "WAITING_FOR_CONSENT",
        "QUEUED",
        "LEASED",
        "RUNNING",
        "RETRY_SCHEDULED",
      ]),
    ),
  });
  if (activeRecovery) {
    return {
      id: activeRecovery.id,
      status: activeRecovery.status,
      location: `/api/v1/ai-jobs/${activeRecovery.id}`,
    };
  }

  const earlierRecoveries = await transaction
    .select({ id: aiJob.id })
    .from(aiJob)
    .where(
      and(
        eq(aiJob.ownerId, failedJob.ownerId),
        eq(aiJob.taskKind, "exercise_generation"),
        recoveryReference,
      ),
    );
  const recovery = await enqueueAIJob(transaction, {
    ownerId: failedJob.ownerId,
    taskKind: "exercise_generation",
    protectedReference: {
      ...failedJob.protectedReference,
      recoveryOfJobId: failedJob.id,
      recoveryOrdinal: String(earlierRecoveries.length + 1),
    },
    idempotencyKey: `focused-generation-recovery:${failedJob.id}:${earlierRecoveries.length + 1}`,
  });
  return recovery;
}

export async function enqueueAIJob(
  transaction: DatabaseTransaction,
  input: {
    ownerId: string;
    taskKind: AITaskKind;
    protectedReference: Record<string, string>;
    idempotencyKey: string;
  },
): Promise<EnqueuedAIJob> {
  const { environment } = getServerContext();
  const deploymentMode = await resolveInstanceDeploymentMode(
    transaction,
    environment.DEPLOYMENT_MODE,
  );
  const { route, provider: routeProvider } = await resolveAIJobRoute(
    transaction,
    {
      deploymentMode,
      jobOwnerId: input.ownerId,
      taskKind: input.taskKind,
    },
  );

  const configured = route
    ? route.providerConnectionId
      ? routeProvider
        ? {
            status: "QUEUED" as const,
            providerKind: routeProvider.kind,
            providerConnectionId: routeProvider.id,
            model: route.model,
          }
        : unconfiguredJobDecision({})
      : environment.OPENAI_API_KEY
        ? {
            status: "QUEUED" as const,
            providerKind: "openai" as const,
            providerConnectionId: "environment-openai" as const,
            model: route.model,
          }
        : unconfiguredJobDecision({})
    : unconfiguredJobDecision({
        ...(environment.OPENAI_API_KEY
          ? { environmentApiKey: environment.OPENAI_API_KEY }
          : {}),
        ...(environment.OPENAI_MODEL
          ? { environmentModel: environment.OPENAI_MODEL }
          : {}),
      });
  const id = newDomainId();
  const graphileJobKey = `ai-job:${id}`;
  const snapshot = {
    ...promptSnapshot(
      input.taskKind,
      configured.model,
      route?.routeVersion ?? 1,
    ),
    schemaVersion: "1.0.0",
    providerKind: configured.providerKind,
    providerConnectionId: configured.providerConnectionId,
    fallbackEnabled: String(route?.fallbackEnabled ?? false),
  };

  await transaction.insert(aiJob).values({
    id,
    ownerId: input.ownerId,
    taskKind: input.taskKind,
    status: configured.status,
    providerConnectionId:
      configured.providerConnectionId === "environment-openai" ||
      configured.providerConnectionId === "unconfigured"
        ? null
        : configured.providerConnectionId,
    modelRouteId: configured.status === "QUEUED" ? route?.id : null,
    protectedReference: input.protectedReference,
    versionSnapshot: snapshot,
    idempotencyKey: input.idempotencyKey,
    graphileJobKey,
  });
  if (configured.status === "QUEUED") {
    await addGraphileJob(transaction, id, graphileJobKey);
  }
  return {
    id,
    status: configured.status,
    location: `/api/v1/ai-jobs/${id}`,
  };
}

export async function resumeWaitingAIJobsForRoutes(
  transaction: DatabaseTransaction,
  scope: AIJobRepairScope,
  bindings: readonly JobRouteBinding[],
): Promise<number> {
  let resumed = 0;
  for (const binding of bindings) {
    const jobs = await transaction
      .select()
      .from(aiJob)
      .where(
        and(
          scope.deploymentMode === "personal"
            ? eq(aiJob.ownerId, scope.actorId)
            : undefined,
          eq(aiJob.taskKind, binding.taskKind),
          eq(aiJob.status, "WAITING_FOR_CONSENT"),
        ),
      )
      .for("update");
    for (const job of jobs) {
      const graphileJobKey = job.graphileJobKey ?? `ai-job:${job.id}`;
      await transaction
        .update(aiJob)
        .set({
          status: "QUEUED",
          providerConnectionId: binding.providerConnectionId,
          modelRouteId: binding.routeId,
          versionSnapshot: {
            ...promptSnapshot(
              binding.taskKind,
              binding.model,
              binding.routeVersion,
            ),
            schemaVersion: "1.0.0",
            providerKind: binding.providerKind,
            providerConnectionId:
              binding.providerConnectionId ?? "environment-openai",
            fallbackEnabled: String(binding.fallbackEnabled),
          },
          graphileJobKey,
          availableAt: new Date(),
          completedAt: null,
          lastErrorCode: null,
          lastErrorSafeMessage: null,
        })
        .where(eq(aiJob.id, job.id));
      await addGraphileJob(transaction, job.id, graphileJobKey);
      resumed += 1;
    }
  }
  return resumed;
}

export async function resumeBlockedAIJobsForProvider(
  transaction: DatabaseTransaction,
  scope: AIJobRepairScope,
  providerConnectionId: string,
): Promise<number> {
  const jobs = await transaction
    .select()
    .from(aiJob)
    .where(
      and(
        scope.deploymentMode === "personal"
          ? eq(aiJob.ownerId, scope.actorId)
          : undefined,
        eq(aiJob.providerConnectionId, providerConnectionId),
        eq(aiJob.status, "AI_BLOCKED"),
        inArray(aiJob.lastErrorCode, [
          "AUTHENTICATION",
          "PROVIDER_SECRET_UNAVAILABLE",
          "SESSION_KEY_EXPIRED",
        ]),
      ),
    )
    .for("update");
  for (const job of jobs) {
    const graphileJobKey = job.graphileJobKey ?? `ai-job:${job.id}`;
    await transaction
      .update(aiJob)
      .set({
        status: "QUEUED",
        graphileJobKey,
        availableAt: new Date(),
        completedAt: null,
        lastErrorCode: null,
        lastErrorSafeMessage: null,
      })
      .where(eq(aiJob.id, job.id));
    await addGraphileJob(transaction, job.id, graphileJobKey);
  }
  return jobs.length;
}
