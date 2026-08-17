import {
  LEARNING_CONTRACT_VERSION,
  getSkillDefinition,
  isContract,
  type AiIssueJudgment,
  type EvidenceKind,
  type ExerciseGradingSpecification,
  type ExerciseItem,
  type ExerciseOption,
  type ExercisePresentation,
  type ExerciseItemType,
  type HintLevel,
  type IssueEvidenceCategory,
  type LessonPlan,
  type SkillEvidenceEvent,
  type SkillId,
} from "@iwc/learning-contracts";
import { validateLessonPlan } from "@iwc/learning-core";

export interface GeneratedLessonStage {
  readonly titleZh: string;
  readonly instructionZh: string;
  readonly promptEn: string;
  readonly minutes: number;
  readonly responseMode: string;
  readonly sourceText?: string;
  readonly options?: readonly {
    readonly id: string;
    readonly labelZh: string;
    readonly labelEn: string;
    readonly confusionZh: string;
  }[];
  readonly acceptedAnswers?: readonly string[];
  readonly mappingPairs?: readonly {
    readonly left: string;
    readonly right: string;
  }[];
  readonly slotLabels?: readonly string[];
  readonly validOrders?: readonly string[];
  readonly branchPromptA?: string;
  readonly branchPromptB?: string;
  readonly branchPromptC?: string;
  readonly rubricCriteria?: readonly string[];
}

export interface GeneratedLessonContent {
  readonly titleZh: string;
  readonly objectiveZh: string;
  readonly stages: readonly GeneratedLessonStage[];
}

export type PracticePaperSection =
  | "FOUNDATION"
  | "REPAIR"
  | "GENERATION"
  | "INTEGRATION";

export interface PracticePaperCriterion {
  readonly labelZh: string;
  readonly labelEn: string;
  readonly descriptionZh: string;
  readonly descriptionEn: string;
  readonly weight: number;
}

export interface PracticePaperItemContent {
  readonly section: PracticePaperSection;
  readonly titleZh: string;
  readonly titleEn: string;
  readonly instructionZh: string;
  readonly promptEn: string;
  readonly sourceText: string;
  readonly responseMode: "choice" | "short_text" | "sentence" | "paragraph";
  readonly options: readonly {
    readonly key: string;
    readonly labelEn: string;
  }[];
  readonly acceptedAnswers: readonly string[];
  readonly answerExplanationZh: string;
  readonly suggestedMinutes: number;
  readonly minimumWords: number;
  readonly maximumWords: number;
  readonly publicCriteria: readonly PracticePaperCriterion[];
}

export interface PracticePaperContent {
  readonly titleZh: string;
  readonly titleEn: string;
  readonly objectiveZh: string;
  readonly objectiveEn: string;
  readonly instructionsZh: readonly string[];
  readonly instructionsEn: readonly string[];
  readonly items: readonly PracticePaperItemContent[];
}

export interface TeachingPracticePrompt {
  readonly id: string;
  readonly instructionZh: string;
  readonly instructionEn: string;
  readonly promptEn: string;
  readonly responseMode: "CHOICE" | "SHORT_TEXT";
  readonly context: "SAME_TOPIC" | "UNSEEN_TOPIC";
  readonly optionsEn: readonly string[];
  readonly referenceAnswerEn: string;
  readonly referenceReasoningZh: string;
  readonly referenceReasoningEn: string;
}

export interface TeachingSectionMarkdown {
  readonly titleZh: string;
  readonly titleEn: string;
  readonly markdown: string;
}

export interface AdaptiveTeachingModule {
  readonly format: "ADAPTIVE_ARTICLE_V1";
  readonly titleZh: string;
  readonly titleEn: string;
  readonly introductionMarkdown: string;
  readonly estimatedMinutes: number;
  readonly coreAbilityZh: string;
  readonly coreAbilityEn: string;
  readonly sections: readonly TeachingSectionMarkdown[];
  readonly practicePrompts: readonly TeachingPracticePrompt[];
}

export interface FocusedLearningPackage {
  readonly teachingModule: AdaptiveTeachingModule;
  readonly paper: PracticePaperContent;
}

export interface PracticePaperItemJudgment {
  readonly itemId: string;
  readonly status: "MEETS_STANDARD" | "NEEDS_WORK" | "NOT_SCORABLE";
  readonly score: number;
  readonly feedbackZh: string;
  readonly strengthsZh: readonly string[];
  readonly problems: readonly {
    readonly criterionLabelZh: string;
    readonly explanationZh: string;
    readonly evidence: string;
  }[];
  readonly improvedAnswerEn: string;
  readonly nextStepZh: string;
}

export interface PracticePaperJudgment {
  readonly totalScore: number;
  readonly summaryZh: string;
  readonly itemResults: readonly PracticePaperItemJudgment[];
}

const practicePaperSections: readonly PracticePaperSection[] = [
  "FOUNDATION",
  "FOUNDATION",
  "REPAIR",
  "REPAIR",
  "GENERATION",
  "GENERATION",
  "INTEGRATION",
  "INTEGRATION",
];

function normalizedInstructionText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s，。；：、,.!?！？“”‘’'"()（）—–-]+/g, "");
}

function hasClearOutputAction(instruction: string): boolean {
  const vaguePhrases = [
    "本轮目标",
    "目标能力",
    "按要求作答",
    "根据题目作答",
    "完成下面的表达",
    "完善表达",
  ];
  if (vaguePhrases.some((phrase) => instruction.includes(phrase))) return false;
  return /选择|选出|判断|匹配|排序|解释|改写|重写|回答|写(?:出|一|两|三|\d)|列出|圈出/.test(
    instruction,
  );
}

function criteriaAreVisibleInInstruction(
  item: PracticePaperItemContent,
): boolean {
  // The learner-facing instruction must state its own requirements, but the
  // criterion description is evaluator metadata and does not need to repeat
  // the instruction word-for-word. A non-empty instruction with a clear
  // output action (checked separately) is sufficient for the learner.
  return item.publicCriteria.every(
    (criterion) => criterion.descriptionZh.trim().length > 0,
  );
}

/** Product-level guardrails that reject confusing or internally inconsistent AI papers. */
export function validatePracticePaperContent(
  value: PracticePaperContent,
): boolean {
  if (value.items.length !== 8) return false;
  if (
    value.items.some(
      (item, index) =>
        item.section !== practicePaperSections[index] ||
        item.titleZh.trim().length === 0 ||
        item.instructionZh.trim().length < 8 ||
        !hasClearOutputAction(item.instructionZh) ||
        !criteriaAreVisibleInInstruction(item) ||
        item.promptEn.trim().length === 0 ||
        item.publicCriteria.length < 1 ||
        item.publicCriteria.length > 4 ||
        item.publicCriteria.reduce(
          (sum, criterion) => sum + criterion.weight,
          0,
        ) < 95 ||
        item.publicCriteria.reduce(
          (sum, criterion) => sum + criterion.weight,
          0,
        ) > 105 ||
        item.suggestedMinutes < 4 ||
        item.suggestedMinutes > 15 ||
        item.publicCriteria.some(
          (criterion) =>
            criterion.labelZh.trim().length === 0 ||
            criterion.descriptionZh.trim().length === 0 ||
            criterion.weight <= 0,
        ),
    )
  )
    return false;
  const totalMinutes = value.items.reduce(
    (sum, item) => sum + item.suggestedMinutes,
    0,
  );
  if (totalMinutes < 55 || totalMinutes > 65) return false;
  const normalizedPrompts = value.items.map((item) =>
    item.promptEn.trim().toLocaleLowerCase(),
  );
  if (new Set(normalizedPrompts).size !== normalizedPrompts.length)
    return false;
  return value.items.every((item) => {
    if (item.responseMode === "choice") {
      const optionKeys = new Set(item.options.map((option) => option.key));
      return (
        item.options.length >= 3 &&
        item.options.length <= 4 &&
        item.acceptedAnswers.length >= 1 &&
        item.acceptedAnswers.every((answer) => optionKeys.has(answer))
      );
    }
    if (item.options.length > 0 || item.acceptedAnswers.length > 0)
      return false;
    if (item.section === "REPAIR" && item.sourceText.trim().length === 0)
      return false;
    if (item.responseMode === "paragraph")
      return item.minimumWords >= 60 && item.maximumWords <= 150;
    return item.minimumWords >= 1 && item.maximumWords >= item.minimumWords;
  });
}

/** Validates a single paper question whose slot fields (section, mode,
 * minutes, word limits) are already fixed by the worker. Used when the paper
 * is authored one question at a time. */
