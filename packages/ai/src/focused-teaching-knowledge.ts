/**
 * Source-owned planning material for focused IELTS Writing tutorials.
 *
 * These notes are deliberately compact and original. They give a generator a
 * bounded teaching direction without imposing a visible course template or
 * copying a third-party lesson. Nothing in this file is rendered directly to
 * a learner.
 */
export type FocusedTeachingSkillId =
  | "complete_comparison"
  | "verb_form_trigger"
  | "sentence_boundary"
  | "subject_verb_agreement"
  | "article_control"
  | "collocation_perspective"
  | "word_form_precision"
  | "task_instruction_coverage"
  | "mechanism_chain"
  | "development_relevance"
  | "weighing_qualification"
  | "paragraph_function_order"
  | "reference_linking";

export interface FocusedTeachingProfile {
  readonly decisionLens: string;
  readonly commonConfusions: readonly string[];
  readonly transferContexts: readonly string[];
  readonly depthCue: string;
}

export const FOCUSED_TEACHING_PROFILES: Readonly<
  Record<FocusedTeachingSkillId, FocusedTeachingProfile>
> = {
  complete_comparison: {
    decisionLens:
      "Name both entities and the exact comparison relationship before choosing a comparative form.",
    commonConfusions: [
      "comparing one group with an undefined whole",
      "using a comparative without the second comparison point",
    ],
    transferContexts: [
      "education access",
      "public transport",
      "workplace policy",
    ],
    depthCue:
      "Use minimal pairs first, then fade the frame until the learner builds a complete comparison unaided.",
  },
  verb_form_trigger: {
    decisionLens:
      "Find the governing trigger immediately before deciding the verb form.",
    commonConfusions: [
      "choosing by translation instead of the trigger",
      "missing an intervening noun phrase or preposition",
    ],
    transferContexts: ["school rules", "health habits", "environmental policy"],
    depthCue:
      "Make the trigger visible, contrast plausible alternatives, then require an original sentence in a new context.",
  },
  sentence_boundary: {
    decisionLens:
      "Identify each complete clause and choose one clear relationship between them.",
    commonConfusions: [
      "joining complete clauses with only a comma",
      "leaving a dependent clause without a main clause",
    ],
    transferContexts: ["technology at work", "urban planning", "public health"],
    depthCue:
      "Move from clause marking to repair, then to choosing a boundary while preserving a new idea.",
  },
  subject_verb_agreement: {
    decisionLens:
      "Locate the head subject, not the nearest noun, before selecting the finite verb.",
    commonConfusions: [
      "agreeing with a noun inside a prepositional phrase",
      "losing agreement after a long subject phrase",
    ],
    transferContexts: [
      "research findings",
      "community services",
      "family life",
    ],
    depthCue:
      "Use distractor-rich minimal pairs and ask the learner to explain which noun controls the verb before independent writing.",
  },
  article_control: {
    decisionLens:
      "Decide whether the noun is countable, specific, and already identifiable to the reader.",
    commonConfusions: [
      "treating a general idea as one specific object",
      "using zero article when a shared reference has been established",
    ],
    transferContexts: ["education funding", "consumer choices", "tourism"],
    depthCue:
      "Show the reader-knowledge decision, not a list of article rules; finish with a short paragraph self-check.",
  },
  collocation_perspective: {
    decisionLens:
      "Choose an expression by the relationship, viewpoint, and usual subject–object pairing in the sentence.",
    commonConfusions: [
      "combining individually correct translated words",
      "using a near synonym with the wrong information perspective",
    ],
    transferContexts: [
      "environmental risk",
      "social inequality",
      "workplace performance",
    ],
    depthCue:
      "Teach usage conditions and plausible near-misses before asking for a new-context sentence.",
  },
  word_form_precision: {
    decisionLens:
      "Use the sentence role and intended meaning to select the needed word-family member.",
    commonConfusions: [
      "choosing a familiar form with the wrong grammatical job",
      "selecting a broad word that loses the intended meaning",
    ],
    transferContexts: ["healthcare", "economic change", "school learning"],
    depthCue:
      "Contrast word-family choices in context, then make the learner explain the meaning change before producing a sentence.",
  },
  task_instruction_coverage: {
    decisionLens:
      "Turn every task action and scope limit into an explicit commitment before drafting.",
    commonConfusions: [
      "answering only one half of a two-part question",
      "giving a position without addressing the requested extent or causes",
    ],
    transferContexts: [
      "agree/disagree",
      "causes and solutions",
      "advantages and disadvantages",
    ],
    depthCue:
      "Use question mapping and thesis choices, then transfer the mapping routine to a genuinely different task type.",
  },
  mechanism_chain: {
    decisionLens:
      "After a cause, name the concrete process or behaviour that changes before stating the result.",
    commonConfusions: [
      "jumping directly from a cause to a vague benefit",
      "repeating the claim instead of adding a causal mechanism",
      "ending with useful or beneficial rather than an observable outcome",
    ],
    transferContexts: [
      "commuting",
      "preventive healthcare",
      "waste reduction",
      "workplace learning",
    ],
    depthCue:
      "Use a visible cause→mechanism→outcome construction, multiple topic contrasts, a guided repair, and two independent transfers.",
  },
  development_relevance: {
    decisionLens:
      "Keep each explanation or example only when it answers how or why the controlling claim follows.",
    commonConfusions: [
      "adding a true but unrelated fact",
      "using an example that changes the paragraph's main claim",
    ],
    transferContexts: [
      "crime prevention",
      "technology use",
      "education policy",
    ],
    depthCue:
      "Use relevance filters and deletion decisions before asking for a tightly developed new paragraph.",
  },
  weighing_qualification: {
    decisionLens:
      "State the criterion used to compare options and the condition that limits the claim.",
    commonConfusions: [
      "calling one option better without a comparison criterion",
      "using absolute language when the conclusion depends on context",
    ],
    transferContexts: [
      "public spending",
      "remote work",
      "environmental regulation",
    ],
    depthCue:
      "Make the criterion and qualifying condition explicit, then practise balanced decisions on a new IELTS topic.",
  },
  paragraph_function_order: {
    decisionLens:
      "Give each sentence one role and order those roles so the reader can follow the paragraph's development.",
    commonConfusions: [
      "using an example before the claim it is meant to support",
      "adding a conclusion before the explanation is complete",
    ],
    transferContexts: [
      "school discipline",
      "city housing",
      "consumer advertising",
    ],
    depthCue:
      "Use reverse outlines and ordering choices, then remove labels before a short original paragraph.",
  },
  reference_linking: {
    decisionLens:
      "Make the referent or logical relation recoverable before using a pronoun or connector.",
    commonConfusions: [
      "using this or it when two nouns are possible referents",
      "choosing a connector that signals a different relationship",
    ],
    transferContexts: [
      "social media",
      "public transport",
      "children's education",
    ],
    depthCue:
      "Repair ambiguous links in context, contrast relation words, and end with a new-context paragraph check.",
  },
};

export function focusedTeachingProfileFor(skillId: string): string {
  const profile = FOCUSED_TEACHING_PROFILES[skillId as FocusedTeachingSkillId];
  if (!profile) {
    return "Teach one observable decision, use fresh IELTS contexts, require active production before the paper, and end with a reusable self-check.";
  }
  return [
    `Decision lens: ${profile.decisionLens}`,
    `Common confusions: ${profile.commonConfusions.join("; ")}.`,
    `Use genuinely different transfer contexts such as: ${profile.transferContexts.join(", ")}.`,
    `Depth cue: ${profile.depthCue}`,
  ].join("\n");
}
