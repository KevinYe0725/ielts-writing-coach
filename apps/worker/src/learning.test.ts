import { describe, expect, it } from "vitest";

import {
  SKILL_IDS,
  type AiIssueJudgment,
  type ExerciseItem,
  type SkillEvidenceEvent,
  type SkillId,
} from "@iwc/learning-contracts";
import {
  evaluateAppliedGate,
  evaluateRetainedGate,
  evaluateTransferredGate,
  validateLessonPlan,
} from "@iwc/learning-core";

import {
  buildCanonicalLessonPlan,
  buildExercisePresentation,
  buildDelayedRewriteEvidence,
  buildExerciseEvidence,
  buildProviderAwareDelayedRewriteEvidence,
  buildProviderAwareExerciseEvidence,
  buildTransferEvidence,
  buildVersionComparisonMetrics,
  canonicalEvidenceFromPayload,
  classifyIssueForPersistence,
  followUpSchedule,
  issueFrequencyPer100Words,
  lessonItemsWithPath,
  verifyComparisonIssueSpans,
  verifyTransferJudgmentEvidence,
  type CanonicalLessonIds,
  type ExerciseEvaluationJudgment,
  type GeneratedLessonContent,
} from "./learning";

const content: GeneratedLessonContent = {
  titleZh: "本轮专项训练",
  objectiveZh: "在不同语境中独立使用目标能力。",
  stages: Array.from({ length: 5 }, (_, index) => ({
    titleZh: `阶段 ${index + 1}`,
    instructionZh: "先独立作答，再查看反馈。",
    promptEn: `Write fresh response ${index + 1}.`,
    minutes: 8,
    responseMode: index === 4 ? "paragraph" : "sentence",
  })),
};

function ids(prefix: string): CanonicalLessonIds {
  return {
    planId: `${prefix}-plan`,
    objectiveId: `${prefix}-objective`,
    secondaryObjectiveId: `${prefix}-secondary-objective`,
    foundationBlockId: `${prefix}-foundation`,
    breakBlockId: `${prefix}-break`,
    applicationBlockId: `${prefix}-application`,
    flexBlockId: `${prefix}-flex`,
    independentGroupId: `${prefix}-blind-group`,
    pretestItemId: `${prefix}-pretest`,
    controlledItemId: `${prefix}-controlled`,
    generationOneItemId: `${prefix}-generation-a`,
    generationTwoItemId: `${prefix}-generation-b`,
    integratedItemId: `${prefix}-integrated`,
    selfCheckItemId: `${prefix}-self-check`,
    exitItemId: `${prefix}-exit`,
    flexRepairItemId: `${prefix}-flex-repair`,
    flexGenerationItemId: `${prefix}-flex-generation`,
  };
}

function plan(skillId: SkillId) {
  return buildCanonicalLessonPlan({
    cycleId: `cycle-${skillId}`,
    skillId,
    sourceEvidenceIds: [`issue-${skillId}`],
    content,
    ids: ids(skillId),
    plannerVersion: "worker-canonical-planner@1.0.0",
    generatorVersion: "exercise-generation@1.0.0",
  });
}

const passingJudgment: ExerciseEvaluationJudgment = {
  passed: true,
  firstAttemptPassed: true,
  confidence: 0.95,
  feedbackZh: "首次独立作答达到目标。",
  evidenceEn: "The target appears correctly in the first answer.",
  dimensionScores: {
    targetCorrectness: 1,
    meaningPreservation: 1,
    naturalness: 0.95,
  },
  criterionResults: [
    {
      id: "target",
      score: 1,
      userAnswerEvidence: ["target evidence"],
    },
  ],
  userAnswerEvidence: ["target evidence"],
  mostImportantSuggestionZh: "继续换语境使用。",
  naturalOpportunity: true,
  coreErrorRecurred: false,
};