export function validatePracticePaperItemContent(
  item: PracticePaperItemContent,
): boolean {
  if (
    item.titleZh.trim().length === 0 ||
    item.titleZh.length > 30 ||
    item.titleEn.trim().length === 0 ||
    item.titleEn.length > 60 ||
    item.instructionZh.trim().length < 8 ||
    item.instructionZh.length > 240 ||
    !hasClearOutputAction(item.instructionZh) ||
    !criteriaAreVisibleInInstruction(item) ||
    item.promptEn.trim().length === 0 ||
    item.promptEn.length > 600 ||
    item.sourceText.length > 800 ||
    item.answerExplanationZh.length > 240 ||
    item.publicCriteria.length < 1 ||
    item.publicCriteria.length > 4 ||
    item.publicCriteria.reduce((sum, criterion) => sum + criterion.weight, 0) <
      95 ||
    item.publicCriteria.reduce((sum, criterion) => sum + criterion.weight, 0) >
      105 ||
    item.suggestedMinutes < 4 ||
    item.suggestedMinutes > 15 ||
    item.publicCriteria.some(
      (criterion) =>
        criterion.labelZh.trim().length === 0 ||
        criterion.labelEn.trim().length === 0 ||
        criterion.descriptionZh.trim().length === 0 ||
        criterion.descriptionEn.trim().length === 0 ||
        criterion.weight <= 0 ||
        criterion.descriptionEn.length > 320,
    )
  )
    return false;
  if (item.responseMode === "choice") {
    const optionKeys = new Set(item.options.map((option) => option.key));
    return (
      item.options.length >= 3 &&
      item.options.length <= 4 &&
      item.acceptedAnswers.length >= 1 &&
      item.acceptedAnswers.every((answer) => optionKeys.has(answer))
    );
  }
  if (item.options.length > 0 || item.acceptedAnswers.length > 0) return false;
  if (item.section === "REPAIR" && item.sourceText.trim().length === 0)
    return false;
  if (item.responseMode === "paragraph")
    return item.minimumWords >= 60 && item.maximumWords <= 150;
  return item.minimumWords >= 1 && item.maximumWords >= item.minimumWords;
}

function substantive(value: unknown, minimum = 4): value is string {
  return typeof value === "string" && value.trim().length >= minimum;
}

function validBilingualCopy(
  chinese: unknown,
  english: unknown,
  minimum = 2,
): boolean {
  return substantive(chinese, minimum) && substantive(english, minimum);
}

function validTeachingPracticePrompt(prompt: TeachingPracticePrompt): boolean {
  if (
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(prompt.id) ||
    !validBilingualCopy(prompt.instructionZh, prompt.instructionEn, 6) ||
    !substantive(prompt.promptEn, 8) ||
    !substantive(prompt.referenceAnswerEn, 2) ||
    !validBilingualCopy(
      prompt.referenceReasoningZh,
      prompt.referenceReasoningEn,
      6,
    )
  )
    return false;
  if (prompt.responseMode === "SHORT_TEXT")
    return prompt.optionsEn.length === 0;
  return (
    prompt.optionsEn.length >= 2 &&
    prompt.optionsEn.length <= 4 &&
    prompt.optionsEn.includes(prompt.referenceAnswerEn)
  );
}

function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const item of Object.values(value)) collectStrings(item, output);
}

function wordTokens(value: string): string[] {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []
  );
}

/** Returns true when one generated field copies a long exact word run. */
export function hasLongExactWordOverlap(
  source: string,
  generatedFields: readonly string[],
  minimumWords = 12,
): boolean {
  if (minimumWords < 1) return false;
  const sourceWords = wordTokens(source);
  if (sourceWords.length < minimumWords) return false;
  const sourceSequences = new Set<string>();
  for (let index = 0; index <= sourceWords.length - minimumWords; index += 1) {
    sourceSequences.add(
      sourceWords.slice(index, index + minimumWords).join("\u0000"),
    );
  }
  return generatedFields.some((field) => {
    const fieldWords = wordTokens(field);
    for (let index = 0; index <= fieldWords.length - minimumWords; index += 1) {
      if (
        sourceSequences.has(
          fieldWords.slice(index, index + minimumWords).join("\u0000"),
        )
      )
        return true;
    }
    return false;
  });
}

function learnerFacingTeachingStrings(
  teaching: AdaptiveTeachingModule,
): string[] {
  const strings: string[] = [
    teaching.titleZh,
    teaching.titleEn,
    teaching.introductionMarkdown,
  ];
  for (const section of teaching.sections) {
    strings.push(section.titleZh, section.titleEn, section.markdown);
  }
  for (const prompt of teaching.practicePrompts) {
    strings.push(
      prompt.instructionZh,
      prompt.instructionEn,
      prompt.promptEn,
      ...prompt.optionsEn,
      prompt.referenceAnswerEn,
      prompt.referenceReasoningZh,
      prompt.referenceReasoningEn,
    );
  }
  return strings;
}

function exactHanSequenceOverlap(
  source: string,
  generatedFields: readonly string[],
  minimumCharacters: number,
): boolean {
  const sourceCharacters = source.match(/\p{Script=Han}/gu) ?? [];
  if (sourceCharacters.length < minimumCharacters) return false;
  const sourceSequences = new Set<string>();
  for (
    let index = 0;
    index <= sourceCharacters.length - minimumCharacters;
    index += 1
  ) {
    sourceSequences.add(
      sourceCharacters.slice(index, index + minimumCharacters).join(""),
    );
  }
  return generatedFields.some((field) => {
    const fieldCharacters = field.match(/\p{Script=Han}/gu) ?? [];
    for (
      let index = 0;
      index <= fieldCharacters.length - minimumCharacters;
      index += 1
    ) {
      if (
        sourceSequences.has(
          fieldCharacters.slice(index, index + minimumCharacters).join(""),
        )
      )
        return true;
    }
    return false;
  });
}

function futurePaperAnswerStrings(paper: PracticePaperContent): string[] {
  const answerFields = new Set([
    "acceptedAnswers",
    "referenceAnswerEn",
    "referenceAnswerZh",
    "modelAnswerEn",
    "modelAnswerZh",
    "sampleAnswerEn",
    "sampleAnswerZh",
    "suggestedAnswerEn",
    "suggestedAnswerZh",
    "answerEn",
    "answerZh",
    "answerExplanationEn",
    "answerExplanationZh",
  ]);
  const answers: string[] = [];
  for (const item of paper.items) {
    for (const acceptedAnswer of item.acceptedAnswers) {
      answers.push(acceptedAnswer);
      const option = item.options.find(
        (candidate) => candidate.key === acceptedAnswer,
      );
      if (option) answers.push(option.labelEn);
    }
    const itemRecord = item as unknown as Record<string, unknown>;
    for (const [key, answer] of Object.entries(itemRecord)) {
      if (answerFields.has(key)) collectStrings(answer, answers);
    }
  }
  return [...new Set(answers.map((answer) => answer.trim()).filter(Boolean))];
}

function leaksFuturePaperAnswer(
  learnerFacingFields: readonly string[],
  paper: PracticePaperContent,
): boolean {
  return futurePaperAnswerStrings(paper).some(
    (answer) =>
      hasLongExactWordOverlap(answer, learnerFacingFields, 8) ||
      exactHanSequenceOverlap(answer, learnerFacingFields, 18),
  );
}

function containsOversizedLearnerFacingField(
  learnerFacingFields: readonly string[],
): boolean {
  return learnerFacingFields.some((field) => wordTokens(field).length > 140);
}

function hasInternalVocabulary(fields: readonly string[]): boolean {
  const unambiguousEnglish =
    /\b(?:schema|skill[_ -]?id|evidence[_ -]?gate|ai[_ -]?job|job[_ -]?id)\b/iu;
  const technicalPrompt =
    /\b(?:(?:system|internal|hidden|developer|generation|evaluation|assessment|backend)\s+prompt|prompt\s+(?:version|registry|template|id|schema|pipeline|configuration|config))\b/iu;
  const technicalModel =
    /\b(?:(?:ai|language|foundation|llm)\s+model|model\s+(?:output|version|provider|route|response|id|configuration|config)|(?:the|this|a)\s+model\s+(?:generated|generates|chose|chooses|selected|selects|scored|scores|returned|returns|produced|produces|evaluated|evaluates|classified|classifies))\b/iu;
  const technicalJob =
    /\b(?:(?:ai|background|generation|evaluation|assessment|queued|pending|running)\s+job|job\s+(?:id|status|queue|runner|failed|failure|completed|running)|wait(?:ing)?\s+for\s+(?:the\s+)?job)\b/iu;
  const scoringImplementation =
    /\b(?:scoring|score)[_ -]?(?:implementation|logic|rule|algorithm|pipeline|engine|code)\b/iu;
  const technicalConfidence =
    /\b(?:(?:model|evaluation|assessment|prediction|output|judg(?:e)?ment)\s+confidence|confidence\s+(?:score|threshold|value|gate|rating)|(?:low|high)[_ -]?confidence\s+(?:judg(?:e)?ment|evaluation|result|output))\b/iu;
  const chineseInternalVocabulary =
    /(?:系统提示词|内部提示词|隐藏提示词|开发者提示词|提示词版本|提示词注册表|提示词ID|AI模型|人工智能模型|语言模型|大语言模型|系统模型|后台模型|评分模型|生成服务模型|模型输出|模型版本|模型供应商|模型提供商|模型路由|模型响应|后台任务|生成任务|评估任务|任务ID|任务状态|等待任务完成|能力ID|技能ID|证据门槛|证据阈值|评分实现|评分逻辑|评分算法|内部评分规则|打分实现|打分逻辑|置信度|置信分数|置信阈值|低置信|内部字段)/iu;

  return fields.some((field) => {
    if (
      unambiguousEnglish.test(field) ||
      technicalPrompt.test(field) ||
      technicalModel.test(field) ||
      technicalJob.test(field) ||
      scoringImplementation.test(field) ||
      technicalConfidence.test(field) ||
      chineseInternalVocabulary.test(field)
    )
      return true;
    return false;
  });
}

