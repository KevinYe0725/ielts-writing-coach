import { createHash } from "node:crypto";

import Ajv2020, { type AnySchemaObject } from "ajv/dist/2020.js";

import {
  QUESTION_TYPES,
  TOPICS,
  type QuestionTopic,
  type QuestionType,
} from "@iwc/question-bank";

import {
  questionBankRefillSchema,
  questionGenerationJudgmentSchema,
} from "./schemas";

export interface GeneratedQuestionProposal {
  type: QuestionType;
  topic: QuestionTopic;
  track: "academic" | "general_training";
  prompt: string;
  internalRationale: string;
}

/** A typed semantic duplicate opinion supplied by the configured AI route. */
export interface QuestionGenerationJudgment {
  duplicate: boolean;
  confidence: number;
  rationale: string;
}

export interface QuestionGenerationResearchSource {
  url: string;
  title: string;
  snippet: string;
}

export interface ExistingGeneratedQuestion {
  type: QuestionType;
  topic: QuestionTopic;
  prompt: string;
}

export type QuestionGenerationRejectionReason =
  | "BATCH_TOO_LARGE"
  | "SCHEMA_INVALID"
  | "TASK2_SURFACE_INVALID"
  | "PROMPT_LEAKAGE"
  | "CURRENT_FACT_DEPENDENCY"
  | "EXACT_DUPLICATE"
  | "COPIED_RESEARCH_SPAN"
  | "FIVE_GRAM_DUPLICATE"
  | "SEMANTIC_JUDGMENT_INVALID"
  | "SEMANTIC_JUDGMENT_LOW_CONFIDENCE"
  | "SEMANTIC_DUPLICATE";

export interface RejectedGeneratedQuestion {
  proposal: unknown;
  reason: QuestionGenerationRejectionReason;
}

export interface QuestionGenerationValidationResult {
  accepted: GeneratedQuestionProposal[];
  pendingSemanticReview: GeneratedQuestionProposal[];
  rejected: RejectedGeneratedQuestion[];
}

