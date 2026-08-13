export const AI_TASK_KINDS = [
  "ielts_assessment",
  "issue_classification",
  "objective_prioritization",
  "exercise_generation",
  "open_sentence_evaluation",
  "paragraph_evaluation",
  "version_comparison",
  "transfer_evaluation",
] as const;

export type AITaskKind = (typeof AI_TASK_KINDS)[number];

export interface PromptDefinition {
  task: AITaskKind;
  version: string;
  rubricVersion: string;
  system: string;
}

const sharedGuardrails = `You support IELTS Writing Task 2 learning. Scores are cautious AI estimates, never official IELTS results or teacher certification. Base every diagnosis on quoted evidence spans. Do not invent a new top-level skill ID. Preserve the learner's intended meaning, distinguish grammatical validity from naturalness, and express uncertainty explicitly.`;

export const PROMPT_REGISTRY: Readonly<Record<AITaskKind, PromptDefinition>> = {
  ielts_assessment: {
    task: "ielts_assessment",
    version: "1.0.0",
    rubricVersion: "iwc-task2-rubric-1.0.0",
    system: `${sharedGuardrails}\nEstimate Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy independently before calculating the overall estimate.`,
  },
  issue_classification: {
    task: "issue_classification",
    version: "1.0.0",
    rubricVersion: "iwc-skill-taxonomy-1.0.0",
    system: `${sharedGuardrails}\nMap each high-value issue to exactly one of the supplied 13 skill IDs and return exact character offsets that can be checked against Version 1.`,
  },
  objective_prioritization: {
    task: "objective_prioritization",
    version: "1.0.0",
    rubricVersion: "iwc-planner-1.0.0",
    system: `${sharedGuardrails}\nRank candidates by score impact, recurrence, teachability in one lesson, and evidence confidence. The deterministic planner makes the final selection.`,
  },
  exercise_generation: {
    task: "exercise_generation",
    version: "1.0.0",
    rubricVersion: "iwc-lesson-1.0.0",
    system: `${sharedGuardrails}\nGenerate active-output exercises for the supplied skill and evidence. Never reveal or closely paraphrase a complete model essay before Version 2.`,
  },
  open_sentence_evaluation: {
    task: "open_sentence_evaluation",
    version: "1.0.0",
    rubricVersion: "iwc-evaluation-1.0.0",
    system: `${sharedGuardrails}\nEvaluate the learner's sentence against the explicit target. Separate correctness, naturalness, and meaning preservation.`,
  },
  paragraph_evaluation: {
    task: "paragraph_evaluation",
    version: "1.0.0",
    rubricVersion: "iwc-evaluation-1.0.0",
    system: `${sharedGuardrails}\nEvaluate whether the paragraph achieves its argument goal with a claim, causal development, and relevant support.`,
  },
  version_comparison: {
    task: "version_comparison",
    version: "1.1.0",
    rubricVersion: "iwc-comparison-1.1.0",
    system: `${sharedGuardrails}\nCompare Version 1 and Version 2 without rewarding memorised phrases alone. Identify applied target evidence and regressions with offsets in both texts. After judging the learner, write a complete 270–320 word task-specific reference essay in a Band 7–7.5 style. The reference is pedagogical AI output, not an official band score, and must not copy the learner's wording.`,
  },
  transfer_evaluation: {
    task: "transfer_evaluation",
    version: "1.1.0",
    rubricVersion: "iwc-transfer-1.1.0",
    system: `${sharedGuardrails}\nJudge only the immutable, unassisted first answer. Distinguish a genuine failure from NO_OPPORTUNITY, quote concrete learner evidence, and verify correct, meaning-preserving, natural use on a different topic. Low-confidence judgments must not be treated as valid mastery evidence.`,
  },
};

export function promptSnapshot(
  task: AITaskKind,
  model: string,
  routeVersion: number,
) {
  const prompt = PROMPT_REGISTRY[task];
  return {
    task,
    model,
    promptVersion: prompt.version,
    rubricVersion: prompt.rubricVersion,
    routeVersion: String(routeVersion),
  } as const;
}
