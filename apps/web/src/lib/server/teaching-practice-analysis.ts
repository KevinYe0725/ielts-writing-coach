import { and, eq } from "drizzle-orm";

import {
  teachingPracticeResponse,
  type Database,
  type TeachingPracticeResponseMode,
  type TeachingPracticeResponseStatus,
} from "@iwc/db";
import {
  projectTeachingPracticeAnalysisAtoms,
  type TeachingPracticeAnalysisAtoms,
} from "@iwc/learning-contracts";
import {
  findTeachingPrompt as findCanonicalTeachingPrompt,
  type TeachingPracticePrompt,
} from "@iwc/worker/focused-learning";

type UnknownRecord = Record<string, unknown>;

export interface LocalizedTeachingText {
  readonly zh: string;
  readonly en: string;
}

export interface TeachingPracticeStrength {
  readonly zh: string;
  readonly en: string;
  readonly userAnswerEvidence: readonly string[];
}

export interface TeachingPracticeKeyImprovement {
  readonly title: LocalizedTeachingText;
  readonly explanation: LocalizedTeachingText;
  readonly whyItMatters: LocalizedTeachingText;
  readonly userAnswerEvidence: readonly string[];
}

export interface TeachingPracticeComparisonPoint {
  readonly aspect: LocalizedTeachingText;
  readonly referenceFeature: LocalizedTeachingText;
  readonly learnerDifference: LocalizedTeachingText;
  readonly userAnswerEvidence: readonly string[];
}

export interface TeachingPracticeAnalysis {
  readonly kind: "PERSONALIZED" | "DETERMINISTIC_CHOICE" | "DEMO_ONLY";
  readonly summary: LocalizedTeachingText;
  readonly strengths: readonly TeachingPracticeStrength[];
  readonly keyImprovement?: TeachingPracticeKeyImprovement;
  readonly comparisonPoints: readonly TeachingPracticeComparisonPoint[];
  readonly nextCheck: LocalizedTeachingText;
  readonly uncertainty?: LocalizedTeachingText;
}

export interface TeachingPracticeResponse {
  readonly id: string;
  readonly lessonPlanId: string;
  readonly userId: string;
  readonly promptId: string;
  readonly submittedAnswer: string;
  readonly responseMode: TeachingPracticeResponseMode;
  readonly status: TeachingPracticeResponseStatus;
  readonly aiJobId: string | null;
  readonly analysis:
    | TeachingPracticeAnalysis
    | TeachingPracticeAnalysisAtoms
    | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const analysisKinds = new Set<TeachingPracticeAnalysis["kind"]>([
  "DETERMINISTIC_CHOICE",
  "DEMO_ONLY",
]);
const MAX_SUMMARY_LENGTH = 1_000;
const MAX_TEXT_LENGTH = 1_500;
const MAX_TITLE_LENGTH = 300;
const MAX_ANSWER_LENGTH = 4_000;
const MAX_EVIDENCE_ITEMS = 4;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, maximum) : null;
}

function learnerCopyString(value: unknown, maximum: number): string | null {
  return boundedString(value, maximum);
}

function projectLocalizedText(
  value: unknown,
  maximum = MAX_TEXT_LENGTH,
): LocalizedTeachingText | null {
  const record = asRecord(value);
  const zh = learnerCopyString(record?.zh, maximum);
  const en = learnerCopyString(record?.en, maximum);
  return record && zh !== null && en !== null ? { zh, en } : null;
}

function projectEvidence(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const projected: string[] = [];
  for (const item of value.slice(0, MAX_EVIDENCE_ITEMS)) {
    const evidence = boundedString(item, MAX_TEXT_LENGTH);
    if (evidence === null) return null;
    projected.push(evidence);
  }
  return projected;
}

function projectArray<T>(
  value: unknown,
  maximum: number,
  project: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const output: T[] = [];
  for (const item of value.slice(0, maximum)) {
    const projected = project(item);
    if (projected === null) return null;
    output.push(projected);
  }
  return output;
}

function projectStrength(value: unknown): TeachingPracticeStrength | null {
  const record = asRecord(value);
  const zh = learnerCopyString(record?.zh, MAX_TEXT_LENGTH);
  const en = learnerCopyString(record?.en, MAX_TEXT_LENGTH);
  const userAnswerEvidence = projectEvidence(record?.userAnswerEvidence);
  return record && zh !== null && en !== null && userAnswerEvidence
    ? { zh, en, userAnswerEvidence }
    : null;
}

