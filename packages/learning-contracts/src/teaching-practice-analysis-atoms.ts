export const TEACHING_PRACTICE_STRENGTH_CODES = [
  "DIRECT_RESPONSE",
  "EXPLICIT_CAUSAL_LINK",
  "SPECIFIC_MECHANISM",
  "CLEAR_OUTCOME",
  "VALID_ALTERNATIVE_PATH",
] as const;

export const TEACHING_PRACTICE_COMPARISON_CODES = [
  "SAME_FUNCTIONAL_PATH",
  "VALID_ALTERNATIVE_PATH",
  "DIFFERENT_FOCUS",
  "MORE_SPECIFIC_RESULT",
] as const;

export const TEACHING_PRACTICE_IMPROVEMENT_CODES = [
  "MAKE_CAUSAL_LINK_EXPLICIT",
  "ADD_INTERMEDIATE_MECHANISM",
  "MAKE_OUTCOME_SPECIFIC",
  "CLARIFY_POSITION",
  "USE_MORE_NATURAL_WORDING",
] as const;

export type TeachingPracticeStrengthCode =
  (typeof TEACHING_PRACTICE_STRENGTH_CODES)[number];
export type TeachingPracticeComparisonCode =
  (typeof TEACHING_PRACTICE_COMPARISON_CODES)[number];
export type TeachingPracticeImprovementCode =
  (typeof TEACHING_PRACTICE_IMPROVEMENT_CODES)[number];

interface EvidenceAtom<TCode extends string> {
  readonly code: TCode;
  readonly evidence: string;
}

export interface TeachingPracticeAnalysisAtoms {
  readonly kind: "PERSONALIZED_ATOMS_V1";
  readonly strengths: readonly EvidenceAtom<TeachingPracticeStrengthCode>[];
  readonly comparisons: readonly EvidenceAtom<TeachingPracticeComparisonCode>[];
  readonly improvements: readonly EvidenceAtom<TeachingPracticeImprovementCode>[];
  readonly uncertainty: "NONE" | "PARTIAL_EVIDENCE";
}

export interface RenderedTeachingPracticeAnalysis {
  readonly kind: "PERSONALIZED";
  readonly summary: LocalizedText;
  readonly strengths: readonly RenderedEvidenceText[];
  readonly comparisonPoints: readonly RenderedComparisonPoint[];
  readonly keyImprovement?: {
    readonly title: LocalizedText;
    readonly explanation: LocalizedText;
    readonly whyItMatters: LocalizedText;
    readonly userAnswerEvidence: readonly string[];
  };
  readonly nextCheck: LocalizedText;
  readonly uncertainty?: LocalizedText;
}

interface LocalizedText {
  readonly zh: string;
  readonly en: string;
}

interface RenderedEvidenceText extends LocalizedText {
  readonly userAnswerEvidence: readonly string[];
}

interface RenderedComparisonPoint {
  readonly aspect: LocalizedText;
  readonly referenceFeature: LocalizedText;
  readonly learnerDifference: LocalizedText;
  readonly userAnswerEvidence: readonly string[];
}

type UnknownRecord = Record<string, unknown>;

const strengthCodes = new Set<string>(TEACHING_PRACTICE_STRENGTH_CODES);
const comparisonCodes = new Set<string>(TEACHING_PRACTICE_COMPARISON_CODES);
const improvementCodes = new Set<string>(TEACHING_PRACTICE_IMPROVEMENT_CODES);

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function projectEvidenceAtoms<TCode extends string>(
  value: unknown,
  submittedAnswer: string,
  codes: ReadonlySet<string>,
  maximum: number,
): EvidenceAtom<TCode>[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const projected: EvidenceAtom<TCode>[] = [];
  for (const candidate of value) {
    const atom = record(candidate);
    if (!atom || !hasExactKeys(atom, ["code", "evidence"])) return null;
    const code = atom.code;
    const evidence = atom.evidence;
    if (
      typeof code !== "string" ||
      !codes.has(code) ||
      typeof evidence !== "string" ||
      evidence.trim().length === 0 ||
      evidence.length > 500 ||
      !submittedAnswer.includes(evidence)
    )
      return null;
    projected.push({ code: code as TCode, evidence });
  }
  return projected;
}

