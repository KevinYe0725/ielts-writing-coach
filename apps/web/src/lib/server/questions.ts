import { and, eq } from "drizzle-orm";

import {
  newDomainId,
  question,
  questionGenerationBatch,
  type Database,
} from "@iwc/db";
import {
  getQuestionById,
  QUESTION_TYPES,
  TOPICS,
  type Question as StaticQuestion,
} from "@iwc/question-bank";

import { ApiProblem } from "./problem";

export async function resolveQuestion(
  database: Database,
  ownerId: string,
  externalId: string,
): Promise<typeof question.$inferSelect> {
  const original = getQuestionById(externalId);
  const existing = await database.query.question.findFirst({
    where: eq(question.externalId, externalId),
  });
  if (existing) {
    if (original) {
      if (!isCanonicalStoredStaticQuestion(existing, original)) {
        throw questionNotFound();
      }
      return existing;
    }
    if (
      !isSupportedQuestion(
        existing.questionType,
        existing.topic,
        existing.ieltsTrack,
      )
    ) {
      throw questionNotFound();
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
    if (existing.visibility === "private") {
      if (existing.ownerId !== ownerId) throw questionNotFound();
      return existing;
    }
    throw questionNotFound();
  }
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

export function isCanonicalStoredStaticQuestion(
  stored: typeof question.$inferSelect,
  canonical: StaticQuestion,
): boolean {
  return (
    stored.externalId === canonical.id &&
    stored.ownerId === null &&
    stored.visibility === "public" &&
    stored.generationBatchId === null &&
    stored.source !== "AI_GENERATED" &&
    stored.source !== "AI_RESEARCHED" &&
    stored.ieltsTrack === "academic" &&
    stored.questionType === canonical.type &&
    stored.topic === canonical.topic &&
    stored.prompt === canonical.prompt
  );
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
