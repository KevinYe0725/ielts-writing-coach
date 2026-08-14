import type {
  TeachingPracticeAnalysis,
  TeachingPracticeResponseData,
} from "./types";

import {
  projectTeachingPracticeAnalysisAtoms,
  renderTeachingPracticeAnalysisAtoms,
} from "@iwc/learning-contracts";

type UnknownRecord = Record<string, unknown>;

const MAX_ID_LENGTH = 512;
const MAX_SUMMARY_LENGTH = 1_000;
const MAX_TEXT_LENGTH = 1_500;
const MAX_TITLE_LENGTH = 300;
const MAX_ANSWER_LENGTH = 4_000;
const MAX_STRENGTHS = 2;
const MAX_COMPARISONS = 3;
const MAX_EVIDENCE_ITEMS = 4;

const analysisStates = new Set<TeachingPracticeResponseData["analysisState"]>([
  "REFERENCE_READY",
  "ANALYSIS_PENDING",
  "ANALYSIS_READY",
  "ANALYSIS_UNAVAILABLE",
  "DEMO_ONLY",
]);

const neutralDemoAnalysis: TeachingPracticeAnalysis = {
  kind: "DEMO_ONLY",
  summary: {
    zh: "你的答案已保存；当前只展示解析结构，不判断语言质量。",
    en: "Your answer was saved. This view only demonstrates the analysis structure and does not judge language quality.",
  },
  strengths: [],
  comparisonPoints: [],
  nextCheck: {
    zh: "请先对照题目要求和参考思路自行检查答案。",
    en: "For now, compare your answer with the task and reference idea yourself.",
  },
  uncertainty: {
    zh: "当前没有对你的英语作出个性化判断。",
    en: "No personalized judgment about your English was made here.",
  },
};

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum
    ? normalized
    : null;
}

function learnerCopyString(value: unknown, maximum: number): string | null {
  return boundedString(value, maximum);
}

function localizedText(value: unknown, maximum = MAX_TEXT_LENGTH) {
  const candidate = asRecord(value);
  const zh = learnerCopyString(candidate?.zh, maximum);
  const en = learnerCopyString(candidate?.en, maximum);
  return candidate && zh && en ? { zh, en } : null;
}

function evidenceSpans(
  value: unknown,
  submittedAnswer: string,
): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_EVIDENCE_ITEMS
  )
    return null;
  const output: string[] = [];
  for (const item of value) {
    const evidence = boundedString(item, MAX_TEXT_LENGTH);
    if (!evidence || !submittedAnswer.includes(evidence)) return null;
    output.push(evidence);
  }
  return output;
}

function projectedArray<T>(
  value: unknown,
  maximum: number,
  project: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const output: T[] = [];
  for (const item of value) {
    const projected = project(item);
    if (!projected) return null;
    output.push(projected);
  }
  return output;
}

function projectAnalysis(
  value: unknown,
  submittedAnswer: string,
): TeachingPracticeAnalysis | null {
  const atoms = projectTeachingPracticeAnalysisAtoms(value, submittedAnswer);
  if (atoms)
    return renderTeachingPracticeAnalysisAtoms(
      atoms,
    ) as TeachingPracticeAnalysis;
  const candidate = asRecord(value);
  const kind = candidate?.kind;
  if (!candidate || (kind !== "DETERMINISTIC_CHOICE" && kind !== "DEMO_ONLY"))
    return null;

  const summary = localizedText(candidate.summary, MAX_SUMMARY_LENGTH);
  const nextCheck = localizedText(candidate.nextCheck);
  if (kind === "DEMO_ONLY") {
    const demoSummary = asRecord(candidate.summary);
    const demoNextCheck = asRecord(candidate.nextCheck);
    const demoUncertainty = asRecord(candidate.uncertainty);
    const hasDemoSummary = Boolean(
      boundedString(demoSummary?.zh, MAX_SUMMARY_LENGTH) &&
        boundedString(demoSummary?.en, MAX_SUMMARY_LENGTH),
    );
    const hasDemoNextCheck = Boolean(
      boundedString(demoNextCheck?.zh, MAX_TEXT_LENGTH) &&
        boundedString(demoNextCheck?.en, MAX_TEXT_LENGTH),
    );
    const hasDemoUncertainty = Boolean(
      boundedString(demoUncertainty?.zh, MAX_TEXT_LENGTH) &&
        boundedString(demoUncertainty?.en, MAX_TEXT_LENGTH),
    );
    const structurallyNeutralDemo =
      Array.isArray(candidate.strengths) &&
      candidate.strengths.length === 0 &&
      Array.isArray(candidate.comparisonPoints) &&
      candidate.comparisonPoints.length === 0 &&
      candidate.keyImprovement === undefined &&
      candidate.improvedAnswerEn === undefined;
    return hasDemoSummary &&
      hasDemoNextCheck &&
      hasDemoUncertainty &&
      structurallyNeutralDemo
      ? neutralDemoAnalysis
      : null;
  }
  const strengths = projectedArray(
    candidate.strengths,
    MAX_STRENGTHS,
    (item) => {
      const entry = asRecord(item);
      const zh = learnerCopyString(entry?.zh, MAX_TEXT_LENGTH);
      const en = learnerCopyString(entry?.en, MAX_TEXT_LENGTH);
      const userAnswerEvidence = evidenceSpans(
        entry?.userAnswerEvidence,
        submittedAnswer,
      );
      return entry && zh && en && userAnswerEvidence
        ? { zh, en, userAnswerEvidence }
        : null;
    },
  );
  const comparisonPoints = projectedArray(
    candidate.comparisonPoints,
    MAX_COMPARISONS,
    (item) => {
      const entry = asRecord(item);
      const aspect = localizedText(entry?.aspect, MAX_TITLE_LENGTH);
      const referenceFeature = localizedText(entry?.referenceFeature);
      const learnerDifference = localizedText(entry?.learnerDifference);
      const userAnswerEvidence = evidenceSpans(
        entry?.userAnswerEvidence,
        submittedAnswer,
      );
      return entry &&
        aspect &&
        referenceFeature &&
        learnerDifference &&
        userAnswerEvidence
        ? {
            aspect,
            referenceFeature,
            learnerDifference,
            userAnswerEvidence,
          }
        : null;
    },
  );
  if (!summary || !nextCheck || !strengths || !comparisonPoints) return null;

  const uncertainty =
    candidate.uncertainty === undefined
      ? undefined
      : localizedText(candidate.uncertainty);
  if (candidate.uncertainty !== undefined && !uncertainty) return null;

  let keyImprovement: TeachingPracticeAnalysis["keyImprovement"];
  if (candidate.keyImprovement !== undefined) {
    const improvement = asRecord(candidate.keyImprovement);
    const title = localizedText(improvement?.title, MAX_TITLE_LENGTH);
    const explanation = localizedText(improvement?.explanation);
    const whyItMatters = localizedText(improvement?.whyItMatters);
    const userAnswerEvidence = evidenceSpans(
      improvement?.userAnswerEvidence,
      submittedAnswer,
    );
    if (
      !improvement ||
      !title ||
      !explanation ||
      !whyItMatters ||
      !userAnswerEvidence
    )
      return null;
    keyImprovement = {
      title,
      explanation,
      whyItMatters,
      userAnswerEvidence,
    };
  }

  if (candidate.improvedAnswerEn !== undefined) return null;

  return {
    kind,
    summary,
    strengths,
    ...(keyImprovement ? { keyImprovement } : {}),
    comparisonPoints,
    nextCheck,
    ...(uncertainty ? { uncertainty } : {}),
  };
}

