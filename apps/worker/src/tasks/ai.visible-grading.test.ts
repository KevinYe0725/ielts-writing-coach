import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ input: "" }));
vi.mock("../runtime", () => ({
  claimAIJob: async () => ({
    id: "grading",
    ownerId: "learner",
    taskKind: "paragraph_evaluation",
    protectedReference: { practicePaper: "true", lessonId: "lesson" },
    versionSnapshot: { model: "test" },
  }),
  databaseContext: {
    db: {
      query: {
        lessonPlan: {
          findFirst: async () => ({
            id: "lesson",
            cycle: { userId: "learner" },
            paperSubmittedAt: new Date(),
            paperAnswers: { q1: "A valid sentence." },
            paperContent: {
              paper: {
                titleZh: "训练卷",
                objectiveZh: "练习清楚表达",
                items: Array.from({ length: 8 }, (_, index) => ({
                  id: `q${index + 1}`,
                  number: index + 1,
                  instructionZh: "写一句话说明公共交通的一项好处。",
                  promptEn: "Explain one benefit of public transport.",
                  sourceText: "",
                  responseMode: "sentence",
                  options: [],
                  acceptedAnswers: [],
                  answerExplanationZh: "",
                  publicCriteria: [
                    {
                      labelZh: "隐藏要求",
                      descriptionZh: "必须引用三个国家的数据。",
                      weight: 100,
                    },
                  ],
                })),
              },
            },
          }),
        },
      },
    },
  },
  adapterForJob: async () => ({
    generateStructured: async (request: { input: string }) => {
      state.input = request.input;
      throw new Error("Captured request without a provider call");
    },
  }),
  markJobFailure: async () => undefined,
  markJobSucceeded: async () => undefined,
  createChildJob: async () => undefined,
}));
import { runAIJob } from "./ai";

describe("visible-instruction grading boundary", () => {
  it("removes hidden legacy criteria before sending a submitted paper to the model", async () => {
    await runAIJob({ jobId: "grading" }, { job: { attempts: 1 } } as never);
    const paper = JSON.parse(
      state.input.split("Paper: ")[1]!.split("\nLearner answers")[0]!,
    );
    expect(JSON.stringify(paper)).not.toContain("必须引用三个国家的数据");
    expect(paper.items[0].publicCriteria).toEqual([
      expect.objectContaining({
        descriptionZh: "写一句话说明公共交通的一项好处。",
        weight: 100,
      }),
    ]);
    expect(paper.items[0].acceptedAnswers).toEqual([]);
  });
});
