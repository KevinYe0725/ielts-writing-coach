import { and, eq } from "drizzle-orm";

import { transitionTrainingCycle } from "@iwc/learning-core";
import { lessonPlan, rewriteTask, trainingCycle } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
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
      allowEmpty: true,
      maximumBytes: 1_024,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      lessonId: id,
      action: "COMPLETE_PRACTICE_PAPER",
    });
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction(async (transaction) => {
        const [plan] = await transaction
          .select()
          .from(lessonPlan)
          .where(eq(lessonPlan.id, id))
          .for("update");
        if (!plan) {
          throw new ApiProblem({
            title: "Practice paper not found",
            status: 404,
            code: "PRACTICE_PAPER_NOT_FOUND",
            detail: "The practice paper does not exist.",
          });
        }
        const [cycle] = await transaction
          .select()
          .from(trainingCycle)
          .where(
            and(
              eq(trainingCycle.id, plan.cycleId),
              eq(trainingCycle.userId, actor.id),
            ),
          )
          .for("update");
        if (!cycle) {
          throw new ApiProblem({
            title: "Practice paper not found",
            status: 404,
            code: "PRACTICE_PAPER_NOT_FOUND",
            detail: "The practice paper does not belong to this learner.",
          });
        }
        if (!plan.paperSubmittedAt || !plan.paperResult) {
          throw new ApiProblem({
            title: "Review not ready",
            status: 425,
            code: "PRACTICE_PAPER_RESULT_NOT_READY",
            detail: "Wait for the complete paper review before continuing.",
          });
        }
        if (["LESSON_RESOLVED", "REWRITE_LOCKED"].includes(cycle.status)) {
          const existing = await transaction.query.rewriteTask.findFirst({
            where: eq(rewriteTask.cycleId, cycle.id),
          });
          return existing;
        }
        if (cycle.status !== "LESSON_ACTIVE") {
          throw new ApiProblem({
            title: "Practice cannot be completed",
            status: 409,
            code: "PRACTICE_PAPER_COMPLETE_NOT_ALLOWED",
            detail: "Open the submitted practice paper before continuing.",
          });
        }
        const resolved = transitionTrainingCycle(
          cycle.status,
          "LESSON_RESOLVED",
        );
        const locked = transitionTrainingCycle(resolved, "REWRITE_LOCKED");
        const now = new Date();
        const availableAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
        const [rewrite] = await transaction
          .insert(rewriteTask)
          .values({
            cycleId: cycle.id,
            userId: actor.id,
            status: "LOCKED",
            availableAt,
            expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1_000),
            abstractChecklist: [
              "Check the question instruction and your position.",
              "Check paragraph purpose and logical development.",
              "Check the personal target only after 35 minutes.",
            ],
            lastInstructionExposureAt: now,
            prerequisiteSkipped: false,
          })
          .onConflictDoUpdate({
            target: rewriteTask.cycleId,
            set: {
              status: "LOCKED",
              availableAt,
              lastInstructionExposureAt: now,
            },
          })
          .returning();
        await transaction
          .update(trainingCycle)
          .set({ status: locked })
          .where(eq(trainingCycle.id, cycle.id));
        await transaction
          .update(lessonPlan)
          .set({ runtimeStatus: "CORE_COMPLETED", resolvedAt: now })
          .where(eq(lessonPlan.id, plan.id));
        return rewrite;
      });
      const responseBody = { completed: true, rewrite_task: output };
      await completeIdempotentResponse(
        db,
        actor.id,
        reservation.key,
        201,
        responseBody,
      );
      return Response.json(responseBody, { status: 201 });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
