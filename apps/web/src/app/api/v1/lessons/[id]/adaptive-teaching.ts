import {
  validateFocusedLearningPackage,
  type AdaptiveTeachingModule,
  type FocusedLearningPackage,
  type PracticePaperContent,
  type PracticePaperItemContent,
  type TeachingBlock,
  type TeachingBlockKind,
  type TeachingBlueprint,
  type TeachingPracticePrompt,
  type TeachingSection,
} from "@iwc/worker/focused-learning";

type UnknownRecord = Record<string, unknown>;

const teachingBlockKinds = new Set<TeachingBlockKind>([
  "EXPLANATION",
  "CONTRAST",
  "REASONING",
  "TOOLKIT",
  "PITFALLS",
  "PRACTICE",
  "SUMMARY",
]);
const difficultyTypes = new Set([
  "CONCEPT_GAP",
  "RECOGNISES_BUT_CANNOT_REVISE",
  "REVISES_BUT_CANNOT_GENERATE",
  "SAME_CONTEXT_ONLY",
  "UNSTABLE_CONTROL",
]);
const paperSections = new Set([
  "FOUNDATION",
  "REPAIR",
  "GENERATION",
  "INTEGRATION",
]);
const paperResponseModes = new Set([
  "choice",
  "short_text",
  "sentence",
  "paragraph",
]);

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : null;
}

function projectArray<T>(
  value: unknown,
  project: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const output: T[] = [];
  for (const item of value) {
    const projected = project(item);
    if (projected === null) return null;
    output.push(projected);
  }
  return output;
}

function projectTeachingPrompt(value: unknown): TeachingPracticePrompt | null {
  const prompt = asRecord(value);
  if (!prompt) return null;
  const id = asString(prompt.id);
  const instructionZh = asString(prompt.instructionZh);
  const instructionEn = asString(prompt.instructionEn);
  const promptEn = asString(prompt.promptEn);
  const responseMode = asString(prompt.responseMode);
  const context = asString(prompt.context);
  const optionsEn = asStringArray(prompt.optionsEn);
  const referenceAnswerEn = asString(prompt.referenceAnswerEn);
  const referenceReasoningZh = asString(prompt.referenceReasoningZh);
  const referenceReasoningEn = asString(prompt.referenceReasoningEn);
  if (
    id === null ||
    instructionZh === null ||
    instructionEn === null ||
    promptEn === null ||
    (responseMode !== "CHOICE" && responseMode !== "SHORT_TEXT") ||
    (context !== "SAME_TOPIC" && context !== "UNSEEN_TOPIC") ||
    optionsEn === null ||
    referenceAnswerEn === null ||
    referenceReasoningZh === null ||
    referenceReasoningEn === null
  )
    return null;
  return {
    id,
    instructionZh,
    instructionEn,
    promptEn,
    responseMode,
    context,
    optionsEn,
    referenceAnswerEn,
    referenceReasoningZh,
    referenceReasoningEn,
  };
}

