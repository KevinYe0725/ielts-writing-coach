import { describe, expect, it } from "vitest";

import type { ExercisePresentation } from "@iwc/learning-contracts";

import {
  validateExerciseWordRange,
  validateTargetedSelfCheck,
} from "./exercise-submission";

const presentation: ExercisePresentation = {
  form: "TARGETED_SELF_CHECK",
  responseMode: "revision",
  revisionSourceItemId: "paragraph-lab",
  minimumWords: 80,
  maximumWords: 120,
  selfCheckPrompts: ["Check target", "Check mechanism"],
};

const paragraph = Array.from({ length: 80 }, (_, index) => `word${index}`).join(
  " ",
);

describe("exercise response API rules", () => {
  it("enforces the paragraph lab's inclusive 80–120 word range", () => {
    expect(validateExerciseWordRange(presentation, paragraph)).toBeNull();
    expect(
      validateExerciseWordRange(
        presentation,
        Array.from({ length: 79 }, () => "word").join(" "),
      ),
    ).toMatchObject({ code: "EXERCISE_WORD_COUNT_OUT_OF_RANGE" });
    expect(
      validateExerciseWordRange(
        presentation,
        Array.from({ length: 121 }, () => "word").join(" "),
      ),
    ).toMatchObject({ code: "EXERCISE_WORD_COUNT_OUT_OF_RANGE" });
  });

  it("refuses self-check completion without every targeted confirmation", () => {
    expect(
      validateTargetedSelfCheck({
        presentation,
        sourceAnswer: paragraph,
        firstAnswer: paragraph,
        finalAnswer: paragraph.replace("word10 word11", "clear mechanism"),
        confirmations: ["Check target"],
      }),
    ).toMatchObject({ code: "SELF_CHECK_CONFIRMATIONS_REQUIRED" });
  });

  it("requires the saved baseline and a substantive second revision", () => {
    expect(
      validateTargetedSelfCheck({
        presentation,
        sourceAnswer: paragraph,
        firstAnswer: `${paragraph} changed`,
        finalAnswer: paragraph.replace("word10 word11", "clear mechanism"),
        confirmations: ["Check target", "Check mechanism"],
      }),
    ).toMatchObject({ code: "SELF_CHECK_BASELINE_MISMATCH" });
    expect(
      validateTargetedSelfCheck({
        presentation,
        sourceAnswer: paragraph,
        firstAnswer: paragraph,
        finalAnswer: paragraph,
        confirmations: ["Check target", "Check mechanism"],
      }),
    ).toMatchObject({ code: "SELF_CHECK_REVISION_REQUIRED" });
    expect(
      validateTargetedSelfCheck({
        presentation,
        sourceAnswer: paragraph,
        firstAnswer: paragraph,
        finalAnswer: paragraph.replace("word10 word11", "clear mechanism"),
        confirmations: ["Check target", "Check mechanism"],
      }),
    ).toBeNull();
  });
});