describe("canonical worker lesson planner", () => {
  it.each(SKILL_IDS)("builds a valid canonical lesson for %s", (skillId) => {
    const lesson = plan(skillId);
    const result = validateLessonPlan(lesson);
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
    expect(lesson.plannedUserSeconds).toBe(3_600);
    expect(lesson.corePathSeconds).toBe(2_700);
    expect(lesson.flexiblePathSeconds).toBe(900);
    expect(result.metrics.totalSeconds).toBe(2_520);
    expect(
      lesson.blocks
        .filter((block) => block.path === "FLEX")
        .flatMap((block) => block.items)
        .reduce((seconds, item) => seconds + item.expectedTotalSeconds, 0),
    ).toBe(900);
    expect(result.metrics.activeOutputRatio).toBeGreaterThanOrEqual(0.65);
    expect(result.metrics.recognitionItemRatio).toBeLessThanOrEqual(0.25);
    expect(lesson.blocks).toContainEqual(
      expect.objectContaining({
        kind: "BREAK",
        path: "CORE",
        timeBudgetSeconds: 180,
        items: [],
      }),
    );
    const blindGenerations = lesson.blocks
      .filter((block) => block.path === "CORE")
      .flatMap((block) => block.items)
      .filter((item) => item.evidenceOpportunity === "INDEPENDENT_GENERATION");
    expect(blindGenerations).toHaveLength(2);
    expect(blindGenerations.every((item) => item.firstAttemptRequired)).toBe(
      true,
    );
    expect(blindGenerations.every((item) => item.hintPolicy === "NONE")).toBe(
      true,
    );
    expect(
      blindGenerations.every(
        (item) => item.feedbackPolicy === "BATCH_AFTER_GROUP",
      ),
    ).toBe(true);
    const remedialReplacement = lesson.blocks
      .filter((block) => block.path === "FLEX")
      .flatMap((block) => block.items)
      .find((item) => item.evidenceOpportunity === "INDEPENDENT_GENERATION");
    expect(remedialReplacement).toMatchObject({
      firstAttemptRequired: true,
      hintPolicy: "NONE",
      feedbackPolicy: "AFTER_SUBMISSION",
    });
    const projected = lessonItemsWithPath(lesson);
    expect(projected.filter(({ path }) => path === "CORE")).toHaveLength(7);
    expect(projected.filter(({ path }) => path === "FLEX")).toHaveLength(2);
    expect(projected.filter(({ path }) => path === "OPTIONAL")).toHaveLength(0);
  });

  it("maps every required exercise form to a genuine interaction contract", () => {
    const base = plan("collocation_perspective").blocks.flatMap(
      (block) => block.items,
    )[0]!;
    const stage: GeneratedLessonContent["stages"][number] = {
      titleZh: "形式",
      instructionZh: "完成题目",
      promptEn: "Complete the target.",
      minutes: 6,
      responseMode: "sentence",
      sourceText: "The pressure from the courses is much slighter.",
      options: [
        {
          id: "a",
          labelZh: "意思 A",
          labelEn: "meaning A",
          confusionZh: "混淆 A",
        },
        {
          id: "b",
          labelZh: "意思 B",
          labelEn: "meaning B",
          confusionZh: "混淆 B",
        },
      ],
      acceptedAnswers: ["b"],
      mappingPairs: [
        { left: "压力较小", right: "face less pressure" },
        { left: "学习压力", right: "academic pressure" },
      ],
      slotLabels: ["subject", "verb", "object"],
      validOrders: ["children face less pressure"],
      branchPromptA: "Write about workload.",
      branchPromptB: "Write about course difficulty.",
      branchPromptC: "Write about both.",
      rubricCriteria: ["Use the target naturally."],
    };
    const formFor = (itemType: ExerciseItem["itemType"]) =>
      buildExercisePresentation({ item: { ...base, itemType }, stage }).form;
    expect(formFor("ERROR_LOCATION")).toBe("SPOTLIGHT");
    expect(formFor("MEANING_FORK")).toBe("MEANING_FORK");
    expect(formFor("EXPRESSION_MAP")).toBe("EXPRESSION_MAP");
    expect(formFor("MINIMAL_PAIR")).toBe("MINIMAL_CONTRAST");
    expect(formFor("SKELETON_COMPLETION")).toBe("SKELETON");
    expect(formFor("SENTENCE_GENERATION")).toBe("OPEN_GENERATION");
    expect(formFor("CAUSAL_CHAIN")).toBe("ARGUMENT_CHAIN");
    expect(formFor("INTEGRATED_APPLICATION")).toBe("PARAGRAPH_LAB");
    expect(
      buildExercisePresentation({
        item: { ...base, itemType: "SELF_CHECK" },
        stage,
        revisionSourceItemId: "paragraph-lab",
      }),
    ).toMatchObject({
      form: "TARGETED_SELF_CHECK",
      responseMode: "revision",
      minimumWords: 80,
      maximumWords: 120,
      revisionSourceItemId: "paragraph-lab",
    });
  });

  it("uses explicit deterministic answers for closed cards and rubric criteria for open cards", () => {
    const grammar = plan("complete_comparison");
    const items = grammar.blocks.flatMap((block) => block.items);
    expect(
      items.find((item) => item.itemType === "MINIMAL_PAIR")?.grading,
    ).toMatchObject({
      mode: "DETERMINISTIC",
      acceptedAnswers: expect.any(Array),
    });
    expect(
      items.find((item) => item.itemType === "SENTENCE_GENERATION")?.grading,
    ).toMatchObject({ mode: "RUBRIC", criteria: expect.any(Array) });

    const lexical = plan("collocation_perspective");
    expect(
      lexical.blocks
        .flatMap((block) => block.items)
        .find((item) => item.itemType === "MEANING_FORK")?.grading,
    ).toMatchObject({ mode: "UNSCORED_BRANCH", branchIds: expect.any(Array) });
  });

  it("traces every paragraph-lab criterion when a secondary objective is available", () => {
    const lesson = buildCanonicalLessonPlan({
      cycleId: "cycle-multi-objective",
      skillId: "collocation_perspective",
      sourceEvidenceIds: ["issue-core"],
      secondaryObjective: {
        skillId: "mechanism_chain",
        sourceEvidenceIds: ["issue-secondary"],
      },
      content,
      ids: ids("multi-objective"),
      plannerVersion: "worker-canonical-planner@1.0.0",
      generatorVersion: "exercise-generation@1.0.0",
    });
    const paragraph = lesson.blocks
      .flatMap((block) => block.items)
      .find((item) => item.itemType === "INTEGRATED_APPLICATION");
    expect(lesson.objectives).toHaveLength(2);
    expect(paragraph?.criteria).toHaveLength(2);
    expect(paragraph?.grading).toMatchObject({
      mode: "RUBRIC",
      criteria: expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringContaining("mechanism_chain"),
        }),
      ]),
    });
    expect(validateLessonPlan(lesson).valid).toBe(true);
  });
});

