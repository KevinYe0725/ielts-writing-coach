import { and, eq } from "drizzle-orm";

import { newDomainId, question, type Database } from "@iwc/db";
import { getQuestionById } from "@iwc/question-bank";

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
    if (existing.visibility === "private" && existing.ownerId !== ownerId) {
      throw new ApiProblem({
        title: "Question not found",
        status: 404,
        code: "QUESTION_NOT_FOUND",
        detail: "The requested question does not exist.",
      });
    }
    return existing;
  }
  const original = getQuestionById(externalId);
  if (!original) {
    throw new ApiProblem({
      title: "Question not found",
      status: 404,
      code: "QUESTION_NOT_FOUND",
      detail: "The requested question does not exist.",
    });
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
  const raced = await database.query.question.findFirst({
    where: eq(question.externalId, externalId),
  });
  if (!raced) throw new Error("Question upsert did not return a record.");
  return raced;
}
