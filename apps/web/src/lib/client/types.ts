import type { ProviderVendor } from "@iwc/ai/provider-catalog";

export type Locale = "zh-CN" | "en";

export type DeploymentMode = "personal" | "shared";

export type AiConnectionState =
  | "connected"
  | "compatibility"
  | "missing"
  | "blocked";

export type TaskKind =
  | "first-attempt"
  | "feedback"
  | "lesson"
  | "rewrite"
  | "comparison"
  | "transfer";

export type SkillState =
  | "diagnosed"
  | "practicing"
  | "applied"
  | "retained"
  | "transferred";

export interface NextTask {
  id: string;
  kind: TaskKind;
  eyebrowZh: string;
  eyebrowEn: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  durationMinutes: number;
  href: string;
  actionZh: string;
  actionEn: string;
  dueLabelZh: string;
  dueLabelEn: string;
}

export interface TimelineStep {
  id: string;
  labelZh: string;
  labelEn: string;
  state: "done" | "current" | "upcoming";
  dateLabel: string;
}

export interface TodayData {
  learnerName: string;
  greetingZh: string;
  greetingEn: string;
  aiState: AiConnectionState;
  nextTask: NextTask;
  navigation: import("./learning-navigation").LearningDestinations;
  cycleTitle: string;
  timeline: TimelineStep[];
  week: {
    focusedMinutes: number | null;
    completedActions: number | null;
    repeatedErrorReduction: number | null;
  };
}

export interface AttemptSubmission {
  feedbackReady: boolean;
  jobId: string | null;
  jobStatus: string | null;
}

export interface WritingPrompt {
  id: string;
  category: string;
  question: string;
  instruction: string;
  sourceLabel: string;
}

export type QuestionType =
  | "opinion"
  | "discussion"
  | "advantages_disadvantages"
  | "problems_solutions"
  | "two_part";

export type QuestionTopic =
  | "education"
  | "technology"
  | "environment"
  | "health"
  | "government"
  | "work_economy"
  | "society_culture"
  | "urban_transport";

export interface QuestionOption {
  id: string;
  prompt: string;
  type: QuestionType;
  topic: QuestionTopic;
  ieltsTrack: "academic" | "general_training";
  visibility: "public" | "private";
}

export interface CustomQuestionInput {
  prompt: string;
  type: QuestionType;
  topic: QuestionTopic;
  ieltsTrack: "academic" | "general_training";
}

export interface AttemptData {
  id: string;
  version: 1 | 2;
  prompt: WritingPrompt;
  durationSeconds: number;
  draft: string;
  startedAt: string;
  autosaveKey: string;
  /** Server-side optimistic concurrency revision. Demo data may omit it. */
  revision?: number;
  cycleId?: string;
  /** True once the server has immutably sealed the blind Version 2 draft. */
  selfCheckSnapshotSaved?: boolean;
}

export interface BandScore {
  criterion: "TR" | "CC" | "LR" | "GRA";
  labelZh: string;
  labelEn: string;
  score: number;
  confidence: "high" | "medium" | "low";
  summaryZh: string;
  summaryEn: string;
}

export interface FeedbackIssue {
  id: string;
  priority: 1 | 2 | 3;
  categoryZh: string;
  categoryEn: string;
  titleZh: string;
  titleEn: string;
  evidence: string;
  /** Immutable Version 1 source span. Historical records may not have one. */
  startOffset: number | null;
  endOffset: number | null;
  explanationZh: string;
  explanationEn: string;
  transferRuleZh: string;
  transferRuleEn: string;
  issueType:
    | "GRAMMAR"
    | "SPELLING"
    | "WORD_FORM"
    | "COLLOCATION"
    | "NATURALNESS"
    | "LOGIC"
    | "COHESION"
    | "TASK_RESPONSE"
    | "OPTIONAL_POLISH";
  correctedVersion: string;
  knowledgePointZh: string;
  severity: "must_fix" | "naturalness" | "polish";
  confidence: number;
  /** Internal linkage used to connect the diagnosis to the selected lesson. */
  skillId?: string | undefined;
}

export interface ParagraphFeedback {
  paragraphIndex: number;
  excerpt: string;
  roleZh: string;
  roleEn: string;
  diagnosisZh: string;
  diagnosisEn: string;
  actionZh: string;
  actionEn: string;
}

