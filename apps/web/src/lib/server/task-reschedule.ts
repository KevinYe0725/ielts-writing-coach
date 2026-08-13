import { and, eq, sql } from "drizzle-orm";

import {
  transitionRewrite,
  transitionTrainingCycle,
  transitionTransfer,
} from "@iwc/learning-core";
import {
  auditEvent,
  rewriteTask,
  skillEvidenceEvent,
  trainingCycle,
  transferTask,
  writingAttempt,
  type Database,
} from "@iwc/db";

import { ApiProblem } from "./problem";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const HOUR_MS = 60 * 60 * 1_000;

export async function rescheduleExpiredRewrite(
  transaction: DatabaseTransaction,
  input: { taskId: string; userId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const [task] = await transaction
    .select()
    .from(rewriteTask)
    .where(
      and(
        eq(rewriteTask.id, input.taskId),
        eq(rewriteTask.userId, input.userId),
      ),
    )
    .for("update");
  if (!task) {
    throw new ApiProblem({
      title: "Rewrite task not found",
      status: 404,
      code: "REWRITE_TASK_NOT_FOUND",
      detail: "The rewrite task does not exist.",
    });
  }
  if (task.expiresAt === null || task.expiresAt > now) {
    throw new ApiProblem({
      title: "Rewrite window is not expired",
      status: 409,
      code: "REWRITE_RESCHEDULE_NOT_AVAILABLE",
      detail: "Only a missed rewrite window can be rescheduled.",
    });
  }
  if (
    task.startedAt !== null ||
    !["LOCKED", "READY", "RESCHEDULED", "SKIPPED_PREREQUISITE"].includes(
      task.status,
    )
  ) {
    throw new ApiProblem({
      title: "Rewrite already started",
      status: 409,
      code: "REWRITE_FIRST_ANSWER_EXISTS",
      detail:
        "A rewrite with a sealed first answer cannot be rescheduled or overwritten.",
    });
  }
  const [existingAttempt] = await transaction
    .select({ id: writingAttempt.id })
    .from(writingAttempt)
    .where(
      and(
        eq(writingAttempt.cycleId, task.cycleId),
        eq(writingAttempt.userId, input.userId),
        eq(writingAttempt.kind, "version_2"),
      ),
    )
    .limit(1);
  if (existingAttempt) {
    throw new ApiProblem({
      title: "Rewrite first answer already exists",
      status: 409,
      code: "REWRITE_FIRST_ANSWER_EXISTS",
      detail:
        "The immutable Version 2 first answer cannot be replaced by rescheduling.",
    });
  }
  const [cycle] = await transaction
    .select()
    .from(trainingCycle)
    .where(
      and(
        eq(trainingCycle.id, task.cycleId),
        eq(trainingCycle.userId, input.userId),
      ),
    )
    .for("update");
  if (!cycle || !["REWRITE_LOCKED", "REWRITE_READY"].includes(cycle.status)) {
    throw new ApiProblem({
      title: "Rewrite cannot be rescheduled",
      status: 409,
      code: "REWRITE_RESCHEDULE_STATE_INVALID",
      detail: "The training cycle is not waiting for an unstarted rewrite.",
    });
  }

  const previousAvailableAt = task.availableAt;
  const previousExpiresAt = task.expiresAt;
  const availableAt = new Date(now.getTime() + 24 * HOUR_MS);
  const expiresAt = new Date(now.getTime() + 48 * HOUR_MS);
  const status = transitionRewrite(task.status, "RESCHEDULED");
  const cycleStatus =
    cycle.status === "REWRITE_READY"
      ? transitionTrainingCycle(cycle.status, "REWRITE_LOCKED")
      : cycle.status;
  await transaction
    .update(rewriteTask)
    .set({
      status,
      availableAt,
      expiresAt,
      contractDueAt: task.contractDueAt ?? previousAvailableAt,
    })
    .where(eq(rewriteTask.id, task.id));
  if (cycleStatus !== cycle.status) {
    await transaction
      .update(trainingCycle)
      .set({ status: cycleStatus })
      .where(eq(trainingCycle.id, cycle.id));
  }
  await transaction.insert(auditEvent).values({
    actorId: input.userId,
    action: "rewrite.window.reschedule",
    targetType: "rewrite_task",
    targetId: task.id,
    result: "success",
    metadata: {
      reason: "WINDOW_EXPIRED",
      previousStatus: task.status,
      previousAvailableAt: previousAvailableAt.toISOString(),
      previousExpiresAt: previousExpiresAt.toISOString(),
      availableAt: availableAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      prerequisiteSkipped: task.prerequisiteSkipped,
    },
    occurredAt: now,
  });
  return { taskId: task.id, status, availableAt, expiresAt };
}

export async function rescheduleExpiredTransfer(
  transaction: DatabaseTransaction,
  input: { taskId: string; userId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const [task] = await transaction
    .select()
    .from(transferTask)
    .where(
      and(
        eq(transferTask.id, input.taskId),
        eq(transferTask.userId, input.userId),
      ),
    )
    .for("update");
  if (!task) {
    throw new ApiProblem({
      title: "Transfer task not found",
      status: 404,
      code: "TRANSFER_TASK_NOT_FOUND",
      detail: "The transfer task does not exist.",
    });
  }
  if (task.expiresAt === null || task.expiresAt > now) {
    throw new ApiProblem({
      title: "Transfer window is not expired",
      status: 409,
      code: "TRANSFER_RESCHEDULE_NOT_AVAILABLE",
      detail: "Only a missed transfer window can be rescheduled.",
    });
  }
  if (!["PLANNED", "READY", "RESCHEDULED"].includes(task.status)) {
    throw new ApiProblem({
      title: "Transfer cannot be rescheduled",
      status: 409,
      code: "TRANSFER_RESCHEDULE_STATE_INVALID",
      detail: "A completed transfer task cannot be rescheduled.",
    });
  }
  const [sealedResponse] = await transaction
    .select({ id: skillEvidenceEvent.id })
    .from(skillEvidenceEvent)
    .where(
      and(
        eq(skillEvidenceEvent.userId, input.userId),
        eq(skillEvidenceEvent.evidenceStage, "TRANSFER_RESPONSE"),
        sql`${skillEvidenceEvent.payload}->>'transferTaskId' = ${task.id}`,
      ),
    )
    .limit(1);
  if (sealedResponse) {
    throw new ApiProblem({
      title: "Transfer first answer already exists",
      status: 409,
      code: "TRANSFER_FIRST_ANSWER_EXISTS",
      detail:
        "The immutable transfer first answer cannot be replaced by rescheduling.",
    });
  }

  const previousAvailableAt = task.availableAt;
  const previousExpiresAt = task.expiresAt;
  const availableAt = new Date(now.getTime() + 48 * HOUR_MS);
  const expiresAt = new Date(now.getTime() + 96 * HOUR_MS);
  const status = transitionTransfer(task.status, "RESCHEDULED");
  await transaction
    .update(transferTask)
    .set({
      status,
      availableAt,
      expiresAt,
      contractDueAt: task.contractDueAt ?? previousAvailableAt,
    })
    .where(eq(transferTask.id, task.id));
  await transaction.insert(auditEvent).values({
    actorId: input.userId,
    action: "transfer.window.reschedule",
    targetType: "transfer_task",
    targetId: task.id,
    result: "success",
    metadata: {
      reason: "WINDOW_EXPIRED",
      previousStatus: task.status,
      previousAvailableAt: previousAvailableAt.toISOString(),
      previousExpiresAt: previousExpiresAt.toISOString(),
      availableAt: availableAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
    occurredAt: now,
  });
  return { taskId: task.id, status, availableAt, expiresAt };
}
