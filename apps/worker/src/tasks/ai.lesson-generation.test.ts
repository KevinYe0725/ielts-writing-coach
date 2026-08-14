import { beforeEach, describe, expect, it, vi } from "vitest";

const lessonState = vi.hoisted(() => ({
  issues: [] as Array<{
    id: string;
    skillId: string;
    startOffset: number;
    endOffset: number;
    excerpt: string;
    diagnosis: Record<string, string>;
    severity: number;
    confidence: number;
  }>,
  assessmentSummary: {
    overviewZh: "论证展开是本次最需要优先改善的部分。",
    overviewEn: "Argument development is the highest-priority weakness.",
  } as Record<string, string>,
  generatedInput: "",
  failure: undefined as unknown,
}));

vi.mock("../runtime", () => {
  const transaction = {
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    })),
  };
  return {
    adapterForJob: vi.fn(async () => ({
      generateStructured: vi.fn(async (request: { input: string }) => {
        lessonState.generatedInput = request.input;
        return {
          value: {
            teachingModule: { format: "ADAPTIVE_ARTICLE_V1" },
            paper: { items: [] },
          },
          model: "mock-deterministic-v1",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      }),
    })),
    claimAIJob: vi.fn(async () => ({
      id: "job-lesson-generation",
      ownerId: "learner-1",
      taskKind: "exercise_generation",
      protectedReference: {
        cycleId: "cycle-1",
        assessmentId: "assessment-1",
        skillId: "mechanism_chain",
      },
      versionSnapshot: {
        model: "mock-deterministic-v1",
        providerKind: "mock",
      },
      attemptCount: 1,
    })),
    createChildJob: vi.fn(),
    databaseContext: {
      db: {
        query: {
          trainingCycle: {
            findFirst: vi.fn(async () => ({
              id: "cycle-1",
              status: "LESSON_GENERATING",
              question: {
                prompt:
                  "Some people think schools should teach financial literacy. Discuss both views.",
              },
              writingAttempts: [
                {
                  kind: "version_1",
                  content:
                    "Schools can prepare young people for important adult decisions.",
                },
              ],
              lessonPlans: [],
            })),
          },
          issueEvidence: {
            findMany: vi.fn(async () => lessonState.issues),
          },
          assessment: {
            findFirst: vi.fn(async () => ({
              id: "assessment-1",
              summary: lessonState.assessmentSummary,
            })),
          },
        },
        transaction: vi.fn(
          async (callback: (value: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      },
    },
    markJobFailure: vi.fn(async (_job: unknown, error: unknown) => {
      lessonState.failure = error;
    }),
    markJobSucceeded: vi.fn(async () => undefined),
  };
});

import { runAIJob } from "./ai";

function issue(input: {
  id: string;
  skillId?: string;
  excerpt: string;
  severity: number;
  confidence: number;
  startOffset: number;
}) {
  return {
    ...input,
    skillId: input.skillId ?? "mechanism_chain",
    endOffset: input.startOffset + input.excerpt.length,
    diagnosis: { en: `Diagnosis for ${input.id}` },
  };
}

async function generateLesson(): Promise<void> {
  await runAIJob({ jobId: "job-lesson-generation" }, {
    job: { attempts: 1 },
  } as never);
}

describe("adaptive lesson generation evidence", () => {
  beforeEach(() => {
    lessonState.generatedInput = "";
    lessonState.failure = undefined;
    lessonState.issues = [];
  });

  it("passes only the selected skill's top four issues in stable priority and position order", async () => {
    lessonState.issues = [
      issue({
        id: "other-first",
        skillId: "grammar_sentence_control",
        excerpt: "UNRELATED_GRAMMAR_EVIDENCE",
        severity: 3,
        confidence: 1,
        startOffset: 0,
      }),
      issue({
        id: "target-low",
        excerpt: "TARGET_LOW",
        severity: 1,
        confidence: 0.99,
        startOffset: 5,
      }),
      issue({
        id: "target-high-later",
        excerpt: "TARGET_HIGH_LATER",
        severity: 3,
        confidence: 0.9,
        startOffset: 80,
      }),
      issue({
        id: "other-second",
        skillId: "spelling_word_form",
        excerpt: "UNRELATED_SPELLING_EVIDENCE",
        severity: 3,
        confidence: 1,
        startOffset: 2,
      }),
      issue({
        id: "target-high-earlier",
        excerpt: "TARGET_HIGH_EARLIER",
        severity: 3,
        confidence: 0.9,
        startOffset: 12,
      }),
      issue({
        id: "target-medium",
        excerpt: "TARGET_MEDIUM",
        severity: 2,
        confidence: 0.95,
        startOffset: 20,
      }),
      issue({
        id: "target-high-lower-confidence",
        excerpt: "TARGET_HIGH_LOWER_CONFIDENCE",
        severity: 3,
        confidence: 0.8,
        startOffset: 3,
      }),
    ];

    await generateLesson();

    expect(lessonState.failure).toBeUndefined();
    expect(lessonState.generatedInput).not.toContain(
      "UNRELATED_GRAMMAR_EVIDENCE",
    );
    expect(lessonState.generatedInput).not.toContain(
      "UNRELATED_SPELLING_EVIDENCE",
    );
    expect(lessonState.generatedInput).not.toContain("TARGET_LOW");
    const excerpts = [
      "TARGET_HIGH_EARLIER",
      "TARGET_HIGH_LATER",
      "TARGET_HIGH_LOWER_CONFIDENCE",
      "TARGET_MEDIUM",
    ];
    for (const excerpt of excerpts) {
      expect(lessonState.generatedInput).toContain(excerpt);
    }
    const positions = excerpts.map((excerpt) =>
      lessonState.generatedInput.indexOf(excerpt),
    );
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right),
    );
  });

  it("uses the selected target and assessment summary when no matching issue exists", async () => {
    lessonState.issues = [
      issue({
        id: "only-other-skill",
        skillId: "collocation_perspective",
        excerpt: "DO_NOT_MIX_THIS_OTHER_SKILL",
        severity: 3,
        confidence: 0.99,
        startOffset: 4,
      }),
    ];

    await generateLesson();

    expect(lessonState.failure).toBeUndefined();
    expect(lessonState.generatedInput).toContain("mechanism_chain");
    expect(lessonState.generatedInput).toContain(
      "Argument development is the highest-priority weakness.",
    );
    expect(lessonState.generatedInput).not.toContain(
      "DO_NOT_MIX_THIS_OTHER_SKILL",
    );
  });
});