/** Validates a focused teaching article before a compatible provider generates
 * its separate paper. Cross-package answer isolation remains a final check. */
export function validateAdaptiveTeachingModule(
  teaching: AdaptiveTeachingModule,
  version1Essay?: string,
): boolean {
  if (
    teaching.format !== "ADAPTIVE_ARTICLE_V1" ||
    !validBilingualCopy(teaching.titleZh, teaching.titleEn, 6) ||
    !substantive(teaching.introductionMarkdown, 40) ||
    teaching.estimatedMinutes < 15 ||
    teaching.estimatedMinutes > 35 ||
    teaching.sections.length < 2 ||
    teaching.sections.length > 6 ||
    !validBilingualCopy(teaching.coreAbilityZh, teaching.coreAbilityEn, 4) ||
    teaching.coreAbilityZh.length > 40 ||
    teaching.coreAbilityEn.length > 160 ||
    teaching.sections.some(
      (section) =>
        !validBilingualCopy(section.titleZh, section.titleEn) ||
        !substantive(section.markdown, 40),
    ) ||
    teaching.practicePrompts.length < 3 ||
    teaching.practicePrompts.length > 4 ||
    new Set(teaching.practicePrompts.map((prompt) => prompt.id)).size !==
      teaching.practicePrompts.length ||
    !teaching.practicePrompts.every(validTeachingPracticePrompt) ||
    !teaching.practicePrompts.some(
      (prompt) => prompt.responseMode === "SHORT_TEXT",
    ) ||
    !teaching.practicePrompts.some(
      (prompt) => prompt.context === "UNSEEN_TOPIC",
    )
  )
    return false;

  const learnerFacingFields = learnerFacingTeachingStrings(teaching);
  if (
    hasInternalVocabulary(learnerFacingFields) ||
    containsOversizedLearnerFacingField(learnerFacingFields) ||
    (substantive(version1Essay, 1) &&
      hasLongExactWordOverlap(version1Essay, learnerFacingFields))
  )
    return false;

  return true;
}

/** Keeps the adaptive tutorial and timed paper aligned and pedagogically useful. */
export function validateFocusedLearningPackage(
  value: FocusedLearningPackage,
  version1Essay?: string,
): boolean {
  const teaching = value.teachingModule;
  if (
    !validateAdaptiveTeachingModule(teaching, version1Essay) ||
    !validatePracticePaperContent(value.paper) ||
    !substantive(value.paper.objectiveZh, 12) ||
    !substantive(value.paper.objectiveEn, 12)
  )
    return false;

  const normalizedTargetZh = normalizedInstructionText(teaching.coreAbilityZh);
  const normalizedTargetEn = normalizedInstructionText(teaching.coreAbilityEn);
  if (
    !normalizedInstructionText(value.paper.objectiveZh).includes(
      normalizedTargetZh,
    ) ||
    !normalizedInstructionText(value.paper.objectiveEn).includes(
      normalizedTargetEn,
    ) ||
    leaksFuturePaperAnswer(learnerFacingTeachingStrings(teaching), value.paper)
  )
    return false;

  return true;
}

export function sanitizePracticePaperJudgment(input: {
  readonly paper: {
    readonly items: readonly {
      readonly id: string;
      readonly responseMode?: string;
      readonly acceptedAnswers?: readonly string[];
    }[];
  };
  readonly answers: Readonly<Record<string, string>>;
  readonly judgment: PracticePaperJudgment;
}): PracticePaperJudgment {
  const expectedIds = new Set(input.paper.items.map((item) => item.id));
  const uniqueIds = new Set(
    input.judgment.itemResults.map((item) => item.itemId),
  );
  if (
    input.judgment.itemResults.length !== input.paper.items.length ||
    uniqueIds.size !== expectedIds.size ||
    [...uniqueIds].some((id) => !expectedIds.has(id))
  ) {
    throw new Error("The practice paper result does not match its questions.");
  }
  const paperById = new Map(input.paper.items.map((item) => [item.id, item]));
  const itemResults = input.judgment.itemResults.map((item) => {
    const answer = input.answers[item.itemId]?.trim() ?? "";
    const question = paperById.get(item.itemId);
    const status =
      answer.length === 0
        ? "NOT_SCORABLE"
        : question?.responseMode === "choice"
          ? question.acceptedAnswers?.includes(answer)
            ? "MEETS_STANDARD"
            : "NEEDS_WORK"
          : item.status;
    const score =
      status === "NOT_SCORABLE"
        ? 0
        : status === "MEETS_STANDARD" && question?.responseMode === "choice"
          ? 100
          : Math.max(0, Math.min(100, item.score));
    return {
      ...item,
      status,
      score,
      feedbackZh:
        status === "NOT_SCORABLE"
          ? "本题未作答，因此无法评分。"
          : item.feedbackZh,
      problems:
        status === "MEETS_STANDARD" || status === "NOT_SCORABLE"
          ? []
          : item.problems.filter(
              (problem) =>
                problem.evidence.length === 0 ||
                answer.includes(problem.evidence),
            ),
      improvedAnswerEn:
        status === "MEETS_STANDARD" || status === "NOT_SCORABLE"
          ? ""
          : item.improvedAnswerEn,
      nextStepZh:
        status === "NOT_SCORABLE"
          ? "复盘时先按题面要求独立完成本题。"
          : item.nextStepZh,
    } satisfies PracticePaperItemJudgment;
  });
  return {
    totalScore:
      itemResults.reduce((sum, item) => sum + item.score, 0) /
      itemResults.length,
    summaryZh: input.judgment.summaryZh,
    itemResults,
  };
}

export interface CanonicalLessonIds {
  readonly planId: string;
  readonly objectiveId: string;
  readonly secondaryObjectiveId?: string;
  readonly foundationBlockId: string;
  readonly breakBlockId: string;
  readonly applicationBlockId: string;
  readonly flexBlockId: string;
  readonly independentGroupId: string;
  readonly pretestItemId: string;
  readonly controlledItemId: string;
  readonly generationOneItemId: string;
  readonly generationTwoItemId: string;
  readonly integratedItemId: string;
  readonly selfCheckItemId: string;
  readonly exitItemId: string;
  readonly flexRepairItemId: string;
  readonly flexGenerationItemId: string;
}

export interface CanonicalLessonItemWithPath {
  readonly item: ExerciseItem;
  readonly path: LessonPlan["blocks"][number]["path"];
}

/**
 * The canonical ExerciseItem deliberately does not duplicate its parent path.
 * Keep the block path beside the item when projecting the plan into legacy DB
 * rows so required-core completion never mistakes reserve FLEX work for CORE.
 */
export function lessonItemsWithPath(
  plan: LessonPlan,
): readonly CanonicalLessonItemWithPath[] {
  return plan.blocks.flatMap((block) =>
    block.items.map((item) => ({ item, path: block.path })),
  );
}