export interface FeedbackData {
  cycleId: string;
  attemptId: string;
  lessonId: string | null;
  overallScore: number;
  languageScored: boolean;
  scoreRange: string;
  modelLabel: string;
  rubricVersion: string;
  scores: BandScore[];
  strengthZh: string;
  strengthEn: string;
  issues: FeedbackIssue[];
  /** The report issue selected as this cycle's focused teaching target. */
  targetIssueId?: string | null;
  prompt: string;
  originalEssay: string;
  overallSummaryZh: string;
  overallSummaryEn: string;
  paragraphFeedback: ParagraphFeedback[];
  lessonScheduledLabelZh: string;
  lessonScheduledLabelEn: string;
  lessonGenerationRetry: {
    jobId: string;
    code: string;
    safeMessage: string;
  } | null;
}

export type TeachingBlockKind =
  | "EXPLANATION"
  | "CONTRAST"
  | "REASONING"
  | "TOOLKIT"
  | "PITFALLS"
  | "PRACTICE"
  | "SUMMARY";

interface TeachingBlockBase {
  readonly titleZh: string;
  readonly titleEn: string;
}

export interface ExplanationTeachingBlock extends TeachingBlockBase {
  readonly kind: "EXPLANATION";
  readonly paragraphsZh: readonly string[];
  readonly paragraphsEn: readonly string[];
  readonly keyPointZh: string;
  readonly keyPointEn: string;
}

export interface ContrastTeachingBlock extends TeachingBlockBase {
  readonly kind: "CONTRAST";
  readonly weakExampleEn: string;
  readonly strongExampleEn: string;
  readonly differenceZh: string;
  readonly differenceEn: string;
}

export interface ReasoningTeachingBlock extends TeachingBlockBase {
  readonly kind: "REASONING";
  readonly scenarioZh: string;
  readonly scenarioEn: string;
  readonly steps: readonly {
    readonly thinkingZh: string;
    readonly thinkingEn: string;
  }[];
  readonly resultEn: string;
  readonly takeawayZh: string;
  readonly takeawayEn: string;
}

export interface ToolkitTeachingBlock extends TeachingBlockBase {
  readonly kind: "TOOLKIT";
  readonly tools: readonly {
    readonly expressionEn: string;
    readonly functionZh: string;
    readonly functionEn: string;
    readonly conditionZh: string;
    readonly conditionEn: string;
    readonly cautionZh: string;
    readonly cautionEn: string;
    readonly exampleEn: string;
  }[];
}

export interface PitfallsTeachingBlock extends TeachingBlockBase {
  readonly kind: "PITFALLS";
  readonly items: readonly {
    readonly patternEn: string;
    readonly problemZh: string;
    readonly problemEn: string;
    readonly betterEn: string;
  }[];
}

export interface TeachingPracticePrompt {
  readonly id: string;
  readonly instructionZh: string;
  readonly instructionEn: string;
  readonly promptEn: string;
  readonly responseMode: "CHOICE" | "SHORT_TEXT";
  readonly context: "SAME_TOPIC" | "UNSEEN_TOPIC";
  readonly optionsEn: readonly string[];
  readonly referenceAnswerEn: string;
  readonly referenceReasoningZh: string;
  readonly referenceReasoningEn: string;
}

export interface TeachingPracticeLocalizedText {
  readonly zh: string;
  readonly en: string;
}

export interface TeachingPracticeAnalysis {
  readonly kind: "PERSONALIZED" | "DETERMINISTIC_CHOICE" | "DEMO_ONLY";
  readonly summary: TeachingPracticeLocalizedText;
  readonly strengths: readonly {
    readonly zh: string;
    readonly en: string;
    readonly userAnswerEvidence: readonly string[];
  }[];
  readonly keyImprovement?: {
    readonly title: TeachingPracticeLocalizedText;
    readonly explanation: TeachingPracticeLocalizedText;
    readonly whyItMatters: TeachingPracticeLocalizedText;
    readonly userAnswerEvidence: readonly string[];
  };
  readonly comparisonPoints: readonly {
    readonly aspect: TeachingPracticeLocalizedText;
    readonly referenceFeature: TeachingPracticeLocalizedText;
    readonly learnerDifference: TeachingPracticeLocalizedText;
    readonly userAnswerEvidence: readonly string[];
  }[];
  readonly nextCheck: TeachingPracticeLocalizedText;
  readonly uncertainty?: TeachingPracticeLocalizedText;
}

