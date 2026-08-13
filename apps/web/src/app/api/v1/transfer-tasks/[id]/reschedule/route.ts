import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
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
import { rescheduleExpiredTransfer } from "@/lib/server/task-reschedule";

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
      action: "reschedule_expired_window",
    });
    if (reservation.replay) return reservation.replay;
    try {
      const result = await db.transaction((transaction) =>
        rescheduleExpiredTransfer(transaction, {
          taskId: id,
          userId: actor.id,
        }),
      );
      const responseBody = {
        transfer_task_id: result.taskId,
        status: result.status,
        available_at: result.availableAt,
        expires_at: result.expiresAt,
        reason: "WINDOW_EXPIRED",
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