describe("issue persistence categories", () => {
  function issue(
    skillId: SkillId,
    excerpt = "example",
    diagnosis = "Review this issue.",
  ): AiIssueJudgment {
    return {
      skillId,
      startOffset: 0,
      endOffset: excerpt.length,
      excerpt,
      diagnosis,
      issueType: "LOGIC",
      correctedVersion: excerpt,
      explanationZh: "解释这一问题。",
      knowledgePointZh: "总结这个知识点。",
      transferRuleZh: "下次写作时检查。",
      severity: "MEDIUM",
      confidence: 0.9,
    };
  }

  it.each([
    ["word_form_precision", "LEXICAL_PRECISION"],
    ["task_instruction_coverage", "TASK_COVERAGE"],
    ["mechanism_chain", "ARGUMENT_DEVELOPMENT"],
    ["development_relevance", "ARGUMENT_DEVELOPMENT"],
    ["weighing_qualification", "ARGUMENT_DEVELOPMENT"],
    ["paragraph_function_order", "COHESION_ORGANIZATION"],
    ["reference_linking", "COHESION_ORGANIZATION"],
  ] as const)(
    "maps %s to the stable %s category without calling it hard grammar",
    (skillId, category) => {
      expect(classifyIssueForPersistence(issue(skillId))).toEqual(
        expect.objectContaining({
          skillId,
          categories: [category],
          hardGrammarError: false,
        }),
      );
    },
  );

  it("keeps true GRA issues separate and protects much + comparative", () => {
    expect(
      classifyIssueForPersistence(issue("subject_verb_agreement")),
    ).toEqual(
      expect.objectContaining({
        categories: ["HARD_GRAMMAR_ERROR"],
        hardGrammarError: true,
      }),
    );
    const comparative = classifyIssueForPersistence(
      issue(
        "complete_comparison",
        "much slighter pressure",
        "The phrase uses much + comparative.",
      ),
    );
    expect(comparative).toEqual(
      expect.objectContaining({
        skillId: "collocation_perspective",
        hardGrammarError: false,
        categories: [
          "COLLOCATION_NATURALNESS",
          "CHINESE_INFORMATION_ORGANIZATION",
        ],
      }),
    );
    expect(comparative.diagnosis).toContain("grammatically valid");
  });
});