export function buildExercisePresentation(input: {
  readonly item: ExerciseItem;
  readonly stage: GeneratedLessonStage;
  readonly meaningStage?: GeneratedLessonStage;
  readonly revisionSourceItemId?: string;
}): ExercisePresentation {
  const { item, stage } = input;
  const options = normalizedOptions(stage);
  const confusionByAnswer = Object.fromEntries(
    options.map((option, index) => [
      option.id,
      stage.options?.[index]?.confusionZh ?? "需要重新区分目标规则。",
    ]),
  );
  const meaningOptions = input.meaningStage
    ? normalizedOptions(input.meaningStage)
    : [];
  const branchTexts = [
    stage.branchPromptA,
    stage.branchPromptB,
    stage.branchPromptC,
  ];
  const branchPrompts = Object.fromEntries(
    meaningOptions.flatMap((option, index) => {
      const prompt = branchTexts[index];
      return prompt ? [[option.id, prompt] as const] : [];
    }),
  );
  const shared = {
    ...(stage.sourceText ? { sourceText: stage.sourceText } : {}),
    ...(Object.keys(branchPrompts).length > 0 ? { branchPrompts } : {}),
  };

  if (item.itemType === "ERROR_LOCATION") {
    return { form: "SPOTLIGHT", responseMode: "span", ...shared };
  }
  if (item.itemType === "MEANING_FORK") {
    return {
      form: "MEANING_FORK",
      responseMode: "choice",
      options,
      ...shared,
    };
  }
  if (["EXPRESSION_MAP", "MATCHING"].includes(item.itemType)) {
    return {
      form: "EXPRESSION_MAP",
      responseMode: "mapping",
      mappingPairs: normalizedMappingPairs(stage),
      ...shared,
    };
  }
  if (choiceItemTypes.has(item.itemType)) {
    return {
      form: ["ROLE_CARD", "FUNCTION_LABELING"].includes(item.itemType)
        ? "ARGUMENT_CHAIN"
        : "MINIMAL_CONTRAST",
      responseMode: "choice",
      options,
      confusionByAnswer,
      ...shared,
    };
  }
  if (["SKELETON_COMPLETION", "GAP_FILL", "ORDERING"].includes(item.itemType)) {
    return {
      form: "SKELETON",
      responseMode: "slots",
      slotLabels: stage.slotLabels ?? [],
      ...shared,
    };
  }
  if (["CAUSAL_CHAIN", "BRIDGE_SENTENCE"].includes(item.itemType)) {
    return {
      form: "ARGUMENT_CHAIN",
      responseMode: item.itemType === "CAUSAL_CHAIN" ? "chain" : "sentence",
      slotLabels: stage.slotLabels ?? [
        "claim",
        "reason",
        "mechanism",
        "result",
      ],
      ...shared,
    };
  }
  if (
    item.itemType === "SELF_CHECK" ||
    item.itemType === "PARAGRAPH_SELF_CHECK"
  ) {
    return {
      form: "TARGETED_SELF_CHECK",
      responseMode: "revision",
      ...(input.revisionSourceItemId
        ? { revisionSourceItemId: input.revisionSourceItemId }
        : {}),
      minimumWords: 80,
      maximumWords: 120,
      selfCheckPrompts: [
        "Underline or name the sentence that demonstrates the core target.",
        "Check every criterion shown for this paragraph.",
        "Make at least one targeted change and submit the second revision.",
      ],
      ...(stage.sourceText ? { sourceText: stage.sourceText } : {}),
    };
  }
  if (
    ["INTEGRATED_APPLICATION", "MICRO_PARAGRAPH", "PARAGRAPH_WRITING"].includes(
      item.itemType,
    )
  ) {
    return {
      form: "PARAGRAPH_LAB",
      responseMode: "paragraph",
      minimumWords: 80,
      maximumWords: 120,
      selfCheckPrompts: [
        "Check that the core target has a concrete span in your paragraph.",
        "Check each objective criterion before moving to the revision card.",
      ],
      ...shared,
    };
  }
  return { form: "OPEN_GENERATION", responseMode: "sentence", ...shared };
}

const itemTypes: Readonly<
  Record<
    SkillId,
    {
      readonly pretest: ExerciseItemType;
      readonly controlled: ExerciseItemType;
      readonly production: ExerciseItemType;
    }
  >
> = {
  complete_comparison: {
    pretest: "MINIMAL_PAIR",
    controlled: "SKELETON_COMPLETION",
    production: "SENTENCE_GENERATION",
  },
  verb_form_trigger: {
    pretest: "ERROR_LOCATION",
    controlled: "GAP_FILL",
    production: "SENTENCE_GENERATION",
  },
  sentence_boundary: {
    pretest: "ERROR_LOCATION",
    controlled: "SENTENCE_REPAIR",
    production: "CONSTRAINED_REWRITE",
  },
  subject_verb_agreement: {
    pretest: "MINIMAL_PAIR",
    controlled: "SENTENCE_REPAIR",
    production: "SENTENCE_GENERATION",
  },
  article_control: {
    pretest: "MINIMAL_PAIR",
    controlled: "GAP_FILL",
    production: "SENTENCE_REPAIR",
  },
  collocation_perspective: {
    pretest: "MEANING_FORK",
    controlled: "EXPRESSION_MAP",
    production: "SENTENCE_GENERATION",
  },
  word_form_precision: {
    pretest: "MINIMAL_PAIR",
    controlled: "GAP_FILL",
    production: "SENTENCE_GENERATION",
  },
  task_instruction_coverage: {
    pretest: "TASK_TYPE_IDENTIFICATION",
    controlled: "OUTLINE",
    production: "OUTLINE",
  },
  mechanism_chain: {
    pretest: "ROLE_CARD",
    controlled: "CAUSAL_CHAIN",
    production: "BRIDGE_SENTENCE",
  },
  development_relevance: {
    pretest: "RELEVANCE_FILTER",
    controlled: "DELETION",
    production: "MICRO_PARAGRAPH",
  },
  weighing_qualification: {
    pretest: "WEIGHING_CHOICE",
    controlled: "QUALIFICATION",
    production: "PARAGRAPH_WRITING",
  },
  paragraph_function_order: {
    pretest: "FUNCTION_LABELING",
    controlled: "REVERSE_OUTLINE",
    production: "MICRO_PARAGRAPH",
  },
  reference_linking: {
    pretest: "LINK_RELATION",
    controlled: "REFERENCE_REPAIR",
    production: "RECONSTRUCTION",
  },
};

export function itemTypesForPrompt(skillId: SkillId): {
  readonly pretest: ExerciseItemType;
  readonly controlled: ExerciseItemType;
  readonly production: ExerciseItemType;
} {
  return itemTypes[skillId];
}

function generatedStage(
  content: GeneratedLessonContent,
  index: number,
): GeneratedLessonStage {
  return (
    content.stages[index] ?? {
      titleZh: "主动输出",
      instructionZh: "先独立完成，再查看反馈。",
      promptEn:
        "Write an original response that demonstrates the target skill.",
      minutes: 6,
      responseMode: "sentence",
    }
  );
}

function rubric(
  skillId: SkillId,
  criteria?: readonly { readonly id: string; readonly description: string }[],
): Extract<ExerciseGradingSpecification, { mode: "RUBRIC" }> {
  const definition = getSkillDefinition(skillId);
  return {
    mode: "RUBRIC" as const,
    minimumConfidence: definition.minimumGradingConfidence,
    criteria: (
      criteria ?? [
        {
          id: `${skillId}:target`,
          description:
            "The target feature is correct, meaning-preserving, and natural in context.",
        },
      ]
    ).map((criterion) => ({ ...criterion, passingScore: 0.8 })),
  };
}

const choiceItemTypes = new Set<ExerciseItemType>([
  "MINIMAL_PAIR",
  "TASK_TYPE_IDENTIFICATION",
  "ROLE_CARD",
  "RELEVANCE_FILTER",
  "DELETION",
  "WEIGHING_CHOICE",
  "FUNCTION_LABELING",
  "LINK_RELATION",
]);

const deterministicItemTypes = new Set<ExerciseItemType>([
  ...choiceItemTypes,
  "SKELETON_COMPLETION",
  "ERROR_LOCATION",
  "GAP_FILL",
  "EXPRESSION_MAP",
  "MATCHING",
  "CAUSAL_CHAIN",
  "ORDERING",
]);

function normalizedOptions(stage: GeneratedLessonStage): ExerciseOption[] {
  const used = new Set<string>();
  const usedLabels = new Set<string>();
  const supplied = stage.options ?? [];
  const source =
    supplied.length >= 2
      ? supplied
      : [
          {
            id: "choice_a",
            labelZh: "选项 A",
            labelEn: "Option A",
            confusionZh: "未区分目标规则。",
          },
          {
            id: "choice_b",
            labelZh: "选项 B",
            labelEn: "Option B",
            confusionZh: "未区分目标规则。",
          },
        ];
  return source.slice(0, 4).map((option, index) => {
    const raw = option.id.trim() || `choice_${index + 1}`;
    const id = used.has(raw) ? `${raw}_${index + 1}` : raw;
    used.add(id);
    const labelKey = `${option.labelZh}\u0000${option.labelEn}`;
    const duplicateLabel = usedLabels.has(labelKey);
    usedLabels.add(labelKey);
    return {
      id,
      labelZh: duplicateLabel
        ? `${option.labelZh} ${index + 1}`
        : option.labelZh,
      labelEn: duplicateLabel
        ? `${option.labelEn} ${index + 1}`
        : option.labelEn,
    };
  });
}

function normalizedMappingPairs(
  stage: GeneratedLessonStage,
): readonly { readonly left: string; readonly right: string }[] {
  const supplied = (stage.mappingPairs ?? []).filter(
    (pair) => pair.left.trim().length > 0 && pair.right.trim().length > 0,
  );
  const left = new Set(supplied.map((pair) => pair.left.trim()));
  const right = new Set(supplied.map((pair) => pair.right.trim()));
  if (
    supplied.length >= 2 &&
    left.size === supplied.length &&
    right.size === supplied.length
  ) {
    return supplied.map((pair) => ({
      left: pair.left.trim(),
      right: pair.right.trim(),
    }));
  }
  return [
    { left: "intended meaning A", right: "complete English chunk A" },
    { left: "intended meaning B", right: "complete English chunk B" },
  ];
}

function acceptedChoiceIds(stage: GeneratedLessonStage): string[] {
  const options = normalizedOptions(stage);
  const raw = new Set(
    (stage.acceptedAnswers ?? []).map((answer) => answer.trim()),
  );
  const accepted = options
    .filter((option, index) => {
      const original = stage.options?.[index];
      return (
        raw.has(option.id) ||
        (original !== undefined &&
          (raw.has(original.id) ||
            raw.has(original.labelEn) ||
            raw.has(original.labelZh)))
      );
    })
    .map((option) => option.id);
  return accepted.length > 0 ? accepted : [options[0]!.id];
}

