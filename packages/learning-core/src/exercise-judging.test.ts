import { describe, expect, it } from "vitest";

import type {
  ExerciseItem,
  ExercisePresentation,
} from "@iwc/learning-contracts";

import {
  exerciseWordCount,
  isSubstantiveRevision,
  judgeClosedExercise,
} from "./exercise-judging";

function item(
  itemType: ExerciseItem["itemType"],
  grading: ExerciseItem["grading"],
): ExerciseItem {
  return {
    id: "item-1",
    blockId: "block-1",
    learningObjectiveId: "objective-1",
    primarySkillId: "collocation_perspective",
    stage: "control",
    itemType,
    prompt: "Complete the item.",
    grading,
    expectedActiveSeconds: 30,
    expectedTotalSeconds: 40,
    isReserve: false,
    generationMode: "TEMPLATE",
    qualityStatus: "VALIDATED",
    evidenceOpportunity: "CONTROLLED_REPAIR",
    contextId: "context-1",
    firstAttemptRequired: false,
    hintPolicy: "NONE",
    feedbackPolicy: "IMMEDIATE",
  };
}

describe("deterministic lesson exercise judging", () => {
  it("accepts a meaningful partial spotlight span", () => {
    const result = judgeClosedExercise({
      item: item("ERROR_LOCATION", {
        mode: "DETERMINISTIC",
        acceptedAnswers: ["pressure from the courses"],
        normalization: "TRIM_CASE_FOLD",
      }),
      presentation: {
        form: "SPOTLIGHT",
        responseMode: "span",
        sourceText: "The pressure from the courses is much slighter.",
      },
      answer: "pressure from",
    });
    expect(result).toMatchObject({ outcome: "PASS", passed: true });
  });

  it("returns the same minimal-contrast result and named confusion", () => {
    const exercise = item("MINIMAL_PAIR", {
      mode: "DETERMINISTIC",
      acceptedAnswers: ["b"],
      normalization: "TRIM_CASE_FOLD",
    });
    const presentation: ExercisePresentation = {
      form: "MINIMAL_CONTRAST",
      responseMode: "choice",
      options: [
        { id: "a", labelZh: "A", labelEn: "slighter pressure" },
        { id: "b", labelZh: "B", labelEn: "less academic pressure" },
      ],
      confusionByAnswer: {
        a: "grammatical comparative mistaken for natural collocation",
      },
    };
    const first = judgeClosedExercise({
      item: exercise,
      presentation,
      answer: "a",
    });
    const repeated = judgeClosedExercise({
      item: exercise,
      presentation,
      answer: "a",
    });
    expect(repeated).toEqual(first);
    expect(first).toMatchObject({
      outcome: "FAIL",
      confusionId: expect.any(String),
    });
  });

  it("matches expression maps and skeletons independent of declared valid order", () => {
    const mapping = item("EXPRESSION_MAP", {
      mode: "DETERMINISTIC",
      acceptedAnswers: [
        "学习压力=>academic pressure|压力较小=>face less pressure",
      ],
      normalization: "ORDER_INSENSITIVE",
    });
    expect(
      judgeClosedExercise({
        item: mapping,
        presentation: { form: "EXPRESSION_MAP", responseMode: "mapping" },
        answer: "压力较小=>face less pressure|学习压力=>academic pressure",
      })?.passed,
    ).toBe(true);

    const skeleton = item("SKELETON_COMPLETION", {
      mode: "DETERMINISTIC",
      acceptedAnswers: [
        "Children face less academic pressure in primary school.",
        "In primary school, children face less academic pressure.",
      ],
      normalization: "TRIM_CASE_FOLD",
    });
    expect(
      judgeClosedExercise({
        item: skeleton,
        presentation: { form: "SKELETON", responseMode: "slots" },
        answer: "In primary school, children face less academic pressure.",
      })?.passed,
    ).toBe(true);
  });

  it("keeps meaning choice neutral and sends rubric generation to AI", () => {
    expect(
      judgeClosedExercise({
        item: item("MEANING_FORK", {
          mode: "UNSCORED_BRANCH",
          branchIds: ["lighter_workload", "easier_courses"],
        }),
        answer: "lighter_workload",
      }),
    ).toMatchObject({
      outcome: "NEUTRAL",
      passed: false,
      validAnswer: true,
      selectedBranchId: "lighter_workload",
    });
    expect(
      judgeClosedExercise({
        item: item("BRIDGE_SENTENCE", {
          mode: "RUBRIC",
          minimumConfidence: 0.85,
          criteria: [
            {
              id: "bridge",
              description: "Makes the mechanism explicit.",
              passingScore: 0.8,
            },
          ],
        }),
        answer: "This gives children time to practise regularly.",
      }),
    ).toBeNull();
  });

  it("enforces paragraph-lab length and an actual second revision", () => {
    const paragraph = Array.from(
      { length: 80 },
      (_, index) => `word${index}`,
    ).join(" ");
    expect(exerciseWordCount(paragraph)).toBe(80);
    expect(isSubstantiveRevision(paragraph, paragraph)).toBe(false);
    expect(
      isSubstantiveRevision(
        paragraph,
        paragraph.replace("word10 word11", "revised mechanism"),
      ),
    ).toBe(true);
  });
});
