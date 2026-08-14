import Ajv2020, {
  type AnySchemaObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";

import {
  validateAdaptiveTeachingModule as validateAdaptiveTeachingModulePedagogy,
  validateFocusedLearningPackage as validateFocusedLearningPedagogy,
  validatePracticePaperContent,
  type AdaptiveTeachingModule,
  type FocusedLearningPackage,
  type PracticePaperContent,
  type TeachingPracticePrompt,
} from "./learning";
import {
  adaptiveTeachingModuleSchema,
  focusedLearningPackageSchema,
  timedPracticePaperSchema,
} from "./schemas";

export type {
  AdaptiveTeachingModule,
  FocusedLearningPackage,
  PracticePaperContent,
  PracticePaperItemContent,
  TeachingBlock,
  TeachingBlockKind,
  TeachingBlueprint,
  TeachingPracticePrompt,
  TeachingSection,
} from "./learning";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateFocusedLearningShape = ajv.compile<FocusedLearningPackage>(
  focusedLearningPackageSchema as AnySchemaObject,
) as ValidateFunction<FocusedLearningPackage>;
const validateAdaptiveTeachingModuleShape = ajv.compile<AdaptiveTeachingModule>(
  adaptiveTeachingModuleSchema as AnySchemaObject,
) as ValidateFunction<AdaptiveTeachingModule>;
const validateTimedPracticePaperShape = ajv.compile<PracticePaperContent>(
  timedPracticePaperSchema as AnySchemaObject,
) as ValidateFunction<PracticePaperContent>;

export function validateAdaptiveTeachingModule(
  value: unknown,
  version1Essay?: string,
): value is AdaptiveTeachingModule {
  return (
    validateAdaptiveTeachingModuleShape(value) &&
    validateAdaptiveTeachingModulePedagogy(value, version1Essay)
  );
}

export function validateTimedPracticePaper(
  value: unknown,
): value is PracticePaperContent {
  return (
    validateTimedPracticePaperShape(value) &&
    validatePracticePaperContent(value)
  );
}

/** Applies the provider schema and the cross-field pedagogical gates together. */
export function validateFocusedLearningPackage(
  value: unknown,
  version1Essay?: string,
): value is FocusedLearningPackage {
  return (
    validateFocusedLearningShape(value) &&
    validateFocusedLearningPedagogy(value, version1Essay)
  );
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function boundedSubstantiveString(
  value: unknown,
  minimum: number,
  maximum: number,
): string | null {
  return typeof value === "string" &&
    value.trim().length >= minimum &&
    value.length <= maximum
    ? value
    : null;
}

function projectCanonicalTeachingPrompt(
  value: unknown,
): TeachingPracticePrompt | null {
  const prompt = asRecord(value);
  if (!prompt) return null;
  const id =
    typeof prompt.id === "string" &&
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(prompt.id)
      ? prompt.id
      : null;
  const instructionZh = boundedSubstantiveString(prompt.instructionZh, 6, 300);
  const instructionEn = boundedSubstantiveString(prompt.instructionEn, 6, 420);
  const promptEn = boundedSubstantiveString(prompt.promptEn, 8, 700);
  const responseMode =
    prompt.responseMode === "CHOICE" || prompt.responseMode === "SHORT_TEXT"
      ? prompt.responseMode
      : null;
  const context =
    prompt.context === "SAME_TOPIC" || prompt.context === "UNSEEN_TOPIC"
      ? prompt.context
      : null;
  const optionsEn =
    Array.isArray(prompt.optionsEn) &&
    prompt.optionsEn.length <= 4 &&
    prompt.optionsEn.every(
      (option) => boundedSubstantiveString(option, 1, 300) !== null,
    )
      ? (prompt.optionsEn as string[])
      : null;
  const referenceAnswerEn = boundedSubstantiveString(
    prompt.referenceAnswerEn,
    2,
    900,
  );
  const referenceReasoningZh = boundedSubstantiveString(
    prompt.referenceReasoningZh,
    6,
    500,
  );
  const referenceReasoningEn = boundedSubstantiveString(
    prompt.referenceReasoningEn,
    6,
    700,
  );
  if (
    id === null ||
    instructionZh === null ||
    instructionEn === null ||
    promptEn === null ||
    responseMode === null ||
    context === null ||
    optionsEn === null ||
    referenceAnswerEn === null ||
    referenceReasoningZh === null ||
    referenceReasoningEn === null ||
    (responseMode === "CHOICE"
      ? optionsEn.length < 2 || !optionsEn.includes(referenceAnswerEn)
      : optionsEn.length !== 0)
  )
    return null;
  return {
    id,
    instructionZh,
    instructionEn,
    promptEn,
    responseMode,
    context,
    optionsEn: [...optionsEn],
    referenceAnswerEn,
    referenceReasoningZh,
    referenceReasoningEn,
  };
}

/**
 * Finds a prompt only in the canonical tutorial PRACTICE blocks. Timed-paper
 * items deliberately are not traversed, even when they reuse the same ID.
 */
export function findTeachingPrompt(
  paperContent: unknown,
  promptId: string,
): TeachingPracticePrompt | null {
  const content = asRecord(paperContent);
  const module = asRecord(content?.teachingModule);
  if (
    module?.format !== "ADAPTIVE_ARTICLE_V1" ||
    !Array.isArray(module.sections)
  )
    return null;
  for (const sectionValue of module.sections) {
    const section = asRecord(sectionValue);
    if (!section || !Array.isArray(section.blocks)) continue;
    for (const blockValue of section.blocks) {
      const block = asRecord(blockValue);
      if (block?.kind !== "PRACTICE" || !Array.isArray(block.prompts)) continue;
      for (const prompt of block.prompts) {
        if (asRecord(prompt)?.id !== promptId) continue;
        return projectCanonicalTeachingPrompt(prompt);
      }
    }
  }
  return null;
}
