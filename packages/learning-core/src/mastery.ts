import {
  getSkillDefinition,
  MASTERY_LEVELS,
  type MasteryLevel,
  type SkillEvidenceEvent,
  type SkillId,
  type UserSkillState,
} from "@iwc/learning-contracts";

const HOUR_MS = 60 * 60 * 1000;
const masteryRank = new Map<MasteryLevel, number>(
  MASTERY_LEVELS.map((level, index) => [level, index]),
);

export interface MasteryGateResult {
  readonly passed: boolean;
  readonly noOpportunity: boolean;
  readonly qualifyingEvidenceIds: readonly string[];
  readonly missing: readonly string[];
  /** transferred is a hard-evidence level, not a claim of permanent or final mastery. */
  readonly finalMastery: false;
}

function rank(level: MasteryLevel): number {
  const value = masteryRank.get(level);
  if (value === undefined) {
    throw new Error(`Unknown mastery level: ${level}`);
  }
  return value;
}

function baseEligible(
  event: SkillEvidenceEvent,
  skillId: SkillId,
  minimumConfidence: number,
): boolean {
  return (
    event.skillId === skillId &&
    event.outcome === "PASS" &&
    event.independent &&
    event.firstAttempt &&
    event.hintLevel === "NONE" &&
    event.confidence >= minimumConfidence &&
    event.validForStateTransition &&
    event.adjudicationStatus === "ACCEPTED"
  );
}

function result(
  missing: readonly string[],
  evidence: readonly SkillEvidenceEvent[],
  noOpportunity = false,
): MasteryGateResult {
  return {
    passed: missing.length === 0 && !noOpportunity,
    noOpportunity,
    qualifyingEvidenceIds: [...new Set(evidence.map((event) => event.id))],
    missing,
    finalMastery: false,
  };
}

export function evaluateAppliedGate(
  skillId: SkillId,
  events: readonly SkillEvidenceEvent[],
): MasteryGateResult {
  const definition = getSkillDefinition(skillId);
  const eligible = events.filter((event) =>
    baseEligible(event, skillId, definition.minimumGradingConfidence),
  );
  const generations = eligible.filter(
    (event) => event.kind === "INDEPENDENT_GENERATION",
  );
  const distinctGenerationContexts = new Set(
    generations.map((event) => event.contextId),
  );
  const integrated = eligible.filter(
    (event) =>
      event.kind === "INTEGRATED_APPLICATION" &&
      event.naturalOpportunity === true &&
      event.coreErrorRecurred !== true,
  );
  const exitTests = eligible.filter(
    (event) => event.kind === "EXIT_TEST" && event.unseenSurfaceForm === true,
  );
  const explicitlyNoOpportunity =
    integrated.length === 0 &&
    events.some(
      (event) =>
        event.skillId === skillId &&
        event.kind === "INTEGRATED_APPLICATION" &&
        (event.outcome === "NO_OPPORTUNITY" ||
          event.naturalOpportunity === false),
    );

  const missing: string[] = [];
  if (
    generations.length < definition.successThreshold.independentNoHintCorrect
  ) {
    missing.push("two first-attempt, no-hint independent generations");
  }
  if (
    distinctGenerationContexts.size <
    definition.successThreshold.distinctContexts
  ) {
    missing.push("two semantically distinct planner context IDs");
  }
  if (integrated.length === 0) {
    missing.push(
      "an immediate integrated near-transfer pass with a natural opportunity and no recurrence",
    );
  }
  if (exitTests.length === 0) {
    missing.push(
      "a first-attempt, no-hint exit test on an unseen surface form",
    );
  }

  return result(
    missing,
    [...generations, ...integrated, ...exitTests],
    explicitlyNoOpportunity,
  );
}

function elapsedHours(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return Number.NaN;
  }
  return (endMs - startMs) / HOUR_MS;
}

