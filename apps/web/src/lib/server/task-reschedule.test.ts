import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  auditEvent,
  createDatabase,
  newDomainId,
  question,
  rewriteTask,
  skillEvidenceEvent,
  trainingCycle,
  transferTask,
  user,
} from "@iwc/db";

import {
  rescheduleExpiredRewrite,
  rescheduleExpiredTransfer,
} from "./task-reschedule";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("expired task rescheduling (PostgreSQL)", () => {
  const database = createDatabase(databaseUrl!);
  const createdUsers: string[] = [];

  afterAll(async () => {
    for (const userId of createdUsers) {
      await database.db.delete(user).where(eq(user.id, userId));
    }
    await database.pool.end();
  });

  it("preserves the original rewrite window and schedules a fresh closed-book interval at a fixed server time", async () => {
    const suffix = newDomainId();
    const userId = `rewrite-reschedule-${suffix}`;
    const questionId = newDomainId();
    const cycleId = newDomainId();
    const taskId = newDomainId();
    const oldDue = new Date("2026-08-10T08:00:00.000Z");
    const oldExpiry = new Date("2026-08-11T08:00:00.000Z");
    const now = new Date("2026-08-13T08:00:00.000Z");
    createdUsers.push(userId);
    await database.db.insert(user).values({
      id: userId,
      name: "Rewrite reschedule",
      email: `${suffix}@example.test`,
      role: "learner",
    });
    await database.db.insert(question).values({
      id: questionId,
      externalId: `rewrite-reschedule-${suffix}`,
      ownerId: userId,
      source: "private_test",
      visibility: "private",
      questionType: "opinion",
      topic: "education",
      prompt: "Should missed practice be rescheduled?",
    });
    await database.db.insert(trainingCycle).values({
      id: cycleId,
      userId,
      questionId,
      status: "REWRITE_READY",
      schemaVersion: "1.0.0",
      timezone: "UTC",
    });
    await database.db.insert(rewriteTask).values({
      id: taskId,
      cycleId,
      userId,
      status: "READY",
      availableAt: oldDue,
      expiresAt: oldExpiry,
      abstractChecklist: ["Check the task."],
    });

    const result = await database.db.transaction((transaction) =>
      rescheduleExpiredRewrite(transaction, { taskId, userId, now }),
    );
    expect(result).toMatchObject({ status: "RESCHEDULED" });
    expect(result.availableAt.toISOString()).toBe("2026-08-14T08:00:00.000Z");
    expect(result.expiresAt.toISOString()).toBe("2026-08-15T08:00:00.000Z");
    await expect(
      database.db.query.rewriteTask.findFirst({
        where: eq(rewriteTask.id, taskId),
      }),
    ).resolves.toMatchObject({
      status: "RESCHEDULED",
      availableAt: new Date("2026-08-14T08:00:00.000Z"),
      expiresAt: new Date("2026-08-15T08:00:00.000Z"),
      contractDueAt: oldDue,
      startedAt: null,
    });
    await expect(
      database.db.query.trainingCycle.findFirst({
        where: eq(trainingCycle.id, cycleId),
      }),
    ).resolves.toMatchObject({ status: "REWRITE_LOCKED" });
    const event = await database.db.query.auditEvent.findFirst({
      where: and(
        eq(auditEvent.actorId, userId),
        eq(auditEvent.action, "rewrite.window.reschedule"),
      ),
    });
    expect(event?.metadata).toMatchObject({
      previousAvailableAt: oldDue.toISOString(),
      previousExpiresAt: oldExpiry.toISOString(),
      reason: "WINDOW_EXPIRED",
    });
  });

  it("reschedules an unanswered transfer without failure evidence and refuses to replace a sealed first answer", async () => {
    const suffix = newDomainId();
    const userId = `transfer-reschedule-${suffix}`;
    const questionId = newDomainId();
    const cycleId = newDomainId();
    const taskId = newDomainId();
    const protectedTaskId = newDomainId();
    const now = new Date("2026-08-13T08:00:00.000Z");
    createdUsers.push(userId);
    await database.db.insert(user).values({
      id: userId,
      name: "Transfer reschedule",
      email: `${suffix}@example.test`,
      role: "learner",
    });
    await database.db.insert(question).values({
      id: questionId,
      externalId: `transfer-reschedule-${suffix}`,
      ownerId: userId,
      source: "private_test",
      visibility: "private",
      questionType: "opinion",
      topic: "technology",
      prompt: "Should a transfer window be rescheduled?",
    });
    await database.db.insert(trainingCycle).values({
      id: cycleId,
      userId,
      questionId,
      status: "CORE_CYCLE_COMPLETED",
      schemaVersion: "1.0.0",
      timezone: "UTC",
      coreSkillId: "collocation_perspective",
      completedAt: new Date("2026-08-08T08:00:00.000Z"),
    });
    await database.db.insert(transferTask).values([
      {
        id: taskId,
        sourceCycleId: cycleId,
        userId,
        questionId,
        skillId: "collocation_perspective",
        status: "READY",
        availableAt: new Date("2026-08-09T08:00:00.000Z"),
        expiresAt: new Date("2026-08-11T08:00:00.000Z"),
      },
      {
        id: protectedTaskId,
        sourceCycleId: cycleId,
        userId,
        questionId,
        skillId: "collocation_perspective",
        status: "READY",
        availableAt: new Date("2026-08-09T08:00:00.000Z"),
        expiresAt: new Date("2026-08-11T08:00:00.000Z"),
      },
    ]);

    const result = await database.db.transaction((transaction) =>
      rescheduleExpiredTransfer(transaction, { taskId, userId, now }),
    );
    expect(result.availableAt.toISOString()).toBe("2026-08-15T08:00:00.000Z");
    expect(result.expiresAt.toISOString()).toBe("2026-08-17T08:00:00.000Z");
    const stored = await database.db.query.transferTask.findFirst({
      where: eq(transferTask.id, taskId),
    });
    expect(stored).toMatchObject({
      status: "RESCHEDULED",
      contractDueAt: new Date("2026-08-09T08:00:00.000Z"),
    });
    expect(
      await database.db.query.skillEvidenceEvent.findMany({
        where: eq(skillEvidenceEvent.cycleId, cycleId),
      }),
    ).toHaveLength(0);

    const responseId = newDomainId();
    await database.db.insert(skillEvidenceEvent).values({
      id: newDomainId(),
      userId,
      cycleId,
      skillId: "collocation_perspective",
      evidenceStage: "TRANSFER_RESPONSE",
      sourceType: "transfer_response",
      sourceId: responseId,
      valid: false,
      confidence: 0,
      occurredAt: new Date("2026-08-10T08:00:00.000Z"),
      payload: { transferTaskId: protectedTaskId, firstAnswer: "Sealed." },
    });
    await expect(
      database.db.transaction((transaction) =>
        rescheduleExpiredTransfer(transaction, {
          taskId: protectedTaskId,
          userId,
          now,
        }),
      ),
    ).rejects.toMatchObject({
      problem: { code: "TRANSFER_FIRST_ANSWER_EXISTS", status: 409 },
    });
    await expect(
      database.db.query.transferTask.findFirst({
        where: eq(transferTask.id, protectedTaskId),
      }),
    ).resolves.toMatchObject({ status: "READY" });
  });

  it("never exposes another learner's expired task", async () => {
    const suffix = newDomainId();
    const ownerId = `reschedule-owner-${suffix}`;
    const intruderId = `reschedule-intruder-${suffix}`;
    const questionId = newDomainId();
    const cycleId = newDomainId();
    const taskId = newDomainId();
    createdUsers.push(ownerId, intruderId);
    await database.db.insert(user).values([
      {
        id: ownerId,
        name: "Owner",
        email: `owner-${suffix}@example.test`,
        role: "learner",
      },
      {
        id: intruderId,
        name: "Intruder",
        email: `intruder-${suffix}@example.test`,
        role: "learner",
      },
    ]);
    await database.db.insert(question).values({
      id: questionId,
      externalId: `reschedule-owner-${suffix}`,
      ownerId,
      source: "private_test",
      visibility: "private",
      questionType: "opinion",
      topic: "education",
      prompt: "Should task ownership remain private?",
    });
    await database.db.insert(trainingCycle).values({
      id: cycleId,
      userId: ownerId,
      questionId,
      status: "REWRITE_LOCKED",
      schemaVersion: "1.0.0",
      timezone: "UTC",
    });
    await database.db.insert(rewriteTask).values({
      id: taskId,
      cycleId,
      userId: ownerId,
      status: "LOCKED",
      availableAt: new Date("2026-08-09T08:00:00.000Z"),
      expiresAt: new Date("2026-08-11T08:00:00.000Z"),
      abstractChecklist: ["Check the task."],
    });
    await expect(
      database.db.transaction((transaction) =>
        rescheduleExpiredRewrite(transaction, {
          taskId,
          userId: intruderId,
          now: new Date("2026-08-13T08:00:00.000Z"),
        }),
      ),
    ).rejects.toMatchObject({
      problem: { code: "REWRITE_TASK_NOT_FOUND", status: 404 },
    });
  });
});