export type TeachingPracticeAnalysisState =
  | "REFERENCE_READY"
  | "ANALYSIS_PENDING"
  | "ANALYSIS_READY"
  | "ANALYSIS_UNAVAILABLE"
  | "DEMO_ONLY";

export interface TeachingPracticeResponseData {
  readonly id: string;
  readonly promptId: string;
  readonly submittedAnswer: string;
  readonly responseMode: "CHOICE" | "SHORT_TEXT";
  readonly analysisState: TeachingPracticeAnalysisState;
  readonly analysis: TeachingPracticeAnalysis | null;
}

export interface PracticeTeachingBlock extends TeachingBlockBase {
  readonly kind: "PRACTICE";
  readonly prompts: readonly TeachingPracticePrompt[];
}

export interface SummaryTeachingBlock extends TeachingBlockBase {
  readonly kind: "SUMMARY";
  readonly rulesZh: readonly string[];
  readonly rulesEn: readonly string[];
  readonly selfCheckZh: string;
  readonly selfCheckEn: string;
}

export type TeachingBlock =
  | ExplanationTeachingBlock
  | ContrastTeachingBlock
  | ReasoningTeachingBlock
  | ToolkitTeachingBlock
  | PitfallsTeachingBlock
  | PracticeTeachingBlock
  | SummaryTeachingBlock;

export interface TeachingSection {
  readonly anchor: string;
  readonly titleZh: string;
  readonly titleEn: string;
  readonly blocks: readonly TeachingBlock[];
}

export interface FocusedTeachingData {
  readonly id: string;
  readonly cycleId: string;
  readonly format: "ADAPTIVE_ARTICLE_V1";
  readonly titleZh: string;
  readonly titleEn: string;
  readonly introductionZh: string;
  readonly introductionEn: string;
  readonly estimatedMinutes: number;
  readonly sections: readonly TeachingSection[];
}

export type LessonStage =
  | "diagnose"
  | "understand"
  | "produce"
  | "apply"
  | "finish";

export type LessonItemKind =
  | "choice"
  | "explain"
  | "rewrite"
  | "transfer"
  | "exit";

export interface LessonChoice {
  id: string;
  labelZh: string;
  labelEn: string;
}

export type LessonExerciseForm =
  | "SPOTLIGHT"
  | "MEANING_FORK"
  | "EXPRESSION_MAP"
  | "MINIMAL_CONTRAST"
  | "SKELETON"
  | "OPEN_GENERATION"
  | "ARGUMENT_CHAIN"
  | "PARAGRAPH_LAB"
  | "TARGETED_SELF_CHECK";

export interface LessonCriterion {
  id: string;
  description: string;
  passingScore: number;
}

export interface LessonItem {
  id: string;
  stage: LessonStage;
  kind: LessonItemKind;
  estimatedMinutes: number;
  eyebrowZh: string;
  eyebrowEn: string;
  source?: string;
  promptZh: string;
  promptEn: string;
  helperZh: string;
  helperEn: string;
  choices?: LessonChoice[];
  form?: LessonExerciseForm;
  responseMode?:
    | "span"
    | "choice"
    | "mapping"
    | "slots"
    | "sentence"
    | "chain"
    | "paragraph"
    | "revision";
  mappingPairs?: Array<{ left: string; right: string }>;
  slotLabels?: string[];
  minimumWords?: number;
  maximumWords?: number;
  selfCheckPrompts?: string[];
  criteria?: LessonCriterion[];
  revisionSourceItemId?: string;
  revisionBaseline?: string;
  hintZh?: string;
  hintEn?: string;
  modelAnswer?: string;
  successZh: string;
  successEn: string;
  path?: "CORE" | "FLEX" | "OPTIONAL";
  evidenceOpportunity?: string;
  hintPolicy?: "NONE" | "ON_REQUEST" | "SCAFFOLD_LADDER";
  feedbackPolicy?: "IMMEDIATE" | "BATCH_AFTER_GROUP" | "AFTER_SUBMISSION";
  independentGroupId?: string;
}

