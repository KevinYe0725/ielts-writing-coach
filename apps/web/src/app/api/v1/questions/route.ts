import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { newDomainId, question } from "@iwc/db";
import {
  QUESTION_BANK,
  QUESTION_TYPES,
  TOPICS,
  listQuestions,
} from "@iwc/question-bank";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { parseJsonBody } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";

const querySchema = z
  .object({
    type: z.enum(QUESTION_TYPES).optional(),
    topic: z.enum(TOPICS).optional(),
  })
  .strict();

const customQuestionSchema = z
  .object({
    prompt: z.string().trim().min(30).max(2_000),
    type: z.enum(QUESTION_TYPES),
    topic: z.enum(TOPICS),
    ielts_track: z.enum(["academic", "general_training"]).default("academic"),
  })
  .strict();

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  const url = new URL(request.url);
  const filters = querySchema.parse({
    type: url.searchParams.get("type") ?? undefined,
    topic: url.searchParams.get("topic") ?? undefined,
  });
  const { db } = getServerContext();
  const [privateQuestions] = await Promise.all([
    db
      .select({
        externalId: question.externalId,
        questionType: question.questionType,
        topic: question.topic,
        prompt: question.prompt,
        ieltsTrack: question.ieltsTrack,
        source: question.source,
        visibility: question.visibility,
      })
      .from(question)
      .where(
        and(eq(question.ownerId, actor.id), eq(question.visibility, "private")),
      )
      .orderBy(desc(question.createdAt)),
  ]);
  const original = listQuestions({
    ...(filters.type === undefined ? {} : { type: filters.type }),
    ...(filters.topic === undefined ? {} : { topic: filters.topic }),
  }).map((item) => ({ ...item, ieltsTrack: "academic", visibility: "public" }));
  return Response.json({
    questions: [...privateQuestions, ...original],
    taxonomy: { types: QUESTION_TYPES, topics: TOPICS },
    bank: { version: "1.0.0", original_count: QUESTION_BANK.length },
  });
});

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  const payload = await parseJsonBody(request, customQuestionSchema, {
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
    const id = newDomainId();
    const externalId = `private-${id}`;
    await db.insert(question).values({
      id,
      externalId,
      ownerId: actor.id,
      source: "user_private",
      visibility: "private",
      ieltsTrack: payload.ielts_track,
      questionType: payload.type,
      topic: payload.topic,
      prompt: payload.prompt,
      bankVersion: "private",
    });
    const responseBody = {
      question: {
        id: externalId,
        prompt: payload.prompt,
        type: payload.type,
        topic: payload.topic,
        ielts_track: payload.ielts_track,
        visibility: "private",
      },
    };
    await completeIdempotentResponse(
      db,
      actor.id,
      reservation.key,
      201,
      responseBody,
    );
    return Response.json(responseBody, { status: 201 });
  } catch (error) {
    return settleIdempotentError(db, actor.id, reservation.key, error);
  }
});