export function evaluateRetainedGate(
  skillId: SkillId,
  priorHighestAttainedLevel: MasteryLevel,
  events: readonly SkillEvidenceEvent[],
): MasteryGateResult {
  const definition = getSkillDefinition(skillId);
  const candidates = events.filter(
    (event) =>
      event.kind === "DELAYED_REWRITE" &&
      event.sourceEntityType === "REWRITE" &&
      baseEligible(event, skillId, definition.minimumGradingConfidence) &&
      event.targetPrompted !== true &&
      event.assisted !== true &&
      event.prerequisiteSkipped !== true &&
      event.naturalOpportunity === true &&
      event.instructionExposureAt !== undefined &&
      elapsedHours(event.instructionExposureAt, event.occurredAt) >= 24,
  );
  const noOpportunity =
    candidates.length === 0 &&
    events.some(
      (event) =>
        event.skillId === skillId &&
        event.kind === "DELAYED_REWRITE" &&
        event.outcome === "NO_OPPORTUNITY",
    );
  const missing: string[] = [];
  if (rank(priorHighestAttainedLevel) < rank("applied")) {
    missing.push("prior applied evidence");
  }
  if (candidates.length === 0) {
    missing.push(
      "an independent delayed rewrite at least 24 hours after instruction, without target hints or assistance",
    );
  }
  return result(missing, candidates, noOpportunity);
}

export function evaluateTransferredGate(
  skillId: SkillId,
  priorHighestAttainedLevel: MasteryLevel,
  originalTopicId: string,
  events: readonly SkillEvidenceEvent[],
): MasteryGateResult {
  const definition = getSkillDefinition(skillId);
  const candidates = events.filter(
    (event) =>
      event.kind === "CROSS_TOPIC_TRANSFER" &&
      event.sourceEntityType === "TRANSFER" &&
      baseEligible(event, skillId, definition.minimumGradingConfidence) &&
      event.topicId !== originalTopicId &&
      event.naturalOpportunity === true &&
      event.targetPrompted !== true &&
      event.assisted !== true,
  );
  const noOpportunity =
    candidates.length === 0 &&
    events.some(
      (event) =>
        event.skillId === skillId &&
        event.kind === "CROSS_TOPIC_TRANSFER" &&
        (event.outcome === "NO_OPPORTUNITY" ||
          event.naturalOpportunity === false),
    );
  const missing: string[] = [];
  if (rank(priorHighestAttainedLevel) < rank("retained")) {
    missing.push("prior retained evidence");
  }
  if (candidates.length === 0) {
    missing.push(
      "a no-hint success on a different topic with a natural opportunity",
    );
  }
  return result(missing, candidates, noOpportunity);
}

export function updateUserSkillState(
  current: UserSkillState,
  input: {
    readonly attainedLevel?: MasteryLevel;
    readonly lessonOutcome?: UserSkillState["latestLessonOutcome"];
    readonly evidence?: SkillEvidenceEvent;
    readonly nextReviewAt?: string;
  },
): UserSkillState {
  const attainedLevel =
    input.attainedLevel !== undefined &&
    rank(input.attainedLevel) > rank(current.highestAttainedLevel)
      ? input.attainedLevel
      : current.highestAttainedLevel;
  const recurrence =
    input.evidence?.kind === "RECURRENCE" && input.evidence.outcome === "FAIL";
  const independentSuccess =
    input.evidence !== undefined &&
    input.evidence.outcome === "PASS" &&
    input.evidence.independent &&
    input.evidence.hintLevel === "NONE";

  return {
    ...current,
    highestAttainedLevel: attainedLevel,
    currentStability: recurrence ? "needs_review" : current.currentStability,
    latestLessonOutcome: input.lessonOutcome ?? current.latestLessonOutcome,
    recurrenceCount: current.recurrenceCount + (recurrence ? 1 : 0),
    consecutiveIndependentSuccesses: recurrence
      ? 0
      : independentSuccess
        ? current.consecutiveIndependentSuccesses + 1
        : current.consecutiveIndependentSuccesses,
    ...(input.evidence === undefined
      ? {}
      : { lastEvidenceAt: input.evidence.occurredAt }),
    ...(input.nextReviewAt === undefined
      ? {}
      : { nextReviewAt: input.nextReviewAt }),
  };
}
