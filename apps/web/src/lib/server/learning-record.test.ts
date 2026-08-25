import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createLearningRecordArchive } from "@iwc/exchange";
import {
  auditEvent,
  createDatabase,
  idempotencyRecord,
  learningPreference,
  newDomainId,
  notification,
  question,
  questionGenerationBatch,
  questionRecommendation,
  searchConnection,
  skillEvidenceEvent,
  trainingCycle,
  user,
} from "@iwc/db";

import {
  buildLearningRecord,
  deleteLearningRecord,
  learningRecordMarkdown,
} from "./learning-record";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("learner data rights (PostgreSQL)", () => {
  it("exports owned learning data and deletes it without deleting the account", async () => {
    const { db, pool } = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const userId = `data-rights-${suffix}`;
    const questionId = newDomainId();
    const searchConnectionId = newDomainId();
    const generationBatchId = newDomainId();
    const recommendationId = newDomainId();
    const cycleId = newDomainId();
    const preservedKey = `delete:${suffix}`;
    const operationalSentinels = [
      `encrypted-search-key-${suffix}`,
      `https://research.example.test/${suffix}`,
      `research snippet ${suffix}`,
      generationBatchId,
      recommendationId,
      "AI_RESEARCHED",
      "question-bank-refill@1.0.0",
    ];
    try {
      await db.insert(user).values({
        id: userId,
        name: "Data Rights Test",
        email: `${suffix}@example.test`,
        role: "learner",
      });
      await db.insert(searchConnection).values({
        id: searchConnectionId,
        configuredByUserId: userId,
        kind: "BRAVE",
        encryptedApiKey: operationalSentinels[0]!,
        encryptedApiKeyNonce: Buffer.alloc(12, 8).toString("base64"),
        encryptionKeyVersion: 1,
        status: "ACTIVE",
      });
      await db.insert(questionGenerationBatch).values({
        id: generationBatchId,
        triggeredByUserId: userId,
        status: "SUCCEEDED",
        mode: "WEB_RESEARCH",
        targetMix: [],
        researchSources: [
          {
            url: operationalSentinels[1]!,
            title: `research title ${suffix}`,
            snippet: operationalSentinels[2]!,
          },
        ],
        searchConnectionId,
        promptVersion: "question-bank-refill@1.0.0",
        rubricVersion: "iwc-question-bank-refill-1.0.0",
        acceptedCount: 1,
        rejectedCount: 4,
      });
      await db.insert(question).values({
        id: questionId,
        externalId: `iwc-dynamic-${suffix}`,
        ownerId: null,
        source: "AI_RESEARCHED",
        visibility: "public",
        questionType: "opinion",
        topic: "education",
        prompt: "Should schools teach practical decision-making?",
        attribution: "question-bank-refill@1.0.0",
        generationBatchId,
      });
      await db.insert(trainingCycle).values({
        id: cycleId,
        userId,
        questionId,
        schemaVersion: "1.0.0",
        timezone: "UTC",
      });
      await db.insert(learningPreference).values({ userId });
      await db.insert(questionRecommendation).values({
        id: recommendationId,
        userId,
        generationBatchId,
        questionExternalId: `iwc-dynamic-${suffix}`,
        action: "INITIAL",
        status: "READY",
        shownAt: new Date(),
      });
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
      expect(before.cycles[0]?.question).not.toHaveProperty("source");
      expect(before.cycles[0]?.question).not.toHaveProperty("attribution");

      const markdown = learningRecordMarkdown(before);
      const archive = createLearningRecordArchive(before, markdown);
      const archiveDirectory = await mkdtemp(
        join(tmpdir(), "iwc-learning-record-privacy-"),
      );
      try {
        const archivePath = join(archiveDirectory, "learning-record.zip");
        await writeFile(archivePath, archive);
        await promisify(execFile)("unzip", [
          "-qq",
          archivePath,
          "-d",
          archiveDirectory,
        ]);
        const zipJson = await readFile(
          join(archiveDirectory, "learning-record.json"),
          "utf8",
        );
        const zipMarkdown = await readFile(
          join(archiveDirectory, "learning-record.md"),
          "utf8",
        );
        for (const exported of [
          JSON.stringify(before),
          markdown,
          zipJson,
          zipMarkdown,
        ]) {
          for (const sentinel of operationalSentinels) {
            expect(exported).not.toContain(sentinel);
          }
        }
      } finally {
        await rm(archiveDirectory, { recursive: true, force: true });
      }

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
      await db.delete(trainingCycle).where(eq(trainingCycle.userId, userId));
      await db.delete(question).where(eq(question.id, questionId));
      await db
        .delete(questionGenerationBatch)
        .where(eq(questionGenerationBatch.id, generationBatchId));
      await db
        .delete(searchConnection)
        .where(eq(searchConnection.id, searchConnectionId));
      await db.delete(user).where(eq(user.id, userId));
      await db.delete(auditEvent).where(eq(auditEvent.targetId, userId));
      await pool.end();
    }
  });
});
