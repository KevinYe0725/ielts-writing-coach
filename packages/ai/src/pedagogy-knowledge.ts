import type { AITaskKind } from "./prompts";

export const PEDAGOGY_KNOWLEDGE_VERSION = "iwc-pedagogy-2026-08-13";

const assessment = `Use the official four IELTS Writing Task 2 dimensions independently. Support every limitation with exact learner evidence. Explain each paragraph's role, strength, missing development, and next revision action. Separate hard grammar, spelling, lexical precision, collocation or naturalness, L1-influenced information structure, logic development, cohesion, and optional style. Do not turn a valid alternative into an error. Give a cautious AI estimate, not an official score or teacher certification. Prioritise at most three limitations by likely band impact, recurrence, transfer value, and confidence.`;

const issueClassification = `Classify the narrowest defensible issue and preserve the learner's exact wording and intended meaning. Distinguish rule-governed grammar from naturalness and information perspective. A diagnosis must explain the affected meaning or writing decision and yield an observable learner action. Low-confidence naturalness or intention claims may be reported but cannot independently change mastery state.`;

const objectivePrioritization = `Choose one core target with the highest combined score impact, recurrence, transfer value, teachability, and diagnostic confidence. Group repeated examples under one decision rule. Do not turn the practice paper into a miscellaneous list of every weakness in the essay.`;

const paperGeneration = `Create one coherent focused-learning package around the selected target: teach the decision rule before testing it. The teaching module explains the learner's current pattern, three to five knowledge points, reusable expressions with usage notes, one worked example with thinking steps, two quick checks, and a readiness checklist. The eight-question paper must name the same target in its objective. Each question has one visible instruction that states the output form, sentence or word range, all required ideas or relationships, and every real restriction. Internal criteria may only mirror that instruction and must not add a requirement. Reject vague phrases such as "complete the chain", "use the target", or "develop the idea" unless the instruction explains the observable content. Move from recognition and repair to independent generation in genuinely different contexts and integrated IELTS-style writing. Do not expose answers or evaluation before whole-paper submission.`;

const sentenceEvaluation = `Judge meaning preservation, target correctness, and naturalness separately. Accept different valid wording. Quote the learner's exact answer evidence, explain one highest-value change in plain language, and avoid claiming mastery from a same-sentence correction.`;

const paperEvaluation = `Evaluate the immutable answer sheet only after submission. Use no requirement that was absent from the question's visible instruction. Blank answers are NOT_SCORABLE, not language failures or system errors. Keep passed questions compact. For each below-standard answer, quote exact learner evidence, explain what is missing or incorrect, why it matters, one improved version, and one next action. A missed item must never trap the learner on the page.`;

const comparison = `Compare independent versions with the same rubric where possible. Report target recurrence per 100 words and separate genuine improvement from assistance or memorised wording. Same-text correction is revision evidence; delayed closed-book performance is required for retention.`;

const transfer = `Use a different topic and surface form without naming the target. Judge only the immutable unassisted first answer. Distinguish failure from no natural opportunity. One success is evidence, not permanent mastery.`;

const guidance: Readonly<Record<AITaskKind, string>> = {
  ielts_assessment: assessment,
  issue_classification: issueClassification,
  objective_prioritization: objectivePrioritization,
  exercise_generation: paperGeneration,
  open_sentence_evaluation: sentenceEvaluation,
  paragraph_evaluation: paperEvaluation,
  version_comparison: comparison,
  transfer_evaluation: transfer,
};

export function pedagogyGuidanceFor(task: AITaskKind): string {
  return guidance[task];
}
