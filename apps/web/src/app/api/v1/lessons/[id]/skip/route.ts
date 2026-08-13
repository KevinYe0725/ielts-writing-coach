import { getServerContext } from "@/lib/server/context";
import { skipFocusedLesson } from "@/lib/server/lesson-skip";
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
      action: "USER_SKIPPED",
    });
    if (reservation.replay) return reservation.replay;
    try {
      const output = await db.transaction((transaction) =>
        skipFocusedLesson(transaction, { lessonId: id, userId: actor.id }),
      );
      const responseBody = {
        skipped: true,
        cycle_status: output.cycleStatus,
        lesson_status: "USER_SKIPPED",
        rewrite_task: output.rewrite,
        mastery_evidence_created: false,
        retained_evidence_allowed: false,
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
        headers: { location: `/api/v1/rewrite-tasks/${output.rewrite.id}` },
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
