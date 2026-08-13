import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";

import {
  createLearningSchedule,
  transitionTrainingCycle,
} from "@iwc/learning-core";
import {
  mixedReviewTask,
  rewriteTask,
  trainingCycle,
  writingAttempt,
  writingAttemptRevision,
} from "@iwc/db";

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
    const id = parseDomainId((await context.params).id, "cycle_id");
    const body = await parseJsonBody(request, emptyObjectSchema, {
      allowEmpty: true,
      maximumBytes: 1_024,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(
      db,
      actor.id,
      request,
      body,
    );
    if (reservation.replay) return reservation.replay;
    try {
      const result = await db.transaction(async (transaction) => {
        const [cycle] = await transaction
          .select()
          .from(trainingCycle)
          .where(
            and(eq(trainingCycle.id, id), eq(trainingCycle.userId, actor.id)),
          )
          .for("update");
        if (!cycle)
          throw new ApiProblem({
            title: "Cycle not found",
            status: 404,
            code: "CYCLE_NOT_FOUND",
            detail: "The training cycle does not exist.",
          });
        const next = transitionTrainingCycle(cycle.status, "ATTEMPT_1_ACTIVE");
        const startedAt = new Date();
        const schedule = createLearningSchedule(startedAt.toISOString());
        const [attempt] = await transaction
          .insert(writingAttempt)
          .values({
            cycleId: cycle.id,
            userId: actor.id,
            kind: "version_1",
            content: "",
            wordCount: 0,
            revision: 1,
          })
          .returning();
        if (!attempt) throw new Error("Writing attempt creation failed.");
        await transaction.insert(writingAttemptRevision).values({
          attemptId: attempt.id,
          revision: 1,
          baseRevision: 0,
          content: "",
          wordCount: 0,
          branch: "canonical",
        });
        await transaction
          .update(trainingCycle)
          .set({ status: next, startedAt })
          .where(eq(trainingCycle.id, cycle.id));
        const [existingTarget] = await transaction
          .select({ id: mixedReviewTask.id })
          .from(mixedReviewTask)
          .where(eq(mixedReviewTask.targetCycleId, cycle.id))
          .limit(1);
        const [dueReview] = existingTarget
          ? []
          : await transaction
              .select({
                id: mixedReviewTask.id,
                sourceCycleId: mixedReviewTask.sourceCycleId,
              })
              .from(mixedReviewTask)
              .where(
                and(
                  eq(mixedReviewTask.userId, actor.id),
                  inArray(mixedReviewTask.status, [
                    "PLANNED",
                    "READY",
                    "RESCHEDULED",
                  ]),
                  isNull(mixedReviewTask.targetCycleId),
                  lte(mixedReviewTask.dueAt, startedAt),
                ),
              )
              .orderBy(asc(mixedReviewTask.dueAt), asc(mixedReviewTask.id))
              .limit(1)
              .for("update", { skipLocked: true });
        if (dueReview) {
          const [source] = await transaction
            .select({ questionId: trainingCycle.questionId })
            .from(trainingCycle)
            .where(eq(trainingCycle.id, dueReview.sourceCycleId))
            .limit(1);
          if (source && source.questionId !== cycle.questionId) {
            await transaction
              .update(mixedReviewTask)
              .set({ targetCycleId: cycle.id, status: "READY" })
              .where(
                and(
                  eq(mixedReviewTask.id, dueReview.id),
                  isNull(mixedReviewTask.targetCycleId),
                ),
              );
          }
        }
        await transaction.insert(rewriteTask).values({
          cycleId: cycle.id,
          userId: actor.id,
          status: "PLANNED",
          availableAt: new Date(schedule.rewrite.targetRewriteAt),
          expiresAt: new Date(schedule.rewrite.targetWindowEndsAt),
          abstractChecklist: [
            "Check whether every part of the task is answered.",
            "Check whether each paragraph has one clear function.",
            "Check grammar and word choice only after the blind draft.",
          ],
        });
        await transaction.insert(mixedReviewTask).values({
          sourceCycleId: cycle.id,
          userId: actor.id,
          status: "PLANNED",
          dueAt: new Date(schedule.mixedReview.dueAt),
        });
        return { attempt, startedAt };
      });
      const responseBody = {
        attempt: result.attempt,
        cycle_status: "ATTEMPT_1_ACTIVE",
        deadline_at: new Date(
          result.startedAt.getTime() + 40 * 60 * 1000,
        ).toISOString(),
      };
      await completeIdempotentResponse(
        db,
        actor.id,
        reservation.key,
        201,
        responseBody,
      );
      return Response.json(responseBody, {
        status: 201,
        headers: {
          location: `/api/v1/writing-attempts/${result.attempt.id}`,
          etag: 'W/"1"',
        },
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
