import {
  LESSON_STATUSES,
  REWRITE_TASK_STATUSES,
  TRAINING_CYCLE_STATES,
  TRANSFER_TASK_STATUSES,
  type LessonStatus,
  type RewriteTaskStatus,
  type TrainingCycle,
  type TrainingCycleState,
  type TransferTaskStatus,
} from "@iwc/learning-contracts";

type MachineName = "TrainingCycle" | "Lesson" | "Rewrite" | "Transfer";
type TransitionTable<S extends string> = Readonly<Record<S, readonly S[]>>;

export class InvalidLearningTransitionError extends Error {
  readonly machine: MachineName;
  readonly from: string;
  readonly to: string;

  constructor(machine: MachineName, from: string, to: string) {
    super(`Illegal ${machine} transition: ${from} -> ${to}`);
    this.name = "InvalidLearningTransitionError";
    this.machine = machine;
    this.from = from;
    this.to = to;
  }
}

export const TRAINING_CYCLE_TRANSITIONS: TransitionTable<TrainingCycleState> = {
  QUESTION_READY: ["ATTEMPT_1_ACTIVE"],
  ATTEMPT_1_ACTIVE: ["SUBMITTED"],
  SUBMITTED: ["ANALYZING"],
  ANALYZING: ["FEEDBACK_READY"],
  FEEDBACK_READY: ["LESSON_GENERATING"],
  LESSON_GENERATING: ["LESSON_READY"],
  LESSON_READY: ["LESSON_ACTIVE"],
  LESSON_ACTIVE: ["LESSON_RESOLVED"],
  LESSON_RESOLVED: ["REWRITE_LOCKED"],
  REWRITE_LOCKED: ["REWRITE_READY"],
  REWRITE_READY: ["ATTEMPT_2_ACTIVE", "REWRITE_LOCKED"],
  ATTEMPT_2_ACTIVE: ["COMPARING"],
  COMPARING: ["CORE_CYCLE_COMPLETED"],
  CORE_CYCLE_COMPLETED: [],
};

export const LESSON_TRANSITIONS: TransitionTable<LessonStatus> = {
  PLANNING: ["READY"],
  READY: ["ACTIVE"],
  ACTIVE: ["CORE_COMPLETED", "TIMEBOX_EXPIRED", "USER_SKIPPED", "ABANDONED"],
  CORE_COMPLETED: [],
  TIMEBOX_EXPIRED: ["USER_SKIPPED"],
  USER_SKIPPED: [],
  ABANDONED: [],
};

export const REWRITE_TRANSITIONS: TransitionTable<RewriteTaskStatus> = {
  PLANNED: ["LOCKED", "SKIPPED_PREREQUISITE"],
  LOCKED: ["READY", "RESCHEDULED", "SKIPPED_PREREQUISITE"],
  READY: ["ACTIVE", "RESCHEDULED"],
  ACTIVE: ["COMPLETED"],
  COMPLETED: [],
  SKIPPED_PREREQUISITE: ["ACTIVE", "RESCHEDULED"],
  RESCHEDULED: ["LOCKED", "READY", "SKIPPED_PREREQUISITE", "RESCHEDULED"],
};

export const TRANSFER_TRANSITIONS: TransitionTable<TransferTaskStatus> = {
  PLANNED: ["READY", "RESCHEDULED"],
  READY: ["COMPLETED", "NO_OPPORTUNITY", "RESCHEDULED"],
  COMPLETED: [],
  NO_OPPORTUNITY: ["RESCHEDULED"],
  RESCHEDULED: ["READY", "RESCHEDULED"],
};

function transition<S extends string>(
  machine: MachineName,
  transitions: TransitionTable<S>,
  current: S,
  next: S,
): S {
  if (!transitions[current].includes(next)) {
    throw new InvalidLearningTransitionError(machine, current, next);
  }
  return next;
}

export function transitionTrainingCycle(
  current: TrainingCycleState,
  next: TrainingCycleState,
): TrainingCycleState {
  return transition("TrainingCycle", TRAINING_CYCLE_TRANSITIONS, current, next);
}

export function transitionLesson(
  current: LessonStatus,
  next: LessonStatus,
): LessonStatus {
  return transition("Lesson", LESSON_TRANSITIONS, current, next);
}

export function transitionRewrite(
  current: RewriteTaskStatus,
  next: RewriteTaskStatus,
): RewriteTaskStatus {
  return transition("Rewrite", REWRITE_TRANSITIONS, current, next);
}

