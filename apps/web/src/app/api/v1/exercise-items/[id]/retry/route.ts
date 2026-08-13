import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { aiJob, evaluation, exerciseAttempt, exerciseItem } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { enqueueAIJob, requeueFailedAIJob } from "@/lib/server/jobs";
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
    const id = parseDomainId(rawId, "exercise_item_id");
    await parseJsonBody(request, emptyObjectSchema, {
      allowEmpty: true,
      maximumBytes: 1_024,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      exerciseItemId: id,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction(async (transaction) => {
        const item = await transaction.query.exerciseItem.findFirst({
          where: eq(exerciseItem.id, id),
          with: { lessonPlan: { with: { cycle: true } } },
        });
        if (!item || item.lessonPlan.cycle.userId !== actor.id) {
          throw new ApiProblem({
            title: "Exercise item not found",
            status: 404,
            code: "EXERCISE_ITEM_NOT_FOUND",
            detail: "The exercise item does not exist.",
          });
        }
        const attempt = await transaction.query.exerciseAttempt.findFirst({
          where: and(
            eq(exerciseAttempt.exerciseItemId, id),
            eq(exerciseAttempt.userId, actor.id),
          ),
          orderBy: [desc(exerciseAttempt.updatedAt), desc(exerciseAttempt.id)],
        });
        if (!attempt) {
          throw new ApiProblem({
            title: "No saved answer to retry",
            status: 409,
            code: "EXERCISE_RETRY_NOT_AVAILABLE",
            detail: "Submit and save this item before retrying its evaluation.",
          });
        }
        const latestEvaluation = await transaction.query.evaluation.findFirst({
          where: eq(evaluation.exerciseAttemptId, attempt.id),
          orderBy: [desc(evaluation.createdAt), desc(evaluation.id)],
        });
        const [failedJob] = await transaction
          .select()
          .from(aiJob)
          .where(
            and(
              eq(aiJob.ownerId, actor.id),
              eq(aiJob.status, "FAILED"),
              inArray(aiJob.taskKind, [
                "open_sentence_evaluation",
                "paragraph_evaluation",
              ]),
              sql`${aiJob.protectedReference}->>'exerciseAttemptId' = ${attempt.id}`,
              ...(latestEvaluation
                ? [gt(aiJob.updatedAt, latestEvaluation.createdAt)]
                : []),
            ),
          )
          .orderBy(desc(aiJob.updatedAt))
          .limit(1)
          .for("update");
        let retried;
        let retryKind: "FAILED_JOB" | "LOW_CONFIDENCE_REEVALUATION";
        if (failedJob) {
          try {
            retried = await requeueFailedAIJob(transaction, failedJob);
          } catch (error) {
            const code =
              typeof error === "object" &&
              error !== null &&
              typeof (error as { code?: unknown }).code === "string"
                ? (error as { code: string }).code
                : "EXERCISE_RETRY_NOT_AVAILABLE";
            throw new ApiProblem({
              title: "Exercise retry is not available",
              status: 409,
              code,
              detail:
                error instanceof Error
                  ? error.message
                  : "This failed evaluation cannot be retried.",
            });
          }
          retryKind = "FAILED_JOB";
        } else {
          if (latestEvaluation?.feedback.outcome !== "NEUTRAL") {
            throw new ApiProblem({
              title: "No failed evaluation to retry",
              status: 409,
              code: "EXERCISE_RETRY_NOT_AVAILABLE",
              detail:
                "This item has neither a failed evaluation job nor a low-confidence neutral judgment.",
            });
          }
          const existingReevaluation = await transaction.query.aiJob.findFirst({
            where: and(
              eq(aiJob.ownerId, actor.id),
              sql`${aiJob.protectedReference}->>'exerciseAttemptId' = ${attempt.id}`,
              sql`${aiJob.protectedReference}->>'reevaluationOfEvaluationId' is not null`,
            ),
            orderBy: [desc(aiJob.updatedAt), desc(aiJob.id)],
          });
          if (existingReevaluation) {
            throw new ApiProblem({
              title: "Neutral re-evaluation limit reached",
              status: 409,
              code: "EXERCISE_REEVALUATION_LIMIT_REACHED",
              detail:
                "One explicit re-evaluation is allowed. The bounded supplemental evidence item remains available.",
            });
          }
          const taskKind = [
            "PARAGRAPH_WRITING",
            "MICRO_PARAGRAPH",
            "INTEGRATED_APPLICATION",
            "PARAGRAPH_SELF_CHECK",
            "SELF_CHECK",
          ].includes(item.itemType)
            ? "paragraph_evaluation"
            : "open_sentence_evaluation";
          retried = await enqueueAIJob(transaction, {
            ownerId: actor.id,
            taskKind,
            protectedReference: {
              exerciseAttemptId: attempt.id,
              exerciseItemId: item.id,
              lessonId: item.lessonPlan.id,
              cycleId: item.lessonPlan.cycle.id,
              reevaluationOfEvaluationId: latestEvaluation.id,
            },
            idempotencyKey: `reevaluation:${attempt.id}:1`,
          });
          retryKind = "LOW_CONFIDENCE_REEVALUATION";
        }
        if (!retried) {
          throw new ApiProblem({
            title: "Exercise retry was not queued",
            status: 500,
            code: "EXERCISE_RETRY_NOT_QUEUED",
            detail: "The bounded item retry could not be queued.",
          });
        }
        return { attemptId: attempt.id, retried, retryKind };
      });
      const responseBody = {
        response_id: output.attemptId,
        job_id: output.retried.id,
        job_status: output.retried.status,
        retry_kind: output.retryKind,
      };
      await completeIdempotentResponse(
        db,
        actor.id,
        reservation.key,
        202,
        responseBody,
      );
      return Response.json(responseBody, {
        status: 202,
        headers: { location: output.retried.location },
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