export function projectTeachingPracticeAnalysisAtoms(
  value: unknown,
  submittedAnswer: string,
): TeachingPracticeAnalysisAtoms | null {
  const candidate = record(value);
  if (
    !candidate ||
    !hasExactKeys(candidate, [
      "kind",
      "strengths",
      "comparisons",
      "improvements",
      "uncertainty",
    ]) ||
    candidate.kind !== "PERSONALIZED_ATOMS_V1" ||
    (candidate.uncertainty !== "NONE" &&
      candidate.uncertainty !== "PARTIAL_EVIDENCE")
  )
    return null;
  const strengths = projectEvidenceAtoms<TeachingPracticeStrengthCode>(
    candidate.strengths,
    submittedAnswer,
    strengthCodes,
    2,
  );
  const comparisons = projectEvidenceAtoms<TeachingPracticeComparisonCode>(
    candidate.comparisons,
    submittedAnswer,
    comparisonCodes,
    3,
  );
  const improvements = projectEvidenceAtoms<TeachingPracticeImprovementCode>(
    candidate.improvements,
    submittedAnswer,
    improvementCodes,
    1,
  );
  return strengths &&
    comparisons &&
    improvements &&
    strengths.length + comparisons.length + improvements.length > 0
    ? {
        kind: "PERSONALIZED_ATOMS_V1",
        strengths,
        comparisons,
        improvements,
        uncertainty: candidate.uncertainty,
      }
    : null;
}

const STRENGTH_COPY: Record<TeachingPracticeStrengthCode, LocalizedText> = {
  DIRECT_RESPONSE: {
    zh: "这部分直接回应了题目要求。",
    en: "This wording responds directly to the task.",
  },
  EXPLICIT_CAUSAL_LINK: {
    zh: "这句话明确呈现了原因与结果之间的联系。",
    en: "This wording makes the cause-and-result link explicit.",
  },
  SPECIFIC_MECHANISM: {
    zh: "这部分写出了观点如何产生结果的中间过程。",
    en: "This wording shows the mechanism between the idea and its result.",
  },
  CLEAR_OUTCOME: {
    zh: "这部分把最终结果表达得很清楚。",
    en: "This wording states the final outcome clearly.",
  },
  VALID_ALTERNATIVE_PATH: {
    zh: "这部分采用了不同于参考答案但可以成立的路径。",
    en: "This wording uses a route that differs from the reference but can still be valid.",
  },
};

const COMPARISON_COPY: Record<
  TeachingPracticeComparisonCode,
  Pick<RenderedComparisonPoint, "aspect" | "learnerDifference">
> = {
  SAME_FUNCTIONAL_PATH: {
    aspect: { zh: "论证路径", en: "Reasoning path" },
    learnerDifference: {
      zh: "你的原句与参考答案采用了相近的作用路径。",
      en: "Your wording follows a similar functional path to the reference.",
    },
  },
  VALID_ALTERNATIVE_PATH: {
    aspect: { zh: "论证路径", en: "Reasoning path" },
    learnerDifference: {
      zh: "你的原句采用了另一条同样可以成立的表达路径。",
      en: "Your wording uses a different route that can still be valid.",
    },
  },
  DIFFERENT_FOCUS: {
    aspect: { zh: "信息重点", en: "Focus" },
    learnerDifference: {
      zh: "你的原句与参考答案强调了不同的信息重点。",
      en: "Your wording emphasizes a different point from the reference.",
    },
  },
  MORE_SPECIFIC_RESULT: {
    aspect: { zh: "结果具体度", en: "Outcome specificity" },
    learnerDifference: {
      zh: "你的原句把结果落到了更具体的行为或变化上。",
      en: "Your wording makes the outcome more concrete.",
    },
  },
};

const REFERENCE_FEATURE: LocalizedText = {
  zh: "参考答案展示的是一种可行路径，而不是唯一写法。",
  en: "The reference answer shows one possible route, not the only valid wording.",
};

const IMPROVEMENT_COPY: Record<
  TeachingPracticeImprovementCode,
  {
    readonly title: LocalizedText;
    readonly explanation: LocalizedText;
    readonly whyItMatters: LocalizedText;
    readonly nextCheck: LocalizedText;
  }
