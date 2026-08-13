import type { LearningSchedule } from "@iwc/learning-contracts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function parseInstant(value: string, fieldName: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${fieldName} must be a valid ISO-8601 instant.`);
  }
  return parsed;
}

function toIso(epochMilliseconds: number): string {
  return new Date(epochMilliseconds).toISOString();
}

function addMilliseconds(
  instant: string,
  milliseconds: number,
  fieldName: string,
): string {
  return toIso(parseInstant(instant, fieldName) + milliseconds);
}

/**
 * Creates deterministic elapsed-time windows. Presentation code may localize the
 * instants, but must not reinterpret D1/D2, D5/D7, or D14 as server-calendar days.
 */
export function createLearningSchedule(
  cycleStartedAt: string,
): LearningSchedule {
  parseInstant(cycleStartedAt, "cycleStartedAt");
  return {
    cycleStartedAt: toIso(parseInstant(cycleStartedAt, "cycleStartedAt")),
    lessonWindowEndsAt: addMilliseconds(
      cycleStartedAt,
      DAY_MS,
      "cycleStartedAt",
    ),
    rewrite: {
      targetRewriteAt: addMilliseconds(
        cycleStartedAt,
        DAY_MS,
        "cycleStartedAt",
      ),
      targetWindowEndsAt: addMilliseconds(
        cycleStartedAt,
        2 * DAY_MS,
        "cycleStartedAt",
      ),
      dueAt: null,
      lastInstructionExposureAt: null,
    },
    transfer: {
      windowStartsAt: addMilliseconds(
        cycleStartedAt,
        5 * DAY_MS,
        "cycleStartedAt",
      ),
      windowEndsAt: addMilliseconds(
        cycleStartedAt,
        7 * DAY_MS,
        "cycleStartedAt",
      ),
      dueAt: addMilliseconds(cycleStartedAt, 5 * DAY_MS, "cycleStartedAt"),
    },
    mixedReview: {
      dueAt: addMilliseconds(cycleStartedAt, 14 * DAY_MS, "cycleStartedAt"),
    },
  };
}

export function unlockRewriteAfterInstruction(
  schedule: LearningSchedule,
  lastInstructionExposureAt: string,
  delayHours = 24,
): LearningSchedule {
  if (!Number.isInteger(delayHours) || delayHours < 24 || delayHours > 48) {
    throw new RangeError(
      "Rewrite delay must be an integer from 24 through 48 hours.",
    );
  }
  parseInstant(lastInstructionExposureAt, "lastInstructionExposureAt");
  const normalizedExposure = toIso(
    parseInstant(lastInstructionExposureAt, "lastInstructionExposureAt"),
  );
  return {
    ...schedule,
    rewrite: {
      ...schedule.rewrite,
      dueAt: addMilliseconds(
        normalizedExposure,
        delayHours * HOUR_MS,
        "lastInstructionExposureAt",
      ),
      lastInstructionExposureAt: normalizedExposure,
    },
  };
}

/** Any substantive explanation, full answer, or scaffold resets the retention clock. */
export function recordInstructionExposure(
  schedule: LearningSchedule,
  instructionExposureAt: string,
): LearningSchedule {
  return unlockRewriteAfterInstruction(schedule, instructionExposureAt, 24);
}

export function isDue(dueAt: string | null, now: string): boolean {
  if (dueAt === null) {
    return false;
  }
  return parseInstant(dueAt, "dueAt") <= parseInstant(now, "now");
}

export function isWithinWindow(
  at: string,
  startsAt: string,
  endsAt: string,
): boolean {
  const instant = parseInstant(at, "at");
  return (
    instant >= parseInstant(startsAt, "startsAt") &&
    instant <= parseInstant(endsAt, "endsAt")
  );
}