function unavailableOuter(
  response: Pick<
    TeachingPracticeResponseData,
    "id" | "promptId" | "submittedAnswer" | "responseMode"
  >,
): TeachingPracticeResponseData {
  return {
    id: response.id,
    promptId: response.promptId,
    submittedAnswer: response.submittedAnswer,
    responseMode: response.responseMode,
    analysisState: "ANALYSIS_UNAVAILABLE",
    analysis: null,
  };
}

/**
 * Final browser boundary for tutorial responses. Every non-public field is
 * dropped and malformed learner judgments collapse to a usable resource.
 */
export function projectTeachingPracticeResponse(
  value: unknown,
): TeachingPracticeResponseData | null {
  const candidate = asRecord(value);
  const id = boundedString(candidate?.id, MAX_ID_LENGTH);
  const promptId = boundedString(candidate?.promptId, MAX_ID_LENGTH);
  const submittedAnswer =
    typeof candidate?.submittedAnswer === "string" &&
    candidate.submittedAnswer.trim().length > 0 &&
    candidate.submittedAnswer.length <= MAX_ANSWER_LENGTH
      ? candidate.submittedAnswer
      : null;
  const responseMode = candidate?.responseMode;
  const analysisState = candidate?.analysisState;
  if (
    !candidate ||
    !id ||
    !promptId ||
    !submittedAnswer ||
    (responseMode !== "CHOICE" && responseMode !== "SHORT_TEXT") ||
    typeof analysisState !== "string" ||
    !analysisStates.has(
      analysisState as TeachingPracticeResponseData["analysisState"],
    )
  )
    return null;

  const safeResponseMode =
    responseMode as TeachingPracticeResponseData["responseMode"];
  const safeAnalysisState =
    analysisState as TeachingPracticeResponseData["analysisState"];
  const outer = {
    id,
    promptId,
    submittedAnswer,
    responseMode: safeResponseMode,
  };
  if (
    safeAnalysisState === "REFERENCE_READY" ||
    safeAnalysisState === "ANALYSIS_PENDING" ||
    safeAnalysisState === "ANALYSIS_UNAVAILABLE"
  ) {
    if (
      safeResponseMode === "CHOICE" &&
      safeAnalysisState !== "ANALYSIS_UNAVAILABLE"
    ) {
      return unavailableOuter(outer);
    }
    return candidate.analysis === null || candidate.analysis === undefined
      ? { ...outer, analysisState: safeAnalysisState, analysis: null }
      : unavailableOuter(outer);
  }

  const analysis = projectAnalysis(candidate.analysis, submittedAnswer);
  const compatible =
    safeAnalysisState === "ANALYSIS_READY"
      ? (safeResponseMode === "SHORT_TEXT" &&
          analysis?.kind === "PERSONALIZED") ||
        (safeResponseMode === "CHOICE" &&
          analysis?.kind === "DETERMINISTIC_CHOICE")
      : safeResponseMode === "SHORT_TEXT" && analysis?.kind === "DEMO_ONLY";
  return analysis && compatible
    ? { ...outer, analysisState: safeAnalysisState, analysis }
    : unavailableOuter(outer);
}

export function unavailableTeachingPracticeResponse(
  value: Pick<
    TeachingPracticeResponseData,
    "id" | "promptId" | "submittedAnswer" | "responseMode"
  >,
): TeachingPracticeResponseData {
  return unavailableOuter(value);
}
