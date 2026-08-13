import { describe, expect, it } from "vitest";

import { projectExerciseItemForDelivery } from "./lesson-delivery";

describe("lesson API delivery projection", () => {
  it("uses the persisted unscored meaning branch for the next prompt", () => {
    const delivered = projectExerciseItemForDelivery(
      {
        prompt: { promptEn: "Default prompt" },
        evaluationContract: {
          canonicalItem: { grading: { mode: "RUBRIC" } },
          presentation: {
            form: "OPEN_GENERATION",
            responseMode: "sentence",
            branchPrompts: {
              lighter_workload: "Write about the amount of assigned work.",
              easier_courses: "Write about how demanding the courses are.",
            },
          },
        },
      },
      { semanticBranch: "easier_courses" },
    );
    expect(delivered.prompt.promptEn).toBe(
      "Write about how demanding the courses are.",
    );
  });

  it("does not leak deterministic answers before submission", () => {
    const delivered = projectExerciseItemForDelivery(
      {
        prompt: {},
        evaluationContract: {
          canonicalItem: {
            grading: {
              mode: "DETERMINISTIC",
              normalization: "TRIM_CASE_FOLD",
              acceptedAnswers: ["secret accepted answer"],
            },
          },
          presentation: {
            form: "MINIMAL_CONTRAST",
            responseMode: "choice",
            options: [
              { id: "a", labelZh: "A", labelEn: "A" },
              { id: "b", labelZh: "B", labelEn: "B" },
            ],
          },
        },
      },
      {},
    );
    expect(
      (
        delivered.evaluationContract.canonicalItem as {
          grading: { acceptedAnswers: string[] };
        }
      ).grading.acceptedAnswers,
    ).toEqual([]);
    expect(JSON.stringify(delivered)).not.toContain("secret accepted answer");
  });

  it("scrambles expression-map choices while preserving the semantic left side", () => {
    const delivered = projectExerciseItemForDelivery(
      {
        prompt: {},
        evaluationContract: {
          canonicalItem: { grading: { mode: "RUBRIC" } },
          presentation: {
            form: "EXPRESSION_MAP",
            responseMode: "mapping",
            mappingPairs: [
              { left: "压力", right: "pressure" },
              { left: "课业量", right: "workload" },
            ],
          },
        },
      },
      {},
    );
    expect(
      (
        (delivered.prompt as Record<string, unknown>).presentation as {
          mappingPairs: Array<{ left: string; right: string }>;
        }
      ).mappingPairs,
    ).toEqual([
      { left: "压力", right: "workload" },
      { left: "课业量", right: "pressure" },
    ]);
  });
});
