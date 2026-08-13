import { and, eq } from "drizzle-orm";

import { transitionRewrite, transitionTrainingCycle } from "@iwc/learning-core";
import {
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
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "rewrite_task_id");
    await parseJsonBody(request, emptyObjectSchema, {
      maximumBytes: 1_024,
      allowEmpty: true,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      rewriteTaskId: id,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction(async (transaction) => {
        const [task] = await transaction
          .select()
          .from(rewriteTask)
          .where(and(eq(rewriteTask.id, id), eq(rewriteTask.userId, actor.id)))
          .for("update");
        if (!task) {
          throw new ApiProblem({
            title: "Rewrite task not found",
            status: 404,
            code: "REWRITE_TASK_NOT_FOUND",
            detail: "The rewrite task does not exist.",
          });
        }
        const now = new Date();
        if (task.availableAt > now) {
          throw new ApiProblem({
            title: "Rewrite still locked",
            status: 423,
            code: "REWRITE_LOCKED",
            detail: "The 24-hour closed-book interval has not finished.",
            available_at: task.availableAt,
          });
        }
        if (task.expiresAt !== null && task.expiresAt <= now) {
          throw new ApiProblem({
            title: "Rewrite window expired",
            status: 409,
            code: "REWRITE_WINDOW_EXPIRED",
            detail:
              "The delayed rewrite window has expired and must be rescheduled.",
            expired_at: task.expiresAt,
          });
        }
        const [cycle] = await transaction
          .select()
          .from(trainingCycle)
          .where(eq(trainingCycle.id, task.cycleId))
          .for("update");
        if (!cycle || cycle.userId !== actor.id) {
          throw new ApiProblem({
            title: "Cycle not found",
            status: 404,
            code: "CYCLE_NOT_FOUND",
            detail: "The training cycle does not exist.",
          });
        }
        let cycleState = cycle.status;
        let taskState = task.status;
        if (cycleState === "REWRITE_LOCKED") {
          cycleState = transitionTrainingCycle(cycleState, "REWRITE_READY");
        }
        if (taskState === "LOCKED" || taskState === "RESCHEDULED") {
          taskState = transitionRewrite(taskState, "READY");
        }
        cycleState = transitionTrainingCycle(cycleState, "ATTEMPT_2_ACTIVE");
        taskState = transitionRewrite(taskState, "ACTIVE");
        const startedAt = new Date();
        const [attempt] = await transaction
          .insert(writingAttempt)
          .values({
            cycleId: cycle.id,
            userId: actor.id,
            kind: "version_2",
            content: "",
            wordCount: 0,
            revision: 1,
          })
          .returning();
        if (!attempt) throw new Error("Version 2 could not be created.");
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
          .set({ status: cycleState })
          .where(eq(trainingCycle.id, cycle.id));
        await transaction
          .update(rewriteTask)
          .set({ status: taskState, startedAt })
          .where(eq(rewriteTask.id, task.id));
        return { attempt, startedAt };
      });
      const responseBody = {
        rewrite_task_id: id,
        attempt: output.attempt,
        cycle_status: "ATTEMPT_2_ACTIVE",
        first_35_minutes: {
          personal_target_hidden: true,
          version_1_hidden: true,
          model_essay_hidden: true,
        },
        self_check_available_at: new Date(
          output.startedAt.getTime() + 35 * 60 * 1000,
        ),
        deadline_at: new Date(output.startedAt.getTime() + 40 * 60 * 1000),
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
          location: `/api/v1/writing-attempts/${output.attempt.id}`,
          etag: 'W/"1"',
        },
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