describe("exercise evidence and applied gate", () => {
  it("updates eligibility only after every hard evidence opportunity passes", () => {
    const lesson = plan("collocation_perspective");
    const items = lesson.blocks.flatMap((block) => block.items);
    const gateItems = [
      ...items.filter(
        (item) => item.evidenceOpportunity === "INDEPENDENT_GENERATION",
      ),
      items.find(
        (item) => item.evidenceOpportunity === "INTEGRATED_APPLICATION",
      ),
      items.find((item) => item.evidenceOpportunity === "EXIT_TEST"),
    ].filter((item): item is ExerciseItem => item !== undefined);
    const evidence = gateItems.map((item, index) =>
      buildExerciseEvidence({
        id: `evidence-${index}`,
        userId: "learner-1",
        attemptId: `attempt-${index}`,
        objectiveId: lesson.objectives[0]?.id ?? "objective",
        item,
        topicId: "education",
        hintsUsed: 0,
        hintLevel: "NONE",
        referenceAnswerSeen: false,
        occurredAt: new Date("2026-08-13T12:00:00.000Z"),
        judgment: passingJudgment,
      }),
    );
    expect(
      evaluateAppliedGate("collocation_perspective", evidence).passed,
    ).toBe(true);
    expect(
      evaluateAppliedGate("collocation_perspective", evidence.slice(0, -1))
        .passed,
    ).toBe(false);

    const hinted = buildExerciseEvidence({
      id: "hinted",
      userId: "learner-1",
      attemptId: "hinted-attempt",
      objectiveId: lesson.objectives[0]?.id ?? "objective",
      item: gateItems[0]!,
      topicId: "education",
      hintsUsed: 1,
      hintLevel: "KEYWORD",
      referenceAnswerSeen: false,
      occurredAt: new Date("2026-08-13T12:00:00.000Z"),
      judgment: passingJudgment,
    });
    expect(hinted.independent).toBe(false);
    const integrated = gateItems.find(
      (item) => item.evidenceOpportunity === "INTEGRATED_APPLICATION",
    )!;
    const noOpportunity = buildExerciseEvidence({
      id: "integrated-no-opportunity",
      userId: "learner-1",
      attemptId: "integrated-no-opportunity-attempt",
      objectiveId: lesson.objectives[0]?.id ?? "objective",
      item: integrated,
      topicId: "education",
      hintsUsed: 0,
      hintLevel: "NONE",
      referenceAnswerSeen: false,
      occurredAt: new Date("2026-08-13T12:00:00.000Z"),
      judgment: {
        ...passingJudgment,
        passed: false,
        firstAttemptPassed: false,
        naturalOpportunity: false,
      },
    });
    expect(noOpportunity.outcome).toBe("NO_OPPORTUNITY");
    expect(
      canonicalEvidenceFromPayload({
        canonicalEvidence: evidence[0],
      }) satisfies SkillEvidenceEvent | null,
    ).toEqual(evidence[0]);
  });

  it("never treats deterministic Mock language output as mastery evidence", () => {
    const lesson = plan("collocation_perspective");
    const item = lesson.blocks
      .flatMap((block) => block.items)
      .find(
        (candidate) =>
          candidate.evidenceOpportunity === "INDEPENDENT_GENERATION",
      );
    expect(item).toBeDefined();
    const mockEvidence = buildProviderAwareExerciseEvidence({
      id: "mock-evidence",
      userId: "learner-1",
      attemptId: "mock-attempt",
      objectiveId: lesson.objectives[0]?.id ?? "objective",
      item: item!,
      topicId: "education",
      hintsUsed: 0,
      hintLevel: "NONE",
      referenceAnswerSeen: false,
      occurredAt: new Date("2026-08-13T12:00:00.000Z"),
      judgment: passingJudgment,
      providerKind: "mock",
    });
    expect(mockEvidence.outcome).toBe("PASS");
    expect(mockEvidence.validForStateTransition).toBe(false);
    expect(
      evaluateAppliedGate("collocation_perspective", [mockEvidence]).passed,
    ).toBe(false);
  });
});

