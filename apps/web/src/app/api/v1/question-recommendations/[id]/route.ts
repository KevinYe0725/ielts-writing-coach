import { z } from "zod";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import {
  abandonQuestionRecommendation,
  getQuestionRecommendation,
} from "@/lib/server/question-recommendation";
import { emptyObjectSchema, parseJsonBody } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  enforceRateLimit,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

import { recommendationResponse } from "../route";

const recommendationIdSchema = z.uuid();

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id } = await context.params;
    const recommendationId = recommendationIdSchema.parse(id);
    const { db } = getServerContext();
    return recommendationResponse(
      await getQuestionRecommendation(db, actor.id, recommendationId),
    );
  },
);

export const DELETE = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    await enforceRateLimit(request, {
      bucket: "question-recommendations-abandon",
      limit: 30,
      windowSeconds: 60,
      identity: actor.id,
    });
    await parseJsonBody(request, emptyObjectSchema, {
      allowEmpty: true,
      maximumBytes: 1_024,
    });
    const { id } = await context.params;
    const recommendationId = recommendationIdSchema.parse(id);
    const { db } = getServerContext();
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {});
    if (reservation.replay) return reservation.replay;
    try {
      await abandonQuestionRecommendation(db, actor.id, recommendationId, {
        afterPersist: async (transaction) =>
          completeIdempotentResponse(
            transaction,
            actor.id,
            reservation.key,
            204,
            { abandoned: true },
          ),
      });
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);