function projectTeachingBlock(value: unknown): TeachingBlock | null {
  const block = asRecord(value);
  if (!block) return null;
  const kind = asString(block.kind);
  const titleZh = asString(block.titleZh);
  const titleEn = asString(block.titleEn);
  if (
    kind === null ||
    !teachingBlockKinds.has(kind as TeachingBlockKind) ||
    titleZh === null ||
    titleEn === null
  )
    return null;
  switch (kind) {
    case "EXPLANATION": {
      const paragraphsZh = asStringArray(block.paragraphsZh);
      const paragraphsEn = asStringArray(block.paragraphsEn);
      const keyPointZh = asString(block.keyPointZh);
      const keyPointEn = asString(block.keyPointEn);
      return paragraphsZh &&
        paragraphsEn &&
        keyPointZh !== null &&
        keyPointEn !== null
        ? {
            kind,
            titleZh,
            titleEn,
            paragraphsZh,
            paragraphsEn,
            keyPointZh,
            keyPointEn,
          }
        : null;
    }
    case "CONTRAST": {
      const weakExampleEn = asString(block.weakExampleEn);
      const strongExampleEn = asString(block.strongExampleEn);
      const differenceZh = asString(block.differenceZh);
      const differenceEn = asString(block.differenceEn);
      return weakExampleEn !== null &&
        strongExampleEn !== null &&
        differenceZh !== null &&
        differenceEn !== null
        ? {
            kind,
            titleZh,
            titleEn,
            weakExampleEn,
            strongExampleEn,
            differenceZh,
            differenceEn,
          }
        : null;
    }
    case "REASONING": {
      const scenarioZh = asString(block.scenarioZh);
      const scenarioEn = asString(block.scenarioEn);
      const steps = projectArray(block.steps, (value) => {
        const step = asRecord(value);
        const thinkingZh = asString(step?.thinkingZh);
        const thinkingEn = asString(step?.thinkingEn);
        return step && thinkingZh !== null && thinkingEn !== null
          ? { thinkingZh, thinkingEn }
          : null;
      });
      const resultEn = asString(block.resultEn);
      const takeawayZh = asString(block.takeawayZh);
      const takeawayEn = asString(block.takeawayEn);
      return scenarioZh !== null &&
        scenarioEn !== null &&
        steps !== null &&
        resultEn !== null &&
        takeawayZh !== null &&
        takeawayEn !== null
        ? {
            kind,
            titleZh,
            titleEn,
            scenarioZh,
            scenarioEn,
            steps,
            resultEn,
            takeawayZh,
            takeawayEn,
          }
        : null;
    }
    case "TOOLKIT": {
      const tools = projectArray(block.tools, (value) => {
        const tool = asRecord(value);
        if (!tool) return null;
        const expressionEn = asString(tool.expressionEn);
        const functionZh = asString(tool.functionZh);
        const functionEn = asString(tool.functionEn);
        const conditionZh = asString(tool.conditionZh);
        const conditionEn = asString(tool.conditionEn);
        const cautionZh = asString(tool.cautionZh);
        const cautionEn = asString(tool.cautionEn);
        const exampleEn = asString(tool.exampleEn);
        return expressionEn !== null &&
          functionZh !== null &&
          functionEn !== null &&
          conditionZh !== null &&
          conditionEn !== null &&
          cautionZh !== null &&
          cautionEn !== null &&
          exampleEn !== null
          ? {
              expressionEn,
              functionZh,
              functionEn,
              conditionZh,
              conditionEn,
              cautionZh,
              cautionEn,
              exampleEn,
            }
          : null;
      });
      return tools ? { kind, titleZh, titleEn, tools } : null;
    }
    case "PITFALLS": {
      const items = projectArray(block.items, (value) => {
        const item = asRecord(value);
        if (!item) return null;
        const patternEn = asString(item.patternEn);
        const problemZh = asString(item.problemZh);
        const problemEn = asString(item.problemEn);
        const betterEn = asString(item.betterEn);
        return patternEn !== null &&
          problemZh !== null &&
          problemEn !== null &&
          betterEn !== null
          ? { patternEn, problemZh, problemEn, betterEn }
          : null;
      });
      return items ? { kind, titleZh, titleEn, items } : null;
    }
    case "PRACTICE": {
      const prompts = projectArray(block.prompts, projectTeachingPrompt);
      return prompts ? { kind, titleZh, titleEn, prompts } : null;
    }
    case "SUMMARY": {
      const rulesZh = asStringArray(block.rulesZh);
      const rulesEn = asStringArray(block.rulesEn);
      const selfCheckZh = asString(block.selfCheckZh);
      const selfCheckEn = asString(block.selfCheckEn);
      return rulesZh && rulesEn && selfCheckZh !== null && selfCheckEn !== null
        ? {
            kind,
            titleZh,
            titleEn,
            rulesZh,
            rulesEn,
            selfCheckZh,
            selfCheckEn,
          }
        : null;
    }
  }
  return null;
}