describe("delayed comparison and follow-up scheduling", () => {
  const judgment = {
    targetApplied: true,
    naturalOpportunity: true,
    confidence: 0.95,
    improvementsZh: ["目标表达更自然。"],
    regressionsZh: [],
    evidenceV2: "qualifying evidence",
    coreIssueSpansV1: [],
    coreIssueSpansV2: [],
  };

  function delayed(
    hours: number,
    assisted = false,
    prerequisiteSkipped = false,
  ) {
    return buildDelayedRewriteEvidence({
      id: `delayed-${hours}-${assisted}`,
      userId: "learner-1",
      skillId: "collocation_perspective",
      objectiveId: "objective-1",
      cycleId: "cycle-1",
      rewriteTaskId: "rewrite-1",
      topicId: "education",
      submittedAt: new Date(Date.UTC(2026, 7, 13, 12 + hours)),
      instructionExposureAt: new Date("2026-08-13T12:00:00.000Z"),
      assisted,
      prerequisiteSkipped,
      judgment,
    });
  }

  it("requires real elapsed time and independent output for retained", () => {
    expect(
      evaluateRetainedGate("collocation_perspective", "applied", [delayed(24)])
        .passed,
    ).toBe(true);
    expect(
      evaluateRetainedGate("collocation_perspective", "applied", [delayed(23)])
        .passed,
    ).toBe(false);
    expect(
      evaluateRetainedGate("collocation_perspective", "applied", [
        delayed(24, true),
      ]).passed,
    ).toBe(false);
    expect(
      evaluateRetainedGate("collocation_perspective", "practicing", [
        delayed(24),
      ]).passed,
    ).toBe(false);
    expect(
      evaluateRetainedGate("collocation_perspective", "applied", [
        delayed(24, false, true),
      ]).passed,
    ).toBe(false);
  });

  it("never awards retained from deterministic Mock comparison output", () => {
    const mockEvidence = buildProviderAwareDelayedRewriteEvidence({
      id: "mock-delayed",
      userId: "learner-1",
      skillId: "collocation_perspective",
      objectiveId: "objective-1",
      cycleId: "cycle-1",
      rewriteTaskId: "rewrite-1",
      topicId: "education",
      submittedAt: new Date("2026-08-14T12:00:00.000Z"),
      instructionExposureAt: new Date("2026-08-13T12:00:00.000Z"),
      assisted: false,
      prerequisiteSkipped: false,
      judgment,
      providerKind: "mock",
    });

    expect(mockEvidence.outcome).toBe("PASS");
    expect(mockEvidence.validForStateTransition).toBe(false);
    expect(
      evaluateRetainedGate("collocation_perspective", "applied", [mockEvidence])
        .passed,
    ).toBe(false);
  });

  it("verifies exact non-overlapping issue spans before normalizing recurrence", () => {
    const essay = "One issue appears, and another issue appears.";
    const spans = verifyComparisonIssueSpans(essay, [
      { startOffset: 4, endOffset: 9, excerpt: "issue" },
      { startOffset: 4, endOffset: 9, excerpt: "issue" },
      { startOffset: 31, endOffset: 36, excerpt: "issue" },
      { startOffset: 0, endOffset: 3, excerpt: "wrong" },
    ]);

    expect(spans).toEqual([
      { startOffset: 4, endOffset: 9, excerpt: "issue" },
      { startOffset: 31, endOffset: 36, excerpt: "issue" },
    ]);
    expect(issueFrequencyPer100Words(2, 250)).toBe(0.8);
  });

  it("computes four-criterion, overall, and per-100-word deltas deterministically", () => {
    const metrics = buildVersionComparisonMetrics({
      scoringVersion: {
        schemaVersion: "1.0.0",
        promptVersion: "1.0.0",
        rubricVersion: "iwc-task2-rubric-1.0.0",
        model: "frozen-model",
      },
      v1Scores: { overall: 6, TR: 6, CC: 5.5, LR: 6, GRA: 6 },
      v2Scores: { overall: 6.5, TR: 6.5, CC: 6, LR: 6.5, GRA: 6.5 },
      v1WordCount: 250,
      v2WordCount: 275,
      v2BlindWordCount: 250,
      v1IssueSpans: [
        { startOffset: 1, endOffset: 2, excerpt: "x" },
        { startOffset: 3, endOffset: 4, excerpt: "y" },
      ],
      v2IssueSpans: [{ startOffset: 5, endOffset: 6, excerpt: "z" }],
      evidenceVerified: true,
    });

    expect(metrics.overall).toEqual({ v1: 6, v2: 6.5, delta: 0.5 });
    expect(metrics.criteria).toMatchObject({
      TR: { delta: 0.5 },
      CC: { delta: 0.5 },
      LR: { delta: 0.5 },
      GRA: { delta: 0.5 },
    });
    expect(metrics.coreIssueRecurrence).toEqual({
      v1Occurrences: 2,
      v2Occurrences: 1,
      v1Per100Words: 0.8,
      v2Per100Words: 0.4,
      deltaPer100Words: -0.4,
      recurred: true,
      evidenceVerified: true,
    });
  });

  it("records a missing natural opportunity without manufacturing a failure", () => {
    const evidence = buildDelayedRewriteEvidence({
      id: "delayed-no-opportunity",
      userId: "learner-1",
      skillId: "collocation_perspective",
      objectiveId: "objective-1",
      cycleId: "cycle-1",
      rewriteTaskId: "rewrite-1",
      topicId: "education",
      submittedAt: new Date("2026-08-14T12:00:00.000Z"),
      instructionExposureAt: new Date("2026-08-13T12:00:00.000Z"),
      assisted: false,
      prerequisiteSkipped: false,
      judgment: {
        ...judgment,
        targetApplied: false,
        naturalOpportunity: false,
      },
    });
    expect(evidence.outcome).toBe("NO_OPPORTUNITY");
    const gate = evaluateRetainedGate("collocation_perspective", "applied", [
      evidence,
    ]);
    expect(gate.passed).toBe(false);
    expect(gate.noOpportunity).toBe(true);
  });

  it("anchors D5-D7 and D14 to cycle.startedAt", () => {
    const schedule = followUpSchedule(new Date("2026-08-13T08:00:00.000Z"));
    expect(schedule.transferAvailableAt.toISOString()).toBe(
      "2026-08-18T08:00:00.000Z",
    );
    expect(schedule.transferExpiresAt.toISOString()).toBe(
      "2026-08-20T08:00:00.000Z",
    );
    expect(schedule.mixedReviewDueAt.toISOString()).toBe(
      "2026-08-27T08:00:00.000Z",
    );
  });
});

