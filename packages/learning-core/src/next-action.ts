import type {
  LessonStatus,
  RewriteTaskStatus,
  TrainingCycleState,
  TransferTaskStatus,
} from "@iwc/learning-contracts";

export const NEXT_ACTION_KINDS = [
  "START_ATTEMPT_1",
  "CONTINUE_ATTEMPT_1",
  "WAIT_FOR_ASSESSMENT",
  "REVIEW_FEEDBACK",
  "WAIT_FOR_LESSON",
  "START_LESSON",
  "CONTINUE_LESSON",
  "COMPLETE_CORE_PREREQUISITE",
  "WAIT_FOR_REWRITE_SCHEDULING",
  "WAIT_FOR_REWRITE_UNLOCK",
  "RESCHEDULE_REWRITE",
  "START_REWRITE",
  "CONTINUE_REWRITE",
  "WAIT_FOR_COMPARISON",
  "START_TRANSFER",
  "RESCHEDULE_TRANSFER",
  "START_MIXED_REVIEW",
  "START_NEW_CYCLE",
] as const;
export type NextActionKind = (typeof NEXT_ACTION_KINDS)[number];

export interface NextAction {
  readonly kind: NextActionKind;
  readonly entityId: string;
  readonly reason: string;
  readonly dueAt: string | null;
  readonly overdue: boolean;
}

export interface NextActionContext {
  readonly now: string;
  readonly cycle: {
    readonly id: string;
    readonly state: TrainingCycleState;
    readonly lessonId: string;
    readonly lessonStatus: LessonStatus;
    readonly rewrite: {
      readonly id: string;
      readonly status: RewriteTaskStatus;
      readonly dueAt: string | null;
      readonly expiresAt: string | null;
    };
  };
  readonly transfers: readonly {
    readonly id: string;
    readonly status: TransferTaskStatus;
    readonly dueAt: string;
    readonly expiresAt: string | null;
  }[];
  readonly mixedReview?: {
    readonly id: string;
    readonly dueAt: string;
    readonly completed: boolean;
  };
}