function projectTeachingSection(value: unknown): TeachingSection | null {
  const section = asRecord(value);
  if (!section) return null;
  const anchor = asString(section.anchor);
  const titleZh = asString(section.titleZh);
  const titleEn = asString(section.titleEn);
  const blocks = projectArray(section.blocks, projectTeachingBlock);
  return anchor !== null &&
    titleZh !== null &&
    titleEn !== null &&
    blocks !== null
    ? { anchor, titleZh, titleEn, blocks }
    : null;
}

function projectTeachingBlueprint(value: unknown): TeachingBlueprint | null {
  const blueprint = asRecord(value);
  if (!blueprint) return null;
  const coreAbilityZh = asString(blueprint.coreAbilityZh);
  const coreAbilityEn = asString(blueprint.coreAbilityEn);
  const difficultyType = asString(blueprint.difficultyType);
  const completionStandardZh = asString(blueprint.completionStandardZh);
  const completionStandardEn = asString(blueprint.completionStandardEn);
  const prerequisiteAbilityZh = asString(blueprint.prerequisiteAbilityZh);
  const prerequisiteAbilityEn = asString(blueprint.prerequisiteAbilityEn);
  const supportingAbilityZh = asString(blueprint.supportingAbilityZh);
  const supportingAbilityEn = asString(blueprint.supportingAbilityEn);
  const selectedBlockKinds = asStringArray(blueprint.selectedBlockKinds);
  if (
    coreAbilityZh === null ||
    coreAbilityEn === null ||
    difficultyType === null ||
    !difficultyTypes.has(difficultyType) ||
    completionStandardZh === null ||
    completionStandardEn === null ||
    prerequisiteAbilityZh === null ||
    prerequisiteAbilityEn === null ||
    supportingAbilityZh === null ||
    supportingAbilityEn === null ||
    selectedBlockKinds === null ||
    !selectedBlockKinds.every((kind) =>
      teachingBlockKinds.has(kind as TeachingBlockKind),
    )
  )
    return null;
  return {
    coreAbilityZh,
    coreAbilityEn,
    difficultyType: difficultyType as TeachingBlueprint["difficultyType"],
    completionStandardZh,
    completionStandardEn,
    prerequisiteAbilityZh,
    prerequisiteAbilityEn,
    supportingAbilityZh,
    supportingAbilityEn,
    selectedBlockKinds: selectedBlockKinds as TeachingBlockKind[],
  };
}

function projectTeachingModule(value: unknown): AdaptiveTeachingModule | null {
  const module = asRecord(value);
  if (!module || module.format !== "ADAPTIVE_ARTICLE_V1") return null;
  const titleZh = asString(module.titleZh);
  const titleEn = asString(module.titleEn);
  const introductionZh = asString(module.introductionZh);
  const introductionEn = asString(module.introductionEn);
  const estimatedMinutes = asInteger(module.estimatedMinutes);
  const blueprint = projectTeachingBlueprint(module.blueprint);
  const sections = projectArray(module.sections, projectTeachingSection);
  return titleZh !== null &&
    titleEn !== null &&
    introductionZh !== null &&
    introductionEn !== null &&
    estimatedMinutes !== null &&
    blueprint !== null &&
    sections !== null
    ? {
        format: module.format,
        titleZh,
        titleEn,
        introductionZh,
        introductionEn,
        estimatedMinutes,
        blueprint,
        sections,
      }
    : null;
}

