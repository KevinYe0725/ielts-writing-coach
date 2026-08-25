import { z } from "zod";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import {
  createQuestionRecommendation,
  type QuestionRecommendationProjection,
} from "@/lib/server/question-recommendation";
import { parseJsonBody } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  enforceRateLimit,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const recommendationSchema = z
  .object({
    action: z.enum(["INITIAL", "SWAP"]),
    excluded_question_id: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  await enforceRateLimit(request, {
    bucket: "question-recommendations-create",
    limit: 30,
    windowSeconds: 60,
    identity: actor.id,
  });
  const payload = await parseJsonBody(request, recommendationSchema, {
    maximumBytes: 4 * 1_024,
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
    const result = await createQuestionRecommendation(
      db,
      actor.id,
      {
        action: payload.action,
        ...(payload.excluded_question_id === undefined
          ? {}
          : { excludedQuestionId: payload.excluded_question_id }),
      },
      {
        afterPersist: async (transaction, persisted) => {
          const projection = questionRecommendationHttpProjection(persisted);
          await completeIdempotentResponse(
            transaction,
            actor.id,
            reservation.key,
            projection.status,
            projection.body,
          );
        },
      },
    );
    return recommendationResponse(result);
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});

export function recommendationResponse(
  result: QuestionRecommendationProjection,
): Response {
  const projection = questionRecommendationHttpProjection(result);
  return Response.json(projection.body, {
    status: projection.status,
    headers: {
      "cache-control": "no-store",
      ...(projection.location ? { location: projection.location } : {}),
      ...(projection.status >= 400
        ? { "content-type": "application/problem+json" }
        : {}),
    },
  });
}

export function questionRecommendationHttpProjection(
  result: QuestionRecommendationProjection,
): { status: number; body: Record<string, unknown>; location?: string } {
  if (result.status === "READY") {
    return {
      status: 200,
      body: {
        recommendation: {
          id: result.id,
          status: "READY",
          question: {
            id: result.question.id,
            prompt: result.question.prompt,
            type: result.question.type,
            topic: result.question.topic,
            ielts_track: result.question.ieltsTrack,
            visibility: result.question.visibility,
          },
        },
      },
    };
  }
  if (result.status === "PENDING") {
    return {
      status: 202,
      location: `/api/v1/question-recommendations/${result.id}`,
      body: {
        recommendation: {
          id: result.id,
          status: "PENDING",
          retry_after_seconds: 2,
          message:
            "We are preparing a new essay question. You can also paste your own question.",
        },
      },
    };
  }
  return {
    status: 503,
    body: {
      type: "https://ielts-writing-coach.dev/problems/question_supply_unavailable",
      title: "Question supply is temporarily unavailable",
      status: 503,
      code: "QUESTION_SUPPLY_UNAVAILABLE",
      detail:
        "A new question could not be prepared. Browse the question bank or paste your own question.",
      recommendation_id: result.id,
    },
  };
}
