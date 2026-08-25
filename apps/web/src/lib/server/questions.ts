import { and, eq } from "drizzle-orm";

import {
  newDomainId,
  question,
  questionGenerationBatch,
  type Database,
} from "@iwc/db";
import { getQuestionById, QUESTION_TYPES, TOPICS } from "@iwc/question-bank";

import { ApiProblem } from "./problem";

export async function resolveQuestion(
  database: Database,
  ownerId: string,
  externalId: string,
): Promise<typeof question.$inferSelect> {
  const existing = await database.query.question.findFirst({
    where: eq(question.externalId, externalId),
  });
  if (existing) {
    if (
      !isSupportedQuestion(
        existing.questionType,
        existing.topic,
        existing.ieltsTrack,
      )
    ) {
      throw questionNotFound();
    }
    if (existing.visibility === "private") {
      if (existing.ownerId !== ownerId || existing.generationBatchId !== null) {
        throw questionNotFound();
      }
      return existing;
    }
    const isGenerated =
      existing.generationBatchId !== null ||
      existing.source === "AI_GENERATED" ||
      existing.source === "AI_RESEARCHED";
    if (isGenerated) {
      if (
        existing.visibility !== "public" ||
        existing.ownerId !== null ||
        existing.generationBatchId === null ||
        (existing.source !== "AI_GENERATED" &&
          existing.source !== "AI_RESEARCHED")
      ) {
        throw questionNotFound();
      }
      const batch = await database.query.questionGenerationBatch.findFirst({
        columns: { status: true },
        where: eq(questionGenerationBatch.id, existing.generationBatchId),
      });
      if (batch?.status !== "SUCCEEDED") throw questionNotFound();
      return existing;
    }
    const staticQuestion = getQuestionById(externalId);
    if (
      !staticQuestion ||
      existing.visibility !== "public" ||
      existing.ownerId !== null
    ) {
      throw questionNotFound();
    }
    return existing;
  }
  const original = getQuestionById(externalId);
  if (!original) {
    throw questionNotFound();
  }
  const [created] = await database
    .insert(question)
    .values({
      id: newDomainId(),
      externalId: original.id,
      source: original.origin,
      visibility: "public",
      ieltsTrack: "academic",
      questionType: original.type,
      topic: original.topic,
      prompt: original.prompt,
      attribution: "IELTS Writing Coach original open question bank",
      bankVersion: "1.0.0",
    })
    .onConflictDoNothing({ target: question.externalId })
    .returning();
  if (created) return created;
  return resolveQuestion(database, ownerId, externalId);
}

function isSupportedQuestion(
  questionType: string,
  topic: string,
  ieltsTrack: string,
): boolean {
  return (
    (QUESTION_TYPES as readonly string[]).includes(questionType) &&
    (TOPICS as readonly string[]).includes(topic) &&
    (ieltsTrack === "academic" || ieltsTrack === "general_training")
  );
}

function questionNotFound(): ApiProblem {
  return new ApiProblem({
    title: "Question not found",
    status: 404,
    code: "QUESTION_NOT_FOUND",
    detail: "The requested question does not exist.",
  });
}
