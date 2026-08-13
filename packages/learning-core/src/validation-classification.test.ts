import { describe, expect, it } from "vitest";

import type {
  ExerciseItem,
  LessonBlock,
  LessonPlan,
} from "@iwc/learning-contracts";

import { classifyMuchSlighterPressure } from "./language-classification";
import { validateLessonPlan } from "./lesson-validator";
import { validateRewritePacketLeakage } from "./rewrite-leakage-validator";

const objective = {
  id: "objective-core",
  trainingCycleId: "cycle-1",
  skillId: "collocation_perspective" as const,
  role: "CORE" as const,
  sourceEvidenceIds: ["issue-1"],
  priority: 1,
  successCriterion:
    "Use a natural pressure expression in two contexts and a paragraph.",
};

function item(
  id: string,
  input: Pick<
    ExerciseItem,
    "stage" | "itemType" | "evidenceOpportunity" | "expectedTotalSeconds"
  > &
    Partial<ExerciseItem>,
): ExerciseItem {
  return {
    id,
    blockId: input.blockId ?? "core-block",
    learningObjectiveId: "objective-core",
    primarySkillId: "collocation_perspective",
    stage: input.stage,
    itemType: input.itemType,
    prompt: `Prompt for ${id}`,
    grading:
      input.itemType === "MEANING_FORK"
        ? {
            mode: "UNSCORED_BRANCH",
            branchIds: ["student-pressure", "course-demand"],
          }
        : {
            mode: "RUBRIC",
            minimumConfidence: 0.9,
            criteria: [
              {
                id: "target",
                description: "Meets the target while preserving meaning.",
                passingScore: 0.8,
              },
            ],
          },
    expectedActiveSeconds:
      input.expectedActiveSeconds ??
      Math.floor(input.expectedTotalSeconds * 0.8),
    expectedTotalSeconds: input.expectedTotalSeconds,
    isReserve: input.isReserve ?? false,
    generationMode: "TEMPLATE",
    qualityStatus: "VALIDATED",
    evidenceOpportunity: input.evidenceOpportunity,
    contextId: input.contextId ?? `context-${id}`,
    firstAttemptRequired: input.firstAttemptRequired ?? false,
    hintPolicy: input.hintPolicy ?? "ON_REQUEST",
    feedbackPolicy: input.feedbackPolicy ?? "IMMEDIATE",
    ...(input.independentGroupId === undefined
      ? {}
      : { independentGroupId: input.independentGroupId }),
    ...(input.unseenSurfaceForm === undefined
      ? {}
      : { unseenSurfaceForm: input.unseenSurfaceForm }),
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
  };
}

function validLesson(): LessonPlan {
  const first: LessonBlock = {
    id: "core-block",
    objectiveId: objective.id,
    kind: "CORE",
    path: "CORE",
    order: 0,
    timeBudgetSeconds: 1080,
    items: [
      item("pretest", {
        stage: "notice",
        itemType: "MEANING_FORK",
        evidenceOpportunity: "PRETEST",
        expectedTotalSeconds: 180,
      }),
      item("repair", {
        stage: "control",
        itemType: "CONSTRAINED_REWRITE",
        evidenceOpportunity: "CONTROLLED_REPAIR",
        expectedTotalSeconds: 300,
      }),
      item("generation-1", {
        stage: "produce",
        itemType: "SENTENCE_GENERATION",
        evidenceOpportunity: "INDEPENDENT_GENERATION",
        expectedTotalSeconds: 300,
        contextId: "students-face-pressure",
        firstAttemptRequired: true,
        hintPolicy: "NONE",
        feedbackPolicy: "BATCH_AFTER_GROUP",
        independentGroupId: "blind-group",
      }),
      item("generation-2", {
        stage: "produce",
        itemType: "SENTENCE_GENERATION",
        evidenceOpportunity: "INDEPENDENT_GENERATION",
        expectedTotalSeconds: 300,
        contextId: "courses-place-pressure",
        firstAttemptRequired: true,
        hintPolicy: "NONE",
        feedbackPolicy: "BATCH_AFTER_GROUP",
        independentGroupId: "blind-group",
      }),
    ],
  };
  const application: LessonBlock = {
    id: "application-block",
    objectiveId: objective.id,
    kind: "INTEGRATED",
    path: "CORE",
    order: 2,
    timeBudgetSeconds: 1440,
    items: [
      item("paragraph", {
        blockId: "application-block",
        stage: "near_transfer",
        itemType: "INTEGRATED_APPLICATION",
        evidenceOpportunity: "INTEGRATED_APPLICATION",
        expectedTotalSeconds: 780,
        criteria: [
          {
            objectiveId: objective.id,
            skillId: objective.skillId,
            rubric: "Use one meaning-accurate and natural pressure expression.",
            passingScore: 0.8,
          },
        ],
      }),
      item("self-check", {
        blockId: "application-block",
        stage: "self_check",
        itemType: "SELF_CHECK",
        evidenceOpportunity: "SELF_CHECK",
        expectedTotalSeconds: 360,
      }),
      item("exit", {
        blockId: "application-block",
        stage: "near_transfer",
        itemType: "EXIT_TEST",
        evidenceOpportunity: "EXIT_TEST",
        expectedTotalSeconds: 300,
        firstAttemptRequired: true,
        hintPolicy: "NONE",
        unseenSurfaceForm: true,
      }),
    ],
  };
  const breakBlock: LessonBlock = {
    id: "break-block",
    kind: "BREAK",
    path: "CORE",
    order: 1,
    timeBudgetSeconds: 180,
    items: [],
  };
  const flex: LessonBlock = {
    id: "flex-block",
    objectiveId: objective.id,
    kind: "CORE",
    path: "FLEX",
    order: 3,
    timeBudgetSeconds: 900,
    items: [
      item("remedial-1", {
        blockId: "flex-block",
        stage: "control",
        itemType: "CONSTRAINED_REWRITE",
        evidenceOpportunity: "OTHER",
        expectedTotalSeconds: 450,
        isReserve: true,
      }),
      item("remedial-2", {
        blockId: "flex-block",
        stage: "produce",
        itemType: "SENTENCE_GENERATION",
        evidenceOpportunity: "OTHER",
        expectedTotalSeconds: 450,
        isReserve: true,
      }),
    ],
  };
  const optional: LessonBlock = {
    id: "optional-block",
    objectiveId: objective.id,
    kind: "REVIEW",
    path: "OPTIONAL",
    order: 4,
    timeBudgetSeconds: 600,
    items: [
      item("optional-transfer", {
        blockId: "optional-block",
        stage: "near_transfer",
        itemType: "SENTENCE_GENERATION",
        evidenceOpportunity: "OTHER",
        expectedTotalSeconds: 600,
      }),
    ],
  };
  return {
    schemaVersion: "1.0.0",
    id: "lesson-1",
    trainingCycleId: "cycle-1",
    status: "READY",
    plannedUserSeconds: 3600,
    corePathSeconds: 2700,
    flexiblePathSeconds: 900,
    objectives: [objective],
    blocks: [first, breakBlock, application, flex, optional],
    plannerVersion: "planner-1",
    generatorVersion: "generator-1",
  };
}