export interface ValidateGeneratedQuestionBatchInput {
  proposals: readonly unknown[];
  existingQuestions: readonly ExistingGeneratedQuestion[];
  researchSources: readonly QuestionGenerationResearchSource[];
  /**
   * Semantic duplicate judgments keyed by the original provider proposal
   * index. A candidate with a same-type or same-topic shortlist stays pending
   * until its own index has a valid, high-confidence non-duplicate judgment.
   */
  semanticJudgments?: Readonly<Partial<Record<number, unknown>>>;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateProposalBatch = ajv.compile(
  questionBankRefillSchema as AnySchemaObject,
);
const validateDuplicateJudgment = ajv.compile(
  questionGenerationJudgmentSchema as AnySchemaObject,
);
const questionTypeSet = new Set<string>(QUESTION_TYPES);
const questionTopicSet = new Set<string>(TOPICS);
const minimumSemanticConfidence = 0.8;

function normalizedWords(value: string): string[] {
  return value.toLocaleLowerCase("en-US").match(/[a-z0-9]+/gu) ?? [];
}

/** Canonical text representation used by every exact prompt duplicate check. */
export function normalizeQuestionPrompt(value: string): string {
  return normalizedWords(value).join(" ");
}

/** Stable SHA-256 identity for a canonical generated-question prompt. */
export function questionPromptHash(value: string): string {
  return createHash("sha256")
    .update(normalizeQuestionPrompt(value))
    .digest("hex");
}

function sentenceCount(value: string): number {
  return value
    .split(/[.!?]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
}

function fiveGrams(value: string): Set<string> {
  const words = normalizedWords(value);
  const grams = new Set<string>();
  for (let index = 0; index <= words.length - 5; index += 1) {
    grams.add(words.slice(index, index + 5).join(" "));
  }
  return grams;
}

export function normalizedWordFiveGramJaccard(
  first: string,
  second: string,
): number {
  const firstGrams = fiveGrams(first);
  const secondGrams = fiveGrams(second);
  if (firstGrams.size === 0 && secondGrams.size === 0) return 0;
  let intersection = 0;
  for (const gram of firstGrams) {
    if (secondGrams.has(gram)) intersection += 1;
  }
  return intersection / (firstGrams.size + secondGrams.size - intersection);
}

function isGeneratedQuestionProposal(
  value: unknown,
): value is GeneratedQuestionProposal {
  return (
    typeof value === "object" &&
    value !== null &&
    validateProposalBatch({ proposals: [value] }) === true
  );
}

function hasRequiredTask2Surface(proposal: GeneratedQuestionProposal): boolean {
  const prompt = proposal.prompt;
  switch (proposal.type) {
    case "opinion":
      return /(?:^|[.!?]\s+)Do you agree or disagree\?\s*$/iu.test(prompt);
    case "discussion":
      return /(?:^|[.!?]\s+)Discuss both views and give your own opinion\.\s*$/iu.test(
        prompt,
      );
    case "advantages_disadvantages":
      return /(?:^|[.!?]\s+)Do the advantages of this development outweigh the disadvantages\?\s*$/iu.test(
        prompt,
      );
    case "problems_solutions":
      return /(?:^|[.!?]\s+)What problems does this situation create, and what measures could address them\?\s*$/iu.test(
        prompt,
      );
    case "two_part": {
      const components = prompt.split("?");
      return (
        components.length === 3 &&
        components[2]?.trim() === "" &&
        (components[0]?.trim().split(/\s+/u).length ?? 0) >= 3 &&
        (components[1]?.trim().split(/\s+/u).length ?? 0) >= 3
      );
    }
  }
}

function hasPromptLeakage(prompt: string): boolean {
  return /(?:\b(?:sample|model) answer\b|\brubric\b|\bband\s*(?:score|descriptor)\b|\bteaching instructions?\b|\bhttps?:\/\/|\bwww\.|\bcitation\b|\bsource\s*(?:url|citation)\b)/iu.test(
    prompt,
  );
}

function hasSpecialistCurrentFactDependency(prompt: string): boolean {
  return /(?:\b(?:as of|in)\s+20\d{2}\b|\bcurrent\s+(?:national|government|legal|statistical|carbon)\b|\blatest\s+(?:figures?|statistics?|law|policy)\b|\b(?:exact|official)\s+(?:figures?|statistics?|percentage)\b)/iu.test(
    prompt,
  );
}

function copiedResearchSpan(
  content: string,
  sources: readonly QuestionGenerationResearchSource[],
): boolean {
  const contentWords = normalizedWords(content);
  if (contentWords.length < 12) return false;
  const sourceSpans = new Set<string>();
  for (const source of sources) {
    const words = normalizedWords(`${source.title} ${source.snippet}`);
    for (let index = 0; index <= words.length - 12; index += 1) {
      sourceSpans.add(words.slice(index, index + 12).join(" "));
    }
  }
  for (let index = 0; index <= contentWords.length - 12; index += 1) {
    if (sourceSpans.has(contentWords.slice(index, index + 12).join(" ")))
      return true;
  }
  return false;
}

function semanticShortlist(
  proposal: GeneratedQuestionProposal,
  existingQuestions: readonly ExistingGeneratedQuestion[],
): ExistingGeneratedQuestion[] {
  return existingQuestions.filter(
    (existing) =>
      existing.type === proposal.type || existing.topic === proposal.topic,
  );
}

/**
 * Applies the provider schema and deterministic publication gates. Candidates
 * with a qualified shortlist but no judgment stay pending rather than being
 * published; Task 6 obtains and supplies their semantic decisions.
 */
export function validateGeneratedQuestionBatch(
  input: ValidateGeneratedQuestionBatchInput,
): QuestionGenerationValidationResult {
  if (input.proposals.length > 15) {
    return {
      accepted: [],
      pendingSemanticReview: [],
      rejected: input.proposals.map((proposal) => ({
        proposal,
        reason: "BATCH_TOO_LARGE" as const,
      })),
    };
  }
  const accepted: GeneratedQuestionProposal[] = [];
  const pendingSemanticReview: GeneratedQuestionProposal[] = [];
  const rejected: RejectedGeneratedQuestion[] = [];
  const priorAcceptedOrPending: GeneratedQuestionProposal[] = [];
  const knownHashes = new Set(
    input.existingQuestions.map((question) =>
      questionPromptHash(question.prompt),
    ),
  );

  input.proposals.forEach((candidate, index) => {
    if (!isGeneratedQuestionProposal(candidate)) {
      rejected.push({ proposal: candidate, reason: "SCHEMA_INVALID" });
      return;
    }
    if (
      !questionTypeSet.has(candidate.type) ||
      !questionTopicSet.has(candidate.topic) ||
      sentenceCount(candidate.prompt) < 1 ||
      sentenceCount(candidate.prompt) > 6 ||
      !hasRequiredTask2Surface(candidate)
    ) {
      rejected.push({ proposal: candidate, reason: "TASK2_SURFACE_INVALID" });
      return;
    }
    const authoredContent = `${candidate.prompt}\n${candidate.internalRationale}`;
    if (hasPromptLeakage(authoredContent)) {
      rejected.push({ proposal: candidate, reason: "PROMPT_LEAKAGE" });
      return;
    }
    if (hasSpecialistCurrentFactDependency(authoredContent)) {
      rejected.push({ proposal: candidate, reason: "CURRENT_FACT_DEPENDENCY" });
      return;
    }
    const candidateHash = questionPromptHash(candidate.prompt);
    if (knownHashes.has(candidateHash)) {
      rejected.push({ proposal: candidate, reason: "EXACT_DUPLICATE" });
      return;
    }
    if (copiedResearchSpan(authoredContent, input.researchSources)) {
      rejected.push({ proposal: candidate, reason: "COPIED_RESEARCH_SPAN" });
      return;
    }

    const shortlist = semanticShortlist(candidate, [
      ...input.existingQuestions,
      ...priorAcceptedOrPending,
    ]);
    if (
      shortlist.some(
        (existing) =>
          normalizedWordFiveGramJaccard(candidate.prompt, existing.prompt) >=
          0.55,
      )
    ) {
      rejected.push({ proposal: candidate, reason: "FIVE_GRAM_DUPLICATE" });
      return;
    }

    if (shortlist.length === 0) {
      knownHashes.add(candidateHash);
      accepted.push(candidate);
      priorAcceptedOrPending.push(candidate);
      return;
    }
    const semanticJudgment = input.semanticJudgments?.[index];
    if (semanticJudgment === undefined) {
      knownHashes.add(candidateHash);
      pendingSemanticReview.push(candidate);
      priorAcceptedOrPending.push(candidate);
      return;
    }
    if (!validateDuplicateJudgment(semanticJudgment)) {
      rejected.push({
        proposal: candidate,
        reason: "SEMANTIC_JUDGMENT_INVALID",
      });
      return;
    }
    const judgment = semanticJudgment as QuestionGenerationJudgment;
    if (judgment.confidence < minimumSemanticConfidence) {
      rejected.push({
        proposal: candidate,
        reason: "SEMANTIC_JUDGMENT_LOW_CONFIDENCE",
      });
      return;
    }
    if (judgment.duplicate) {
      rejected.push({ proposal: candidate, reason: "SEMANTIC_DUPLICATE" });
      return;
    }
    knownHashes.add(candidateHash);
    accepted.push(candidate);
    priorAcceptedOrPending.push(candidate);
  });

  return { accepted, pendingSemanticReview, rejected };
}