> = {
  MAKE_CAUSAL_LINK_EXPLICIT: {
    title: { zh: "把因果联系写明", en: "Make the causal link explicit" },
    explanation: {
      zh: "明确说明前一个信息如何导致后一个结果。",
      en: "State how the first idea leads to the later result.",
    },
    whyItMatters: {
      zh: "读者需要看见两个信息之间的逻辑关系。",
      en: "The reader needs to see the logical relationship between the two ideas.",
    },
    nextCheck: {
      zh: "下次检查：原因和结果之间的联系是否明确？",
      en: "Next time, check whether the link between cause and result is explicit.",
    },
  },
  ADD_INTERMEDIATE_MECHANISM: {
    title: { zh: "补出中间机制", en: "Add the intermediate mechanism" },
    explanation: {
      zh: "在起点与结果之间补一句，说明变化是怎样发生的。",
      en: "Add how the change happens between the starting point and the outcome.",
    },
    whyItMatters: {
      zh: "中间机制能避免论证从原因直接跳到结论。",
      en: "The mechanism prevents the reasoning from jumping straight from cause to conclusion.",
    },
    nextCheck: {
      zh: "下次检查：原因和结果之间是否写出了中间过程？",
      en: "Next time, check whether the mechanism between cause and result is present.",
    },
  },
  MAKE_OUTCOME_SPECIFIC: {
    title: { zh: "把结果写得更具体", en: "Make the outcome more specific" },
    explanation: {
      zh: "把最终发生的行为或变化说清楚，避免只写笼统结果。",
      en: "Name the final behaviour or change instead of leaving the outcome general.",
    },
    whyItMatters: {
      zh: "具体结果能让读者确认这条论证链最终说明了什么。",
      en: "A specific outcome lets the reader see what the reasoning ultimately demonstrates.",
    },
    nextCheck: {
      zh: "下次检查：结果是否写出了具体行为或变化？",
      en: "Next time, check whether the outcome names a concrete behaviour or change.",
    },
  },
  CLARIFY_POSITION: {
    title: { zh: "把立场写得更明确", en: "Clarify the position" },
    explanation: {
      zh: "直接写明你支持、反对或倾向哪一方。",
      en: "State directly which position you support or prefer.",
    },
    whyItMatters: {
      zh: "明确立场能帮助读者理解后续理由服务于什么结论。",
      en: "A clear position shows the reader what conclusion the later reasons support.",
    },
    nextCheck: {
      zh: "下次检查：读者能否直接看出你的立场？",
      en: "Next time, check whether the reader can identify your position immediately.",
    },
  },
  USE_MORE_NATURAL_WORDING: {
    title: { zh: "换成更自然的表达", en: "Use more natural wording" },
    explanation: {
      zh: "保留原意，同时换成英语中更常见的搭配或句法。",
      en: "Keep the meaning while using a more conventional English collocation or structure.",
    },
    whyItMatters: {
      zh: "自然表达能减少读者理解句意时的额外负担。",
      en: "Natural wording reduces the effort needed to understand the sentence.",
    },
    nextCheck: {
      zh: "下次检查：关键搭配是否是英语中常见的说法？",
      en: "Next time, check whether the key collocation is conventional English.",
    },
  },
};

export function renderTeachingPracticeAnalysisAtoms(
  atoms: TeachingPracticeAnalysisAtoms,
): RenderedTeachingPracticeAnalysis {
  const improvement = atoms.improvements[0];
  const improvementCopy = improvement
    ? IMPROVEMENT_COPY[improvement.code]
    : undefined;
  const hasSpecificObservation =
    atoms.strengths.length > 0 || atoms.comparisons.length > 0;
  const summary = improvement
    ? {
        zh: "从你原句中的证据看，这次有一个最值得集中修改的点。",
        en: "The quoted wording supports one focused point to revise.",
      }
    : hasSpecificObservation
      ? {
          zh: "你原句中的证据足以支持一次有针对性的对照。",
          en: "The quoted wording supports a focused comparison.",
        }
      : {
          zh: "你的回答已保存；现有原句证据不足以支持更具体的说明。",
          en: "Your answer was saved, but the available wording does not support a more specific comment.",
        };
  return {
    kind: "PERSONALIZED",
    summary,
    strengths: atoms.strengths.map((atom) => ({
      ...STRENGTH_COPY[atom.code],
      userAnswerEvidence: [atom.evidence],
    })),
    comparisonPoints: atoms.comparisons.map((atom) => ({
      ...COMPARISON_COPY[atom.code],
      referenceFeature: REFERENCE_FEATURE,
      userAnswerEvidence: [atom.evidence],
    })),
    ...(improvement && improvementCopy
      ? {
          keyImprovement: {
            title: improvementCopy.title,
            explanation: improvementCopy.explanation,
            whyItMatters: improvementCopy.whyItMatters,
            userAnswerEvidence: [improvement.evidence],
          },
        }
      : {}),
    nextCheck:
      improvementCopy?.nextCheck ??
      ({
        zh: "下次继续检查：关键关系是否有原句证据支持？",
        en: "Next time, keep checking whether each key relationship is supported by the wording.",
      } as const),
    ...(atoms.uncertainty === "PARTIAL_EVIDENCE"
      ? {
          uncertainty: {
            zh: "这里只保留了能够由你的原句直接支持的部分。",
            en: "Only points directly supported by your wording are shown here.",
          },
        }
      : {}),
  };
}