describe("cross-topic transfer evidence", () => {
  const judgment = {
    targetApplied: true,
    naturalOpportunity: true,
    confidence: 0.95,
    feedbackZh: "目标能力在陌生话题中自然出现。",
    feedbackEn: "The target skill appeared naturally on the new topic.",
    evidenceEn: "qualifying span",
    dimensionScores: {
      targetCorrectness: 0.95,
      meaningPreservation: 0.95,
      naturalness: 0.9,
    },
    userAnswerEvidence: ["qualifying span"],
    mostImportantSuggestionZh: "继续迁移到新话题。",
  };

  function transfer(providerKind = "openai", naturalOpportunity = true) {
    return buildTransferEvidence({
      id: `transfer-evidence-${providerKind}-${naturalOpportunity}`,
      userId: "learner-1",
      skillId: "collocation_perspective",
      objectiveId: "objective-1",
      transferTaskId: "transfer-task-1",
      responseId: "transfer-response-1",
      topicId: "health",
      submittedAt: new Date("2026-08-18T12:00:00.000Z"),
      providerKind,
      judgment: { ...judgment, naturalOpportunity },
    });
  }

  it("passes only after retained evidence, on another topic, without hints", () => {
    const evidence = transfer();
    expect(
      evaluateTransferredGate(
        "collocation_perspective",
        "retained",
        "education",
        [evidence],
      ).passed,
    ).toBe(true);
    expect(
      evaluateTransferredGate(
        "collocation_perspective",
        "applied",
        "education",
        [evidence],
      ).passed,
    ).toBe(false);
    expect(
      evaluateTransferredGate("collocation_perspective", "retained", "health", [
        evidence,
      ]).passed,
    ).toBe(false);
  });

  it("treats no opportunity as neutral and never promotes Mock evidence", () => {
    const noOpportunity = transfer("openai", false);
    const neutralGate = evaluateTransferredGate(
      "collocation_perspective",
      "retained",
      "education",
      [noOpportunity],
    );
    expect(noOpportunity.outcome).toBe("NO_OPPORTUNITY");
    expect(neutralGate.noOpportunity).toBe(true);
    expect(neutralGate.passed).toBe(false);

    const mock = transfer("mock");
    expect(mock.validForStateTransition).toBe(false);
    expect(
      evaluateTransferredGate(
        "collocation_perspective",
        "retained",
        "education",
        [mock],
      ).passed,
    ).toBe(false);

    const lowConfidence = buildTransferEvidence({
      id: "transfer-evidence-low-confidence",
      userId: "learner-1",
      skillId: "collocation_perspective",
      transferTaskId: "transfer-task-1",
      responseId: "transfer-response-low-confidence",
      topicId: "health",
      submittedAt: new Date("2026-08-18T12:00:00.000Z"),
      providerKind: "openai",
      judgment: { ...judgment, confidence: 0.5 },
    });
    expect(lowConfidence.validForStateTransition).toBe(false);
    expect(
      evaluateTransferredGate(
        "collocation_perspective",
        "retained",
        "education",
        [lowConfidence],
      ).passed,
    ).toBe(false);
  });

  it("refuses a PASS whose quoted evidence is not in the immutable first answer", () => {
    const hallucinated = verifyTransferJudgmentEvidence(
      "Pupils face less academic pressure in primary school.",
      {
        ...judgment,
        userAnswerEvidence: ["Students experience a lighter workload."],
      },
    );
    expect(hallucinated.targetApplied).toBe(false);
    expect(hallucinated.userAnswerEvidence).toEqual([]);

    const verified = verifyTransferJudgmentEvidence(
      "Pupils face less academic pressure in primary school.",
      {
        ...judgment,
        userAnswerEvidence: ["face less academic pressure"],
      },
    );
    expect(verified.targetApplied).toBe(true);
    expect(verified.userAnswerEvidence).toEqual([
      "face less academic pressure",
    ]);
  });
});
