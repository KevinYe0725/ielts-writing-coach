import { and, desc, eq, isNull, ne } from "drizzle-orm";

import {
  lessonPlan,
  type Database,
  rewriteTask,
  trainingCycle,
  transferTask,
} from "@iwc/db";
import type { TrainingCycleState } from "@iwc/learning-contracts";
import { getUniqueNextAction, type NextAction } from "@iwc/learning-core";

export const ACTIVE_ESSAY_LIMIT = 8;

export interface EssayWorkspaceResources {
  cycleId: string;
  writingAvailable: boolean;
  feedbackAvailable: boolean;
  lessonId: string | null;
  rewriteTaskId: string | null;
  comparisonAvailable: boolean;
  transferTaskId: string | null;
}

export interface EssayWorkspaceItem {
  id: string;
  prompt: string;
  topic: string;
  status: string;
  updatedAt: string;
  nextAction: NextAction;
  resources: EssayWorkspaceResources;
}

export interface EssayWorkspaceData {
  activeCount: number;
  activeLimit: typeof ACTIVE_ESSAY_LIMIT;
  essays: EssayWorkspaceItem[];
}

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

type CycleSnapshot = {
  id: string;
  status: TrainingCycleState;
  updatedAt: Date;
  question: { prompt: string; topic: string } | null;
  lessonPlans: Array<{ id: string }>;
  rewriteTasks: Array<{
    id: string;
    status:
      | "PLANNED"
      | "LOCKED"
      | "READY"
      | "ACTIVE"
      | "COMPLETED"
      | "SKIPPED_PREREQUISITE"
      | "RESCHEDULED";
    availableAt: Date | null;
    expiresAt: Date | null;
  }>;
  transferTasks: Array<{
    id: string;
    status:
      | "PLANNED"
      | "READY"
      | "COMPLETED"
      | "NO_OPPORTUNITY"
      | "RESCHEDULED";
    availableAt: Date;
    expiresAt: Date | null;
  }>;
  mixedReviewTasks: Array<{
    id: string;
    dueAt: Date;
    status: string;
    targetCycleId: string | null;
  }>;
  writingAttempts: Array<{
    kind: "version_1" | "version_2" | "transfer";
    assessment: { id: string } | null;
  }>;
};

function actionForCycle(cycle: CycleSnapshot, now: string): NextAction {
  const lesson = cycle.lessonPlans[0];
  const rewrite = cycle.rewriteTasks[0];
  const mixedReview = cycle.mixedReviewTasks[0];
  return getUniqueNextAction({
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
        dueAt: rewrite?.availableAt?.toISOString() ?? null,
        expiresAt: rewrite?.expiresAt?.toISOString() ?? null,
      },
    },
    transfers: cycle.transferTasks.map((task) => ({
      id: task.id,
      status: task.status,
      dueAt: task.availableAt.toISOString(),
      expiresAt: task.expiresAt?.toISOString() ?? null,
    })),
    ...(mixedReview === undefined
      ? {}
      : {
          mixedReview: {
            id: mixedReview.id,
            dueAt: mixedReview.dueAt.toISOString(),
            completed:
              mixedReview.status === "COMPLETED" ||
              mixedReview.targetCycleId !== null,
          },
        }),
  });
}

export function projectEssayWorkspaceItem(
  cycle: CycleSnapshot,
  now: string,
): EssayWorkspaceItem {
  const lesson = cycle.lessonPlans[0];
  const rewrite = cycle.rewriteTasks[0];
  const transfer = cycle.transferTasks[0];
  return {
    id: cycle.id,
    prompt: cycle.question?.prompt ?? "",
    topic: cycle.question?.topic ?? "",
    status: cycle.status,
    updatedAt: cycle.updatedAt.toISOString(),
    nextAction: actionForCycle(cycle, now),
    resources: {
      cycleId: cycle.id,
      writingAvailable: cycle.writingAttempts.length > 0,
      feedbackAvailable: cycle.writingAttempts.some(
        (attempt) => attempt.assessment !== null,
      ),
      lessonId: lesson?.id ?? null,
      rewriteTaskId: rewrite?.id ?? null,
      comparisonAvailable: cycle.writingAttempts.some(
        (attempt) =>
          attempt.kind === "version_2" && attempt.assessment !== null,
      ),
      transferTaskId: transfer?.id ?? null,
    },
  };
}

export async function loadEssayWorkspace(
  db: Database,
  userId: string,
  now = new Date().toISOString(),
): Promise<EssayWorkspaceData> {
  const cycles = await db.query.trainingCycle.findMany({
    where: and(
      eq(trainingCycle.userId, userId),
      isNull(trainingCycle.archivedAt),
      ne(trainingCycle.status, "CORE_CYCLE_COMPLETED"),
    ),
    with: {
      question: true,
      lessonPlans: { orderBy: [desc(lessonPlan.createdAt)] },
      rewriteTasks: { orderBy: [desc(rewriteTask.createdAt)] },
      transferTasks: { orderBy: [desc(transferTask.createdAt)] },
      mixedReviewTasks: true,
      writingAttempts: { with: { assessment: true } },
    },
    orderBy: [desc(trainingCycle.updatedAt), desc(trainingCycle.id)],
    limit: ACTIVE_ESSAY_LIMIT,
  });
  const essays = cycles.map((cycle) =>
    projectEssayWorkspaceItem(cycle as CycleSnapshot, now),
  );
  return {
    activeCount: essays.length,
    activeLimit: ACTIVE_ESSAY_LIMIT,
    essays,
  };
}
