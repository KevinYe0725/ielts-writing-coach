import type { ExercisePresentation } from "@iwc/learning-contracts";
import { exerciseWordCount, isSubstantiveRevision } from "@iwc/learning-core";

export interface ExerciseSubmissionViolation {
  readonly code:
    | "EXERCISE_WORD_COUNT_OUT_OF_RANGE"
    | "SELF_CHECK_CONFIRMATIONS_REQUIRED"
    | "SELF_CHECK_BASELINE_MISMATCH"
    | "SELF_CHECK_REVISION_REQUIRED";
  readonly detail: string;
}

export function validateExerciseWordRange(
  presentation: ExercisePresentation | null,
  finalAnswer: string,
): ExerciseSubmissionViolation | null {
  if (
    presentation?.minimumWords === undefined &&
    presentation?.maximumWords === undefined
  ) {
    return null;
  }
  const count = exerciseWordCount(finalAnswer);
  const minimum = presentation.minimumWords ?? 0;
  const maximum = presentation.maximumWords ?? Number.MAX_SAFE_INTEGER;
  return count < minimum || count > maximum
    ? {
        code: "EXERCISE_WORD_COUNT_OUT_OF_RANGE",
        detail: `Write ${minimum}–${maximum} words for this paragraph exercise; the submitted revision has ${count}.`,
      }
    : null;
}

export function validateTargetedSelfCheck(input: {
  readonly presentation: ExercisePresentation | null;
  readonly sourceAnswer: string;
  readonly firstAnswer: string;
  readonly finalAnswer: string;
  readonly confirmations: readonly string[];
}): ExerciseSubmissionViolation | null {
  if (input.presentation?.form !== "TARGETED_SELF_CHECK") return null;
  const requiredChecks = input.presentation.selfCheckPrompts ?? [];
  if (requiredChecks.some((check) => !input.confirmations.includes(check))) {
    return {
      code: "SELF_CHECK_CONFIRMATIONS_REQUIRED",
      detail:
        "Confirm every targeted check before submitting the second revision.",
    };
  }
  if (input.firstAnswer.trim() !== input.sourceAnswer.trim()) {
    return {
      code: "SELF_CHECK_BASELINE_MISMATCH",
      detail:
        "The first self-check version must be the saved paragraph-lab answer.",
    };
  }
  if (!isSubstantiveRevision(input.sourceAnswer, input.finalAnswer)) {
    return {
      code: "SELF_CHECK_REVISION_REQUIRED",
      detail:
        "Make at least one substantive targeted change before submitting the self-check.",
    };
  }
  return null;
}