export interface LessonRuntimeData {
  status: string;
  revision: number;
  startedAt: string | null;
  effectiveElapsedSeconds: number;
  productiveSeconds: number;
  segmentLimitSeconds: number;
  timeboxExpired: boolean;
  split: "NONE" | "SCHEDULED" | "ACTIVE" | "COMPLETED";
  refresher: "NOT_REQUIRED" | "REQUIRED" | "COMPLETED";
  interruptionCount: number;
  autoSplit: {
    currentModule: number;
    moduleCount: number;
    maxMinutes: number;
  } | null;
  refresherPlan: {
    kind: "RULE_CONTRAST" | "SCAFFOLD_FADE" | "TIMED_PARAGRAPH";
    durationMinutes: number;
  } | null;
  serverDraft: import("./lesson-cache").CachedLessonItem | null;
  /** Client receipt time used only to animate the server-authoritative clock. */
  observedAtMs: number;
}

export interface LessonData {
  id: string;
  titleZh: string;
  titleEn: string;
  coreTargetZh: string;
  coreTargetEn: string;
  totalMinutes: number;
  initialItemIndex: number;
  initialResponse: LessonSavedResponse | null;
  runtime: LessonRuntimeData;
  remediationActive: boolean;
  items: LessonItem[];
  rewriteUnlockZh: string;
  rewriteUnlockEn: string;
}

export interface LessonSavedResponse {
  itemId: string;
  responseId: string;
  firstAnswer: string;
  finalAnswer: string;
  attempts: number;
  hintsUsed: number;
  hintLevel: LessonResponseInput["hintLevel"];
  referenceAnswerSeen: boolean;
  evaluation: LessonEvaluationResult | null;
}

export interface LessonResponseInput {
  itemId: string;
  /** Stable server response id used when the learner revises the same item. */
  responseId?: string;
  firstAnswer: string;
  hintedAnswer?: string;
  finalAnswer: string;
  hintsUsed: number;
  hintLevel:
    | "NONE"
    | "KEYWORD"
    | "PARTIAL_FRAME"
    | "FULL_FRAME"
    | "ANSWER_SHOWN";
  referenceAnswerSeen: boolean;
  elapsedSeconds: number;
  selfCheckConfirmations?: string[];
}

export interface LessonEvaluationResult {
  responseId: string;
  jobId: string | null;
  /** DEMO_ONLY advances the browser demo but is never language evidence. */
  outcome:
    | "PASS"
    | "RETRY"
    | "NEUTRAL"
    | "DEMO_ONLY"
    | "UNASSESSED"
    | "BATCH_PENDING"
    | "BATCH_COMPLETE";
  passed: boolean | null;
  firstAttemptPassed: boolean | null;
  confidence: number | null;
  feedbackZh: string;
  feedbackEn: string;
  evidence: string[];
  dimensionScores: Record<string, number>;
  criterionResults: Array<{
    id: string;
    score: number;
    passed: boolean;
    evidence: string[];
  }>;
  acceptedAnswers: string[];
  confusionId: string | null;
  suggestionZh: string;
  validForEvidence: boolean;
  demoOnly: boolean;
  remediationActive: boolean;
  batchFeedback: Array<{
    itemId: string;
    passed: boolean | null;
    feedbackZh: string;
    feedbackEn: string;
    suggestionZh: string;
    demoOnly: boolean;
  }>;
}

export interface LessonRuntimeUpdate {
  revision: number;
  action:
    | "SAVE_DRAFT"
    | "PAUSE"
    | "REPORT_INTERRUPTION"
    | "SCHEDULE_SPLIT"
    | "COMPLETE_REFRESHER";
  draft?: import("./lesson-cache").CachedLessonItem | null;
  refresherAnswer?: string;
  interruptionKind?: "BROWSER" | "NETWORK" | "TIMER" | "USER_ABNORMAL";
}

export interface LessonCompletionResult {
  completionMode: "EVIDENCE_APPLIED" | "PRACTICE_ONLY" | "TIMEBOX_TRIMMED";
  masteryEvidenceCreated: boolean;
  rewriteScheduled: boolean;
  segmentScheduled: boolean;
}

export type PracticePaperSection =
  | "FOUNDATION"
  | "REPAIR"
  | "GENERATION"
  | "INTEGRATION";