export function transitionTransfer(
  current: TransferTaskStatus,
  next: TransferTaskStatus,
): TransferTaskStatus {
  return transition("Transfer", TRANSFER_TRANSITIONS, current, next);
}

export interface AggregateConsistencyIssue {
  readonly code: string;
  readonly message: string;
}

const resolvedLessonStatuses = new Set<LessonStatus>([
  "CORE_COMPLETED",
  "TIMEBOX_EXPIRED",
  "USER_SKIPPED",
  "ABANDONED",
]);

export function validateTrainingCycleConsistency(
  cycle: TrainingCycle,
): readonly AggregateConsistencyIssue[] {
  const issues: AggregateConsistencyIssue[] = [];

  if (!TRAINING_CYCLE_STATES.includes(cycle.state)) {
    issues.push({
      code: "UNKNOWN_CYCLE_STATE",
      message: `Unknown cycle state: ${cycle.state}`,
    });
  }
  if (!LESSON_STATUSES.includes(cycle.lessonStatus)) {
    issues.push({
      code: "UNKNOWN_LESSON_STATUS",
      message: `Unknown lesson status: ${cycle.lessonStatus}`,
    });
  }
  if (!REWRITE_TASK_STATUSES.includes(cycle.rewriteStatus)) {
    issues.push({
      code: "UNKNOWN_REWRITE_STATUS",
      message: `Unknown rewrite status: ${cycle.rewriteStatus}`,
    });
  }
  if (
    cycle.transferStatuses.some(
      (status) => !TRANSFER_TASK_STATUSES.includes(status),
    )
  ) {
    issues.push({
      code: "UNKNOWN_TRANSFER_STATUS",
      message: "At least one transfer task has an unknown status.",
    });
  }

  if (cycle.state === "LESSON_READY" && cycle.lessonStatus !== "READY") {
    issues.push({
      code: "LESSON_READY_MISMATCH",
      message: "LESSON_READY requires LessonPlan.status READY.",
    });
  }
  if (cycle.state === "LESSON_ACTIVE" && cycle.lessonStatus !== "ACTIVE") {
    issues.push({
      code: "LESSON_ACTIVE_MISMATCH",
      message: "LESSON_ACTIVE requires LessonPlan.status ACTIVE.",
    });
  }
  if (
    [
      "LESSON_RESOLVED",
      "REWRITE_LOCKED",
      "REWRITE_READY",
      "ATTEMPT_2_ACTIVE",
      "COMPARING",
      "CORE_CYCLE_COMPLETED",
    ].includes(cycle.state) &&
    !resolvedLessonStatuses.has(cycle.lessonStatus)
  ) {
    issues.push({
      code: "UNRESOLVED_LESSON",
      message:
        "The cycle advanced past the lesson while its independent status is unresolved.",
    });
  }
  if (
    cycle.state === "REWRITE_LOCKED" &&
    !["LOCKED", "RESCHEDULED", "SKIPPED_PREREQUISITE"].includes(
      cycle.rewriteStatus,
    )
  ) {
    issues.push({
      code: "REWRITE_LOCK_MISMATCH",
      message:
        "REWRITE_LOCKED requires a locked, rescheduled, or prerequisite-skipped rewrite task.",
    });
  }
  if (cycle.state === "REWRITE_READY" && cycle.rewriteStatus !== "READY") {
    issues.push({
      code: "REWRITE_READY_MISMATCH",
      message: "REWRITE_READY requires RewriteTask.status READY.",
    });
  }
  if (cycle.state === "ATTEMPT_2_ACTIVE" && cycle.rewriteStatus !== "ACTIVE") {
    issues.push({
      code: "REWRITE_ACTIVE_MISMATCH",
      message: "ATTEMPT_2_ACTIVE requires RewriteTask.status ACTIVE.",
    });
  }
  if (
    ["COMPARING", "CORE_CYCLE_COMPLETED"].includes(cycle.state) &&
    cycle.rewriteStatus !== "COMPLETED"
  ) {
    issues.push({
      code: "REWRITE_INCOMPLETE",
      message: "Comparison requires a completed rewrite task.",
    });
  }
  if (
    cycle.state === "CORE_CYCLE_COMPLETED" &&
    cycle.coreCompletedAt === undefined
  ) {
    issues.push({
      code: "MISSING_CORE_COMPLETION_TIME",
      message: "A completed core cycle must record coreCompletedAt.",
    });
  }

  return issues;
}
