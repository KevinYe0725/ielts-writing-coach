import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";

import { LEARNING_CONTRACT_VERSION } from "@iwc/learning-contracts";
import { mixedReviewTask, trainingCycle } from "@iwc/db";

import { lockLearnerAndAssertActiveCycleCapacity } from "@/lib/server/active-cycle-limit";
import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { assertRecommendationForCycle } from "@/lib/server/question-recommendation";
import { resolveQuestion } from "@/lib/server/questions";
import { ianaTimezoneSchema, parseJsonBody } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const createCycleSchema = z
  .object({
    question_id: z.string().trim().min(1).max(200),
    recommendation_id: z.uuid().optional(),
    timezone: ianaTimezoneSchema,
  })
  .strict();

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  const { db } = getServerContext();
  const cycles = await db.query.trainingCycle.findMany({
    where: eq(trainingCycle.userId, actor.id),
    orderBy: [desc(trainingCycle.createdAt)],
    with: { question: true },
    limit: 100,
  });
  return Response.json({ cycles });
});

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  const payload = await parseJsonBody(request, createCycleSchema, {
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
    if (payload.recommendation_id) {
      await assertRecommendationForCycle(
        db,
        actor.id,
        payload.recommendation_id,
        payload.question_id,
      );
    }
    const selectedQuestion = await resolveQuestion(
      db,
      actor.id,
      payload.question_id,
    );
    const cycle = await db.transaction(async (transaction) => {
      // Recommendation and cycle creation share this exact learner-locked
      // capacity predicate so neither mutation can drift from the other.
      await lockLearnerAndAssertActiveCycleCapacity(transaction, actor.id);

      // A due D14 review is passively attached to the next ordinary timed essay.
      // The old skill is never returned to the browser, so the first draft stays
      // genuinely low-cue and can only produce a recurrence observation.
      const [dueReview] = await transaction
        .select({
          id: mixedReviewTask.id,
          sourceCycleId: mixedReviewTask.sourceCycleId,
        })
        .from(mixedReviewTask)
        .where(
          and(
            eq(mixedReviewTask.userId, actor.id),
            inArray(mixedReviewTask.status, [
              "PLANNED",
              "READY",
              "RESCHEDULED",
            ]),
            isNull(mixedReviewTask.targetCycleId),
            lte(mixedReviewTask.dueAt, new Date()),
          ),
        )
        .orderBy(asc(mixedReviewTask.dueAt), asc(mixedReviewTask.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (dueReview) {
        const [source] = await transaction
          .select({ questionId: trainingCycle.questionId })
          .from(trainingCycle)
          .where(
            and(
              eq(trainingCycle.id, dueReview.sourceCycleId),
              eq(trainingCycle.userId, actor.id),
            ),
          )
          .limit(1);
        if (source?.questionId === selectedQuestion.id) {
          throw new ApiProblem({
            title: "Choose a new essay question",
            status: 409,
            code: "MIXED_REVIEW_NEW_QUESTION_REQUIRED",
            detail:
              "The D14 mixed review must run inside a different essay question so it remains a genuine low-cue check.",
          });
        }
      }

      const [created] = await transaction
        .insert(trainingCycle)
        .values({
          userId: actor.id,
          questionId: selectedQuestion.id,
          status: "QUESTION_READY",
          schemaVersion: LEARNING_CONTRACT_VERSION,
          timezone: payload.timezone,
        })
        .returning();
      if (!created) throw new Error("Training cycle creation failed.");
      if (dueReview) {
        await transaction
          .update(mixedReviewTask)
          .set({ targetCycleId: created.id, status: "READY" })
          .where(
            and(
              eq(mixedReviewTask.id, dueReview.id),
              isNull(mixedReviewTask.targetCycleId),
            ),
          );
      }
      return created;
    });
    const responseBody = {
      cycle: {
        ...cycle,
        question: {
          id: selectedQuestion.externalId,
          prompt: selectedQuestion.prompt,
          type: selectedQuestion.questionType,
          topic: selectedQuestion.topic,
        },
      },
      next_action: "start_version_1",
    };
    const location = `/api/v1/training-cycles/${cycle.id}`;
    await completeIdempotentResponse(
      db,
      actor.id,
      reservation.key,
      201,
      responseBody,
    );
    return Response.json(responseBody, {
      status: 201,
      headers: { location },
    });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
