import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  auditEvent,
  createDatabase,
  idempotencyRecord,
  learningPreference,
  newDomainId,
  notification,
  question,
  skillEvidenceEvent,
  trainingCycle,
  user,
} from "@iwc/db";

import { buildLearningRecord, deleteLearningRecord } from "./learning-record";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("learner data rights (PostgreSQL)", () => {
  it("exports owned learning data and deletes it without deleting the account", async () => {
    const { db, pool } = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const userId = `data-rights-${suffix}`;
    const questionId = newDomainId();
    const cycleId = newDomainId();
    const preservedKey = `delete:${suffix}`;
    try {
      await db.insert(user).values({
        id: userId,
        name: "Data Rights Test",
        email: `${suffix}@example.test`,
        role: "learner",
      });
      await db.insert(question).values({
        id: questionId,
        externalId: `private-${suffix}`,
        ownerId: userId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach practical decision-making?",
      });
      await db.insert(trainingCycle).values({
        id: cycleId,
        userId,
        questionId,
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
      await db.insert(learningPreference).values({ userId });
      await db.insert(skillEvidenceEvent).values({
        userId,
        cycleId,
        skillId: "mechanism_chain",
        evidenceStage: "CONTROLLED_PRACTICE",
        sourceType: "EXERCISE_RESPONSE",
        sourceId: newDomainId(),
        valid: true,
        confidence: 0.95,
        occurredAt: new Date(),
        payload: { test: true },
      });
      await db.insert(notification).values({
        userId,
        channel: "in_app",
        kind: "rewrite_ready",
        dedupeKey: `test-${suffix}`,
        payload: { cycleId },
        scheduledAt: new Date(),
      });
      await db.insert(idempotencyRecord).values([
        {
          userId,
          key: preservedKey,
          requestHash: "a".repeat(64),
          expiresAt: new Date(Date.now() + 60_000),
        },
        {
          userId,
          key: `stale:${suffix}`,
          requestHash: "b".repeat(64),
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      const before = await buildLearningRecord(db, userId);
      expect(before.cycles).toHaveLength(1);
      expect(before.skillEvidence).toHaveLength(1);

      const result = await deleteLearningRecord(db, userId, preservedKey);
      expect(result).toMatchObject({ cycles: 1, evidenceEvents: 1 });
      expect(
        await db.query.user.findFirst({ where: eq(user.id, userId) }),
      ).toBeTruthy();
      expect(
        await db.query.trainingCycle.findMany({
          where: eq(trainingCycle.userId, userId),
        }),
      ).toHaveLength(0);
      expect(
        await db.query.learningPreference.findFirst({
          where: eq(learningPreference.userId, userId),
        }),
      ).toBeUndefined();
      expect(
        await db.query.idempotencyRecord.findMany({
          where: eq(idempotencyRecord.userId, userId),
        }),
      ).toHaveLength(1);
    } finally {
      await db.delete(user).where(eq(user.id, userId));
      await db.delete(auditEvent).where(eq(auditEvent.targetId, userId));
      await pool.end();
    }
  });
});
