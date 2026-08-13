import { and, eq } from "drizzle-orm";

import { transitionTransfer } from "@iwc/learning-core";
import { transferTask } from "@iwc/db";

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
    const id = parseDomainId(rawId, "transfer_task_id");
    await parseJsonBody(request, emptyObjectSchema, {
      maximumBytes: 1_024,
      allowEmpty: true,
    });
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      transferTaskId: id,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const result = await db.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(transferTask)
          .where(
            and(eq(transferTask.id, id), eq(transferTask.userId, actor.id)),
          )
          .for("update");
        if (!current) {
          throw new ApiProblem({
            title: "Transfer task not found",
            status: 404,
            code: "TRANSFER_TASK_NOT_FOUND",
            detail: "The transfer task does not exist.",
          });
        }
        const now = new Date();
        if (current.availableAt > now) {
          throw new ApiProblem({
            title: "Transfer task not ready",
            status: 409,
            code: "TRANSFER_TASK_NOT_READY",
            detail:
              "Only a due transfer task can record no natural opportunity.",
          });
        }
        if (current.expiresAt !== null && current.expiresAt <= now) {
          throw new ApiProblem({
            title: "Transfer window expired",
            status: 409,
            code: "TRANSFER_WINDOW_EXPIRED",
            detail: "This transfer window has expired and must be rescheduled.",
          });
        }
        const ready = ["PLANNED", "RESCHEDULED"].includes(current.status)
          ? transitionTransfer(current.status, "READY")
          : current.status;
        if (ready !== "READY") {
          throw new ApiProblem({
            title: "Transfer task not ready",
            status: 409,
            code: "TRANSFER_TASK_NOT_READY",
            detail:
              "Only a ready transfer task can record no natural opportunity.",
          });
        }
        const noOpportunity = transitionTransfer(ready, "NO_OPPORTUNITY");
        const rescheduled = transitionTransfer(noOpportunity, "RESCHEDULED");
        const availableAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const expiresAt = new Date(availableAt.getTime() + 48 * 60 * 60 * 1000);
        await transaction
          .update(transferTask)
          .set({ status: rescheduled, availableAt, expiresAt })
          .where(eq(transferTask.id, id));
        return { rescheduled, availableAt, expiresAt };
      });
      const responseBody = {
        transfer_task_id: id,
        status: result.rescheduled,
        result: "NO_OPPORTUNITY",
        counted_as_failure: false,
        available_at: result.availableAt,
        expires_at: result.expiresAt,
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
