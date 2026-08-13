export interface TimedExerciseAttempt {
  readonly contractAttempts: readonly { readonly elapsedSeconds: number }[];
}

/**
 * Response events store elapsed snapshots for one exercise. A hint/final
 * revision therefore must not add the same working time again.
 */
export function recordedExerciseDurationSeconds(
  attempts: readonly TimedExerciseAttempt[],
): number {
  return attempts.reduce(
    (total, attempt) =>
      total +
      Math.max(
        0,
        ...attempt.contractAttempts.map((response) =>
          Math.max(0, response.elapsedSeconds),
        ),
      ),
    0,
  );
}
