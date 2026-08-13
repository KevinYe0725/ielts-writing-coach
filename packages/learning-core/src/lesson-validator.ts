import {
  getSkillDefinition,
  validateContract,
  type ExerciseItem,
  type LessonPlan,
  type LearningObjective,
} from "@iwc/learning-contracts";

export interface LessonValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface LessonValidationResult {
  readonly valid: boolean;
  readonly issues: readonly LessonValidationIssue[];
  readonly metrics: {
    readonly totalSeconds: number;
    readonly activeOutputRatio: number;
    readonly recognitionItemRatio: number;
  };
}

const recognitionItemTypes = new Set<ExerciseItem["itemType"]>([
  "MINIMAL_PAIR",
  "ERROR_LOCATION",
  "MEANING_FORK",
  "MATCHING",
  "TASK_TYPE_IDENTIFICATION",
  "RELEVANCE_FILTER",
  "WEIGHING_CHOICE",
  "FUNCTION_LABELING",
  "ORDERING",
  "LINK_RELATION",
]);

function push(
  issues: LessonValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function itemsForObjective(
  items: readonly ExerciseItem[],
  objective: LearningObjective,
): readonly ExerciseItem[] {
  return items.filter((item) => item.learningObjectiveId === objective.id);
}

export function validateLessonPlan(plan: unknown): LessonValidationResult {
  const schemaResult = validateContract("lessonPlan", plan);
  if (!schemaResult.valid) {
    return {
      valid: false,
      issues: schemaResult.issues.map((issue) => ({
        code: `SCHEMA_${issue.keyword.toUpperCase()}`,
        path: issue.instancePath || "/",
        message: issue.message,
      })),
      metrics: {
        totalSeconds: 0,
        activeOutputRatio: 0,
        recognitionItemRatio: 0,
      },
    };
  }

  const lesson = plan as LessonPlan;
  const issues: LessonValidationIssue[] = [];
  const objectivesById = new Map(
    lesson.objectives.map((objective) => [objective.id, objective]),
  );
  const allItems = lesson.blocks.flatMap((block) => block.items);
  // The 65% rule is for the required core learning path. BREAK has no items,
  // while FLEX and OPTIONAL are mutually exclusive post-checkpoint branches.
  const requiredItems = lesson.blocks
    .filter((block) => block.path === "CORE" && block.kind !== "BREAK")
    .flatMap((block) => block.items)
    .filter((item) => !item.isReserve);
  const totalSeconds = requiredItems.reduce(
    (sum, item) => sum + item.expectedTotalSeconds,
    0,
  );
  const activeSeconds = requiredItems.reduce(
    (sum, item) => sum + item.expectedActiveSeconds,
    0,
  );
  const activeOutputRatio =
    totalSeconds === 0 ? 0 : activeSeconds / totalSeconds;
  const recognitionCount = requiredItems.filter((item) =>
    recognitionItemTypes.has(item.itemType),
  ).length;
  const recognitionItemRatio =
    requiredItems.length === 0 ? 0 : recognitionCount / requiredItems.length;

  const coreObjectives = lesson.objectives.filter(
    (objective) => objective.role === "CORE",
  );
  const secondaryObjectives = lesson.objectives.filter(
    (objective) => objective.role === "SECONDARY",
  );
  const reviewObjectives = lesson.objectives.filter(
    (objective) => objective.role === "REVIEW",
  );
  if (coreObjectives.length !== 1) {
    push(
      issues,
      "CORE_OBJECTIVE_COUNT",
      "/objectives",
      "A lesson must contain exactly one core objective.",
    );
  }
  if (secondaryObjectives.length > 1) {
    push(
      issues,
      "SECONDARY_OBJECTIVE_COUNT",
      "/objectives",
      "A lesson may contain at most one secondary objective.",
    );
  }
  if (reviewObjectives.length > 1) {
    push(
      issues,
      "REVIEW_OBJECTIVE_COUNT",
      "/objectives",
      "A lesson may contain at most one prior review objective.",
    );
  }
  if (
    lesson.corePathSeconds + lesson.flexiblePathSeconds !==
    lesson.plannedUserSeconds
  ) {
    push(
      issues,
      "TIME_BUDGET_SUM",
      "/plannedUserSeconds",
      "Core and flexible path budgets must equal planned user time.",
    );
  }
  const coreBlockBudget = lesson.blocks
    .filter((block) => block.path === "CORE")
    .reduce((sum, block) => sum + block.timeBudgetSeconds, 0);
  const remedialBlockBudget = lesson.blocks
    .filter((block) => block.path === "FLEX")
    .reduce((sum, block) => sum + block.timeBudgetSeconds, 0);
  const optionalBlockBudget = lesson.blocks
    .filter((block) => block.path === "OPTIONAL")
    .reduce((sum, block) => sum + block.timeBudgetSeconds, 0);
  const longestExecutablePathBudget =
    coreBlockBudget + Math.max(remedialBlockBudget, optionalBlockBudget);
  if (longestExecutablePathBudget > lesson.plannedUserSeconds) {
    push(
      issues,
      "BLOCK_TIME_OVERFLOW",
      "/blocks",
      "The longest executable block path exceeds the 60-minute lesson budget.",
    );
  }
  // FLEX and OPTIONAL are alternative tail branches; only the longer branch
  // consumes the declared flexible-path clock budget.
  if (
    coreBlockBudget !== lesson.corePathSeconds ||
    Math.max(remedialBlockBudget, optionalBlockBudget) !==
      lesson.flexiblePathSeconds
  ) {
    push(
      issues,
      "PATH_TIME_BUDGET",
      "/blocks",
      "CORE blocks must equal corePathSeconds; the longer alternative FLEX/OPTIONAL branch must equal flexiblePathSeconds.",
    );
  }
  const breakBlocks = lesson.blocks.filter((block) => block.kind === "BREAK");
  if (
    breakBlocks.length !== 1 ||
    breakBlocks[0]?.path !== "CORE" ||
    breakBlocks[0].timeBudgetSeconds !== 180 ||
    breakBlocks[0].items.length !== 0
  ) {
    push(
      issues,
      "MICRO_BREAK",
      "/blocks",
      "The core path must contain exactly one always-active, item-free 180-second BREAK block.",
    );
  }
  const plannedBreakSeconds = breakBlocks.reduce(
    (sum, block) => sum + block.timeBudgetSeconds,
    0,
  );
  if (totalSeconds !== coreBlockBudget - plannedBreakSeconds) {
    push(
      issues,
      "CORE_ITEM_TIME_BUDGET",
      "/blocks",
      "Required CORE exercise seconds must fill the core block budget after excluding BREAK time.",
    );
  }
  for (const [blockIndex, block] of lesson.blocks.entries()) {
    if (block.kind !== "BREAK" && block.items.length === 0) {
      push(
        issues,
        "EMPTY_LEARNING_BLOCK",
        `/blocks/${blockIndex}/items`,
        "Only a BREAK block may contain no exercise items.",
      );
    }
  }
  if (totalSeconds > 3600) {
    push(
      issues,
      "ITEM_TIME_OVERFLOW",
      "/blocks",
      "Required items exceed the 60-minute hard limit.",
    );
  }
  if (activeOutputRatio < 0.65) {
    push(
      issues,
      "ACTIVE_OUTPUT_RATIO",
      "/blocks",
      "Required-path active output must occupy at least 65% of expected user time.",
    );
  }
  if (recognitionCount > 4 || recognitionItemRatio > 0.25) {
    push(
      issues,
      "RECOGNITION_CAP",
      "/blocks",
      "Recognition, selection, and ordering items must be at most four and at most 25% of required items.",
    );
  }

  const itemIds = new Set<string>();
  for (const [blockIndex, block] of lesson.blocks.entries()) {
    for (const [itemIndex, item] of block.items.entries()) {
      const path = `/blocks/${blockIndex}/items/${itemIndex}`;
      if (itemIds.has(item.id)) {
        push(
          issues,
          "DUPLICATE_ITEM_ID",
          `${path}/id`,
          `Duplicate exercise item ID: ${item.id}`,
        );
      }
      itemIds.add(item.id);
      const objective = objectivesById.get(item.learningObjectiveId);
      if (objective === undefined) {
        push(
          issues,
          "UNKNOWN_OBJECTIVE",
          `${path}/learningObjectiveId`,
          "Every item must trace to a lesson objective.",
        );
        continue;
      }
      if (item.primarySkillId !== objective.skillId) {
        push(
          issues,
          "SKILL_OBJECTIVE_MISMATCH",
          `${path}/primarySkillId`,
          "The primary skill must match the referenced objective.",
        );
      }
      const skill = getSkillDefinition(item.primarySkillId);
      if (!skill.allowedItemTypes.includes(item.itemType)) {
        push(
          issues,
          "UNSUPPORTED_ITEM_TYPE",
          `${path}/itemType`,
          `${item.itemType} is not allowed for ${item.primarySkillId}.`,
        );
      }
      if (item.expectedActiveSeconds > item.expectedTotalSeconds) {
        push(
          issues,
          "ACTIVE_TIME_OVERFLOW",
          `${path}/expectedActiveSeconds`,
          "Active seconds cannot exceed total expected seconds.",
        );
      }
      if (
        item.grading.mode === "RUBRIC" &&
        item.grading.minimumConfidence < skill.minimumGradingConfidence
      ) {
        push(
          issues,
          "GRADING_CONFIDENCE_TOO_LOW",
          `${path}/grading/minimumConfidence`,
          "An open-item rubric cannot use a lower confidence gate than its SkillDefinition.",
        );
      }
      if (
        item.itemType === "MEANING_FORK" &&
        item.grading.mode !== "UNSCORED_BRANCH"
      ) {
        push(
          issues,
          "MEANING_FORK_SCORING",
          `${path}/grading`,
          "A meaning fork chooses the intended semantic branch and must not count as correct or incorrect.",
        );
      }
      if (item.evidenceOpportunity === "INDEPENDENT_GENERATION") {
        if (!item.firstAttemptRequired || item.hintPolicy !== "NONE") {
          push(
            issues,
            "INDEPENDENT_NOT_BLIND",
            path,
            "Independent evidence must require a first attempt with no hint.",
          );
        }
        if (
          block.path === "CORE" &&
          (item.feedbackPolicy !== "BATCH_AFTER_GROUP" ||
            item.independentGroupId === undefined)
        ) {
          push(
            issues,
            "INDEPENDENT_FEEDBACK_LEAK",
            path,
            "Core independent generation must use a batch feedback group so one answer cannot leak the next. A bounded FLEX replacement may receive feedback after its single fresh attempt.",
          );
        }
      }
      if (
        ["READY", "ACTIVE", "CORE_COMPLETED"].includes(lesson.status) &&
        !["VALIDATED", "PUBLISHED"].includes(item.qualityStatus)
      ) {
        push(
          issues,
          "UNVALIDATED_ITEM",
          `${path}/qualityStatus`,
          "A released lesson cannot contain an unvalidated item.",
        );
      }
      if (item.criteria !== undefined) {
        for (const criterion of item.criteria) {
          const criterionObjective = objectivesById.get(criterion.objectiveId);
          if (
            criterionObjective === undefined ||
            criterionObjective.skillId !== criterion.skillId
          ) {
            push(
              issues,
              "CRITERION_TRACE_MISMATCH",
              `${path}/criteria`,
              "Every integrated criterion must trace to a matching objective and skill.",
            );
          }
        }
      }
    }
  }

  for (const objective of lesson.objectives) {
    const objectiveItems = itemsForObjective(allItems, objective);
    const reserveCount = objectiveItems.filter((item) => item.isReserve).length;
    if (reserveCount > 2) {
      push(
        issues,
        "RESERVE_ITEM_CAP",
        "/blocks",
        `Objective ${objective.id} has more than two reserve items.`,
      );
    }
  }

  const core = coreObjectives[0];
  if (core !== undefined) {
    const coreItems = itemsForObjective(requiredItems, core);
    const opportunities = (
      kind: ExerciseItem["evidenceOpportunity"],
    ): readonly ExerciseItem[] =>
      coreItems.filter((item) => item.evidenceOpportunity === kind);
    if (opportunities("PRETEST").length === 0) {
      push(
        issues,
        "MISSING_PRETEST",
        "/blocks",
        "The core path must contain a pretest.",
      );
    }
    if (opportunities("CONTROLLED_REPAIR").length === 0) {
      push(
        issues,
        "MISSING_CONTROLLED_REPAIR",
        "/blocks",
        "The core path must contain a controlled repair.",
      );
    }
    const generations = opportunities("INDEPENDENT_GENERATION");
    if (
      generations.length < 2 ||
      new Set(generations.map((item) => item.contextId)).size < 2
    ) {
      push(
        issues,
        "MISSING_DISTINCT_GENERATION",
        "/blocks",
        "The core path needs two no-hint generations in different planner contexts.",
      );
    }
    const grouped = new Map<string, number>();
    for (const item of generations) {
      if (item.independentGroupId !== undefined) {
        grouped.set(
          item.independentGroupId,
          (grouped.get(item.independentGroupId) ?? 0) + 1,
        );
      }
    }
    if (![...grouped.values()].some((count) => count >= 2 && count <= 3)) {
      push(
        issues,
        "INVALID_INDEPENDENT_GROUP",
        "/blocks",
        "At least one independent generation group must contain two or three answers before feedback.",
      );
    }
    const integrated = opportunities("INTEGRATED_APPLICATION").filter(
      (item) =>
        item.criteria?.some(
          (criterion) =>
            criterion.objectiveId === core.id &&
            criterion.skillId === core.skillId,
        ) === true,
    );
    if (integrated.length === 0) {
      push(
        issues,
        "MISSING_INTEGRATED_APPLICATION",
        "/blocks",
        "The core objective needs a separately scored integrated application criterion.",
      );
    }
    if (!integrated.some((item) => item.stage === "near_transfer")) {
      push(
        issues,
        "MISSING_NEAR_TRANSFER",
        "/blocks",
        "The integrated core application must provide an immediate near-transfer opportunity.",
      );
    }
    const exits = opportunities("EXIT_TEST").filter(
      (item) =>
        item.firstAttemptRequired &&
        item.hintPolicy === "NONE" &&
        item.unseenSurfaceForm === true,
    );
    if (exits.length === 0) {
      push(
        issues,
        "MISSING_UNSEEN_EXIT",
        "/blocks",
        "The core path needs a no-hint exit test with an unseen surface form.",
      );
    }
    if (opportunities("SELF_CHECK").length === 0) {
      push(
        issues,
        "MISSING_SELF_CHECK",
        "/blocks",
        "The core path must contain a targeted self-check and revision opportunity.",
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    metrics: { totalSeconds, activeOutputRatio, recognitionItemRatio },
  };
}
