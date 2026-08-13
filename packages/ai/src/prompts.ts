import {
  PEDAGOGY_KNOWLEDGE_VERSION,
  pedagogyGuidanceFor,
} from "./pedagogy-knowledge";

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

function withKnowledge(task: AITaskKind, instruction: string): string {
  return `${sharedGuardrails}\nTeaching knowledge (${PEDAGOGY_KNOWLEDGE_VERSION}): ${pedagogyGuidanceFor(task)}\n${instruction}`;
}

export const PROMPT_REGISTRY: Readonly<Record<AITaskKind, PromptDefinition>> = {
  ielts_assessment: {
    task: "ielts_assessment",
    version: "1.2.0",
    rubricVersion: "iwc-task2-rubric-1.0.0",
    system: withKnowledge(
      "ielts_assessment",
      "Estimate Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy independently before calculating the overall estimate. Return a concise bilingual overall summary, one genuine strength, and evidence-linked paragraph feedback for every paragraph.",
    ),
  },
  issue_classification: {
    task: "issue_classification",
    version: "1.2.0",
    rubricVersion: "iwc-skill-taxonomy-1.0.0",
    system: withKnowledge(
      "issue_classification",
      "Map each high-value issue to exactly one of the supplied 13 skill IDs and return exact character offsets that can be checked against Version 1. For every issue, distinguish its learner-facing type, give a meaning-preserving corrected version, explain the problem in plain Chinese, teach one transferable knowledge point, and give a future self-check rule.",
    ),
  },
  objective_prioritization: {
    task: "objective_prioritization",
    version: "1.1.0",
    rubricVersion: "iwc-planner-1.0.0",
    system: withKnowledge(
      "objective_prioritization",
      "Rank candidates by score impact, recurrence, teachability in one lesson, and evidence confidence. The deterministic planner makes the final selection.",
    ),
  },
  exercise_generation: {
    task: "exercise_generation",
    version: "3.0.0",
    rubricVersion: "iwc-focused-learning-package-3.0.0",
    system: withKnowledge(
      "exercise_generation",
      "Create one coherent learning package: a focused teaching module followed by a timed practice paper. Use plain learner-facing Chinese for teaching and instructions and natural English for writing material. The module and paper must share the exact same target title. Do not mention database fields, IDs, schemas, prompts, models, jobs, evidence gates, state machines, retries, or any other implementation detail. Never reveal or closely paraphrase a complete model essay before Version 2.",
    ),
  },
  open_sentence_evaluation: {
    task: "open_sentence_evaluation",
    version: "1.1.0",
    rubricVersion: "iwc-evaluation-1.0.0",
    system: withKnowledge(
      "open_sentence_evaluation",
      "Evaluate the learner's sentence against the explicit target.",
    ),
  },
  paragraph_evaluation: {
    task: "paragraph_evaluation",
    version: "2.1.0",
    rubricVersion: "iwc-practice-paper-2.0.0",
    system: withKnowledge(
      "paragraph_evaluation",
      "Return a concise whole-paper summary, then detailed teaching analysis only for questions that do not meet the published standard. Use human-readable language; never expose internal IDs, schema names, model metadata, jobs, routes, retries, confidence gates, or implementation terminology.",
    ),
  },
  version_comparison: {
    task: "version_comparison",
    version: "1.1.0",
    rubricVersion: "iwc-comparison-1.1.0",
    system: withKnowledge(
      "version_comparison",
      "Identify applied target evidence and regressions with offsets in both texts. After judging the learner, write a complete 270–320 word task-specific reference essay in a Band 7–7.5 style. The reference is pedagogical AI output, not an official band score, and must not copy the learner's wording.",
    ),
  },
  transfer_evaluation: {
    task: "transfer_evaluation",
    version: "1.1.0",
    rubricVersion: "iwc-transfer-1.1.0",
    system: withKnowledge(
      "transfer_evaluation",
      "Quote concrete learner evidence and verify correct, meaning-preserving, natural use on a different topic. Low-confidence judgments must not be treated as valid mastery evidence.",
    ),
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
