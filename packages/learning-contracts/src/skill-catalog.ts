import {
  LEARNING_CONTRACT_VERSION,
  SKILL_IDS,
  type AcceptedAnswerPolicy,
  type ExerciseItemType,
  type IeltsDimension,
  type SkillDefinition,
  type SkillFallbackStrategy,
  type SkillId,
  type SkillSuccessThreshold,
} from "./types";

const CORE_SUCCESS_THRESHOLD: SkillSuccessThreshold = {
  independentNoHintCorrect: 2,
  distinctContexts: 2,
  integratedApplicationRequired: true,
  unseenExitTestRequired: true,
};

const deterministicPolicy: AcceptedAnswerPolicy = {
  mode: "DETERMINISTIC_SET",
  preservesIntendedMeaning: true,
  acceptsEquivalentNaturalAnswers: false,
  rejectsRecommendationMismatchAlone: true,
  deterministicNormalization: "TRIM_CASE_FOLD",
};

const languageRubric: AcceptedAnswerPolicy = {
  mode: "CONSTRAINED_RUBRIC",
  preservesIntendedMeaning: true,
  acceptsEquivalentNaturalAnswers: true,
  rejectsRecommendationMismatchAlone: true,
  rubricCriteria: [
    "target feature is correct",
    "meaning is preserved",
    "English is natural",
  ],
};

const argumentRubric: AcceptedAnswerPolicy = {
  mode: "CONSTRAINED_RUBRIC",
  preservesIntendedMeaning: true,
  acceptsEquivalentNaturalAnswers: true,
  rejectsRecommendationMismatchAlone: true,
  rubricCriteria: [
    "task-relevant claim",
    "explicit logical relation",
    "sufficient development",
  ],
};

const cohesionRubric: AcceptedAnswerPolicy = {
  mode: "CONSTRAINED_RUBRIC",
  preservesIntendedMeaning: true,
  acceptsEquivalentNaturalAnswers: true,
  rejectsRecommendationMismatchAlone: true,
  rubricCriteria: [
    "referent or sentence function is clear",
    "logical relation is accurate",
    "sequence is coherent",
  ],
};

function fallback(
  kind: SkillFallbackStrategy["kind"],
  description: string,
): SkillFallbackStrategy {
  return {
    kind,
    maxRemedialItems: 2,
    lowConfidenceAction: "SUPPLEMENT_WITHOUT_STATE_CHANGE",
    description,
  };
}

function defineSkill(input: {
  id: SkillId;
  dimension: IeltsDimension;
  nameZh: string;
  description: string;
  allowedItemTypes: readonly ExerciseItemType[];
  acceptedAnswerPolicy: AcceptedAnswerPolicy;
  minimumGradingConfidence: number;
  fallbackStrategy: SkillFallbackStrategy;
}): SkillDefinition {
  return {
    ...input,
    allowedItemTypes: [
      ...new Set<ExerciseItemType>([...input.allowedItemTypes, "SELF_CHECK"]),
    ],
    successThreshold: CORE_SUCCESS_THRESHOLD,
    version: LEARNING_CONTRACT_VERSION,
  };
}

