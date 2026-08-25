import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { emptyObjectSchema, parseJsonBody } from "@/lib/server/request";
import { retryQuestionBankRefill } from "@/lib/server/question-recommendation";
import { requireRole, requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  enforceRateLimit,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

function wireResult(result: {
  state: "STARTED" | "ATTACHED";
  batchStatus: string;
}) {
  return { state: result.state, batch_status: result.batchStatus };
}

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  await enforceRateLimit(request, {
    bucket: "question-supply-retry",
    identity: actor.id,
    limit: 5,
    windowSeconds: 15 * 60,
  });
  await parseJsonBody(request, emptyObjectSchema, {
    allowEmpty: true,
    maximumBytes: 1_024,
  });
  const { db } = getServerContext();
  const reservation = await reserveIdempotencyKey(db, actor.id, request, {});
  if (reservation.replay) return reservation.replay;

  try {
    const result = await retryQuestionBankRefill(db, actor.id, {
      afterPersist: async (transaction, persisted) =>
        completeIdempotentResponse(
          transaction,
          actor.id,
          reservation.key,
          202,
          wireResult(persisted),
        ),
    });
    return Response.json(wireResult(result), {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
