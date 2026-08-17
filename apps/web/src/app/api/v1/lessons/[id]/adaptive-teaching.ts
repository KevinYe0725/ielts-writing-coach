import {
  validateFocusedLearningPackage,
  type AdaptiveTeachingModule,
  type FocusedLearningPackage,
  type PracticePaperContent,
  type PracticePaperItemContent,
  type TeachingPracticePrompt,
  type TeachingSectionMarkdown,
} from "@iwc/worker/focused-learning";

type UnknownRecord = Record<string, unknown>;

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

function projectTeachingSectionMarkdown(
  value: unknown,
): TeachingSectionMarkdown | null {
  const section = asRecord(value);
  if (!section) return null;
  const titleZh = asString(section.titleZh);
  const titleEn = asString(section.titleEn);
  const markdown = asString(section.markdown);
  return titleZh !== null && titleEn !== null && markdown !== null
    ? { titleZh, titleEn, markdown }
    : null;
}

function projectTeachingModule(value: unknown): AdaptiveTeachingModule | null {
  const module = asRecord(value);
  if (!module || module.format !== "ADAPTIVE_ARTICLE_V1") return null;
  const titleZh = asString(module.titleZh);
  const titleEn = asString(module.titleEn);
  const introductionMarkdown = asString(module.introductionMarkdown);
  const estimatedMinutes = asInteger(module.estimatedMinutes);
  const coreAbilityZh = asString(module.coreAbilityZh);
  const coreAbilityEn = asString(module.coreAbilityEn);
  const sections = projectArray(
    module.sections,
    projectTeachingSectionMarkdown,
  );
  const practicePrompts = projectArray(
    module.practicePrompts,
    projectTeachingPrompt,
  );
  return titleZh !== null &&
    titleEn !== null &&
    introductionMarkdown !== null &&
    estimatedMinutes !== null &&
    coreAbilityZh !== null &&
    coreAbilityEn !== null &&
    sections !== null &&
    practicePrompts !== null
    ? {
        format: module.format,
        titleZh,
        titleEn,
        introductionMarkdown,
        estimatedMinutes,
        coreAbilityZh,
        coreAbilityEn,
        sections,
        practicePrompts,
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
    introductionMarkdown: module.introductionMarkdown,
    estimatedMinutes: module.estimatedMinutes,
    sections: module.sections,
    practicePrompts: module.practicePrompts,
  };
}
