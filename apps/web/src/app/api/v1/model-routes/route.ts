import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { AI_TASK_KINDS } from "@iwc/ai";
import { auditEvent, modelRoute, providerConnection, user } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseJsonBody } from "@/lib/server/request";
import { requireRole, requireSession } from "@/lib/server/session";
import {
  resolveAIJobRoute,
  resolveInstanceDeploymentMode,
  resumeWaitingAIJobsForRoutes,
  type JobRouteBinding,
} from "@/lib/server/jobs";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const routeSchema = z
  .object({
    tasks: z
      .array(z.enum(AI_TASK_KINDS))
      .min(1)
      .max(AI_TASK_KINDS.length)
      .default([...AI_TASK_KINDS]),
    provider_connection_id: z.string().min(1),
    model: z.string().trim().min(1).max(200),
    fallback_provider_connection_id: z.uuid().optional(),
    fallback_model: z.string().trim().min(1).max(200).optional(),
    fallback_enabled: z.boolean().default(false),
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
          columns: { id: true, role: true },
          where: inArray(user.role, ["owner", "admin"]),
        })
      : [{ id: actor.id, role: actor.role }];
  const routes = await db.query.modelRoute.findMany({
    where: inArray(
      modelRoute.ownerId,
      privilegedOwners.map((owner) => owner.id),
    ),
  });
  const roleByOwner = new Map(
    privilegedOwners.map((owner) => [owner.id, owner.role]),
  );
  // The client folds records by task. This is the inverse of the canonical
  // resolver's precedence, so its final value is exactly the active route.
  routes.sort(
    (left, right) =>
      left.updatedAt.getTime() - right.updatedAt.getTime() ||
      (roleByOwner.get(left.ownerId) === roleByOwner.get(right.ownerId)
        ? 0
        : roleByOwner.get(left.ownerId) === "admin"
          ? -1
          : 1) ||
      right.ownerId.localeCompare(left.ownerId) ||
      right.id.localeCompare(left.id),
  );
  return Response.json({
    routes,
    default_environment_route:
      environment.OPENAI_API_KEY && environment.OPENAI_MODEL
        ? {
            provider_connection_id: "environment-openai",
            model: environment.OPENAI_MODEL,
          }
        : null,
    cross_provider_fallback_default: false,
  });
});

export const PUT = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  const payload = await parseJsonBody(request, routeSchema, {
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
  if (
    payload.fallback_enabled &&
    (!payload.fallback_provider_connection_id || !payload.fallback_model)
  ) {
    throw new ApiProblem({
      title: "Fallback incomplete",
      status: 422,
      code: "FALLBACK_INCOMPLETE",
      detail: "Enable fallback only with an explicit provider and model.",
    });
  }
  if (payload.provider_connection_id !== "environment-openai") {
    const provider = await db.query.providerConnection.findFirst({
      where: and(
        eq(providerConnection.id, payload.provider_connection_id),
        inArray(providerConnection.ownerId, privilegedOwnerIds),
      ),
    });
    if (!provider || !provider.enabled)
      throw new ApiProblem({
        title: "Provider not found",
        status: 404,
        code: "PROVIDER_NOT_FOUND",
        detail: "The selected provider connection does not exist.",
      });
    if (payload.tasks.includes("ielts_assessment") && provider.capabilities) {
      const capabilities = provider.capabilities as {
        structuredOutput?: boolean;
      };
      if (capabilities.structuredOutput !== true) {
        throw new ApiProblem({
          title: "Model not eligible",
          status: 422,
          code: "SCORING_MODEL_SCHEMA_UNSTABLE",
          detail:
            "A scoring model must pass structured-output capability probing.",
        });
      }
    }
  } else if (!environment.OPENAI_API_KEY) {
    throw new ApiProblem({
      title: "Environment provider unavailable",
      status: 422,
      code: "PROVIDER_NOT_FOUND",
      detail: "OPENAI_API_KEY is not configured on this instance.",
    });
  }

  const reservation = await reserveIdempotencyKey(
    db,
    actor.id,
    request,
    payload,
  );
  if (reservation.replay) return reservation.replay;
  try {
    const result = await db.transaction(async (transaction) => {
      const saved = [];
      for (const task of payload.tasks) {
        const existing =
          deploymentMode === "shared"
            ? (
                await resolveAIJobRoute(transaction, {
                  deploymentMode,
                  jobOwnerId: actor.id,
                  taskKind: task,
                })
              ).route
            : await transaction.query.modelRoute.findFirst({
                where: and(
                  eq(modelRoute.ownerId, actor.id),
                  eq(modelRoute.taskKind, task),
                ),
              });
        const [record] = existing
          ? await transaction
              .update(modelRoute)
              .set({
                providerConnectionId:
                  payload.provider_connection_id === "environment-openai"
                    ? null
                    : payload.provider_connection_id,
                model: payload.model,
                fallbackProviderConnectionId:
                  payload.fallback_provider_connection_id,
                fallbackModel: payload.fallback_model,
                fallbackEnabled: payload.fallback_enabled,
                routeVersion: existing.routeVersion + 1,
              })
              .where(eq(modelRoute.id, existing.id))
              .returning()
          : await transaction
              .insert(modelRoute)
              .values({
                ownerId: actor.id,
                taskKind: task,
                providerConnectionId:
                  payload.provider_connection_id === "environment-openai"
                    ? null
                    : payload.provider_connection_id,
                model: payload.model,
                fallbackProviderConnectionId:
                  payload.fallback_provider_connection_id,
                fallbackModel: payload.fallback_model,
                fallbackEnabled: payload.fallback_enabled,
              })
              .returning();
        if (record) saved.push(record);
      }
      await transaction.insert(auditEvent).values({
        actorId: actor.id,
        action: "model_routes.update",
        targetType: "model_route",
        result: "success",
        metadata: {
          tasks: payload.tasks,
          fallbackEnabled: payload.fallback_enabled,
        },
      });
      const persistedDeploymentMode = await resolveInstanceDeploymentMode(
        transaction,
        deploymentMode,
      );
      const repairBindings: JobRouteBinding[] = [];
      for (const task of payload.tasks) {
        const resolved = await resolveAIJobRoute(transaction, {
          deploymentMode: persistedDeploymentMode,
          jobOwnerId: actor.id,
          taskKind: task,
        });
        if (!resolved.route) continue;
        if (resolved.route.providerConnectionId && !resolved.provider) continue;
        if (!resolved.route.providerConnectionId && !environment.OPENAI_API_KEY)
          continue;
        repairBindings.push({
          taskKind: task,
          routeId: resolved.route.id,
          providerConnectionId: resolved.route.providerConnectionId,
          providerKind: resolved.provider?.kind ?? "openai",
          model: resolved.route.model,
          routeVersion: resolved.route.routeVersion,
          fallbackEnabled: resolved.route.fallbackEnabled,
        });
      }
      const resumedJobs = await resumeWaitingAIJobsForRoutes(
        transaction,
        { actorId: actor.id, deploymentMode: persistedDeploymentMode },
        repairBindings,
      );
      const responseBody = { routes: saved, resumed_jobs: resumedJobs };
      await completeIdempotentResponse(
        transaction,
        actor.id,
        reservation.key,
        200,
        responseBody,
      );
      return responseBody;
    });
    return Response.json(result);
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
