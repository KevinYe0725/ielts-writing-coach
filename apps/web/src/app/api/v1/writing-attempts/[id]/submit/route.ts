import { and, eq } from "drizzle-orm";

import { transitionTrainingCycle } from "@iwc/learning-core";
import { rewriteTask, trainingCycle, writingAttempt } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { enqueueAIJob } from "@/lib/server/jobs";
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
    const id = parseDomainId(rawId, "attempt_id");
    await parseJsonBody(request, emptyObjectSchema, {
      maximumBytes: 1_024,
      allowEmpty: true,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      attemptId: id,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction(async (transaction) => {
        const [attempt] = await transaction
          .select()
          .from(writingAttempt)
          .where(
            and(eq(writingAttempt.id, id), eq(writingAttempt.userId, actor.id)),
          )
          .for("update");
        if (!attempt)
          throw new ApiProblem({
            title: "Attempt not found",
            status: 404,
            code: "ATTEMPT_NOT_FOUND",
            detail: "The writing attempt does not exist.",
          });
        if (attempt.lockedAt)
          throw new ApiProblem({
            title: "Already submitted",
            status: 409,
            code: "ATTEMPT_ALREADY_SUBMITTED",
            detail: "The writing attempt has already been submitted.",
          });
        const [cycle] = await transaction
          .select()
          .from(trainingCycle)
          .where(eq(trainingCycle.id, attempt.cycleId))
          .for("update");
        if (!cycle || cycle.userId !== actor.id)
          throw new ApiProblem({
            title: "Cycle not found",
            status: 404,
            code: "CYCLE_NOT_FOUND",
            detail: "The training cycle does not exist.",
          });
        const expectedState =
          attempt.kind === "version_1"
            ? "ATTEMPT_1_ACTIVE"
            : "ATTEMPT_2_ACTIVE";
        if (cycle.status !== expectedState)
          throw new ApiProblem({
            title: "Attempt not active",
            status: 409,
            code: "ATTEMPT_NOT_ACTIVE",
            detail: "The training cycle is not accepting this submission.",
          });
        const now = new Date();
        const durationSeconds = Math.max(
          0,
          Math.round((now.getTime() - attempt.createdAt.getTime()) / 1000),
        );
        const abnormalities = [...attempt.abnormalConditions];
        if (durationSeconds !== null && durationSeconds > 40 * 60 + 30)
          abnormalities.push("submitted_after_40_minute_window");
        await transaction
          .update(writingAttempt)
          .set({
            lockedAt: now,
            submittedAt: now,
            durationSeconds,
            abnormalConditions: [...new Set(abnormalities)],
            ...(attempt.kind === "version_2" &&
            attempt.draftAfterSelfCheck === null
              ? { draftAfterSelfCheck: attempt.content }
              : {}),
          })
          .where(eq(writingAttempt.id, attempt.id));
        if (attempt.kind === "version_1") {
          const submitted = transitionTrainingCycle(cycle.status, "SUBMITTED");
          const analyzing = transitionTrainingCycle(submitted, "ANALYZING");
          await transaction
            .update(trainingCycle)
            .set({ status: analyzing })
            .where(eq(trainingCycle.id, cycle.id));
          const job = await enqueueAIJob(transaction, {
            ownerId: actor.id,
            taskKind: "ielts_assessment",
            protectedReference: { attemptId: attempt.id, cycleId: cycle.id },
            idempotencyKey: `assessment:${attempt.id}`,
          });
          return { job, cycleStatus: analyzing, wordCount: attempt.wordCount };
        }
        const comparing = transitionTrainingCycle(cycle.status, "COMPARING");
        await transaction
          .update(trainingCycle)
          .set({ status: comparing })
          .where(eq(trainingCycle.id, cycle.id));
        await transaction
          .update(rewriteTask)
          .set({ status: "COMPLETED", completedAt: now })
          .where(
            and(
              eq(rewriteTask.cycleId, cycle.id),
              eq(rewriteTask.userId, actor.id),
            ),
          );
        const job = await enqueueAIJob(transaction, {
          ownerId: actor.id,
          taskKind: "version_comparison",
          protectedReference: { attemptId: attempt.id, cycleId: cycle.id },
          idempotencyKey: `comparison:${attempt.id}`,
        });
        return { job, cycleStatus: comparing, wordCount: attempt.wordCount };
      });
      const responseBody = {
        submitted: true,
        cycle_status: output.cycleStatus,
        word_count: output.wordCount,
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
