export const LEARNING_CONTRACT_VERSION = "1.0.0" as const;

export const IELTS_DIMENSIONS = ["TR", "CC", "LR", "GRA"] as const;
export type IeltsDimension = (typeof IELTS_DIMENSIONS)[number];

export const SKILL_IDS = [
  "complete_comparison",
  "verb_form_trigger",
  "sentence_boundary",
  "subject_verb_agreement",
  "article_control",
  "collocation_perspective",
  "word_form_precision",
  "task_instruction_coverage",
  "mechanism_chain",
  "development_relevance",
  "weighing_qualification",
  "paragraph_function_order",
  "reference_linking",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export const ISSUE_EVIDENCE_CATEGORIES = [
  "HARD_GRAMMAR_ERROR",
  "COLLOCATION_NATURALNESS",
  "CHINESE_INFORMATION_ORGANIZATION",
  "LEXICAL_PRECISION",
  "TASK_COVERAGE",
  "ARGUMENT_DEVELOPMENT",
  "COHESION_ORGANIZATION",
  "OPTIONAL_OPTIMIZATION",
] as const;
export type IssueEvidenceCategory = (typeof ISSUE_EVIDENCE_CATEGORIES)[number];

export const EXERCISE_ITEM_TYPES = [
  "MINIMAL_PAIR",
  "SKELETON_COMPLETION",
  "CONSTRAINED_REWRITE",
  "ERROR_LOCATION",
  "GAP_FILL",
  "SENTENCE_GENERATION",
  "SENTENCE_REPAIR",
  "PARAGRAPH_SELF_CHECK",
  "MEANING_FORK",
  "EXPRESSION_MAP",
  "MULTIPLE_REALIZATION",
  "MATCHING",
  "TASK_TYPE_IDENTIFICATION",
  "THESIS_COMPARISON",
  "OUTLINE",
  "ROLE_CARD",
  "CAUSAL_CHAIN",
  "BRIDGE_SENTENCE",
  "RELEVANCE_FILTER",
  "DELETION",
  "MICRO_PARAGRAPH",
  "WEIGHING_CHOICE",
  "QUALIFICATION",
  "PARAGRAPH_WRITING",
  "FUNCTION_LABELING",
  "ORDERING",
  "REVERSE_OUTLINE",
  "REFERENCE_REPAIR",
  "LINK_RELATION",
  "RECONSTRUCTION",
  "INTEGRATED_APPLICATION",
  "EXIT_TEST",
  "SELF_CHECK",
] as const;
export type ExerciseItemType = (typeof EXERCISE_ITEM_TYPES)[number];

/**
 * Presentation is kept separate from the canonical ExerciseItem so changing
 * a widget never changes the learning/evidence contract.  The server still
 * judges every closed interaction from ExerciseItem.grading; these fields
 * only describe how the learner supplies that answer.
 */
export const EXERCISE_FORMS = [
  "SPOTLIGHT",
  "MEANING_FORK",
  "EXPRESSION_MAP",
  "MINIMAL_CONTRAST",
  "SKELETON",
  "OPEN_GENERATION",
  "ARGUMENT_CHAIN",
  "PARAGRAPH_LAB",
  "TARGETED_SELF_CHECK",
] as const;
export type ExerciseForm = (typeof EXERCISE_FORMS)[number];

export interface ExerciseOption {
  readonly id: string;
  readonly labelZh: string;
  readonly labelEn: string;
}

export interface ExerciseMappingPair {
  readonly left: string;
  readonly right: string;
}

export interface ExercisePresentation {
  readonly form: ExerciseForm;
  readonly responseMode:
    | "span"
    | "choice"
    | "mapping"
    | "slots"
    | "sentence"
    | "chain"
    | "paragraph"
    | "revision";
  readonly sourceText?: string;
  readonly options?: readonly ExerciseOption[];
  readonly mappingPairs?: readonly ExerciseMappingPair[];
  readonly slotLabels?: readonly string[];
  readonly confusionByAnswer?: Readonly<Record<string, string>>;
  readonly branchPrompts?: Readonly<Record<string, string>>;
  readonly revisionSourceItemId?: string;
  readonly minimumWords?: number;
  readonly maximumWords?: number;
  readonly selfCheckPrompts?: readonly string[];
}

export type ExerciseEvaluationOutcome = "PASS" | "FAIL" | "NEUTRAL";

export interface SkillSuccessThreshold {
  readonly independentNoHintCorrect: 2;
  readonly distinctContexts: 2;
  readonly integratedApplicationRequired: true;
  readonly unseenExitTestRequired: true;
}

export type AcceptedAnswerMode = "DETERMINISTIC_SET" | "CONSTRAINED_RUBRIC";

export interface AcceptedAnswerPolicy {
  readonly mode: AcceptedAnswerMode;
  readonly preservesIntendedMeaning: true;
  readonly acceptsEquivalentNaturalAnswers: boolean;
  readonly rejectsRecommendationMismatchAlone: true;
  readonly deterministicNormalization?: "TRIM_CASE_FOLD" | "ORDER_INSENSITIVE";
  readonly rubricCriteria?: readonly string[];
}

export interface SkillFallbackStrategy {
  readonly kind:
    | "SCAFFOLD_LADDER"
    | "GENERAL_REWRITE"
    | "GENERAL_ARGUMENT"
    | "GENERAL_COHESION";
  readonly maxRemedialItems: 2;
  readonly lowConfidenceAction: "SUPPLEMENT_WITHOUT_STATE_CHANGE";
  readonly description: string;
}

export interface SkillDefinition {
  readonly id: SkillId;
  readonly dimension: IeltsDimension;
  readonly nameZh: string;
  readonly description: string;
  readonly allowedItemTypes: readonly ExerciseItemType[];
  readonly successThreshold: SkillSuccessThreshold;
  readonly acceptedAnswerPolicy: AcceptedAnswerPolicy;
  readonly minimumGradingConfidence: number;
  readonly fallbackStrategy: SkillFallbackStrategy;
  readonly version: typeof LEARNING_CONTRACT_VERSION;
}

export const TRAINING_CYCLE_STATES = [
  "QUESTION_READY",
  "ATTEMPT_1_ACTIVE",
  "SUBMITTED",
  "ANALYZING",
  "FEEDBACK_READY",
  "LESSON_GENERATING",
  "LESSON_READY",
  "LESSON_ACTIVE",
  "LESSON_RESOLVED",
  "REWRITE_LOCKED",
  "REWRITE_READY",
  "ATTEMPT_2_ACTIVE",
  "COMPARING",
  "CORE_CYCLE_COMPLETED",
] as const;
export type TrainingCycleState = (typeof TRAINING_CYCLE_STATES)[number];

export const LESSON_STATUSES = [
  "PLANNING",
  "READY",
  "ACTIVE",
  "CORE_COMPLETED",
  "TIMEBOX_EXPIRED",
  "USER_SKIPPED",
  "ABANDONED",
] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const REWRITE_TASK_STATUSES = [
  "PLANNED",
  "LOCKED",
  "READY",
  "ACTIVE",
  "COMPLETED",
  "SKIPPED_PREREQUISITE",
  "RESCHEDULED",
] as const;
export type RewriteTaskStatus = (typeof REWRITE_TASK_STATUSES)[number];

export const TRANSFER_TASK_STATUSES = [
  "PLANNED",
  "READY",
  "COMPLETED",
  "NO_OPPORTUNITY",
  "RESCHEDULED",
] as const;
export type TransferTaskStatus = (typeof TRANSFER_TASK_STATUSES)[number];

export const EXERCISE_STAGES = [
  "notice",
  "understand",
  "control",
  "produce",
  "near_transfer",
  "self_check",
] as const;
export type ExerciseStage = (typeof EXERCISE_STAGES)[number];

export type ObjectiveRole = "CORE" | "SECONDARY" | "REVIEW";

export interface LearningObjective {
  readonly id: string;
  readonly trainingCycleId: string;
  readonly skillId: SkillId;
  readonly role: ObjectiveRole;
  readonly sourceEvidenceIds: readonly string[];
  readonly priority: number;
  readonly successCriterion: string;
}

export interface IssueEvidence {
  readonly schemaVersion: typeof LEARNING_CONTRACT_VERSION;
  readonly id: string;
  readonly essayAttemptId: string;
  readonly skillId: SkillId;
  /** Zero-based UTF-16 snapshot offsets; endOffset is exclusive. */
  readonly startOffset: number;
  readonly endOffset: number;
  readonly excerpt: string;
  readonly diagnosis: string;
  readonly categories: readonly IssueEvidenceCategory[];
  readonly hardGrammarError: boolean;
  readonly severity: "LOW" | "MEDIUM" | "HIGH";
  readonly confidence: number;
  readonly adjudicationStatus: "ACCEPTED" | "DISPUTED" | "CORRECTED";
}

export interface ExerciseCriterion {
  readonly objectiveId: string;
  readonly skillId: SkillId;
  readonly rubric: string;
  readonly passingScore: number;
}

export type ExerciseGradingSpecification =
  | {
      readonly mode: "DETERMINISTIC";
      readonly acceptedAnswers: readonly string[];
      readonly normalization: "TRIM_CASE_FOLD" | "ORDER_INSENSITIVE" | "EXACT";
    }
  | {
      readonly mode: "RUBRIC";
      readonly minimumConfidence: number;
      readonly criteria: readonly {
        readonly id: string;
        readonly description: string;
        readonly passingScore: number;
      }[];
    }
  | {
      readonly mode: "UNSCORED_BRANCH";
      readonly branchIds: readonly string[];
    };

export interface ExerciseItem {
  readonly id: string;
  readonly blockId: string;
  readonly learningObjectiveId: string;
  readonly primarySkillId: SkillId;
  readonly sourceIssueId?: string | null;
  readonly stage: ExerciseStage;
  readonly itemType: ExerciseItemType;
  readonly prompt: string;
  readonly grading: ExerciseGradingSpecification;
  readonly expectedActiveSeconds: number;
  readonly expectedTotalSeconds: number;
  readonly isReserve: boolean;
  readonly generationMode: "TEMPLATE" | "AI";
  readonly qualityStatus:
    | "DRAFT"
    | "VALIDATING"
    | "VALIDATED"
    | "PUBLISHED"
    | "REJECTED";
  readonly evidenceOpportunity:
    | "PRETEST"
    | "CONTROLLED_REPAIR"
    | "INDEPENDENT_GENERATION"
    | "INTEGRATED_APPLICATION"
    | "EXIT_TEST"
    | "SELF_CHECK"
    | "OTHER";
  readonly contextId: string;
  readonly firstAttemptRequired: boolean;
  readonly hintPolicy: "NONE" | "ON_REQUEST" | "SCAFFOLD_LADDER";
  readonly feedbackPolicy:
    | "IMMEDIATE"
    | "BATCH_AFTER_GROUP"
    | "AFTER_SUBMISSION";
  readonly independentGroupId?: string;
  readonly unseenSurfaceForm?: boolean;
  readonly criteria?: readonly ExerciseCriterion[];
}

export interface ExerciseResponseContract {
  readonly schemaVersion: typeof LEARNING_CONTRACT_VERSION;
  readonly id: string;
  readonly exerciseItemId: string;
  readonly firstAttemptId: string;
  readonly finalAttemptId: string;
  readonly currentEvaluationId?: string;
  readonly attempts: readonly {
    readonly id: string;
    readonly answer: string;
    readonly submittedAt: string;
    readonly elapsedSeconds: number;
    readonly hintLevel: HintLevel;
    readonly referenceAnswerSeen: boolean;
  }[];
  readonly evaluations: readonly {
    readonly id: string;
    readonly attemptId: string;
    readonly outcome: EvidenceOutcome;
    readonly confidence: number;
    readonly dimensionScores: Readonly<Record<string, number>>;
    readonly userAnswerEvidence: readonly string[];
    readonly mostImportantSuggestion: string;
    readonly evaluatorVersion: string;
    readonly promptVersion: string;
    readonly rubricVersion: string;
    readonly adjudicationStatus: AdjudicationStatus;
    readonly supersedesEvaluationId?: string;
  }[];
}

export interface LessonBlock {
  readonly id: string;
  readonly objectiveId?: string;
  readonly kind: "CORE" | "SECONDARY" | "REVIEW" | "INTEGRATED" | "BREAK";
  /** FLEX is automatic remediation; OPTIONAL is voluntary enrichment after the core gate passes. */
  readonly path: "CORE" | "FLEX" | "OPTIONAL";
  readonly order: number;
  readonly timeBudgetSeconds: number;
  readonly items: readonly ExerciseItem[];
}

export interface LessonPlan {
  readonly schemaVersion: typeof LEARNING_CONTRACT_VERSION;
  readonly id: string;
  readonly trainingCycleId: string;
  readonly status: LessonStatus;
  readonly plannedUserSeconds: number;
  readonly corePathSeconds: number;
  readonly flexiblePathSeconds: number;
  readonly objectives: readonly LearningObjective[];
  readonly blocks: readonly LessonBlock[];
  readonly plannerVersion: string;
  readonly generatorVersion: string;
}

export type EvidenceOutcome = "PASS" | "FAIL" | "NO_OPPORTUNITY";
export type HintLevel =
  | "NONE"
  | "KEYWORD"
  | "PARTIAL_FRAME"
  | "FULL_FRAME"
  | "ANSWER_SHOWN";
export type AdjudicationStatus =
  | "ACCEPTED"
  | "DISPUTED"
  | "SUPERSEDED"
  | "PENDING";

export const EVIDENCE_KINDS = [
  "DIAGNOSED_ISSUE",
  "RECOGNITION",
  "CONTROLLED_REPAIR",
  "INDEPENDENT_GENERATION",
  "NEAR_TRANSFER",
  "INTEGRATED_APPLICATION",
  "EXIT_TEST",
  "DELAYED_REWRITE",
  "CROSS_TOPIC_TRANSFER",
  "RECURRENCE",
  "REVIEW",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface SkillEvidenceEvent {
  readonly schemaVersion: typeof LEARNING_CONTRACT_VERSION;
  readonly id: string;
  readonly userId: string;
  readonly skillId: SkillId;
  readonly objectiveId?: string;
  readonly kind: EvidenceKind;
  readonly outcome: EvidenceOutcome;
  readonly independent: boolean;
  readonly firstAttempt: boolean;
  readonly hintLevel: HintLevel;
  readonly confidence: number;
  readonly validForStateTransition: boolean;
  readonly adjudicationStatus: AdjudicationStatus;
  readonly contextId: string;
  readonly topicId: string;
  readonly sourceEntityType: "ESSAY" | "EXERCISE" | "REWRITE" | "TRANSFER";
  readonly sourceEntityId: string;
  readonly occurredAt: string;
  readonly naturalOpportunity?: boolean;
  readonly targetPrompted?: boolean;
  readonly unseenSurfaceForm?: boolean;
  readonly coreErrorRecurred?: boolean;
  readonly instructionExposureAt?: string;
  readonly prerequisiteSkipped?: boolean;
  readonly assisted?: boolean;
}

export const MASTERY_LEVELS = [
  "diagnosed",
  "practicing",
  "applied",
  "retained",
  "transferred",
] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];
export type SkillStability = "stable" | "unstable" | "needs_review";
export type LatestLessonOutcome = "applied" | "developing" | "not_stable";

export interface UserSkillState {
  readonly skillId: SkillId;
  readonly highestAttainedLevel: MasteryLevel;
  readonly currentStability: SkillStability;
  readonly latestLessonOutcome: LatestLessonOutcome;
  readonly recurrenceCount: number;
  readonly consecutiveIndependentSuccesses: number;
  readonly lastEvidenceAt?: string;
  readonly nextReviewAt?: string;
}

export interface RewriteTask {
  readonly id: string;
  readonly status: RewriteTaskStatus;
  readonly targetRewriteAt: string;
  readonly dueAt: string | null;
  readonly lastInstructionExposureAt: string | null;
  readonly assisted: boolean;
  readonly prerequisiteSkipped: boolean;
}

export interface TransferTask {
  readonly id: string;
  readonly objectiveId: string;
  readonly status: TransferTaskStatus;
  readonly windowStartsAt: string;
  readonly windowEndsAt: string;
  readonly dueAt: string;
  readonly naturalOpportunityDefinition: string;
  readonly noHintRequired: true;
}

export interface LearningSchedule {
  readonly cycleStartedAt: string;
  readonly lessonWindowEndsAt: string;
  readonly rewrite: {
    readonly targetRewriteAt: string;
    readonly targetWindowEndsAt: string;
    readonly dueAt: string | null;
    readonly lastInstructionExposureAt: string | null;
  };
  readonly transfer: {
    readonly windowStartsAt: string;
    readonly windowEndsAt: string;
    readonly dueAt: string;
  };
  readonly mixedReview: {
    readonly dueAt: string;
  };
}

export interface TrainingCycle {
  readonly schemaVersion: typeof LEARNING_CONTRACT_VERSION;
  readonly id: string;
  readonly userId: string;
  readonly questionId: string;
  readonly state: TrainingCycleState;
  readonly lessonStatus: LessonStatus;
  readonly rewriteStatus: RewriteTaskStatus;
  readonly transferStatuses: readonly TransferTaskStatus[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly coreCompletedAt?: string;
}

export interface AssessmentCriterionResult {
  readonly band: number;
  readonly confidence: number;
  readonly rationale: string;
  readonly evidenceIds: readonly string[];
}

/** AI-owned semantic output. Server IDs, versions, and timestamps are intentionally absent. */
export interface AiAssessmentJudgment {
  readonly overallBand: number;
  readonly criteria: Readonly<
    Record<
      IeltsDimension,
      {
        readonly band: number;
        readonly confidence: number;
        readonly rationale: string;
      }
    >
  >;
}

/** Character offsets refer to the immutable essay snapshot supplied to the AI job. */
export interface AiIssueJudgment {
  readonly skillId: SkillId;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly excerpt: string;
  readonly diagnosis: string;
  readonly severity: "LOW" | "MEDIUM" | "HIGH";
  readonly confidence: number;
}

export interface AssessmentContract {
  readonly schemaVersion: typeof LEARNING_CONTRACT_VERSION;
  readonly id: string;
  readonly attemptId: string;
  readonly rubricVersion: string;
  readonly modelId: string;
  readonly overallBand: number;
  readonly criteria: Readonly<
    Record<IeltsDimension, AssessmentCriterionResult>
  >;
  readonly issueEvidenceIds: readonly string[];
}

export interface RewritePacket {
  readonly schemaVersion: typeof LEARNING_CONTRACT_VERSION;
  readonly rewriteTaskId: string;
  readonly question: {
    readonly prompt: string;
    readonly instructions: string;
  };
  readonly durationMinutes: 40;
  readonly blindDraft: {
    readonly minutes: 35;
    readonly showPersonalTargets: false;
  };
  readonly selfCheck: {
    readonly minutes: 5;
    readonly abstractTargets: readonly string[];
  };
}

export interface LearningProfileExchange {
  readonly schemaVersion: typeof LEARNING_CONTRACT_VERSION;
  readonly exportedAt: string;
  readonly source: "WEB" | "SKILL";
  readonly profileId: string;
  readonly skills: readonly UserSkillState[];
  readonly evidence: readonly SkillEvidenceEvent[];
  readonly checksumSha256: string;
}

export interface CycleBundleAttempt {
  readonly id: string;
  readonly version: "V1" | "V2";
  readonly content: string;
  readonly startedAt: string;
  readonly submittedAt: string;
  readonly wordCount: number;
  readonly assisted: boolean;
  readonly interrupted: boolean;
  readonly draftBeforeSelfCheck?: string;
  readonly draftAfterSelfCheck?: string;
}

export type CycleBundleLessonResponse = ExerciseResponseContract;

export interface CycleBundleConflict {
  readonly id: string;
  readonly entityType:
    | "ATTEMPT"
    | "ASSESSMENT"
    | "OBJECTIVE"
    | "LESSON_RESPONSE"
    | "EVIDENCE"
    | "DUE_TASK";
  readonly entityId: string;
  readonly fieldPaths: readonly string[];
  readonly localValueHash: string;
  readonly incomingValueHash: string;
  readonly status: "UNRESOLVED" | "KEEP_LOCAL" | "KEEP_INCOMING" | "MERGED";
  readonly detectedAt: string;
  readonly resolutionNote?: string;
}

/** Complete, portable Web/Skill cycle exchange. It intentionally has no provider, secret, chat, or DB fields. */
export interface CycleBundle {
  readonly contractVersion: typeof LEARNING_CONTRACT_VERSION;
  readonly manifest: {
    readonly bundleId: string;
    readonly cycleId: string;
    readonly source: "WEB" | "SKILL";
    readonly exportedAt: string;
    /** Persisted portable-content revision, independent from local DB/file revisions. */
    readonly revision: number;
    /** Exact last portable revision observed before this content snapshot. */
    readonly parentRevision: number | null;
    readonly appendOnlyEntityIds: readonly string[];
  };
  readonly checksum: {
    readonly algorithm: "SHA-256";
    readonly canonicalization: "JCS";
    /** SHA-256 over RFC 8785 JCS of this complete bundle with top-level checksum omitted. */
    readonly value: string;
  };
  readonly cycle: {
    readonly id: string;
    readonly state: TrainingCycleState;
    readonly question: {
      readonly id: string;
      readonly prompt: string;
      readonly instructions: string;
    };
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly coreCompletedAt?: string;
  };
  readonly attempts: readonly CycleBundleAttempt[];
  readonly assessment: AssessmentContract | null;
  readonly issueEvidence: readonly IssueEvidence[];
  readonly objectives: readonly LearningObjective[];
  readonly lesson: {
    readonly plan: LessonPlan | null;
    readonly responses: readonly CycleBundleLessonResponse[];
  };
  readonly evidence: readonly SkillEvidenceEvent[];
  readonly dueTasks: {
    readonly rewrite: RewriteTask;
    readonly transfers: readonly TransferTask[];
    readonly mixedReview: {
      readonly id: string;
      readonly dueAt: string;
      readonly status: "PLANNED" | "READY" | "COMPLETED" | "RESCHEDULED";
    };
  };
  readonly conflicts: readonly CycleBundleConflict[];
}

export interface ContractValidationIssue {
  readonly instancePath: string;
  readonly keyword: string;
  readonly message: string;
}

export interface ContractValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ContractValidationIssue[];
}

export const PROMPT_VERSIONS = {
  assessment: "assessment@1.0.0",
  issueDiagnosis: "issue-diagnosis@1.0.0",
  lessonGeneration: "lesson-generation@1.0.0",
  exerciseEvaluation: "exercise-evaluation@1.0.0",
} as const;

export const RUBRIC_VERSIONS = {
  ieltsTask2: "ielts-task2@1.0.0",
  openExercise: "open-exercise@1.0.0",
  integratedApplication: "integrated-application@1.0.0",
} as const;

export const CONTRACT_VERSIONS = {
  learning: LEARNING_CONTRACT_VERSION,
  cycleBundle: LEARNING_CONTRACT_VERSION,
  aiAssessmentJudgment: LEARNING_CONTRACT_VERSION,
  aiIssueJudgment: LEARNING_CONTRACT_VERSION,
} as const;
