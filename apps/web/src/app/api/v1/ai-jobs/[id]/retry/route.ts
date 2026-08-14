import { and, eq } from "drizzle-orm";

import { aiJob } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import {
  recoverFailedFocusedGeneration,
  requeueFailedAIJob,
} from "@/lib/server/jobs";
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

const retryableTaskKinds = new Set([
  "exercise_generation",
  "open_sentence_evaluation",
  "paragraph_evaluation",
]);

export const POST = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "job_id");
    await parseJsonBody(request, emptyObjectSchema, {
      allowEmpty: true,
      maximumBytes: 1_024,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      jobId: id,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const retried = await db.transaction(async (transaction) => {
        const [job] = await transaction
          .select()
          .from(aiJob)
          .where(and(eq(aiJob.id, id), eq(aiJob.ownerId, actor.id)))
          .for("update");
        if (!job) {
          throw new ApiProblem({
            title: "Job not found",
            status: 404,
            code: "AI_JOB_NOT_FOUND",
            detail: "The AI job does not exist.",
          });
        }
        if (!retryableTaskKinds.has(job.taskKind)) {
          throw new ApiProblem({
            title: "Item retry is not supported",
            status: 409,
            code: "AI_JOB_RETRY_NOT_SUPPORTED",
            detail:
              "Only a failed generated lesson module or open exercise evaluation can be retried here.",
          });
        }
        try {
          if (job.taskKind === "exercise_generation") {
            return await recoverFailedFocusedGeneration(transaction, job);
          }
          return await requeueFailedAIJob(transaction, job);
        } catch (error) {
          const code =
            typeof error === "object" &&
            error !== null &&
            typeof (error as { code?: unknown }).code === "string"
              ? (error as { code: string }).code
              : "AI_JOB_RETRY_NOT_AVAILABLE";
          throw new ApiProblem({
            title: "Item retry is not available",
            status: 409,
            code,
            detail:
              error instanceof Error
                ? error.message
                : "The failed item cannot be retried.",
          });
        }
      });
      const responseBody = {
        retried: true,
        job_id: retried.id,
        job_status: retried.status,
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
        headers: { location: retried.location },
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