export interface PracticePaperQuestion {
  id: string;
  number: number;
  section: PracticePaperSection;
  titleZh: string;
  titleEn: string;
  instructionZh: string;
  promptEn: string;
  sourceText: string;
  responseMode: "choice" | "short_text" | "sentence" | "paragraph";
  options: Array<{ key: string; labelEn: string }>;
  suggestedMinutes: number;
  minimumWords: number;
  maximumWords: number;
  publicCriteria: Array<{
    labelZh: string;
    labelEn: string;
    descriptionZh: string;
    descriptionEn: string;
    weight: number;
  }>;
}

export interface PracticePaperResult {
  totalScore: number;
  summaryZh: string;
  itemResults: Array<{
    itemId: string;
    status: "MEETS_STANDARD" | "NEEDS_WORK" | "NOT_SCORABLE";
    score: number;
    feedbackZh: string;
    strengthsZh: string[];
    problems: Array<{
      criterionLabelZh: string;
      explanationZh: string;
      evidence: string;
    }>;
    improvedAnswerEn: string;
    nextStepZh: string;
  }>;
}

export interface PracticePaperData {
  id: string;
  cycleId: string;
  titleZh: string;
  titleEn: string;
  objectiveZh: string;
  objectiveEn: string;
  durationMinutes: 60;
  instructionsZh: string[];
  instructionsEn: string[];
  questions: PracticePaperQuestion[];
  answers: Record<string, string>;
  startedAt: string | null;
  submittedAt: string | null;
  result: PracticePaperResult | null;
  evaluationPending: boolean;
}

export interface RewriteData extends AttemptData {
  abstractGoals: Array<{ zh: string; en: string }>;
  unlockLabelZh: string;
  unlockLabelEn: string;
}

export interface ComparisonPoint {
  id: string;
  state: "resolved" | "improved" | "watch";
  titleZh: string;
  titleEn: string;
  before: string;
  after: string;
  noteZh: string;
  noteEn: string;
}

export interface ComparisonScoreDelta {
  criterion: "TR" | "CC" | "LR" | "GRA";
  labelZh: string;
  labelEn: string;
  v1: number;
  v2: number;
  delta: number;
}

export interface ComparisonRecurrence {
  v1Occurrences: number;
  v2Occurrences: number;
  v1Per100Words: number;
  v2Per100Words: number;
  deltaPer100Words: number;
  recurred: boolean;
  evidenceVerified: boolean;
}

export interface ComparisonData {
  promptTitle: string;
  v1Score: number;
  v2Score: number;
  overallDelta: number;
  criterionDeltas: ComparisonScoreDelta[];
  recurrence: ComparisonRecurrence;
  scoringVersion: {
    schemaVersion: string;
    promptVersion: string;
    rubricVersion: string;
    model: string;
  };
  v1Words: number;
  v2Words: number;
  points: ComparisonPoint[];
  nextTask: NextTask;
  retained?: boolean;
  summaryZh?: string;
  summaryEn?: string;
  modelEssay?: string;
  modelEssaySource?: "ai" | "mock" | "unavailable";
}

export type TransferTaskStatus =
  | "PLANNED"
  | "READY"
  | "COMPLETED"
  | "NO_OPPORTUNITY"
  | "RESCHEDULED";

export type TransferOutcome = "PASS" | "FAIL" | "NO_OPPORTUNITY";

export interface TransferResult {
  outcome: TransferOutcome;
  confidence: number | null;
  feedbackZh: string;
  feedbackEn: string;
  evidence: string;
  evidenceStatus: string;
  transferred: boolean;
  gateMissing: string[];
  /** True only in the explicit demo client, which never performs language scoring. */
  mockLanguageScoring: boolean;
}

export interface TransferTaskData {
  id: string;
  sourceCycleId: string;
  status: TransferTaskStatus;
  availableAt: string;
  expiresAt: string | null;
  windowExpired: boolean;
  targetHintHidden: boolean;
  question: WritingPrompt;
  result: TransferResult | null;
  pendingJobId: string | null;
  evaluationError: { code: string; safeMessage: string } | null;
}

export interface TransferResponseInput {
  firstAnswer: string;
  elapsedSeconds: number;
  startedAt: string;
}

export interface TransferSubmission {
  transferTaskId: string;
  responseId: string;
  firstAnswerSaved: boolean;
  jobId: string;
  jobStatus: string;
}

