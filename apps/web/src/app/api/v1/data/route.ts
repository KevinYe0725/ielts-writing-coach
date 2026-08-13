import { z } from "zod";

import { getServerContext } from "@/lib/server/context";
import { deleteLearningRecord } from "@/lib/server/learning-record";
import { apiRoute } from "@/lib/server/problem";
import { parseJsonBody } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  enforceRateLimit,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const deletionSchema = z
  .object({
    confirmation: z.literal("DELETE MY LEARNING DATA"),
  })
  .strict();

/** Delete learner-owned writing and teaching data while preserving the account. */
export const DELETE = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  await enforceRateLimit(request, {
    bucket: "learning-data-delete",
    limit: 3,
    windowSeconds: 60 * 60,
    identity: actor.id,
  });
  const body = await parseJsonBody(request, deletionSchema, {
    maximumBytes: 1_024,
  });
  const { db } = getServerContext();
  const reservation = await reserveIdempotencyKey(db, actor.id, request, body);
  if (reservation.replay) return reservation.replay;
  try {
    const counts = await deleteLearningRecord(db, actor.id, reservation.key);
    const responseBody = {
      deleted: true,
      account_preserved: true,
      ...counts,
    };
    await completeIdempotentResponse(
      db,
      actor.id,
      reservation.key,
      200,
      responseBody,
    );
    return Response.json(responseBody, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
