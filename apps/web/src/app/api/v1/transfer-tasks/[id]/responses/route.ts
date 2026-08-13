import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { transitionTransfer } from "@iwc/learning-core";
import { aiJob, newDomainId, skillEvidenceEvent, transferTask } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { enqueueAIJob } from "@/lib/server/jobs";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseDomainId, parseJsonBody } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const responseSchema = z
  .object({
    first_answer: z.string().trim().min(1).max(8_000),
    elapsed_seconds: z
      .number()
      .int()
      .min(0)
      .max(60 * 60),
    started_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export const POST = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "transfer_task_id");
    const payload = await parseJsonBody(request, responseSchema, {
      maximumBytes: 16 * 1_024,
    });
    const submittedAt = new Date();
    const startedAt = new Date(payload.started_at);
    if (startedAt.getTime() > submittedAt.getTime() + 5 * 60 * 1_000) {
      throw new ApiProblem({
        title: "Invalid transfer start time",
        status: 400,
        code: "TRANSFER_START_TIME_INVALID",
        detail: "The first-answer start time cannot be in the future.",
      });
    }

    const elapsedByClock = Math.max(
      0,
      Math.round((submittedAt.getTime() - startedAt.getTime()) / 1_000),
    );
    if (Math.abs(elapsedByClock - payload.elapsed_seconds) > 5 * 60) {
      throw new ApiProblem({
        title: "Inconsistent transfer timing",
        status: 400,
        code: "TRANSFER_TIMING_INCONSISTENT",
        detail:
          "Elapsed time must match the submitted start time within five minutes.",
      });
    }

    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      transferTaskId: id,
      ...payload,
    });
    if (reservation.replay) return reservation.replay;

    try {
      const output = await db.transaction(async (transaction) => {
        const [task] = await transaction
          .select()
          .from(transferTask)
          .where(
            and(eq(transferTask.id, id), eq(transferTask.userId, actor.id)),
          )
          .for("update");
        if (!task) {
          throw new ApiProblem({
            title: "Transfer task not found",
            status: 404,
            code: "TRANSFER_TASK_NOT_FOUND",
            detail: "The transfer task does not exist.",
          });
        }
        if (task.availableAt > submittedAt) {
          throw new ApiProblem({
            title: "Transfer task not ready",
            status: 409,
            code: "TRANSFER_TASK_NOT_READY",
            detail: "Only a ready transfer task can accept a first answer.",
          });
        }
        if (task.expiresAt !== null && task.expiresAt < submittedAt) {
          throw new ApiProblem({
            title: "Transfer window expired",
            status: 409,
            code: "TRANSFER_WINDOW_EXPIRED",
            detail: "This transfer window has expired and must be rescheduled.",
          });
        }
        const readyStatus = ["PLANNED", "RESCHEDULED"].includes(task.status)
          ? transitionTransfer(task.status, "READY")
          : task.status;
        if (readyStatus !== "READY") {
          throw new ApiProblem({
            title: "Transfer task not ready",
            status: 409,
            code: "TRANSFER_TASK_NOT_READY",
            detail: "Only a ready transfer task can accept a first answer.",
          });
        }

        const [existingJob] = await transaction
          .select({ id: aiJob.id })
          .from(aiJob)
          .where(
            and(
              eq(aiJob.ownerId, actor.id),
              eq(aiJob.taskKind, "transfer_evaluation"),
              inArray(aiJob.status, [
                "QUEUED",
                "LEASED",
                "RUNNING",
                "RETRY_SCHEDULED",
                "WAITING_FOR_CONSENT",
                "AI_BLOCKED",
                "FAILED",
                "SUCCEEDED",
              ]),
              sql`${aiJob.protectedReference}->>'transferTaskId' = ${task.id}`,
            ),
          )
          .limit(1);
        if (existingJob) {
          throw new ApiProblem({
            title: "Transfer answer already submitted",
            status: 409,
            code: "TRANSFER_RESPONSE_EXISTS",
            detail:
              "The immutable first answer for this transfer window has already been saved.",
          });
        }

        const responseId = newDomainId();
        await transaction.insert(skillEvidenceEvent).values({
          id: newDomainId(),
          userId: actor.id,
          cycleId: task.sourceCycleId,
          skillId: task.skillId,
          evidenceStage: "TRANSFER_RESPONSE",
          sourceType: "transfer_response",
          sourceId: responseId,
          valid: false,
          confidence: 0,
          occurredAt: submittedAt,
          payload: {
            transferTaskId: task.id,
            firstAnswer: payload.first_answer,
            firstAnswerStartedAt: startedAt.toISOString(),
            submittedAt: submittedAt.toISOString(),
            elapsedSeconds: payload.elapsed_seconds,
            hintLevel: "NONE",
            targetHintHidden: true,
            assisted: false,
          },
        });
        if (task.status !== "READY") {
          await transaction
            .update(transferTask)
            .set({ status: readyStatus })
            .where(eq(transferTask.id, task.id));
        }
        const job = await enqueueAIJob(transaction, {
          ownerId: actor.id,
          taskKind: "transfer_evaluation",
          protectedReference: {
            cycleId: task.sourceCycleId,
            transferTaskId: task.id,
            transferResponseId: responseId,
          },
          idempotencyKey: `transfer-evaluation:${responseId}`,
        });
        return { job, responseId, taskId: task.id };
      });

      const responseBody = {
        transfer_task_id: output.taskId,
        response_id: output.responseId,
        first_answer_saved: true,
        job_id: output.job.id,
        job_status: output.job.status,
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
        headers: { location: output.job.location },
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