export const SKILL_DEFINITIONS = [
  defineSkill({
    id: "complete_comparison",
    dimension: "GRA",
    nameZh: "完整比较结构",
    description:
      "Make the compared entities and comparative relationship grammatically complete.",
    allowedItemTypes: [
      "MINIMAL_PAIR",
      "SKELETON_COMPLETION",
      "CONSTRAINED_REWRITE",
      "SENTENCE_GENERATION",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: languageRubric,
    minimumGradingConfidence: 0.9,
    fallbackStrategy: fallback(
      "SCAFFOLD_LADDER",
      "Move from a complete sentence frame to partial cues, keywords, and then no hint.",
    ),
  }),
  defineSkill({
    id: "verb_form_trigger",
    dimension: "GRA",
    nameZh: "动词形式触发",
    description:
      "Select the verb form required by prepositions, infinitives, and other triggers.",
    allowedItemTypes: [
      "ERROR_LOCATION",
      "GAP_FILL",
      "SENTENCE_GENERATION",
      "SENTENCE_REPAIR",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: languageRubric,
    minimumGradingConfidence: 0.92,
    fallbackStrategy: fallback(
      "SCAFFOLD_LADDER",
      "Return to the trigger, then fade a complete frame to independent generation.",
    ),
  }),
  defineSkill({
    id: "sentence_boundary",
    dimension: "GRA",
    nameZh: "句子边界",
    description: "Avoid fragments, run-ons, and comma splices.",
    allowedItemTypes: [
      "ERROR_LOCATION",
      "SENTENCE_REPAIR",
      "CONSTRAINED_REWRITE",
      "PARAGRAPH_SELF_CHECK",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: languageRubric,
    minimumGradingConfidence: 0.92,
    fallbackStrategy: fallback(
      "SCAFFOLD_LADDER",
      "Mark clause boundaries before rebuilding one sentence at a time.",
    ),
  }),
  defineSkill({
    id: "subject_verb_agreement",
    dimension: "GRA",
    nameZh: "主谓一致",
    description:
      "Maintain agreement between the grammatical subject and finite verb.",
    allowedItemTypes: [
      "MINIMAL_PAIR",
      "SENTENCE_REPAIR",
      "SENTENCE_GENERATION",
      "PARAGRAPH_SELF_CHECK",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: languageRubric,
    minimumGradingConfidence: 0.92,
    fallbackStrategy: fallback(
      "SCAFFOLD_LADDER",
      "Identify the head subject before fading to no-hint generation.",
    ),
  }),
  defineSkill({
    id: "article_control",
    dimension: "GRA",
    nameZh: "冠词与可数性",
    description:
      "Control article choice in relation to definiteness and countability.",
    allowedItemTypes: [
      "MINIMAL_PAIR",
      "GAP_FILL",
      "SENTENCE_REPAIR",
      "PARAGRAPH_SELF_CHECK",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: languageRubric,
    minimumGradingConfidence: 0.9,
    fallbackStrategy: fallback(
      "SCAFFOLD_LADDER",
      "Resolve countability and reference before asking for independent use.",
    ),
  }),
  defineSkill({
    id: "collocation_perspective",
    dimension: "LR",
    nameZh: "自然搭配与表达视角",
    description:
      "Confirm the intended meaning, then express it through a natural English collocation and information perspective.",
    allowedItemTypes: [
      "MEANING_FORK",
      "EXPRESSION_MAP",
      "MULTIPLE_REALIZATION",
      "CONSTRAINED_REWRITE",
      "SENTENCE_GENERATION",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: languageRubric,
    minimumGradingConfidence: 0.85,
    fallbackStrategy: fallback(
      "GENERAL_REWRITE",
      "Confirm meaning first, then compare several natural realizations without treating one model phrase as the only answer.",
    ),
  }),
  defineSkill({
    id: "word_form_precision",
    dimension: "LR",
    nameZh: "词形与意义精确度",
    description:
      "Choose the word form and lexical meaning required by the sentence.",
    allowedItemTypes: [
      "MATCHING",
      "MINIMAL_PAIR",
      "GAP_FILL",
      "CONSTRAINED_REWRITE",
      "SENTENCE_GENERATION",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: languageRubric,
    minimumGradingConfidence: 0.88,
    fallbackStrategy: fallback(
      "SCAFFOLD_LADDER",
      "Contrast word families and then fade support in a meaning-preserving rewrite.",
    ),
  }),
  defineSkill({
    id: "task_instruction_coverage",
    dimension: "TR",
    nameZh: "题目指令覆盖",
    description:
      "Address every required task action and the relevant scope of the question.",
    allowedItemTypes: [
      "TASK_TYPE_IDENTIFICATION",
      "THESIS_COMPARISON",
      "OUTLINE",
      "MICRO_PARAGRAPH",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: argumentRubric,
    minimumGradingConfidence: 0.86,
    fallbackStrategy: fallback(
      "GENERAL_ARGUMENT",
      "Map each instruction to an explicit thesis or outline commitment before drafting.",
    ),
  }),
  defineSkill({
    id: "mechanism_chain",
    dimension: "TR",
    nameZh: "因果机制链",
    description:
      "Develop a claim through reason, mechanism, and consequence rather than assertion alone.",
    allowedItemTypes: [
      "ROLE_CARD",
      "CAUSAL_CHAIN",
      "BRIDGE_SENTENCE",
      "MICRO_PARAGRAPH",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: argumentRubric,
    minimumGradingConfidence: 0.85,
    fallbackStrategy: fallback(
      "GENERAL_ARGUMENT",
      "Rebuild the chain as claim, reason, mechanism, and result, then remove the labels.",
    ),
  }),
  defineSkill({
    id: "development_relevance",
    dimension: "TR",
    nameZh: "论证展开相关性",
    description:
      "Keep explanations and examples causally relevant to the controlling idea.",
    allowedItemTypes: [
      "RELEVANCE_FILTER",
      "DELETION",
      "MICRO_PARAGRAPH",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: argumentRubric,
    minimumGradingConfidence: 0.85,
    fallbackStrategy: fallback(
      "GENERAL_ARGUMENT",
      "Remove material that cannot answer how or why the controlling claim follows.",
    ),
  }),
  defineSkill({
    id: "weighing_qualification",
    dimension: "TR",
    nameZh: "权衡与限定",
    description:
      "Compare significance using an explicit criterion and appropriate qualification.",
    allowedItemTypes: [
      "WEIGHING_CHOICE",
      "QUALIFICATION",
      "THESIS_COMPARISON",
      "PARAGRAPH_WRITING",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: argumentRubric,
    minimumGradingConfidence: 0.85,
    fallbackStrategy: fallback(
      "GENERAL_ARGUMENT",
      "Choose one comparison criterion and state the condition under which the judgment holds.",
    ),
  }),
  defineSkill({
    id: "paragraph_function_order",
    dimension: "CC",
    nameZh: "段落功能与顺序",
    description:
      "Order sentence functions so that a paragraph develops coherently.",
    allowedItemTypes: [
      "FUNCTION_LABELING",
      "ORDERING",
      "REVERSE_OUTLINE",
      "MICRO_PARAGRAPH",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: cohesionRubric,
    minimumGradingConfidence: 0.86,
    fallbackStrategy: fallback(
      "GENERAL_COHESION",
      "Label each sentence function and rebuild the shortest coherent sequence.",
    ),
  }),
  defineSkill({
    id: "reference_linking",
    dimension: "CC",
    nameZh: "指代与逻辑连接",
    description:
      "Make referents unambiguous and express the intended logical relation accurately.",
    allowedItemTypes: [
      "REFERENCE_REPAIR",
      "LINK_RELATION",
      "RECONSTRUCTION",
      "MICRO_PARAGRAPH",
      "INTEGRATED_APPLICATION",
      "EXIT_TEST",
    ],
    acceptedAnswerPolicy: cohesionRubric,
    minimumGradingConfidence: 0.88,
    fallbackStrategy: fallback(
      "GENERAL_COHESION",
      "Name the referent or relation explicitly before fading back to cohesive devices.",
    ),
  }),
] as const satisfies readonly SkillDefinition[];

const skillDefinitionMap = new Map<SkillId, SkillDefinition>(
  SKILL_DEFINITIONS.map((definition) => [definition.id, definition]),
);

if (
  skillDefinitionMap.size !== SKILL_IDS.length ||
  SKILL_IDS.some((id) => !skillDefinitionMap.has(id))
) {
  throw new Error(
    "The v1 skill catalog must define each of the fixed 13 skill IDs exactly once.",
  );
}

export function getSkillDefinition(skillId: SkillId): SkillDefinition {
  const definition = skillDefinitionMap.get(skillId);
  if (definition === undefined) {
    throw new Error(`Unsupported skill_id: ${skillId}`);
  }
  return definition;
}

export function isSkillId(value: unknown): value is SkillId {
  return typeof value === "string" && skillDefinitionMap.has(value as SkillId);
}

export { deterministicPolicy as DETERMINISTIC_ACCEPTED_ANSWER_POLICY };
