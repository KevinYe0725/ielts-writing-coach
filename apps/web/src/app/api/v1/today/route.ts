import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";

import { getUniqueNextAction, type NextAction } from "@iwc/learning-core";
import { lessonPlan, rewriteTask, trainingCycle, transferTask } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";

const actionPriority: Readonly<Record<NextAction["kind"], number>> = {
  CONTINUE_ATTEMPT_1: 1,
  CONTINUE_REWRITE: 2,
  CONTINUE_LESSON: 3,
  RESCHEDULE_REWRITE: 4,
  START_REWRITE: 4,
  START_TRANSFER: 5,
  REVIEW_FEEDBACK: 6,
  START_LESSON: 7,
  COMPLETE_CORE_PREREQUISITE: 8,
  START_ATTEMPT_1: 9,
  START_MIXED_REVIEW: 10,
  RESCHEDULE_TRANSFER: 11,
  WAIT_FOR_ASSESSMENT: 12,
  WAIT_FOR_LESSON: 13,
  WAIT_FOR_COMPARISON: 14,
  WAIT_FOR_REWRITE_SCHEDULING: 15,
  WAIT_FOR_REWRITE_UNLOCK: 16,
  START_NEW_CYCLE: 17,
};

function deriveLessonStatus(state: string) {
  if (state === "LESSON_READY") return "READY" as const;
  if (state === "LESSON_ACTIVE") return "ACTIVE" as const;
  if (
    [
      "LESSON_RESOLVED",
      "REWRITE_LOCKED",
      "REWRITE_READY",
      "ATTEMPT_2_ACTIVE",
      "COMPARING",
      "CORE_CYCLE_COMPLETED",
    ].includes(state)
  )
    return "CORE_COMPLETED" as const;
  return "PLANNING" as const;
}

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  const { db } = getServerContext();
  const cycles = await db.query.trainingCycle.findMany({
    where: and(
      eq(trainingCycle.userId, actor.id),
      isNull(trainingCycle.archivedAt),
    ),
    with: {
      question: true,
      lessonPlans: true,
      rewriteTasks: true,
      transferTasks: true,
      mixedReviewTasks: true,
    },
    orderBy: [desc(trainingCycle.updatedAt)],
    limit: 10,
  });

  if (cycles.length === 0) {
    return Response.json({
      next_action: {
        kind: "START_NEW_CYCLE",
        entityId: "question-bank",
        reason: "Choose one question and start a strict 40-minute Version 1.",
        dueAt: null,
        overdue: false,
      },
      cycle: null,
      queue: [],
    });
  }

  const now = new Date().toISOString();
  const candidates = cycles.map((cycle) => {
    const lesson = cycle.lessonPlans[0];
    const rewrite = cycle.rewriteTasks[0];
    const action = getUniqueNextAction({
      now,
      cycle: {
        id: cycle.id,
        state: cycle.status,
        lessonId: lesson?.id ?? cycle.id,
        lessonStatus: deriveLessonStatus(cycle.status),
        rewrite: {
          id: rewrite?.id ?? cycle.id,
          status:
            rewrite?.status ??
            (cycle.status === "LESSON_RESOLVED"
              ? "SKIPPED_PREREQUISITE"
              : "LOCKED"),
          dueAt: rewrite?.availableAt.toISOString() ?? null,
          expiresAt: rewrite?.expiresAt?.toISOString() ?? null,
        },
      },
      transfers: cycle.transferTasks.map((task) => ({
        id: task.id,
        status: task.status,
        dueAt: task.availableAt.toISOString(),
        expiresAt: task.expiresAt?.toISOString() ?? null,
      })),
      ...(cycle.mixedReviewTasks[0] === undefined
        ? {}
        : {
            mixedReview: {
              id: cycle.mixedReviewTasks[0].id,
              dueAt: cycle.mixedReviewTasks[0].dueAt.toISOString(),
              completed:
                cycle.mixedReviewTasks[0].status === "COMPLETED" ||
                cycle.mixedReviewTasks[0].targetCycleId !== null,
            },
          }),
    });
    return { action, cycle };
  });
  candidates.sort(
    (left, right) =>
      actionPriority[left.action.kind] - actionPriority[right.action.kind] ||
      (left.action.dueAt ?? "").localeCompare(right.action.dueAt ?? "") ||
      left.cycle.id.localeCompare(right.cycle.id),
  );
  const [selected, ...queue] = candidates;
  return Response.json({
    next_action: selected?.action,
    cycle: selected
      ? {
          id: selected.cycle.id,
          status: selected.cycle.status,
          question: selected.cycle.question,
          core_skill_id: selected.cycle.coreSkillId,
        }
      : null,
    queue: queue.map(({ action, cycle }) => ({
      cycle_id: cycle.id,
      kind: action.kind,
      due_at: action.dueAt,
    })),
  });
});
