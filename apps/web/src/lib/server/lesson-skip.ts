import { and, eq } from "drizzle-orm";

import { transitionLesson, transitionTrainingCycle } from "@iwc/learning-core";
import { lessonPlan, rewriteTask, trainingCycle, type Database } from "@iwc/db";

import {
  lessonRuntimeSnapshot,
  normalizeLessonRuntimeState,
} from "./lesson-runtime";
import { ApiProblem } from "./problem";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export async function skipFocusedLesson(
  transaction: DatabaseTransaction,
  input: { lessonId: string; userId: string; now?: Date },
) {
  const [plan] = await transaction
    .select()
    .from(lessonPlan)
    .where(eq(lessonPlan.id, input.lessonId))
    .for("update");
  if (!plan) {
    throw new ApiProblem({
      title: "Lesson not found",
      status: 404,
      code: "LESSON_NOT_FOUND",
      detail: "The lesson does not exist.",
    });
  }
  const [cycle] = await transaction
    .select()
    .from(trainingCycle)
    .where(
      and(
        eq(trainingCycle.id, plan.cycleId),
        eq(trainingCycle.userId, input.userId),
      ),
    )
    .for("update");
  if (!cycle) {
    throw new ApiProblem({
      title: "Lesson not found",
      status: 404,
      code: "LESSON_NOT_FOUND",
      detail: "The lesson does not belong to this learner.",
    });
  }
  if (!["LESSON_READY", "LESSON_ACTIVE"].includes(cycle.status)) {
    throw new ApiProblem({
      title: "Lesson cannot be skipped",
      status: 409,
      code: "LESSON_SKIP_NOT_AVAILABLE",
      detail: "Only an unfinished focused lesson can be skipped.",
    });
  }
  if (!["READY", "ACTIVE", "TIMEBOX_EXPIRED"].includes(plan.runtimeStatus)) {
    throw new ApiProblem({
      title: "Lesson cannot be skipped",
      status: 409,
      code: "LESSON_SKIP_NOT_AVAILABLE",
      detail: "This focused lesson has already been resolved.",
    });
  }
  let cycleStatus = cycle.status;
  if (cycleStatus === "LESSON_READY") {
    cycleStatus = transitionTrainingCycle(cycleStatus, "LESSON_ACTIVE");
  }
  cycleStatus = transitionTrainingCycle(cycleStatus, "LESSON_RESOLVED");
  cycleStatus = transitionTrainingCycle(cycleStatus, "REWRITE_LOCKED");
  let runtimeStatus = plan.runtimeStatus;
  if (runtimeStatus === "READY") {
    runtimeStatus = transitionLesson(runtimeStatus, "ACTIVE");
  }
  runtimeStatus = transitionLesson(
    runtimeStatus as "ACTIVE" | "TIMEBOX_EXPIRED",
    "USER_SKIPPED",
  );
  const now = input.now ?? new Date();
  const snapshot = lessonRuntimeSnapshot(plan, now);
  const state = normalizeLessonRuntimeState(plan.runtimeState);
  const rewrite = (
    await transaction
      .insert(rewriteTask)
      .values({
        cycleId: cycle.id,
        userId: input.userId,
        status: "SKIPPED_PREREQUISITE",
        availableAt: now,
        contractDueAt: null,
        expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1_000),
        abstractChecklist: [
          "Check the question instruction and your position.",
          "Check paragraph purpose and logical development.",
          "Check the personal target only after 35 minutes.",
        ],
        lastInstructionExposureAt: null,
        assisted: false,
        prerequisiteSkipped: true,
      })
      .onConflictDoUpdate({
        target: rewriteTask.cycleId,
        set: {
          status: "SKIPPED_PREREQUISITE",
          availableAt: now,
          contractDueAt: null,
          expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1_000),
          lastInstructionExposureAt: null,
          assisted: false,
          prerequisiteSkipped: true,
        },
      })
      .returning()
  )[0];
  if (!rewrite) throw new Error("Skipped-prerequisite rewrite was not saved.");
  await transaction
    .update(trainingCycle)
    .set({ status: cycleStatus })
    .where(eq(trainingCycle.id, cycle.id));
  await transaction
    .update(lessonPlan)
    .set({
      runtimeStatus,
      activeStartedAt: null,
      pausedAt: now,
      resolvedAt: now,
      elapsedSeconds: snapshot.effectiveElapsedSeconds,
      runtimeRevision: plan.runtimeRevision + 1,
      runtimeState: { ...state, completionMode: "PRACTICE_ONLY" },
    })
    .where(eq(lessonPlan.id, plan.id));
  return { cycleStatus, rewrite };
}