function time(value: string, fieldName: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${fieldName} must be a valid ISO-8601 instant.`);
  }
  return parsed;
}

function action(
  kind: NextActionKind,
  entityId: string,
  reason: string,
  dueAt: string | null,
  now: number,
): NextAction {
  return {
    kind,
    entityId,
    reason,
    dueAt,
    overdue: dueAt !== null && time(dueAt, "dueAt") < now,
  };
}

const incompleteLessonStatuses = new Set<LessonStatus>([
  "PLANNING",
  "READY",
  "ACTIVE",
  "TIMEBOX_EXPIRED",
  "ABANDONED",
]);

/** Returns exactly one deterministic Today-page action for an aggregate snapshot. */
export function getUniqueNextAction(context: NextActionContext): NextAction {
  const now = time(context.now, "now");
  const { cycle } = context;

  switch (cycle.state) {
    case "QUESTION_READY":
      return action(
        "START_ATTEMPT_1",
        cycle.id,
        "The first timed draft is ready.",
        null,
        now,
      );
    case "ATTEMPT_1_ACTIVE":
      return action(
        "CONTINUE_ATTEMPT_1",
        cycle.id,
        "Resume the saved first draft.",
        null,
        now,
      );
    case "SUBMITTED":
    case "ANALYZING":
      return action(
        "WAIT_FOR_ASSESSMENT",
        cycle.id,
        "The submitted draft is being assessed.",
        null,
        now,
      );
    case "FEEDBACK_READY":
      return action(
        "REVIEW_FEEDBACK",
        cycle.id,
        "Read the one-minute assessment summary and core goal.",
        null,
        now,
      );
    case "LESSON_GENERATING":
      return action(
        "WAIT_FOR_LESSON",
        cycle.lessonId,
        "The constrained lesson is being generated and validated.",
        null,
        now,
      );
    case "LESSON_READY":
      return action(
        "START_LESSON",
        cycle.lessonId,
        "The personalized lesson is ready.",
        null,
        now,
      );
    case "LESSON_ACTIVE":
      return action(
        "CONTINUE_LESSON",
        cycle.lessonId,
        "Resume the lesson at its saved item and branch.",
        null,
        now,
      );
    case "LESSON_RESOLVED":
    case "REWRITE_LOCKED": {
      if (
        cycle.rewrite.expiresAt !== null &&
        time(cycle.rewrite.expiresAt, "rewrite.expiresAt") <= now &&
        ["LOCKED", "READY", "RESCHEDULED", "SKIPPED_PREREQUISITE"].includes(
          cycle.rewrite.status,
        )
      ) {
        return action(
          "RESCHEDULE_REWRITE",
          cycle.rewrite.id,
          "The closed-book rewrite window was missed and must be explicitly rescheduled.",
          cycle.rewrite.expiresAt,
          now,
        );
      }
      if (cycle.rewrite.status === "SKIPPED_PREREQUISITE") {
        return action(
          "START_REWRITE",
          cycle.rewrite.id,
          "The learner explicitly skipped the lesson. The rewrite may start, but it is prerequisite-skipped and cannot create retention evidence.",
          cycle.rewrite.dueAt,
          now,
        );
      }
      if (
        incompleteLessonStatuses.has(cycle.lessonStatus) &&
        cycle.rewrite.dueAt === null
      ) {
        return action(
          "COMPLETE_CORE_PREREQUISITE",
          cycle.lessonId,
          "Finish the remaining core path before a formal rewrite due time exists.",
          null,
          now,
        );
      }
      if (cycle.rewrite.dueAt === null) {
        return action(
          "WAIT_FOR_REWRITE_SCHEDULING",
          cycle.rewrite.id,
          "The formal rewrite time must be calculated from the latest instruction exposure.",
          null,
          now,
        );
      }
      if (time(cycle.rewrite.dueAt, "rewrite.dueAt") > now) {
        return action(
          "WAIT_FOR_REWRITE_UNLOCK",
          cycle.rewrite.id,
          "The closed-book interval is still running.",
          cycle.rewrite.dueAt,
          now,
        );
      }
      return action(
        "START_REWRITE",
        cycle.rewrite.id,
        "The delayed closed-book rewrite is due.",
        cycle.rewrite.dueAt,
        now,
      );
    }
    case "REWRITE_READY":
      if (
        cycle.rewrite.expiresAt !== null &&
        time(cycle.rewrite.expiresAt, "rewrite.expiresAt") <= now
      ) {
        return action(
          "RESCHEDULE_REWRITE",
          cycle.rewrite.id,
          "The closed-book rewrite window was missed and must be explicitly rescheduled.",
          cycle.rewrite.expiresAt,
          now,
        );
      }
      return action(
        "START_REWRITE",
        cycle.rewrite.id,
        "The delayed closed-book rewrite is ready.",
        cycle.rewrite.dueAt,
        now,
      );
    case "ATTEMPT_2_ACTIVE":
      return action(
        "CONTINUE_REWRITE",
        cycle.rewrite.id,
        "Resume the saved Version 2 draft.",
        cycle.rewrite.dueAt,
        now,
      );
    case "COMPARING":
      return action(
        "WAIT_FOR_COMPARISON",
        cycle.id,
        "Version 1 and Version 2 are being compared with the same rubric version.",
        null,
        now,
      );
    case "CORE_CYCLE_COMPLETED":
      break;
  }

  const sortedTransfers = [...context.transfers].sort(
    (left, right) =>
      time(left.dueAt, "transfer.dueAt") -
        time(right.dueAt, "transfer.dueAt") || left.id.localeCompare(right.id),
  );
  const expiredTransfer = sortedTransfers.find(
    (task) =>
      task.expiresAt !== null &&
      time(task.expiresAt, "transfer.expiresAt") <= now &&
      ["PLANNED", "READY", "RESCHEDULED"].includes(task.status),
  );
  if (expiredTransfer !== undefined) {
    return action(
      "RESCHEDULE_TRANSFER",
      expiredTransfer.id,
      "The transfer window was missed and must be explicitly rescheduled without recording a learning failure.",
      expiredTransfer.expiresAt,
      now,
    );
  }
  const reschedule = sortedTransfers.find(
    (task) => task.status === "NO_OPPORTUNITY",
  );
  if (reschedule !== undefined) {
    return action(
      "RESCHEDULE_TRANSFER",
      reschedule.id,
      "No natural opportunity occurred, so the task is rescheduled without a failure.",
      reschedule.dueAt,
      now,
    );
  }
  const readyTransfer = sortedTransfers.find(
    (task) =>
      task.status === "READY" ||
      ((["PLANNED", "RESCHEDULED"] as const).includes(
        task.status as "PLANNED" | "RESCHEDULED",
      ) &&
        time(task.dueAt, "transfer.dueAt") <= now),
  );
  if (readyTransfer !== undefined) {
    return action(
      "START_TRANSFER",
      readyTransfer.id,
      "A no-target-hint transfer check is ready.",
      readyTransfer.dueAt,
      now,
    );
  }
  if (
    context.mixedReview !== undefined &&
    !context.mixedReview.completed &&
    time(context.mixedReview.dueAt, "mixedReview.dueAt") <= now
  ) {
    return action(
      "START_MIXED_REVIEW",
      context.mixedReview.id,
      "The D14 mixed review is due in a new essay.",
      context.mixedReview.dueAt,
      now,
    );
  }
  return action(
    "START_NEW_CYCLE",
    cycle.id,
    "No higher-priority learning task is currently due.",
    null,
    now,
  );
}
