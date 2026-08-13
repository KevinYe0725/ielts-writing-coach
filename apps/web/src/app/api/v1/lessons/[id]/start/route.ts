import { and, eq } from "drizzle-orm";

import { transitionTrainingCycle } from "@iwc/learning-core";
import { lessonPlan, trainingCycle } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import {
  lessonRuntimeSnapshot,
  startLessonRuntime,
} from "@/lib/server/lesson-runtime";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import {
  emptyObjectSchema,
  parseDomainId,
  parseJsonBody,
} from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

export const POST = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "lesson_id");
    await parseJsonBody(request, emptyObjectSchema, {
      maximumBytes: 1_024,
      allowEmpty: true,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      lessonId: id,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const cycle = await db.transaction(async (transaction) => {
        let plan = await transaction.query.lessonPlan.findFirst({
          where: eq(lessonPlan.id, id),
        });
        if (!plan) {
          throw new ApiProblem({
            title: "Lesson not found",
            status: 404,
            code: "LESSON_NOT_FOUND",
            detail: "The lesson does not exist.",
          });
        }
        const [current] = await transaction
          .select()
          .from(trainingCycle)
          .where(
            and(
              eq(trainingCycle.id, plan.cycleId),
              eq(trainingCycle.userId, actor.id),
            ),
          )
          .for("update");
        if (!current) {
          throw new ApiProblem({
            title: "Cycle not found",
            status: 404,
            code: "CYCLE_NOT_FOUND",
            detail: "The lesson does not belong to this learner.",
          });
        }
        await transaction
          .select({ id: lessonPlan.id })
          .from(lessonPlan)
          .where(eq(lessonPlan.id, id))
          .for("update");
        plan =
          (await transaction.query.lessonPlan.findFirst({
            where: eq(lessonPlan.id, id),
          })) ?? plan;
        const next =
          current.status === "LESSON_READY"
            ? transitionTrainingCycle(current.status, "LESSON_ACTIVE")
            : current.status;
        if (next !== "LESSON_ACTIVE") {
          throw new ApiProblem({
            title: "Lesson cannot be started",
            status: 409,
            code: "LESSON_START_NOT_ALLOWED",
            detail: "This lesson is not ready or resumable.",
          });
        }
        if (current.status !== next) {
          await transaction
            .update(trainingCycle)
            .set({ status: next })
            .where(eq(trainingCycle.id, current.id));
        }
        const runtimeUpdate = startLessonRuntime(plan);
        const [runtimePlan] =
          Object.keys(runtimeUpdate).length === 0
            ? [plan]
            : await transaction
                .update(lessonPlan)
                .set(runtimeUpdate)
                .where(eq(lessonPlan.id, plan.id))
                .returning();
        return {
          id: current.id,
          status: next,
          plan: runtimePlan ?? plan,
        };
      });
      const responseBody = {
        lesson_id: id,
        cycle_id: cycle.id,
        cycle_status: cycle.status,
        core_minutes: cycle.plan.coreMinutes,
        maximum_minutes: cycle.plan.coreMinutes + cycle.plan.remediationMinutes,
        runtime: lessonRuntimeSnapshot(cycle.plan),
      };
      await completeIdempotentResponse(
        db,
        actor.id,
        reservation.key,
        200,
        responseBody,
      );
      return Response.json(responseBody);
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
