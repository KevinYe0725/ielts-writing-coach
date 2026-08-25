import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createLearningRecordArchive } from "@iwc/exchange";
import {
  auditEvent,
  aiJob,
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
import { enqueueQuestionBankRefill } from "./jobs";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("learner data rights (PostgreSQL)", () => {
  async function waitForLockWaiters(
    pool: ReturnType<typeof createDatabase>["pool"],
    minimum: number,
  ): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await pool.query<{ waiting: string }>(`
        select count(*)::text as waiting
        from pg_locks
        where not granted
      `);
      if (Number(result.rows[0]?.waiting ?? 0) >= minimum) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      `Timed out waiting for ${minimum} PostgreSQL lock waiter(s)`,
    );
  }

  it("exports owned learning data and deletes it without deleting the account", async () => {
    const { db, pool } = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const userId = `data-rights-${suffix}`;
    const questionId = newDomainId();
    const searchConnectionId = newDomainId();
    const generationBatchId = newDomainId();
    const recommendationId = newDomainId();
    const abandonedRecommendationId = newDomainId();
    const cycleId = newDomainId();
    const preservedKey = `delete:${suffix}`;
    const operationalSentinels = [
      `encrypted-search-key-${suffix}`,
      `https://research.example.test/${suffix}`,
      `research snippet ${suffix}`,
      generationBatchId,
      recommendationId,
      abandonedRecommendationId,
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
      await db.insert(questionRecommendation).values({
        id: abandonedRecommendationId,
        userId,
        generationBatchId,
        action: "SWAP",
        status: "ABANDONED",
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
      expect(
        await db.query.questionRecommendation.findMany({
          where: eq(questionRecommendation.userId, userId),
        }),
      ).toHaveLength(0);
      await expect(
        db.query.questionGenerationBatch.findFirst({
          where: eq(questionGenerationBatch.id, generationBatchId),
        }),
      ).resolves.toMatchObject({
        id: generationBatchId,
        triggeredByUserId: userId,
        status: "SUCCEEDED",
        acceptedCount: 1,
        rejectedCount: 4,
      });
      await expect(
        db.query.question.findFirst({ where: eq(question.id, questionId) }),
      ).resolves.toMatchObject({
        id: questionId,
        ownerId: null,
        generationBatchId,
      });
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

  it.each(["QUEUED", "RUNNING"] as const)(
    "preserves a legacy learner-owned %s refill queue/job during learning-data deletion and permits a later refill after it terminates",
    async (jobStatus) => {
      const { db, pool } = createDatabase(databaseUrl!);
      const suffix = newDomainId();
      const userId = `refill-delete-${jobStatus.toLowerCase()}-${suffix}`;
      const jobId = newDomainId();
      const batchId = newDomainId();
      const laterBatchId = newDomainId();
      const graphileJobKey = `ai-job:${jobId}`;
      let laterJobId: string | null = null;
      let laterGraphileJobKey: string | null = null;
      try {
        await db.insert(user).values({
          id: userId,
          name: `Refill deletion ${jobStatus}`,
          email: `${userId}@example.test`,
          role: "learner",
        });
        await db.execute(sql`select graphile_worker.add_job(
          'run_ai_job',
          ${JSON.stringify({ jobId })}::json,
          max_attempts := 5,
          job_key := ${graphileJobKey},
          job_key_mode := 'preserve_run_at'
        )`);
        await db.insert(aiJob).values({
          id: jobId,
          ownerId: userId,
          taskKind: "question_bank_refill",
          status: jobStatus,
          protectedReference: { generationBatchId: batchId },
          versionSnapshot: {
            providerKind: "unconfigured",
            providerConnectionId: "unconfigured",
          },
          idempotencyKey: `question-bank-refill:${batchId}`,
          graphileJobKey,
          ...(jobStatus === "RUNNING"
            ? { leasedAt: new Date(), startedAt: new Date(), attemptCount: 1 }
            : {}),
        });
        await db.insert(questionGenerationBatch).values({
          id: batchId,
          triggeredByUserId: userId,
          status: jobStatus === "RUNNING" ? "GENERATING" : "QUEUED",
          mode: "OFFLINE",
          targetMix: [
            { questionType: "opinion", topic: "education", count: 1 },
          ],
          aiJobId: jobId,
          promptVersion: "1.0.0",
          rubricVersion: "iwc-question-bank-refill-1.0.0",
        });

        const result = await deleteLearningRecord(
          db,
          userId,
          `delete:${suffix}`,
        );

        expect(result.queuedJobs).toBe(0);
        await expect(
          db.query.aiJob.findFirst({ where: eq(aiJob.id, jobId) }),
        ).resolves.toMatchObject({
          id: jobId,
          ownerId: userId,
          taskKind: "question_bank_refill",
          status: jobStatus,
        });
        await expect(
          db.query.questionGenerationBatch.findFirst({
            where: eq(questionGenerationBatch.id, batchId),
          }),
        ).resolves.toMatchObject({ id: batchId, aiJobId: jobId });
        const queued = await db.execute<{ present: boolean }>(sql`
          select exists(
            select 1 from graphile_worker._private_jobs where key = ${graphileJobKey}
          ) as present
        `);
        expect(queued.rows[0]?.present).toBe(true);

        await db
          .update(aiJob)
          .set({ status: "FAILED", completedAt: new Date() })
          .where(eq(aiJob.id, jobId));
        await db
          .update(questionGenerationBatch)
          .set({
            status: "FAILED",
            safeFailureCode: "AI_UNAVAILABLE",
            updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1_000),
          })
          .where(eq(questionGenerationBatch.id, batchId));
        await db.insert(questionGenerationBatch).values({
          id: laterBatchId,
          triggeredByUserId: userId,
          status: "QUEUED",
          mode: "OFFLINE",
          targetMix: [
            { questionType: "discussion", topic: "government", count: 1 },
          ],
          promptVersion: "1.0.0",
          rubricVersion: "iwc-question-bank-refill-1.0.0",
        });
        const later = await db.transaction((transaction) =>
          enqueueQuestionBankRefill(transaction, userId, laterBatchId),
        );
        laterJobId = later.id;
        const laterJob = await db.query.aiJob.findFirst({
          where: eq(aiJob.id, later.id),
        });
        laterGraphileJobKey = laterJob?.graphileJobKey ?? null;
        expect(later).toMatchObject({
          id: expect.any(String),
          status: expect.stringMatching(/^(QUEUED|WAITING_FOR_CONSENT)$/u),
        });
      } finally {
        for (const key of [laterGraphileJobKey, graphileJobKey]) {
          if (key)
            await db.execute(sql`select graphile_worker.remove_job(${key})`);
        }
        await db
          .delete(questionGenerationBatch)
          .where(eq(questionGenerationBatch.id, laterBatchId));
        await db
          .delete(questionGenerationBatch)
          .where(eq(questionGenerationBatch.id, batchId));
        if (laterJobId) await db.delete(aiJob).where(eq(aiJob.id, laterJobId));
        await db.delete(aiJob).where(eq(aiJob.id, jobId));
        await db.delete(auditEvent).where(eq(auditEvent.targetId, userId));
        await db.delete(user).where(eq(user.id, userId));
        await pool.end();
      }
    },
  );

  it("keeps a concurrently inserted ordinary AI job and its Graphile row together across deletion", async () => {
    const { db, pool } = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const userId = `delete-race-${suffix}`;
    const jobId = newDomainId();
    const graphileJobKey = `ai-job:${jobId}`;
    const [blockingNotification] = await db
      .insert(user)
      .values({
        id: userId,
        name: "Deletion race learner",
        email: `${userId}@example.test`,
        role: "learner",
      })
      .then(async () =>
        db
          .insert(notification)
          .values({
            userId,
            channel: "in_app",
            kind: "deletion_race",
            dedupeKey: `delete-race-${suffix}`,
            payload: {},
            scheduledAt: new Date(),
          })
          .returning({ id: notification.id }),
      );
    const blocker = await pool.connect();
    let blockerOpen = false;
    try {
      await blocker.query("begin");
      blockerOpen = true;
      await blocker.query(
        "select id from notification where id = $1 for update",
        [blockingNotification!.id],
      );

      const deletion = deleteLearningRecord(db, userId, `delete:${suffix}`);
      await waitForLockWaiters(pool, 1);

      let insertionSettled = false;
      const insertion = db
        .transaction(async (transaction) => {
          await transaction.execute(sql`select graphile_worker.add_job(
            'run_ai_job',
            ${JSON.stringify({ jobId })}::json,
            max_attempts := 5,
            job_key := ${graphileJobKey},
            job_key_mode := 'preserve_run_at'
          )`);
          await transaction.insert(aiJob).values({
            id: jobId,
            ownerId: userId,
            taskKind: "ielts_assessment",
            status: "QUEUED",
            protectedReference: { attemptId: newDomainId() },
            versionSnapshot: {
              providerKind: "unconfigured",
              providerConnectionId: "unconfigured",
            },
            idempotencyKey: `delete-race:${jobId}`,
            graphileJobKey,
          });
        })
        .finally(() => {
          insertionSettled = true;
        });

      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (insertionSettled) break;
        const waits = await pool.query<{ waiting: string }>(`
          select count(*)::text as waiting from pg_locks where not granted
        `);
        if (Number(waits.rows[0]?.waiting ?? 0) >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      await blocker.query("commit");
      blockerOpen = false;
      await Promise.all([deletion, insertion]);

      await expect(
        db.query.aiJob.findFirst({ where: eq(aiJob.id, jobId) }),
      ).resolves.toMatchObject({ id: jobId, graphileJobKey });
      const queued = await db.execute<{ present: boolean }>(sql`
        select exists(
          select 1 from graphile_worker._private_jobs where key = ${graphileJobKey}
        ) as present
      `);
      expect(queued.rows[0]?.present).toBe(true);
    } finally {
      if (blockerOpen) await blocker.query("rollback");
      blocker.release();
      await db.execute(
        sql`select graphile_worker.remove_job(${graphileJobKey})`,
      );
      await db.delete(aiJob).where(eq(aiJob.id, jobId));
      await db.delete(auditEvent).where(eq(auditEvent.targetId, userId));
      await db.delete(user).where(eq(user.id, userId));
      await pool.end();
    }
  });

  it("rolls back the AI-row deletion when Graphile removal fails", async () => {
    const { db, pool } = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const userId = `delete-rollback-${suffix}`;
    const jobId = newDomainId();
    const graphileJobKey = `ai-job:${jobId}`;
    try {
      await db.insert(user).values({
        id: userId,
        name: "Deletion rollback learner",
        email: `${userId}@example.test`,
        role: "learner",
      });
      await db.execute(sql`select graphile_worker.add_job(
        'run_ai_job',
        ${JSON.stringify({ jobId })}::json,
        max_attempts := 5,
        job_key := ${graphileJobKey},
        job_key_mode := 'preserve_run_at'
      )`);
      await db.insert(aiJob).values({
        id: jobId,
        ownerId: userId,
        taskKind: "ielts_assessment",
        status: "QUEUED",
        protectedReference: { attemptId: newDomainId() },
        versionSnapshot: {
          providerKind: "unconfigured",
          providerConnectionId: "unconfigured",
        },
        idempotencyKey: `delete-rollback:${jobId}`,
        graphileJobKey,
      });
      await pool.query(`
        create function public.test_fail_learning_delete_graphile()
        returns trigger language plpgsql as $$
        begin
          raise exception 'injected Graphile removal failure';
        end;
        $$;
        create trigger test_fail_learning_delete_graphile
        before delete or update on graphile_worker._private_jobs
        for each row execute function public.test_fail_learning_delete_graphile();
      `);

      await expect(
        deleteLearningRecord(db, userId, `delete:${suffix}`),
      ).rejects.toThrow("Failed query: select graphile_worker.remove_job");
      await expect(
        db.query.aiJob.findFirst({ where: eq(aiJob.id, jobId) }),
      ).resolves.toMatchObject({ id: jobId, graphileJobKey });
      const queued = await db.execute<{ present: boolean }>(sql`
        select exists(
          select 1 from graphile_worker._private_jobs where key = ${graphileJobKey}
        ) as present
      `);
      expect(queued.rows[0]?.present).toBe(true);
    } finally {
      await pool.query(`
        drop trigger if exists test_fail_learning_delete_graphile
          on graphile_worker._private_jobs;
        drop function if exists public.test_fail_learning_delete_graphile();
      `);
      await db.execute(
        sql`select graphile_worker.remove_job(${graphileJobKey})`,
      );
      await db.delete(aiJob).where(eq(aiJob.id, jobId));
      await db.delete(auditEvent).where(eq(auditEvent.targetId, userId));
      await db.delete(user).where(eq(user.id, userId));
      await pool.end();
    }
  });
});
