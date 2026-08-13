import {
  LEARNING_CONTRACT_VERSION,
  assertContract,
  type SkillEvidenceEvent,
  type SkillId,
} from "@iwc/learning-contracts";

export interface MixedReviewIssue {
  readonly id: string;
  readonly skillId: string;
  readonly confidence: number;
  readonly diagnosis: Record<string, unknown>;
}

export interface MixedReviewResult {
  readonly outcome: "RECURRED" | "NOT_AMONG_DETECTED_ISSUES";
  readonly source_skill_id: SkillId;
  readonly target_cycle_id: string;
  readonly target_attempt_id: string;
  readonly detected_issue_ids: readonly string[];
  readonly confidence: number;
  readonly language_scoring: "AI_ESTIMATE" | "DEMO_ONLY";
  readonly valid_for_mastery_transition: false;
  readonly interpretation_zh: string;
  readonly interpretation_en: string;
  readonly reviewed_at: string;
}

function isSyntheticFallback(issue: MixedReviewIssue): boolean {
  return issue.diagnosis.source === "SYNTHETIC_FALLBACK";
}

/**
 * Builds a deliberately non-mastery observation from a later independent essay.
 * Absence from a bounded issue list is useful review information, but is never
 * treated as proof that the learner applied or mastered the old target.
 */
export function buildMixedReviewObservation(input: {
  readonly evidenceId: string;
  readonly reviewTaskId: string;
  readonly userId: string;
  readonly sourceSkillId: SkillId;
  readonly targetCycleId: string;
  readonly targetAttemptId: string;
  readonly targetTopicId: string;
  readonly occurredAt: string;
  readonly assisted: boolean;
  readonly providerKind: string;
  readonly issues: readonly MixedReviewIssue[];
}): {
  readonly canonicalEvidence: SkillEvidenceEvent;
  readonly result: MixedReviewResult;
  readonly recurred: boolean;
} {
  const matches = input.issues.filter(
    (issue) =>
      issue.skillId === input.sourceSkillId && !isSyntheticFallback(issue),
  );
  const recurred = matches.length > 0;
  const confidence = recurred
    ? Math.max(...matches.map((issue) => issue.confidence))
    : 0.5;
  const demoOnly = input.providerKind === "mock";
  const canonicalEvidence: SkillEvidenceEvent = {
    schemaVersion: LEARNING_CONTRACT_VERSION,
    id: input.evidenceId,
    userId: input.userId,
    skillId: input.sourceSkillId,
    kind: "RECURRENCE",
    outcome: recurred ? "FAIL" : "PASS",
    independent: !input.assisted,
    firstAttempt: true,
    hintLevel: "NONE",
    confidence,
    // This is a review observation, not an applied/retained/transferred gate.
    validForStateTransition: false,
    adjudicationStatus: "ACCEPTED",
    contextId: `mixed-review:${input.reviewTaskId}`,
    topicId: input.targetTopicId,
    sourceEntityType: "ESSAY",
    sourceEntityId: input.targetAttemptId,
    occurredAt: input.occurredAt,
    targetPrompted: false,
    coreErrorRecurred: recurred,
    assisted: input.assisted,
  };
  assertContract("skillEvidenceEvent", canonicalEvidence);

  return {
    canonicalEvidence,
    recurred,
    result: {
      outcome: recurred ? "RECURRED" : "NOT_AMONG_DETECTED_ISSUES",
      source_skill_id: input.sourceSkillId,
      target_cycle_id: input.targetCycleId,
      target_attempt_id: input.targetAttemptId,
      detected_issue_ids: matches.map((issue) => issue.id),
      confidence,
      language_scoring: demoOnly ? "DEMO_ONLY" : "AI_ESTIMATE",
      valid_for_mastery_transition: false,
      interpretation_zh: recurred
        ? "旧目标在这篇独立新作文中再次被检出；系统会降低稳定度，但不会倒退已经取得的最高能力等级。"
        : "旧目标未出现在本次最高优先问题列表中；这是一次积极观察，但不足以单独证明掌握或升级能力等级。",
      interpretation_en: recurred
        ? "The old target recurred in this independent essay. Stability may decrease, but the highest attained level is not erased."
        : "The old target was not among the highest-priority issues detected here. This is a positive observation, not standalone proof of mastery.",
      reviewed_at: input.occurredAt,
    },
  };
}