export interface SkillRecord {
  id: string;
  labelZh: string;
  labelEn: string;
  category: "TR" | "CC" | "LR" | "GRA";
  state: SkillState;
  evidenceCount: number;
  recurrenceRate: number | null;
  nextReviewZh: string;
  nextReviewEn: string;
}

export interface GrowthData {
  essaysCompleted: number;
  learningMinutes: number;
  currentBand: number | null;
  targetBand: number;
  independentNonRecurrenceRate: number | null;
  weeklyScores: Array<{ label: string; score: number }>;
  skills: SkillRecord[];
}

export interface CycleBundleImportResult {
  imported: boolean;
  idempotent: boolean;
  cycleId: string;
  bundleId: string;
  conflicts: Array<Record<string, unknown>>;
}

export interface CycleExportOption {
  id: string;
  status: string;
  prompt: string;
  createdAt: string;
}

export const AI_TASK_KINDS = [
  "ielts_assessment",
  "issue_classification",
  "objective_prioritization",
  "exercise_generation",
  "open_sentence_evaluation",
  "paragraph_evaluation",
  "teaching_practice_analysis",
  "version_comparison",
  "transfer_evaluation",
] as const;

export type AiTaskKind = (typeof AI_TASK_KINDS)[number];

export interface ModelRouteSetting {
  id: string;
  taskKind: AiTaskKind;
  providerConnectionId: string | null;
  model: string;
  fallbackEnabled: boolean;
  routeVersion: number;
}

