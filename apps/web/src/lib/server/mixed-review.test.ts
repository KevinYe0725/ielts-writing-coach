import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import {
  createDatabase,
  mixedReviewTask,
  newDomainId,
  question,
  trainingCycle,
  user,
} from "@iwc/db";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)(
  "D14 mixed review persistence (PostgreSQL)",
  () => {
    const { db, pool } = createDatabase(databaseUrl!);
    const createdUsers: string[] = [];

    afterEach(async () => {
      for (const id of createdUsers.splice(0)) {
        await db.delete(user).where(eq(user.id, id));
      }
    });

    it("links at most one due old target to a later cycle", async () => {
      const suffix = newDomainId();
      const userId = `mixed-review-${suffix}`;
      const sourceCycleId = newDomainId();
      const targetCycleId = newDomainId();
      const sourceQuestionId = newDomainId();
      const targetQuestionId = newDomainId();
      createdUsers.push(userId);
      await db.insert(user).values({
        id: userId,
        name: "Mixed Review Test",
        email: `${suffix}@example.test`,
        role: "learner",
      });
      await db.insert(question).values([
        {
          id: sourceQuestionId,
          externalId: `mixed-source-${suffix}`,
          questionType: "opinion",
          topic: "education",
          prompt: "Should schools teach a second language early?",
        },
        {
          id: targetQuestionId,
          externalId: `mixed-target-${suffix}`,
          questionType: "discussion",
          topic: "technology",
          prompt: "Discuss whether automation benefits the workplace.",
        },
      ]);
      await db.insert(trainingCycle).values([
        {
          id: sourceCycleId,
          userId,
          questionId: sourceQuestionId,
          schemaVersion: "1.0.0",
          timezone: "UTC",
          coreSkillId: "collocation_naturalness",
        },
        {
          id: targetCycleId,
          userId,
          questionId: targetQuestionId,
          schemaVersion: "1.0.0",
          timezone: "UTC",
        },
      ]);
      const taskId = newDomainId();
      await db.insert(mixedReviewTask).values({
        id: taskId,
        sourceCycleId,
        targetCycleId,
        userId,
        status: "READY",
        dueAt: new Date("2026-08-27T12:00:00.000Z"),
      });

      const stored = await db.query.mixedReviewTask.findFirst({
        where: and(
          eq(mixedReviewTask.userId, userId),
          eq(mixedReviewTask.targetCycleId, targetCycleId),
        ),
      });
      expect(stored).toMatchObject({
        id: taskId,
        sourceCycleId,
        targetCycleId,
        status: "READY",
      });
      const duplicateError = await db
        .insert(mixedReviewTask)
        .values({
          sourceCycleId: targetCycleId,
          targetCycleId,
          userId,
          status: "READY",
          dueAt: new Date("2026-08-28T12:00:00.000Z"),
        })
        .catch((error: unknown) => error);
      expect(duplicateError).toBeInstanceOf(Error);
      expect(
        (duplicateError as { cause?: { code?: string } }).cause?.code,
      ).toBe("23505");
    });
  },
);