function mappedAnswer(stage: GeneratedLessonStage): string | null {
  const pairs = normalizedMappingPairs(stage);
  return pairs.length > 0
    ? pairs.map((pair) => `${pair.left.trim()}=>${pair.right.trim()}`).join("|")
    : null;
}

function deterministicAnswers(
  itemType: ExerciseItemType,
  stage: GeneratedLessonStage,
): readonly string[] {
  if (choiceItemTypes.has(itemType)) return acceptedChoiceIds(stage);
  if (["EXPRESSION_MAP", "MATCHING"].includes(itemType)) {
    const mapped = mappedAnswer(stage);
    if (mapped) return [mapped];
  }
  if (["SKELETON_COMPLETION", "CAUSAL_CHAIN", "ORDERING"].includes(itemType)) {
    const valid = (stage.validOrders ?? [])
      .map((answer) => answer.trim())
      .filter(Boolean);
    if (valid.length > 0) return [...new Set(valid)];
  }
  const supplied = (stage.acceptedAnswers ?? [])
    .map((answer) => answer.trim())
    .filter(Boolean);
  return supplied.length > 0 ? [...new Set(supplied)] : [stage.promptEn.trim()];
}

function gradingFor(
  itemType: ExerciseItemType,
  skillId: SkillId,
  stage: GeneratedLessonStage,
  rubricCriteria?: readonly {
    readonly id: string;
    readonly description: string;
  }[],
): ExerciseGradingSpecification {
  if (itemType === "MEANING_FORK") {
    return {
      mode: "UNSCORED_BRANCH",
      branchIds: normalizedOptions(stage).map((option) => option.id),
    };
  }
  if (deterministicItemTypes.has(itemType)) {
    return {
      mode: "DETERMINISTIC",
      acceptedAnswers: deterministicAnswers(itemType, stage),
      normalization: ["EXPRESSION_MAP", "MATCHING"].includes(itemType)
        ? "ORDER_INSENSITIVE"
        : "TRIM_CASE_FOLD",
    };
  }
  return rubric(
    skillId,
    rubricCriteria ??
      stage.rubricCriteria?.map((description, index) => ({
        id: `${skillId}:generated:${index + 1}`,
        description,
      })),
  );
}

function canonicalItem(input: {
  readonly id: string;
  readonly blockId: string;
  readonly objectiveId: string;
  readonly skillId: SkillId;
  readonly sourceIssueId: string | null;
  readonly stage: ExerciseItem["stage"];
  readonly itemType: ExerciseItemType;
  readonly prompt: string;
  readonly expectedActiveSeconds: number;
  readonly expectedTotalSeconds: number;
  readonly isReserve?: boolean;
  readonly evidenceOpportunity: ExerciseItem["evidenceOpportunity"];
  readonly contextId: string;
  readonly firstAttemptRequired: boolean;
  readonly hintPolicy: ExerciseItem["hintPolicy"];
  readonly feedbackPolicy: ExerciseItem["feedbackPolicy"];
  readonly independentGroupId?: string;
  readonly unseenSurfaceForm?: boolean;
  readonly integratedCriterion?: boolean;
  readonly grading?: ExerciseGradingSpecification;
  readonly criteria?: ExerciseItem["criteria"];
}): ExerciseItem {
  return {
    id: input.id,
    blockId: input.blockId,
    learningObjectiveId: input.objectiveId,
    primarySkillId: input.skillId,
    sourceIssueId: input.sourceIssueId,
    stage: input.stage,
    itemType: input.itemType,
    prompt: input.prompt,
    grading: input.grading ?? rubric(input.skillId),
    expectedActiveSeconds: input.expectedActiveSeconds,
    expectedTotalSeconds: input.expectedTotalSeconds,
    isReserve: input.isReserve ?? false,
    generationMode: "AI",
    qualityStatus: "VALIDATED",
    evidenceOpportunity: input.evidenceOpportunity,
    contextId: input.contextId,
    firstAttemptRequired: input.firstAttemptRequired,
    hintPolicy: input.hintPolicy,
    feedbackPolicy: input.feedbackPolicy,
    ...(input.independentGroupId === undefined
      ? {}
      : { independentGroupId: input.independentGroupId }),
    ...(input.unseenSurfaceForm === undefined
      ? {}
      : { unseenSurfaceForm: input.unseenSurfaceForm }),
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
  };
}