function projectPaperItem(value: unknown): PracticePaperItemContent | null {
  const item = asRecord(value);
  if (!item) return null;
  const section = asString(item.section);
  const titleZh = asString(item.titleZh);
  const titleEn = asString(item.titleEn);
  const instructionZh = asString(item.instructionZh);
  const promptEn = asString(item.promptEn);
  const sourceText = asString(item.sourceText);
  const responseMode = asString(item.responseMode);
  const options = projectArray(item.options, (value) => {
    const option = asRecord(value);
    const key = asString(option?.key);
    const labelEn = asString(option?.labelEn);
    return option && key !== null && labelEn !== null ? { key, labelEn } : null;
  });
  const acceptedAnswers = asStringArray(item.acceptedAnswers);
  const answerExplanationZh = asString(item.answerExplanationZh);
  const suggestedMinutes = asInteger(item.suggestedMinutes);
  const minimumWords = asInteger(item.minimumWords);
  const maximumWords = asInteger(item.maximumWords);
  const publicCriteria = projectArray(item.publicCriteria, (value) => {
    const criterion = asRecord(value);
    if (!criterion) return null;
    const labelZh = asString(criterion.labelZh);
    const labelEn = asString(criterion.labelEn);
    const descriptionZh = asString(criterion.descriptionZh);
    const descriptionEn = asString(criterion.descriptionEn);
    const weight = asInteger(criterion.weight);
    return labelZh !== null &&
      labelEn !== null &&
      descriptionZh !== null &&
      descriptionEn !== null &&
      weight !== null
      ? { labelZh, labelEn, descriptionZh, descriptionEn, weight }
      : null;
  });
  if (
    section === null ||
    !paperSections.has(section) ||
    titleZh === null ||
    titleEn === null ||
    instructionZh === null ||
    promptEn === null ||
    sourceText === null ||
    responseMode === null ||
    !paperResponseModes.has(responseMode) ||
    options === null ||
    acceptedAnswers === null ||
    answerExplanationZh === null ||
    suggestedMinutes === null ||
    minimumWords === null ||
    maximumWords === null ||
    publicCriteria === null
  )
    return null;
  return {
    section: section as PracticePaperItemContent["section"],
    titleZh,
    titleEn,
    instructionZh,
    promptEn,
    sourceText,
    responseMode: responseMode as PracticePaperItemContent["responseMode"],
    options,
    acceptedAnswers,
    answerExplanationZh,
    suggestedMinutes,
    minimumWords,
    maximumWords,
    publicCriteria,
  };
}

function projectPaper(value: unknown): PracticePaperContent | null {
  const paper = asRecord(value);
  if (!paper) return null;
  const titleZh = asString(paper.titleZh);
  const titleEn = asString(paper.titleEn);
  const objectiveZh = asString(paper.objectiveZh);
  const objectiveEn = asString(paper.objectiveEn);
  const instructionsZh = asStringArray(paper.instructionsZh);
  const instructionsEn = asStringArray(paper.instructionsEn);
  const items = projectArray(paper.items, projectPaperItem);
  return titleZh !== null &&
    titleEn !== null &&
    objectiveZh !== null &&
    objectiveEn !== null &&
    instructionsZh !== null &&
    instructionsEn !== null &&
    items !== null
    ? {
        titleZh,
        titleEn,
        objectiveZh,
        objectiveEn,
        instructionsZh,
        instructionsEn,
        items,
      }
    : null;
}

function validatedFocusedLearningPackage(
  value: unknown,
): FocusedLearningPackage | null {
  const persisted = asRecord(value);
  if (!persisted) return null;
  const teachingModule = projectTeachingModule(persisted.teachingModule);
  const paper = projectPaper(persisted.paper);
  if (!teachingModule || !paper) return null;
  const focusedPackage = { teachingModule, paper };
  try {
    return validateFocusedLearningPackage(focusedPackage)
      ? focusedPackage
      : null;
  } catch {
    return null;
  }
}

export function learnerFacingTeachingArticle(
  value: unknown,
): Record<string, unknown> | null {
  const focusedPackage = validatedFocusedLearningPackage(value);
  if (!focusedPackage) return null;
  const module = focusedPackage.teachingModule;
  return {
    format: module.format,
    titleZh: module.titleZh,
    titleEn: module.titleEn,
    introductionZh: module.introductionZh,
    introductionEn: module.introductionEn,
    estimatedMinutes: module.estimatedMinutes,
    sections: module.sections,
  };
}