describe("lesson validator", () => {
  it("accepts a 45-minute core path, 3-minute break, and alternative flex/optional tail", () => {
    const result = validateLessonPlan(validLesson());
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
    // 2700-second core budget includes the break; exercise time and the active
    // output denominator explicitly exclude its 180 seconds.
    expect(result.metrics.totalSeconds).toBe(2520);
    expect(result.metrics.activeOutputRatio).toBeGreaterThanOrEqual(0.65);
  });

  it("rejects a missing break and answer-by-answer feedback inside the blind generation group", () => {
    const lesson = validLesson();
    const noBreak = {
      ...lesson,
      blocks: lesson.blocks.filter((block) => block.kind !== "BREAK"),
    };
    expect(
      validateLessonPlan(noBreak).issues.some(
        (issue) => issue.code === "MICRO_BREAK",
      ),
    ).toBe(true);

    const leakingBlocks = lesson.blocks.map((block) => ({
      ...block,
      items: block.items.map((exercise) =>
        exercise.id === "generation-1"
          ? { ...exercise, feedbackPolicy: "IMMEDIATE" as const }
          : exercise,
      ),
    }));
    expect(
      validateLessonPlan({ ...lesson, blocks: leakingBlocks }).issues.some(
        (issue) => issue.code === "INDEPENDENT_FEEDBACK_LEAK",
      ),
    ).toBe(true);
  });
});

describe("closed-book rewrite leakage", () => {
  const packet = {
    schemaVersion: "1.0.0",
    rewriteTaskId: "rewrite-1",
    question: {
      prompt: "Discuss the advantages and disadvantages.",
      instructions: "Write at least 250 words.",
    },
    durationMinutes: 40,
    blindDraft: { minutes: 35, showPersonalTargets: false },
    selfCheck: {
      minutes: 5,
      abstractTargets: [
        "Check that comparisons are complete.",
        "Check each causal link.",
      ],
    },
  };

  it("accepts the strict 35+5 allowlist packet", () => {
    expect(validateRewritePacketLeakage(packet)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("rejects V1/feedback fields and protected answer fragments", () => {
    expect(
      validateRewritePacketLeakage({
        ...packet,
        feedback: "Use face less pressure.",
      }).valid,
    ).toBe(false);
    expect(
      validateRewritePacketLeakage(packet, {
        forbiddenSourceFragments: ["Check each causal link."],
      }).issues.some((issue) => issue.code === "SOURCE_FRAGMENT_LEAK"),
    ).toBe(true);
  });
});

describe("much slighter pressure regression guard", () => {
  it("classifies naturalness and perspective without inventing a much + comparative grammar error", () => {
    const issue = classifyMuchSlighterPressure(
      "The pressure from the courses in primary school is much slighter.",
    );
    expect(issue).not.toBeNull();
    expect(issue).toMatchObject({
      skillId: "collocation_perspective",
      category: "NATURALNESS_AND_PERSPECTIVE",
      hardGrammarError: false,
    });
    expect(issue?.grammarNote).toContain("correctly intensify the comparative");
    expect(issue?.grammarNote).not.toContain("cannot");
  });
});
