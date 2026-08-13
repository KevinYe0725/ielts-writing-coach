import { and, eq } from "drizzle-orm";

import { notification } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
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
    const { id } = await context.params;
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      notificationId: id,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const updated = await db
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(eq(notification.id, id), eq(notification.userId, actor.id)))
        .returning({ id: notification.id });
      if (updated.length === 0) {
        throw new ApiProblem({
          title: "Notification not found",
          status: 404,
          code: "NOTIFICATION_NOT_FOUND",
          detail: "The notification does not exist.",
        });
      }
      const responseBody = { read: true };
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
