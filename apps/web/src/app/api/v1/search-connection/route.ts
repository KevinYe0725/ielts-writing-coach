import { z } from "zod";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { emptyObjectSchema, parseJsonBody } from "@/lib/server/request";
import {
  getSearchConnectionProjection,
  revokeSearchConnection,
  saveSearchConnection,
} from "@/lib/server/search-connection";
import { requireRole, requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  enforceRateLimit,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const saveSchema = z
  .object({ api_key: z.string().trim().min(1).max(2_000) })
  .strict();

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  const { db } = getServerContext();
  return Response.json(await getSearchConnectionProjection(db, actor), {
    headers: { "cache-control": "no-store" },
  });
});

export const PUT = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  await enforceRateLimit(request, {
    bucket: "search-connection-save",
    limit: 10,
    windowSeconds: 60 * 60,
    identity: actor.id,
  });
  const payload = await parseJsonBody(request, saveSchema, {
    maximumBytes: 8 * 1_024,
  });
  const { db } = getServerContext();
  const reservation = await reserveIdempotencyKey(
    db,
    actor.id,
    request,
    payload,
  );
  if (reservation.replay) return reservation.replay;
  try {
    const responseBody = await saveSearchConnection(
      db,
      actor,
      payload.api_key,
      {
        afterPersist: async (transaction, responseBody) =>
          completeIdempotentResponse(
            transaction,
            actor.id,
            reservation.key,
            200,
            responseBody!,
          ),
      },
    );
    return Response.json(responseBody, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});

export const DELETE = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  requireRole(actor, ["owner", "admin"]);
  await enforceRateLimit(request, {
    bucket: "search-connection-revoke",
    limit: 10,
    windowSeconds: 60 * 60,
    identity: actor.id,
  });
  await parseJsonBody(request, emptyObjectSchema, {
    allowEmpty: true,
    maximumBytes: 1_024,
  });
  const { db } = getServerContext();
  const reservation = await reserveIdempotencyKey(db, actor.id, request, {});
  if (reservation.replay) return reservation.replay;
  try {
    await revokeSearchConnection(db, actor, {
      afterPersist: async (transaction) =>
        completeIdempotentResponse(
          transaction,
          actor.id,
          reservation.key,
          204,
          {
            revoked: true,
          },
        ),
    });
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