export interface UserPreferences {
  deploymentMode: DeploymentMode;
  locale: Locale;
  feedbackLanguage: "zh-with-en" | "en";
  examType: "academic" | "general";
  targetBand: number;
  timezone: string;
  studyTime: string;
  studyDays: string[];
  strictTimedMode: boolean;
  emailNotifications: boolean;
  email: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface AiConnection {
  id: string;
  provider: "openai" | "compatible" | "mock";
  vendor: ProviderVendor;
  displayName: string;
  baseUrl: string;
  model: string;
  state: AiConnectionState;
  secretSource: "encrypted" | "environment" | "session" | "none";
  secretHint: string;
  lastTestedZh: string;
  lastTestedEn: string;
  latencyMs: number | null;
  structuredOutput: boolean;
}

export interface SettingsData {
  preferences: UserPreferences;
  ai: AiConnection;
  mailState: "ready" | "missing" | "unverified" | "error";
}

export interface SystemStatus {
  version: string;
  actorRole: "owner" | "admin";
  deploymentMode: DeploymentMode;
  ai: AiConnection;
  mailState: "ready" | "missing" | "unverified" | "error";
  databaseState: "healthy" | "degraded";
  migrationsCurrent: boolean;
  taskExecutorState: "healthy" | "degraded";
  queue: {
    waiting: number;
    running: number;
    failed: number;
  };
  users: {
    active: number;
    invited: number;
    publicRegistration: boolean;
  };
  privacy: {
    adminCanReadEssays: boolean;
    auditEvents: number;
    recentAudit: Array<{
      id: string;
      action: string;
      targetType: string;
      targetId: string | null;
      result: string;
      occurredAt: string;
    }>;
  };
}

export interface BootstrapInput {
  deploymentMode: DeploymentMode;
  adminName: string;
  email: string;
  password: string;
  provider: AiConnection["provider"];
  providerVendor: ProviderVendor;
  baseUrl: string;
  apiKey: string;
  model: string;
  secretSource: "encrypted" | "session";
  /**
   * Optional one-time bootstrap token for a real self-hosted instance. The
   * setup page may also receive it as a `token` query parameter.
   */
  setupToken?: string;
  /** Create the instance and sign in without configuring a provider yet. */
  configureAi?: boolean;
  /** Populated by setup status; session storage is never assumed from mode alone. */
  sessionOnlyAvailable?: boolean;
}

export interface AiConnectionInput {
  provider: AiConnection["provider"];
  providerVendor: ProviderVendor;
  baseUrl: string;
  apiKey: string;
  model: string;
  secretSource: "encrypted" | "session";
}

export interface ConnectionProbe {
  status: "success" | "compatibility" | "failure";
  latencyMs: number;
  connection: boolean;
  structuredOutput: boolean;
  contextWindow: boolean;
  messageZh: string;
  messageEn: string;
}

export interface LearningClient {
  getToday(): Promise<TodayData>;
  getQuestions(): Promise<QuestionOption[]>;
  createCustomQuestion(input: CustomQuestionInput): Promise<QuestionOption>;
  startTrainingCycle(questionId: string): Promise<string>;
  getAttempt(version: 1 | 2, cycleId: string): Promise<AttemptData>;
  saveDraft(attemptId: string, draft: string): Promise<void>;
  saveSelfCheckSnapshot(
    attemptId: string,
    draft: string,
    phase: "before" | "after",
  ): Promise<void>;
  submitAttempt(attemptId: string, draft: string): Promise<AttemptSubmission>;
  getFeedback(cycleId: string): Promise<FeedbackData>;
  getFocusedTeaching(
    cycleId: string,
    lessonId: string,
  ): Promise<FocusedTeachingData>;
  submitTeachingPracticeAnswer(
    lessonId: string,
    prompt: TeachingPracticePrompt,
    answer: string,
  ): Promise<TeachingPracticeResponseData>;
  getTeachingPracticeResponse(
    lessonId: string,
    promptId: string,
    fallback?: TeachingPracticeResponseData,
  ): Promise<TeachingPracticeResponseData | null>;
  retryTeachingPracticeAnalysis(
    response: TeachingPracticeResponseData,
  ): Promise<TeachingPracticeResponseData>;
  getLesson(cycleId: string, lessonId: string): Promise<LessonData>;
  getPracticePaper(
    cycleId: string,
    lessonId: string,
  ): Promise<PracticePaperData>;
  submitPracticePaper(
    lessonId: string,
    answers: Record<string, string>,
  ): Promise<void>;
  replaceLegacyLesson(lessonId: string): Promise<void>;
  completePracticePaper(lessonId: string): Promise<void>;
  saveLessonProgress(
    lessonId: string,
    itemIndex: number,
    response?: LessonResponseInput,
  ): Promise<LessonEvaluationResult | null>;
  updateLessonRuntime(
    lessonId: string,
    update: LessonRuntimeUpdate,
  ): Promise<LessonRuntimeData>;
  retryLessonItem(
    lessonId: string,
    itemId: string,
  ): Promise<LessonEvaluationResult>;
  retryLessonGeneration(jobId: string): Promise<void>;
  skipLesson(lessonId: string): Promise<string>;
  completeLesson(
    lessonId: string,
    mode?: "standard" | "trim_optional",
  ): Promise<LessonCompletionResult>;
  getRewrite(taskId: string, cycleId: string): Promise<RewriteData>;
  rescheduleRewrite(taskId: string): Promise<void>;
  getComparison(cycleId: string): Promise<ComparisonData>;
  getTransferTask(
    taskId: string,
    expectedCycleId?: string,
  ): Promise<TransferTaskData>;
  submitTransferResponse(
    taskId: string,
    input: TransferResponseInput,
  ): Promise<TransferSubmission>;
  markTransferNoOpportunity(taskId: string): Promise<TransferTaskData>;
  rescheduleTransfer(taskId: string): Promise<void>;
  getGrowth(): Promise<GrowthData>;
  getSettings(): Promise<SettingsData>;
  updatePreferences(preferences: UserPreferences): Promise<UserPreferences>;
  downloadLearningArchive(): Promise<void>;
  getCycleExportOptions(): Promise<CycleExportOption[]>;
  downloadCycleBundle(cycleId: string): Promise<void>;
  importLearningBundle(file: File): Promise<CycleBundleImportResult>;
  getModelRoutes(): Promise<ModelRouteSetting[]>;
  updateModelRoute(input: {
    taskKind: AiTaskKind;
    providerConnectionId: string;
    model: string;
  }): Promise<ModelRouteSetting>;
  deleteLearningData(): Promise<void>;
  testConnection(input: Partial<BootstrapInput>): Promise<ConnectionProbe>;
  completeBootstrap(input: BootstrapInput): Promise<void>;
  configureAiConnection(input: AiConnectionInput): Promise<void>;
  deleteAiConnection(connectionId: string): Promise<void>;
  getSystemStatus(): Promise<SystemStatus>;
}