export function buildCanonicalLessonPlan(input: {
  readonly cycleId: string;
  readonly skillId: SkillId;
  readonly sourceEvidenceIds: readonly string[];
  readonly content: GeneratedLessonContent;
  readonly ids: CanonicalLessonIds;
  readonly plannerVersion: string;
  readonly generatorVersion: string;
  readonly secondaryObjective?: {
    readonly skillId: SkillId;
    readonly sourceEvidenceIds: readonly string[];
  };
}): LessonPlan {
  if (input.sourceEvidenceIds.length === 0) {
    throw new Error(
      "A canonical lesson requires at least one current or historical issue evidence ID.",
    );
  }
  const definition = getSkillDefinition(input.skillId);
  const types = itemTypes[input.skillId];
  if (
    !definition.allowedItemTypes.includes(types.pretest) ||
    !definition.allowedItemTypes.includes(types.controlled) ||
    !definition.allowedItemTypes.includes(types.production)
  ) {
    throw new Error(
      `The deterministic item plan is not supported for ${input.skillId}.`,
    );
  }
  const sourceIssueId = input.sourceEvidenceIds[0] ?? null;
  const stage0 = generatedStage(input.content, 0);
  const stage1 = generatedStage(input.content, 1);
  const stage2 = generatedStage(input.content, 2);
  const stage3 = generatedStage(input.content, 3);
  const stage4 = generatedStage(input.content, 4);
  const secondary =
    input.secondaryObjective &&
    input.ids.secondaryObjectiveId &&
    input.secondaryObjective.skillId !== input.skillId &&
    input.secondaryObjective.sourceEvidenceIds.length > 0
      ? {
          id: input.ids.secondaryObjectiveId,
          ...input.secondaryObjective,
        }
      : null;
  const integratedCriteria: NonNullable<ExerciseItem["criteria"]> = [
    {
      objectiveId: input.ids.objectiveId,
      skillId: input.skillId,
      rubric:
        "Use the core target naturally and accurately without recurrence of the diagnosed issue.",
      passingScore: 0.8,
    },
    ...(secondary
      ? [
          {
            objectiveId: secondary.id,
            skillId: secondary.skillId,
            rubric:
              "Also satisfy the explicitly named secondary objective in the same paragraph.",
            passingScore: 0.8,
          },
        ]
      : []),
  ];
  const integratedRubricCriteria = integratedCriteria.map((criterion) => ({
    id: `${criterion.objectiveId}:${criterion.skillId}`,
    description: criterion.rubric,
  }));

  const pretest = canonicalItem({
    id: input.ids.pretestItemId,
    blockId: input.ids.foundationBlockId,
    objectiveId: input.ids.objectiveId,
    skillId: input.skillId,
    sourceIssueId,
    stage: "notice",
    itemType: types.pretest,
    prompt: stage0.promptEn,
    expectedActiveSeconds: 240,
    expectedTotalSeconds: 300,
    evidenceOpportunity: "PRETEST",
    contextId: `${input.cycleId}:closed-book-pretest`,
    firstAttemptRequired: true,
    hintPolicy: "NONE",
    feedbackPolicy: "AFTER_SUBMISSION",
    grading: gradingFor(types.pretest, input.skillId, stage0),
  });
  const controlled = canonicalItem({
    id: input.ids.controlledItemId,
    blockId: input.ids.foundationBlockId,
    objectiveId: input.ids.objectiveId,
    skillId: input.skillId,
    sourceIssueId,
    stage: "control",
    itemType: types.controlled,
    prompt: stage1.promptEn,
    expectedActiveSeconds: 300,
    expectedTotalSeconds: 360,
    evidenceOpportunity: "CONTROLLED_REPAIR",
    contextId: `${input.cycleId}:controlled-repair`,
    firstAttemptRequired: false,
    hintPolicy: "SCAFFOLD_LADDER",
    feedbackPolicy: "IMMEDIATE",
    grading: gradingFor(types.controlled, input.skillId, stage1),
  });
  const generationOne = canonicalItem({
    id: input.ids.generationOneItemId,
    blockId: input.ids.foundationBlockId,
    objectiveId: input.ids.objectiveId,
    skillId: input.skillId,
    sourceIssueId: null,
    stage: "produce",
    itemType: types.production,
    prompt: stage2.promptEn,
    expectedActiveSeconds: 330,
    expectedTotalSeconds: 360,
    evidenceOpportunity: "INDEPENDENT_GENERATION",
    contextId: `${input.cycleId}:independent-context-a`,
    firstAttemptRequired: true,
    hintPolicy: "NONE",
    feedbackPolicy: "BATCH_AFTER_GROUP",
    independentGroupId: input.ids.independentGroupId,
    grading: gradingFor(types.production, input.skillId, stage2),
  });
  const generationTwo = canonicalItem({
    id: input.ids.generationTwoItemId,
    blockId: input.ids.foundationBlockId,
    objectiveId: input.ids.objectiveId,
    skillId: input.skillId,
    sourceIssueId: null,
    stage: "produce",
    itemType: types.production,
    prompt: stage3.promptEn,
    expectedActiveSeconds: 330,
    expectedTotalSeconds: 360,
    evidenceOpportunity: "INDEPENDENT_GENERATION",
    contextId: `${input.cycleId}:independent-context-b`,
    firstAttemptRequired: true,
    hintPolicy: "NONE",
    feedbackPolicy: "BATCH_AFTER_GROUP",
    independentGroupId: input.ids.independentGroupId,
    grading: gradingFor(types.production, input.skillId, stage3),
  });
  const integrated = canonicalItem({
    id: input.ids.integratedItemId,
    blockId: input.ids.applicationBlockId,
    objectiveId: input.ids.objectiveId,
    skillId: input.skillId,
    sourceIssueId: null,
    stage: "near_transfer",
    itemType: "INTEGRATED_APPLICATION",
    prompt: `Write an 80–120 word paragraph. ${stage4.promptEn}`,
    expectedActiveSeconds: 660,
    expectedTotalSeconds: 720,
    evidenceOpportunity: "INTEGRATED_APPLICATION",
    contextId: `${input.cycleId}:integrated-near-transfer`,
    firstAttemptRequired: true,
    hintPolicy: "NONE",
    feedbackPolicy: "AFTER_SUBMISSION",
    grading: gradingFor(
      "INTEGRATED_APPLICATION",
      input.skillId,
      stage4,
      integratedRubricCriteria,
    ),
    criteria: integratedCriteria,
  });
  const selfCheck = canonicalItem({
    id: input.ids.selfCheckItemId,
    blockId: input.ids.applicationBlockId,
    objectiveId: input.ids.objectiveId,
    skillId: input.skillId,
    sourceIssueId: null,
    stage: "self_check",
    itemType: "SELF_CHECK",
    prompt:
      "Review your integrated response against the target, identify one relevant weakness if present, and submit a revised version.",
    expectedActiveSeconds: 210,
    expectedTotalSeconds: 240,
    evidenceOpportunity: "SELF_CHECK",
    contextId: `${input.cycleId}:targeted-self-check`,
    firstAttemptRequired: false,
    hintPolicy: "ON_REQUEST",
    feedbackPolicy: "AFTER_SUBMISSION",
    grading: rubric(input.skillId, integratedRubricCriteria),
    criteria: integratedCriteria,
  });
  const exit = canonicalItem({
    id: input.ids.exitItemId,
    blockId: input.ids.applicationBlockId,
    objectiveId: input.ids.objectiveId,
    skillId: input.skillId,
    sourceIssueId: null,
    stage: "near_transfer",
    itemType: "EXIT_TEST",
    prompt:
      "Complete a new, unseen-surface-form response that demonstrates the target without reusing the lesson wording.",
    expectedActiveSeconds: 160,
    expectedTotalSeconds: 180,
    evidenceOpportunity: "EXIT_TEST",
    contextId: `${input.cycleId}:unseen-exit`,
    firstAttemptRequired: true,
    hintPolicy: "NONE",
    feedbackPolicy: "AFTER_SUBMISSION",
    unseenSurfaceForm: true,
    grading: gradingFor("EXIT_TEST", input.skillId, stage1),
  });
  const flexRepair = canonicalItem({
    id: input.ids.flexRepairItemId,
    blockId: input.ids.flexBlockId,
    objectiveId: input.ids.objectiveId,
    skillId: input.skillId,
    sourceIssueId,
    stage: "control",
    itemType: types.controlled,
    prompt:
      "Use the scaffold only if the core checkpoint is incomplete, then repair the target in a fresh example.",
    expectedActiveSeconds: 330,
    expectedTotalSeconds: 420,
    isReserve: true,
    evidenceOpportunity: "OTHER",
    contextId: `${input.cycleId}:flex-repair`,
    firstAttemptRequired: false,
    hintPolicy: "SCAFFOLD_LADDER",
    feedbackPolicy: "IMMEDIATE",
    grading: gradingFor(types.controlled, input.skillId, stage2),
  });
  const flexGeneration = canonicalItem({
    id: input.ids.flexGenerationItemId,
    blockId: input.ids.flexBlockId,
    objectiveId: input.ids.objectiveId,
    skillId: input.skillId,
    sourceIssueId: null,
    stage: "produce",
    itemType: types.production,
    prompt:
      "After the remedial scaffold, produce one fresh response without copying the demonstrated wording.",
    expectedActiveSeconds: 420,
    expectedTotalSeconds: 480,
    isReserve: true,
    // This is a fresh post-remediation opportunity. It may replace a failed
    // blind generation, but only when completed first-attempt and no-hint.
    evidenceOpportunity: "INDEPENDENT_GENERATION",
    contextId: `${input.cycleId}:flex-generation`,
    firstAttemptRequired: true,
    hintPolicy: "NONE",
    feedbackPolicy: "AFTER_SUBMISSION",
    grading: gradingFor(types.production, input.skillId, stage3),
  });

  const plan: LessonPlan = {
    schemaVersion: LEARNING_CONTRACT_VERSION,
    id: input.ids.planId,
    trainingCycleId: input.cycleId,
    status: "READY",
    plannedUserSeconds: 3_600,
    corePathSeconds: 2_700,
    flexiblePathSeconds: 900,
    objectives: [
      {
        id: input.ids.objectiveId,
        trainingCycleId: input.cycleId,
        skillId: input.skillId,
        role: "CORE",
        sourceEvidenceIds: input.sourceEvidenceIds,
        priority: 1,
        successCriterion:
          "Pass two distinct first-attempt no-hint generations, an integrated near-transfer criterion, and an unseen exit test.",
      },
      ...(secondary
        ? [
            {
              id: secondary.id,
              trainingCycleId: input.cycleId,
              skillId: secondary.skillId,
              role: "SECONDARY" as const,
              sourceEvidenceIds: secondary.sourceEvidenceIds,
              priority: 2,
              successCriterion:
                "Satisfy the named secondary criterion inside the paragraph lab without replacing the core target.",
            },
          ]
        : []),
    ],
    blocks: [
      {
        id: input.ids.foundationBlockId,
        objectiveId: input.ids.objectiveId,
        kind: "CORE",
        path: "CORE",
        order: 0,
        timeBudgetSeconds: 1_380,
        items: [pretest, controlled, generationOne, generationTwo],
      },
      {
        id: input.ids.breakBlockId,
        kind: "BREAK",
        path: "CORE",
        order: 1,
        timeBudgetSeconds: 180,
        items: [],
      },
      {
        id: input.ids.applicationBlockId,
        objectiveId: input.ids.objectiveId,
        kind: "INTEGRATED",
        path: "CORE",
        order: 2,
        timeBudgetSeconds: 1_140,
        items: [integrated, selfCheck, exit],
      },
      {
        id: input.ids.flexBlockId,
        objectiveId: input.ids.objectiveId,
        kind: "CORE",
        path: "FLEX",
        order: 3,
        timeBudgetSeconds: 900,
        items: [flexRepair, flexGeneration],
      },
    ],
    plannerVersion: input.plannerVersion,
    generatorVersion: input.generatorVersion,
  };
  const validation = validateLessonPlan(plan);
  if (!validation.valid) {
    throw new Error(
      `Canonical lesson validation failed: ${validation.issues
        .map((issue) => `${issue.code}@${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return plan;
}

const hardGrammarSkills = new Set<SkillId>([
  "complete_comparison",
  "verb_form_trigger",
  "sentence_boundary",
  "subject_verb_agreement",
  "article_control",
]);

export interface PersistedIssueClassification {
  readonly skillId: SkillId;
  readonly categories: readonly IssueEvidenceCategory[];
  readonly hardGrammarError: boolean;
  readonly diagnosis: string;
}

export function classifyIssueForPersistence(
  issue: AiIssueJudgment,
): PersistedIssueClassification {
  if (
    /much\s+(?:\+\s*)?slighter|much\s*\+\s*comparative/i.test(
      `${issue.excerpt} ${issue.diagnosis}`,
    )
  ) {
    return {
      skillId: "collocation_perspective",
      categories: [
        "COLLOCATION_NATURALNESS",
        "CHINESE_INFORMATION_ORGANIZATION",
      ],
      hardGrammarError: false,
      diagnosis:
        "The modifier much is grammatically valid with a comparative. The issue is the naturalness of ‘slighter pressure’ and the English perspective used to identify who experiences or creates the pressure.",
    };
  }
  if (hardGrammarSkills.has(issue.skillId)) {
    return {
      skillId: issue.skillId,
      categories: ["HARD_GRAMMAR_ERROR"],
      hardGrammarError: true,
      diagnosis: issue.diagnosis,
    };
  }
  if (issue.skillId === "collocation_perspective") {
    return {
      skillId: issue.skillId,
      categories: [
        "COLLOCATION_NATURALNESS",
        "CHINESE_INFORMATION_ORGANIZATION",
      ],
      hardGrammarError: false,
      diagnosis: issue.diagnosis,
    };
  }
  if (issue.skillId === "word_form_precision") {
    return {
      skillId: issue.skillId,
      categories: ["LEXICAL_PRECISION"],
      hardGrammarError: false,
      diagnosis: issue.diagnosis,
    };
  }
  if (issue.skillId === "task_instruction_coverage") {
    return {
      skillId: issue.skillId,
      categories: ["TASK_COVERAGE"],
      hardGrammarError: false,
      diagnosis: issue.diagnosis,
    };
  }
  if (
    issue.skillId === "mechanism_chain" ||
    issue.skillId === "development_relevance" ||
    issue.skillId === "weighing_qualification"
  ) {
    return {
      skillId: issue.skillId,
      categories: ["ARGUMENT_DEVELOPMENT"],
      hardGrammarError: false,
      diagnosis: issue.diagnosis,
    };
  }
  if (
    issue.skillId === "paragraph_function_order" ||
    issue.skillId === "reference_linking"
  ) {
    return {
      skillId: issue.skillId,
      categories: ["COHESION_ORGANIZATION"],
      hardGrammarError: false,
      diagnosis: issue.diagnosis,
    };
  }
  return {
    skillId: issue.skillId,
    categories: ["OPTIONAL_OPTIMIZATION"],
    hardGrammarError: false,
    diagnosis: issue.diagnosis,
  };
}

export interface ExerciseEvaluationJudgment {
  readonly passed: boolean;
  readonly firstAttemptPassed: boolean;
  readonly confidence: number;
  readonly feedbackZh: string;
  readonly evidenceEn: string;
  readonly dimensionScores: {
    readonly targetCorrectness: number;
    readonly meaningPreservation: number;
    readonly naturalness: number;
  };
  readonly criterionResults: readonly {
    readonly id: string;
    readonly score: number;
    readonly userAnswerEvidence: readonly string[];
  }[];
  readonly userAnswerEvidence: readonly string[];
  readonly mostImportantSuggestionZh: string;
  readonly naturalOpportunity: boolean;
  readonly coreErrorRecurred: boolean;
}

function evidenceKind(
  opportunity: ExerciseItem["evidenceOpportunity"],
): EvidenceKind {
  switch (opportunity) {
    case "CONTROLLED_REPAIR":
      return "CONTROLLED_REPAIR";
    case "INDEPENDENT_GENERATION":
      return "INDEPENDENT_GENERATION";
    case "INTEGRATED_APPLICATION":
      return "INTEGRATED_APPLICATION";
    case "EXIT_TEST":
      return "EXIT_TEST";
    case "PRETEST":
      return "RECOGNITION";
    case "SELF_CHECK":
    case "OTHER":
      return "REVIEW";
  }
}

function hintLevel(value: string): HintLevel {
  return [
    "NONE",
    "KEYWORD",
    "PARTIAL_FRAME",
    "FULL_FRAME",
    "ANSWER_SHOWN",
  ].includes(value)
    ? (value as HintLevel)
    : "ANSWER_SHOWN";
}

export function buildExerciseEvidence(input: {
  readonly id: string;
  readonly userId: string;
  readonly attemptId: string;
  readonly objectiveId: string;
  readonly item: ExerciseItem;
  readonly topicId: string;
  readonly hintsUsed: number;
  readonly hintLevel: string;
  readonly referenceAnswerSeen: boolean;
  readonly occurredAt: Date;
  readonly judgment: ExerciseEvaluationJudgment;
}): SkillEvidenceEvent {
  const minimumConfidence = getSkillDefinition(
    input.item.primarySkillId,
  ).minimumGradingConfidence;
  const normalizedHintLevel = hintLevel(input.hintLevel);
  const independent =
    input.hintsUsed === 0 &&
    normalizedHintLevel === "NONE" &&
    !input.referenceAnswerSeen;
  const kind = evidenceKind(input.item.evidenceOpportunity);
  const integrated = kind === "INTEGRATED_APPLICATION";
  const outcome =
    integrated && !input.judgment.naturalOpportunity
      ? "NO_OPPORTUNITY"
      : input.judgment.firstAttemptPassed
        ? "PASS"
        : "FAIL";
  return {
    schemaVersion: LEARNING_CONTRACT_VERSION,
    id: input.id,
    userId: input.userId,
    skillId: input.item.primarySkillId,
    objectiveId: input.objectiveId,
    kind,
    outcome,
    independent,
    firstAttempt: true,
    hintLevel: normalizedHintLevel,
    confidence: input.judgment.confidence,
    validForStateTransition: input.judgment.confidence >= minimumConfidence,
    adjudicationStatus: "ACCEPTED",
    contextId: input.item.contextId,
    topicId: input.topicId,
    sourceEntityType: "EXERCISE",
    sourceEntityId: input.attemptId,
    occurredAt: input.occurredAt.toISOString(),
    naturalOpportunity: integrated ? input.judgment.naturalOpportunity : true,
    targetPrompted: true,
    ...(input.item.unseenSurfaceForm === undefined
      ? {}
      : { unseenSurfaceForm: input.item.unseenSurfaceForm }),
    ...(integrated
      ? { coreErrorRecurred: input.judgment.coreErrorRecurred }
      : {}),
  };
}

export function buildProviderAwareExerciseEvidence(
  input: Parameters<typeof buildExerciseEvidence>[0] & {
    readonly providerKind: string;
  },
): SkillEvidenceEvent {
  const evidence = buildExerciseEvidence(input);
  return input.providerKind === "mock"
    ? { ...evidence, validForStateTransition: false }
    : evidence;
}

export function canonicalEvidenceFromPayload(
  payload: Record<string, unknown>,
): SkillEvidenceEvent | null {
  const candidate = payload.canonicalEvidence;
  return isContract("skillEvidenceEvent", candidate) ? candidate : null;
}

export interface ComparisonJudgment {
  readonly targetApplied: boolean;
  readonly naturalOpportunity: boolean;
  readonly confidence: number;
  readonly improvementsZh: readonly string[];
  readonly regressionsZh: readonly string[];
  readonly evidenceV2: string;
  readonly coreIssueSpansV1: readonly ComparisonIssueSpan[];
  readonly coreIssueSpansV2: readonly ComparisonIssueSpan[];
  readonly modelEssay?: string;
}

export interface ComparisonIssueSpan {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly excerpt: string;
}

export interface VersionScoreSet {
  readonly overall: number;
  readonly TR: number;
  readonly CC: number;
  readonly LR: number;
  readonly GRA: number;
}

export interface VersionComparisonMetrics {
  readonly scoringVersion: {
    readonly schemaVersion: string;
    readonly promptVersion: string;
    readonly rubricVersion: string;
    readonly model: string;
  };
  readonly overall: {
    readonly v1: number;
    readonly v2: number;
    readonly delta: number;
  };
  readonly criteria: Readonly<
    Record<
      "TR" | "CC" | "LR" | "GRA",
      { readonly v1: number; readonly v2: number; readonly delta: number }
    >
  >;
  readonly wordCounts: {
    readonly v1: number;
    readonly v2: number;
    readonly v2Blind: number;
  };
  readonly coreIssueRecurrence: {
    readonly v1Occurrences: number;
    readonly v2Occurrences: number;
    readonly v1Per100Words: number;
    readonly v2Per100Words: number;
    readonly deltaPer100Words: number;
    readonly recurred: boolean;
    readonly evidenceVerified: boolean;
  };
}

export function countComparisonWords(content: string): number {
  return (
    content.trim().match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)?.length ?? 0
  );
}

export function verifyComparisonIssueSpans(
  content: string,
  spans: readonly ComparisonIssueSpan[],
): readonly ComparisonIssueSpan[] {
  const candidates = spans
    .filter(
      (span) =>
        Number.isInteger(span.startOffset) &&
        Number.isInteger(span.endOffset) &&
        span.startOffset >= 0 &&
        span.endOffset > span.startOffset &&
        span.endOffset <= content.length &&
        content.slice(span.startOffset, span.endOffset) === span.excerpt,
    )
    .sort(
      (left, right) =>
        left.startOffset - right.startOffset ||
        left.endOffset - right.endOffset,
    );
  const verified: ComparisonIssueSpan[] = [];
  for (const candidate of candidates) {
    const previous = verified.at(-1);
    if (previous && candidate.startOffset < previous.endOffset) continue;
    if (
      previous &&
      candidate.startOffset === previous.startOffset &&
      candidate.endOffset === previous.endOffset
    )
      continue;
    verified.push(candidate);
  }
  return verified;
}

export function issueFrequencyPer100Words(
  issueCount: number,
  wordCount: number,
): number {
  if (issueCount <= 0 || wordCount <= 0) return 0;
  return Math.round(((issueCount * 100) / wordCount) * 100) / 100;
}

function scoreDelta(v1: number, v2: number): number {
  return Math.round((v2 - v1) * 10) / 10;
}

export function buildVersionComparisonMetrics(input: {
  readonly scoringVersion: VersionComparisonMetrics["scoringVersion"];
  readonly v1Scores: VersionScoreSet;
  readonly v2Scores: VersionScoreSet;
  readonly v1WordCount: number;
  readonly v2WordCount: number;
  readonly v2BlindWordCount: number;
  readonly v1IssueSpans: readonly ComparisonIssueSpan[];
  readonly v2IssueSpans: readonly ComparisonIssueSpan[];
  readonly evidenceVerified: boolean;
}): VersionComparisonMetrics {
  const criterion = (key: "TR" | "CC" | "LR" | "GRA") => ({
    v1: input.v1Scores[key],
    v2: input.v2Scores[key],
    delta: scoreDelta(input.v1Scores[key], input.v2Scores[key]),
  });
  const v1Per100Words = issueFrequencyPer100Words(
    input.v1IssueSpans.length,
    input.v1WordCount,
  );
  const v2Per100Words = issueFrequencyPer100Words(
    input.v2IssueSpans.length,
    input.v2BlindWordCount,
  );
  return {
    scoringVersion: input.scoringVersion,
    overall: {
      v1: input.v1Scores.overall,
      v2: input.v2Scores.overall,
      delta: scoreDelta(input.v1Scores.overall, input.v2Scores.overall),
    },
    criteria: {
      TR: criterion("TR"),
      CC: criterion("CC"),
      LR: criterion("LR"),
      GRA: criterion("GRA"),
    },
    wordCounts: {
      v1: input.v1WordCount,
      v2: input.v2WordCount,
      v2Blind: input.v2BlindWordCount,
    },
    coreIssueRecurrence: {
      v1Occurrences: input.v1IssueSpans.length,
      v2Occurrences: input.v2IssueSpans.length,
      v1Per100Words,
      v2Per100Words,
      deltaPer100Words: Math.round((v2Per100Words - v1Per100Words) * 100) / 100,
      recurred: input.v2IssueSpans.length > 0,
      evidenceVerified: input.evidenceVerified,
    },
  };
}

export interface TransferEvaluationJudgment {
  readonly targetApplied: boolean;
  readonly naturalOpportunity: boolean;
  readonly confidence: number;
  readonly feedbackZh: string;
  readonly feedbackEn: string;
  readonly evidenceEn: string;
  readonly dimensionScores: {
    readonly targetCorrectness: number;
    readonly meaningPreservation: number;
    readonly naturalness: number;
  };
  readonly userAnswerEvidence: readonly string[];
  readonly mostImportantSuggestionZh: string;
}

export function verifyTransferJudgmentEvidence(
  firstAnswer: string,
  judgment: TransferEvaluationJudgment,
): TransferEvaluationJudgment {
  const verifiedSpans = judgment.userAnswerEvidence
    .map((span) => span.trim())
    .filter(
      (span, index, source) =>
        span.length > 0 &&
        firstAnswer.includes(span) &&
        source.indexOf(span) === index,
    );
  return {
    ...judgment,
    targetApplied:
      judgment.targetApplied &&
      judgment.naturalOpportunity &&
      verifiedSpans.length > 0,
    evidenceEn:
      verifiedSpans.length > 0
        ? verifiedSpans.join(" … ")
        : judgment.naturalOpportunity
          ? ""
          : judgment.evidenceEn,
    userAnswerEvidence: verifiedSpans,
  };
}

export function buildDelayedRewriteEvidence(input: {
  readonly id: string;
  readonly userId: string;
  readonly skillId: SkillId;
  readonly objectiveId?: string;
  readonly cycleId: string;
  readonly rewriteTaskId: string;
  readonly topicId: string;
  readonly submittedAt: Date;
  readonly instructionExposureAt: Date | null;
  readonly assisted: boolean;
  readonly prerequisiteSkipped: boolean;
  readonly judgment: ComparisonJudgment;
}): SkillEvidenceEvent {
  const minimumConfidence = getSkillDefinition(
    input.skillId,
  ).minimumGradingConfidence;
  return {
    schemaVersion: LEARNING_CONTRACT_VERSION,
    id: input.id,
    userId: input.userId,
    skillId: input.skillId,
    ...(input.objectiveId === undefined
      ? {}
      : { objectiveId: input.objectiveId }),
    kind: "DELAYED_REWRITE",
    outcome: !input.judgment.naturalOpportunity
      ? "NO_OPPORTUNITY"
      : input.judgment.targetApplied
        ? "PASS"
        : "FAIL",
    independent: !input.assisted,
    firstAttempt: true,
    hintLevel: input.assisted ? "ANSWER_SHOWN" : "NONE",
    confidence: input.judgment.confidence,
    validForStateTransition: input.judgment.confidence >= minimumConfidence,
    adjudicationStatus: "ACCEPTED",
    contextId: `${input.cycleId}:delayed-rewrite`,
    topicId: input.topicId,
    sourceEntityType: "REWRITE",
    sourceEntityId: input.rewriteTaskId,
    occurredAt: input.submittedAt.toISOString(),
    naturalOpportunity: input.judgment.naturalOpportunity,
    targetPrompted: input.assisted,
    ...(input.instructionExposureAt === null
      ? {}
      : { instructionExposureAt: input.instructionExposureAt.toISOString() }),
    prerequisiteSkipped: input.prerequisiteSkipped,
    assisted: input.assisted,
  };
}

export function buildProviderAwareDelayedRewriteEvidence(
  input: Parameters<typeof buildDelayedRewriteEvidence>[0] & {
    readonly providerKind: string;
  },
): SkillEvidenceEvent {
  const evidence = buildDelayedRewriteEvidence(input);
  return input.providerKind === "mock"
    ? { ...evidence, validForStateTransition: false }
    : evidence;
}

export function buildTransferEvidence(input: {
  readonly id: string;
  readonly userId: string;
  readonly skillId: SkillId;
  readonly objectiveId?: string;
  readonly transferTaskId: string;
  readonly responseId: string;
  readonly topicId: string;
  readonly submittedAt: Date;
  readonly providerKind: string;
  readonly judgment: TransferEvaluationJudgment;
}): SkillEvidenceEvent {
  const minimumConfidence = getSkillDefinition(
    input.skillId,
  ).minimumGradingConfidence;
  const languageScored = input.providerKind !== "mock";
  return {
    schemaVersion: LEARNING_CONTRACT_VERSION,
    id: input.id,
    userId: input.userId,
    skillId: input.skillId,
    ...(input.objectiveId === undefined
      ? {}
      : { objectiveId: input.objectiveId }),
    kind: "CROSS_TOPIC_TRANSFER",
    outcome: !input.judgment.naturalOpportunity
      ? "NO_OPPORTUNITY"
      : input.judgment.targetApplied
        ? "PASS"
        : "FAIL",
    independent: true,
    firstAttempt: true,
    hintLevel: "NONE",
    confidence: input.judgment.confidence,
    validForStateTransition:
      languageScored && input.judgment.confidence >= minimumConfidence,
    adjudicationStatus: "ACCEPTED",
    contextId: `${input.transferTaskId}:cross-topic-transfer`,
    topicId: input.topicId,
    sourceEntityType: "TRANSFER",
    sourceEntityId: input.responseId,
    occurredAt: input.submittedAt.toISOString(),
    naturalOpportunity: input.judgment.naturalOpportunity,
    targetPrompted: false,
    assisted: false,
  };
}

const DAY_MS = 24 * 60 * 60 * 1_000;

export function followUpSchedule(cycleStartedAt: Date): {
  readonly transferAvailableAt: Date;
  readonly transferExpiresAt: Date;
  readonly mixedReviewDueAt: Date;
} {
  if (!Number.isFinite(cycleStartedAt.getTime())) {
    throw new TypeError(
      "cycle.startedAt must be a valid date before follow-up scheduling.",
    );
  }
  const anchor = cycleStartedAt.getTime();
  return {
    transferAvailableAt: new Date(anchor + 5 * DAY_MS),
    transferExpiresAt: new Date(anchor + 7 * DAY_MS),
    mixedReviewDueAt: new Date(anchor + 14 * DAY_MS),
  };
}

export function responseModeForItem(item: ExerciseItem): string {
  if (
    item.itemType === "SELF_CHECK" ||
    item.itemType === "PARAGRAPH_SELF_CHECK"
  )
    return "revision";
  if (item.itemType === "MEANING_FORK" || choiceItemTypes.has(item.itemType))
    return "choice";
  if (item.itemType === "ERROR_LOCATION") return "span";
  if (["EXPRESSION_MAP", "MATCHING"].includes(item.itemType)) return "mapping";
  if (["SKELETON_COMPLETION", "GAP_FILL", "ORDERING"].includes(item.itemType))
    return "slots";
  if (
    item.itemType === "INTEGRATED_APPLICATION" ||
    item.itemType === "PARAGRAPH_WRITING"
  ) {
    return "paragraph";
  }
  if (item.itemType === "OUTLINE" || item.itemType === "REVERSE_OUTLINE")
    return "outline";
  return "sentence";
}