function projectKeyImprovement(
  value: unknown,
): TeachingPracticeKeyImprovement | null {
  const record = asRecord(value);
  const title = projectLocalizedText(record?.title, MAX_TITLE_LENGTH);
  const explanation = projectLocalizedText(record?.explanation);
  const whyItMatters = projectLocalizedText(record?.whyItMatters);
  const userAnswerEvidence = projectEvidence(record?.userAnswerEvidence);
  return record && title && explanation && whyItMatters && userAnswerEvidence
    ? { title, explanation, whyItMatters, userAnswerEvidence }
    : null;
}

function projectComparisonPoint(
  value: unknown,
): TeachingPracticeComparisonPoint | null {
  const record = asRecord(value);
  const aspect = projectLocalizedText(record?.aspect, MAX_TITLE_LENGTH);
  const referenceFeature = projectLocalizedText(record?.referenceFeature);
  const learnerDifference = projectLocalizedText(record?.learnerDifference);
  const userAnswerEvidence = projectEvidence(record?.userAnswerEvidence);
  return record &&
    aspect &&
    referenceFeature &&
    learnerDifference &&
    userAnswerEvidence
    ? { aspect, referenceFeature, learnerDifference, userAnswerEvidence }
    : null;
}

/** Drops every non-contract field before analysis may reach a learner. */
export function projectTeachingPracticeAnalysis(
  value: unknown,
  submittedAnswer = "",
): TeachingPracticeAnalysis | TeachingPracticeAnalysisAtoms | null {
  const atoms = projectTeachingPracticeAnalysisAtoms(value, submittedAnswer);
  if (atoms) return atoms;
  const record = asRecord(value);
  const kind = record?.kind;
  if (
    !record ||
    typeof kind !== "string" ||
    !analysisKinds.has(kind as TeachingPracticeAnalysis["kind"])
  )
    return null;
  const summary = projectLocalizedText(record.summary, MAX_SUMMARY_LENGTH);
  const strengths = projectArray(record.strengths, 2, projectStrength);
  const comparisonPoints = projectArray(
    record.comparisonPoints,
    3,
    projectComparisonPoint,
  );
  const nextCheck = projectLocalizedText(record.nextCheck);
  if (!summary || !strengths || !comparisonPoints || !nextCheck) return null;

  const projected: TeachingPracticeAnalysis = {
    kind: kind as TeachingPracticeAnalysis["kind"],
    summary,
    strengths,
    comparisonPoints,
    nextCheck,
  };
  const uncertainty =
    record.uncertainty === undefined
      ? undefined
      : projectLocalizedText(record.uncertainty);
  if (record.uncertainty !== undefined && !uncertainty) return null;
  if (kind === "DEMO_ONLY") {
    return uncertainty &&
      strengths.length === 0 &&
      comparisonPoints.length === 0 &&
      record.keyImprovement === undefined &&
      record.improvedAnswerEn === undefined
      ? { ...projected, uncertainty }
      : null;
  }
  const keyImprovement =
    record.keyImprovement === undefined
      ? undefined
      : projectKeyImprovement(record.keyImprovement);
  if (record.keyImprovement !== undefined && !keyImprovement) return null;
  if (record.improvedAnswerEn !== undefined) return null;

  return {
    ...projected,
    ...(keyImprovement ? { keyImprovement } : {}),
    ...(uncertainty ? { uncertainty } : {}),
  };
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isCanonicalTeachingPrompt(
  value: unknown,
): value is TeachingPracticePrompt {
  const prompt = asRecord(value);
  if (
    !prompt ||
    typeof prompt.id !== "string" ||
    typeof prompt.instructionZh !== "string" ||
    typeof prompt.instructionEn !== "string" ||
    typeof prompt.promptEn !== "string" ||
    (prompt.responseMode !== "CHOICE" &&
      prompt.responseMode !== "SHORT_TEXT") ||
    (prompt.context !== "SAME_TOPIC" && prompt.context !== "UNSEEN_TOPIC") ||
    !isStringArray(prompt.optionsEn) ||
    typeof prompt.referenceAnswerEn !== "string" ||
    typeof prompt.referenceReasoningZh !== "string" ||
    typeof prompt.referenceReasoningEn !== "string"
  )
    return false;
  return prompt.responseMode === "CHOICE"
    ? prompt.optionsEn.length >= 2 &&
        prompt.optionsEn.includes(prompt.referenceAnswerEn)
    : prompt.optionsEn.length === 0;
}

/** Looks only inside canonical tutorial PRACTICE blocks, never timed-paper items. */
export function findTeachingPrompt(
  paperContent: unknown,
  promptId: string,
): TeachingPracticePrompt | null {
  return findCanonicalTeachingPrompt(paperContent, promptId);
}

/** Choice feedback is derived from canonical data and has no AI dependency. */
export function buildDeterministicChoiceAnalysis(
  prompt: TeachingPracticePrompt,
  submittedAnswer: string,
): TeachingPracticeAnalysis | null {
  if (
    !isCanonicalTeachingPrompt(prompt) ||
    prompt.responseMode !== "CHOICE" ||
    !prompt.optionsEn.includes(submittedAnswer)
  )
    return null;
  const followsReference = submittedAnswer === prompt.referenceAnswerEn;
  return {
    kind: "DETERMINISTIC_CHOICE",
    summary: followsReference
      ? {
          zh: "你的选择与参考思路采用了同一条作用路径。参考选项是一种可行表达，而不是唯一答案。",
          en: "Your choice follows the same functional path as the reference, which is one possible answer rather than the only valid wording.",
        }
      : {
          zh: "你的选择与参考选项强调了不同的句子功能。下面对照这种差异，不把参考表达当作唯一答案。",
          en: "Your choice and the reference emphasize different sentence functions. The comparison treats the reference as one possible answer, not the only valid wording.",
        },
    strengths: followsReference
      ? [
          {
            zh: "你识别出了参考思路所强调的作用过程。",
            en: "You identified the functional process emphasized by the reference.",
            userAnswerEvidence: [submittedAnswer],
          },
        ]
      : [],
    comparisonPoints: [
      {
        aspect: { zh: "句子功能", en: "Sentence function" },
        referenceFeature: {
          zh: prompt.referenceReasoningZh,
          en: prompt.referenceReasoningEn,
        },
        learnerDifference: followsReference
          ? {
              zh: "你的选择呈现了相同的作用过程。",
              en: "Your choice presents the same functional process.",
            }
          : {
              zh: `你的选择“${submittedAnswer}”强调了另一种功能；可以继续检查它是否写出了题目要求的中间过程。`,
              en: `Your choice, “${submittedAnswer}”, emphasizes a different function; check whether it states the intermediate process requested by the prompt.`,
            },
        userAnswerEvidence: [submittedAnswer],
      },
    ],
    nextCheck: {
      zh: "检查选项是否不仅陈述主题，还明确写出题目要求的作用过程。",
      en: "Check whether the option does more than name the topic by stating the requested functional process.",
    },
  };
}

export interface CreateTeachingPracticeResponseInput {
  readonly lessonPlanId: string;
  readonly userId: string;
  readonly promptId: string;
  readonly submittedAnswer: string;
  readonly responseMode: TeachingPracticeResponseMode;
  readonly status: TeachingPracticeResponseStatus;
  readonly aiJobId?: string | null;
  readonly analysis?: unknown;
}

function learnerFacingResponse(
  row: typeof teachingPracticeResponse.$inferSelect,
): TeachingPracticeResponse {
  return {
    ...row,
    analysis: projectTeachingPracticeAnalysis(
      row.analysis,
      row.submittedAnswer,
    ),
  };
}

/**
 * Inserts once and returns the existing row on replay.  Conflict handling never
 * updates submitted_answer, so a later request cannot replace the first answer.
 */
export async function createOrGetTeachingPracticeResponse(
  db: Database,
  input: CreateTeachingPracticeResponseInput,
): Promise<TeachingPracticeResponse> {
  const analysis =
    input.analysis === undefined || input.analysis === null
      ? null
      : projectTeachingPracticeAnalysis(input.analysis, input.submittedAnswer);
  if (input.analysis !== undefined && input.analysis !== null && !analysis) {
    throw new TypeError("Invalid learner-facing teaching-practice analysis");
  }
  const [created] = await db
    .insert(teachingPracticeResponse)
    .values({
      lessonPlanId: input.lessonPlanId,
      userId: input.userId,
      promptId: input.promptId,
      submittedAnswer: input.submittedAnswer,
      responseMode: input.responseMode,
      status: input.status,
      aiJobId: input.aiJobId ?? null,
      analysis: analysis as UnknownRecord | null,
    })
    .onConflictDoNothing({
      target: [
        teachingPracticeResponse.lessonPlanId,
        teachingPracticeResponse.userId,
        teachingPracticeResponse.promptId,
      ],
    })
    .returning();
  if (created) return learnerFacingResponse(created);

  const existing = await db.query.teachingPracticeResponse.findFirst({
    where: and(
      eq(teachingPracticeResponse.lessonPlanId, input.lessonPlanId),
      eq(teachingPracticeResponse.userId, input.userId),
      eq(teachingPracticeResponse.promptId, input.promptId),
    ),
  });
  if (!existing) {
    throw new Error("Teaching-practice response conflict could not be read");
  }
  return learnerFacingResponse(existing);
}
