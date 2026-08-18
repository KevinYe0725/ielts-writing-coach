import {
  errorFromProblem,
  isApiProblem,
  LearningClientError,
  type ApiProblemDetails,
} from "./errors";
import {
  projectTeachingPracticeResponse,
  unavailableTeachingPracticeResponse,
} from "./teaching-practice-projection";
import { AI_TASK_KINDS } from "./types";
import type {
  AiConnection,
  AiConnectionInput,
  AttemptSubmission,
  AttemptData,
  BandScore,
  BootstrapInput,
  ComparisonData,
  ConnectionProbe,
  CustomQuestionInput,
  CycleExportOption,
  CycleBundleImportResult,
  EssayWorkspaceData,
  EssayWorkspaceItem,
  FeedbackData,
  FeedbackIssue,
  FocusedTeachingData,
  GrowthData,
  LearningClient,
  LessonData,
  LessonCompletionResult,
  LessonEvaluationResult,
  LessonItem,
  LessonResponseInput,
  LessonRuntimeData,
  LessonRuntimeUpdate,
  LegacyLessonRecoveryResult,
  PracticePaperData,
  PracticePaperQuestion,
  PracticePaperResult,
  LessonStage,
  ModelRouteSetting,
  NextTask,
  PendingAiJob,
  QuestionOption,
  QuestionTopic,
  QuestionType,
  RewriteData,
  SettingsData,
  SkillRecord,
  SystemStatus,
  TaskKind,
  TimelineStep,
  TodayData,
  TransferResponseInput,
  TransferSubmission,
  TransferTaskData,
  TransferTaskStatus,
  TeachingPracticePrompt,
  TeachingPracticeResponseData,
  AiTaskKind,
  UserPreferences,
  WritingPrompt,
} from "./types";

// Keep this browser-only wire guard independent of the server learning-core
// barrel, which also exports Ajv-backed validators that cannot run under the
// production Content Security Policy.
const NEXT_ACTION_KINDS = [
  "START_ATTEMPT_1",
  "CONTINUE_ATTEMPT_1",
  "WAIT_FOR_ASSESSMENT",
  "REVIEW_FEEDBACK",
  "WAIT_FOR_LESSON",
  "START_LESSON",
  "CONTINUE_LESSON",
  "COMPLETE_CORE_PREREQUISITE",
  "WAIT_FOR_REWRITE_SCHEDULING",
  "WAIT_FOR_REWRITE_UNLOCK",
  "RESCHEDULE_REWRITE",
  "START_REWRITE",
  "CONTINUE_REWRITE",
  "WAIT_FOR_COMPARISON",
  "START_TRANSFER",
  "RESCHEDULE_TRANSFER",
  "START_MIXED_REVIEW",
  "START_NEW_CYCLE",
] as const;

type Fetch = typeof globalThis.fetch;
type JsonRecord = Record<string, unknown>;

interface RequestOptions {
  body?: unknown;
  headers?: HeadersInit;
  idempotent?: boolean;
  idempotencyKey?: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  permitStatuses?: readonly number[];
}

interface RequestResult<T> {
  data: T;
  response: Response;
}

interface JobEventSource {
  addEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
}

export interface HttpLearningClientOptions {
  baseUrl?: string;
  eventSourceFactory?: (url: string) => JobEventSource;
  fetch?: Fetch;
  idempotencyKey?: () => string;
  maxJobWaitMs?: number;
  now?: () => Date;
  origin?: string;
  pollIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface WireQuestion extends JsonRecord {
  externalId?: string;
  id?: string;
  ieltsTrack?: string;
  instructions?: string;
  prompt?: string;
  questionType?: string;
  topic?: string;
  type?: string;
  visibility?: string;
}

interface WireTransferResult extends JsonRecord {
  confidence?: number | null;
  evidence?: unknown;
  feedback_en?: string;
  feedback_zh?: string;
  gate_missing?: unknown;
  mock_language_scoring?: boolean;
  outcome?: string;
  status?: string;
  transferred?: boolean;
}

interface WireTransferTask extends JsonRecord {
  available_at?: string;
  expires_at?: string | null;
  evaluation_error?: { code?: string; safe_message?: string } | null;
  id?: string;
  pending_job_id?: string | null;
  question?: WireQuestion;
  result?: WireTransferResult | null;
  source_cycle_id?: string;
  source_question?: WireQuestion;
  status?: string;
  target_hint_hidden?: boolean;
  window_expired?: boolean;
}

interface WireAttempt extends JsonRecord {
  content?: string;
  createdAt?: string;
  cycleId?: string;
  draftBeforeSelfCheck?: string | null;
  draftAfterSelfCheck?: string | null;
  durationSeconds?: number | null;
  id?: string;
  kind?: string;
  lockedAt?: string | null;
  revision?: number;
  submittedAt?: string | null;
  wordCount?: number;
}

interface WireAssessment extends JsonRecord {
  confidence?: number;
  criterionScores?: JsonRecord;
  id?: string;
  isAiEstimate?: boolean;
  issues?: WireIssue[];
  overallBand?: number;
  schemaVersion?: string;
  summary?: JsonRecord;
  versionSnapshot?: JsonRecord;
}

interface WireIssue extends JsonRecord {
  confidence?: number;
  diagnosis?: JsonRecord;
  endOffset?: number;
  excerpt?: string;
  id?: string;
  severity?: number;
  skillId?: string;
  startOffset?: number;
}

const issueTypes = [
  "GRAMMAR",
  "SPELLING",
  "WORD_FORM",
  "COLLOCATION",
  "NATURALNESS",
  "LOGIC",
  "COHESION",
  "TASK_RESPONSE",
  "OPTIONAL_POLISH",
] as const;

interface WireLessonPlan extends JsonRecord {
  coreMinutes?: number;
  coreSkillId?: string;
  id?: string;
  items?: WireExerciseItem[];
  plannedMinutes?: number;
  stages?: unknown[];
}

interface WireLessonEvaluation extends JsonRecord {
  outcome?: string;
  confidence?: number;
  demo_only?: boolean;
  evidence?: unknown;
  dimension_scores?: JsonRecord;
  criterion_results?: unknown;
  accepted_answers?: unknown;
  confusion_id?: string | null;
  feedback_en?: string;
  feedback_zh?: string;
  first_attempt_passed?: boolean;
  passed?: boolean;
  suggestion_zh?: string;
  valid_for_evidence?: boolean;
}

interface WireLessonResponse extends JsonRecord {
  attempt_count?: number;
  evaluation?: WireLessonEvaluation | null;
  final_answer?: unknown;
  first_answer?: unknown;
  hint_level?: string;
  hints_used?: number;
  reference_answer_seen?: boolean;
  response_id?: string;
}

interface WireLessonProgress extends JsonRecord {
  active_item_ids?: string[];
  completed_item_ids?: string[];
  remediation_active?: boolean;
  next_core_index?: number;
  next_item_id?: string | null;
  responses?: Record<string, WireLessonResponse>;
}

interface WireLessonRuntime extends JsonRecord {
  effectiveElapsedSeconds?: number;
  productiveSeconds?: number;
  revision?: number;
  segmentLimitSeconds?: number;
  server_draft?: JsonRecord | null;
  startedAt?: string | null;
  state?: JsonRecord;
  status?: string;
  timeboxExpired?: boolean;
}

interface WireBatchFeedback extends JsonRecord {
  demo_only?: boolean;
  feedback_en?: string;
  feedback_zh?: string;
  item_id?: string;
  passed?: boolean;
  suggestion_zh?: string;
}

interface WireExerciseBatch extends JsonRecord {
  feedback?: WireBatchFeedback[];
  feedback_ready?: boolean;
  group_id?: string;
  required?: number;
  submitted?: number;
}

interface WireExerciseItem extends JsonRecord {
  evaluationContract?: JsonRecord;
  expectedMinutes?: number;
  id?: string;
  itemType?: string;
  ordinal?: number;
  prompt?: JsonRecord;
}

interface WireRewriteTask extends JsonRecord {
  abstractChecklist?: string[];
  availableAt?: string;
  completedAt?: string | null;
  expiresAt?: string | null;
  id?: string;
  startedAt?: string | null;
  status?: string;
}

interface WireCycle extends JsonRecord {
  coreSkillId?: string | null;
  createdAt?: string;
  id?: string;
  lessonPlans?: WireLessonPlan[];
  question?: WireQuestion;
  rewriteTasks?: WireRewriteTask[];
  transferTasks?: WireTransferTask[];
  status?: string;
  updatedAt?: string;
  writingAttempts?: Array<WireAttempt & { assessment?: WireAssessment | null }>;
  comparisonEvidence?: {
    confidence?: number;
    payload?: JsonRecord;
    valid?: boolean;
  } | null;
  lessonGenerationRetry?: {
    code?: string;
    jobId?: string;
    safeMessage?: string;
  } | null;
  issueClassificationRetry?: {
    code?: string;
    jobId?: string;
    safeMessage?: string;
  } | null;
}

interface TodayWire {
  cycle: null | {
    core_skill_id?: string | null;
    id: string;
    question?: WireQuestion;
    status: string;
    resources?: {
      comparison_available?: boolean;
      feedback_available?: boolean;
      lesson_id?: string | null;
      pending_job?: null | {
        error_code?: string | null;
        error_safe_message?: string | null;
        id: string;
        status: string;
        task_kind: string;
      };
      rewrite_task_id?: string | null;
      transfer_task_id?: string | null;
      writing_available?: boolean;
    };
  };
  next_action: {
    dueAt?: string | null;
    entityId: string;
    kind: string;
    overdue?: boolean;
    reason?: string;
  };
  queue?: Array<{ cycle_id: string; due_at: string | null; kind: string }>;
}

interface WireEssayWorkspaceAction extends JsonRecord {
  due_at?: string | null;
  entity_id?: string;
  kind?: string;
  overdue?: boolean;
  reason?: string;
}

interface WireEssayWorkspaceResources extends JsonRecord {
  comparison_available?: boolean;
  cycle_id?: string;
  feedback_available?: boolean;
  lesson_id?: string | null;
  rewrite_task_id?: string | null;
  transfer_task_id?: string | null;
  writing_available?: boolean;
}

interface WireEssayWorkspaceItem extends JsonRecord {
  id?: string;
  next_action?: WireEssayWorkspaceAction;
  prompt?: string;
  resources?: WireEssayWorkspaceResources;
  status?: string;
  topic?: string;
  updated_at?: string;
}

interface EssayWorkspaceWire extends JsonRecord {
  active_count?: number;
  active_limit?: number;
  essays?: WireEssayWorkspaceItem[];
}

interface CycleWire {
  cycle: WireCycle;
}

interface AttemptWire {
  attempt: WireAttempt & { cycle?: WireCycle };
}

interface ProviderWire extends JsonRecord {
  baseUrl?: string | null;
  base_url?: string | null;
  capabilities?: JsonRecord | null;
  enabled?: boolean;
  id?: string;
  kind?: AiConnection["provider"];
  vendor?: AiConnection["vendor"];
  lastTestedAt?: string | null;
  name?: string;
  secretMode?: string;
  secret_mode?: string;
}

interface JobWire {
  error?: { code?: string; safe_message?: string } | null;
  id?: string;
  status: string;
}

const terminalJobStates = new Set(["SUCCEEDED", "AI_BLOCKED", "FAILED"]);
const timelineStates = [
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

const defaultPreferences: UserPreferences = {
  deploymentMode: "personal",
  locale: "zh-CN",
  feedbackLanguage: "zh-with-en",
  examType: "academic",
  targetBand: 7,
  timezone: "Asia/Shanghai",
  studyTime: "20:00",
  studyDays: ["Tue", "Thu", "Sat"],
  strictTimedMode: true,
  emailNotifications: false,
  email: "",
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function textValue(
  value: JsonRecord,
  keys: readonly string[],
  fallback = "",
): string {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return fallback;
}

function numberValue(
  value: JsonRecord,
  keys: readonly string[],
  fallback = 0,
): number {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate))
      return candidate;
  }
  return fallback;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecoverableTeachingAnalysisError(error: unknown): boolean {
  if (!(error instanceof LearningClientError)) return false;
  return (
    error.code === "NETWORK_ERROR" ||
    error.status === 408 ||
    error.status === 425 ||
    error.status === 429 ||
    error.status >= 500 ||
    (error.status === 0 && error.retryable)
  );
}

function randomId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function wordCount(value: string): number {
  return value.trim().match(/[\p{L}\p{N}’'-]+/gu)?.length ?? 0;
}

function statusIndex(status = "QUESTION_READY"): number {
  const index = timelineStates.indexOf(
    status as (typeof timelineStates)[number],
  );
  return index < 0 ? 0 : index;
}

function formatDue(value: string | null | undefined, locale: "zh" | "en") {
  if (!value) return locale === "zh" ? "无需等待" : "Ready when you are";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function mapQuestion(question: WireQuestion | undefined): WritingPrompt {
  const source = question ?? {};
  return {
    id: source.externalId ?? source.id ?? "current-question",
    category: `${source.topic ?? "IELTS Task 2"} · ${source.questionType ?? "Essay"}`,
    question:
      source.prompt ??
      "Open Today to choose an IELTS Writing Task 2 question before starting.",
    instruction:
      source.instructions ??
      "Write at least 250 words and support your answer with reasons.",
    sourceLabel: "IELTS Writing Task 2",
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function evidenceText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  return textValue(value, ["summary", "excerpt", "evidence", "description"]);
}

function mapTransferTask(task: WireTransferTask): TransferTaskData {
  const rawResult = task.result;
  let result: TransferTaskData["result"] = null;
  if (
    rawResult &&
    (rawResult.outcome === "PASS" ||
      rawResult.outcome === "FAIL" ||
      rawResult.outcome === "NO_OPPORTUNITY")
  ) {
    result = {
      outcome: rawResult.outcome,
      confidence:
        typeof rawResult.confidence === "number" ? rawResult.confidence : null,
      feedbackZh: rawResult.feedback_zh ?? "服务器已记录本次迁移评估结果。",
      feedbackEn:
        rawResult.feedback_en ??
        "The server recorded this transfer evaluation result.",
      evidence: evidenceText(rawResult.evidence),
      evidenceStatus: rawResult.status ?? "RECORDED",
      transferred: rawResult.transferred === true,
      gateMissing: stringList(rawResult.gate_missing),
      mockLanguageScoring: rawResult.mock_language_scoring === true,
    };
  }
  const sourceQuestion = task.question ?? task.source_question;
  return {
    id: task.id ?? "transfer-task-unavailable",
    sourceCycleId: task.source_cycle_id ?? "",
    status: (task.status ?? "PLANNED") as TransferTaskStatus,
    availableAt: task.available_at ?? "",
    expiresAt: task.expires_at ?? null,
    windowExpired: task.window_expired === true,
    targetHintHidden: task.target_hint_hidden !== false,
    question: mapQuestion(sourceQuestion),
    result,
    pendingJobId: task.pending_job_id ?? null,
    evaluationError: task.evaluation_error
      ? {
          code: task.evaluation_error.code ?? "TRANSFER_EVALUATION_FAILED",
          safeMessage:
            task.evaluation_error.safe_message ??
            "The transfer evaluation could not be completed.",
        }
      : null,
  };
}

/**
 * A cycle whose scoring-chain job is terminal-but-not-succeeded needs an
 * explicit action; silently "waiting" would never make progress.
 */
function blockedJobPresentation(pendingJob: {
  errorCode: string | null;
  errorSafeMessage: string | null;
  status: string;
  taskKind: string;
}): ReturnType<typeof actionPresentation> {
  const nouns: Record<string, { zh: string; en: string }> = {
    ielts_assessment: { zh: "批改", en: "feedback" },
    issue_classification: { zh: "问题归类", en: "issue classification" },
    exercise_generation: { zh: "专项训练", en: "focused practice" },
    version_comparison: { zh: "对比分析", en: "comparison" },
  };
  const noun = nouns[pendingJob.taskKind] ?? { zh: "AI 任务", en: "AI task" };
  const blocked = pendingJob.status === "AI_BLOCKED";
  const zhReason = pendingJob.errorSafeMessage
    ? `上次失败原因：${pendingJob.errorSafeMessage}`
    : "上次运行未能完成。";
  const enReason = pendingJob.errorSafeMessage
    ? `Last failure: ${pendingJob.errorSafeMessage}`
    : "The last run did not finish.";
  return {
    taskKind: "feedback",
    href: "/today",
    durationMinutes: 0,
    eyebrowZh: blocked ? "AI 连接需要修复" : `${noun.zh}未完成`,
    eyebrowEn: blocked ? "AI connection needs repair" : `${noun.en} incomplete`,
    titleZh: blocked ? "修复 AI 连接后自动继续" : `重试${noun.zh}`,
    titleEn: blocked
      ? "Repair the AI connection to continue"
      : `Retry ${noun.en}`,
    descriptionZh: `${zhReason}${blocked ? "更新或更换 AI 密钥后，等待中的任务会自动恢复。" : ""}`,
    descriptionEn: `${enReason}${blocked ? " Waiting jobs resume automatically after the AI key is updated or replaced." : ""}`,
    actionZh: blocked ? "检查 AI 连接" : `重试${noun.zh}`,
    actionEn: blocked ? "Review AI connection" : `Retry ${noun.en}`,
  };
}

function actionPresentation(kind: string): {
  actionEn: string;
  actionZh: string;
  descriptionEn: string;
  descriptionZh: string;
  durationMinutes: number;
  eyebrowEn: string;
  eyebrowZh: string;
  href: string;
  taskKind: TaskKind;
  titleEn: string;
  titleZh: string;
} {
  if (kind === "START_MIXED_REVIEW") {
    return {
      taskKind: "first-attempt",
      href: "/today?mixed-review=1",
      durationMinutes: 40,
      eyebrowZh: "D14 被动复测",
      eyebrowEn: "D14 hidden review",
      titleZh: "完成新作文并被动复测旧目标",
      titleEn: "Write a new essay with a hidden prior-skill check",
      descriptionZh:
        "旧目标保持隐藏；系统只根据这篇新作文中自然出现的证据判断保持情况。",
      descriptionEn:
        "The prior skill stays hidden and is checked only through natural evidence in the new essay.",
      actionZh: "选择新题",
      actionEn: "Choose a new prompt",
    };
  }
  if (
    ["START_ATTEMPT_1", "CONTINUE_ATTEMPT_1", "START_NEW_CYCLE"].includes(kind)
  ) {
    return {
      taskKind: "first-attempt",
      href: "/write",
      durationMinutes: 40,
      eyebrowZh: "唯一下一步",
      eyebrowEn: "Your one next action",
      titleZh: "完成一篇 40 分钟首写",
      titleEn: "Complete a 40-minute first attempt",
      descriptionZh: "题目、计时与自动保存都已准备好。",
      descriptionEn: "Your prompt, timer, and autosave are ready.",
      actionZh: kind === "CONTINUE_ATTEMPT_1" ? "继续写作" : "开始写作",
      actionEn:
        kind === "CONTINUE_ATTEMPT_1" ? "Continue writing" : "Start writing",
    };
  }
  if (["REVIEW_FEEDBACK", "WAIT_FOR_ASSESSMENT"].includes(kind)) {
    const waiting = kind === "WAIT_FOR_ASSESSMENT";
    return {
      taskKind: "feedback",
      href: waiting ? "/today" : "/feedback",
      durationMinutes: waiting ? 0 : 15,
      eyebrowZh: waiting ? "批改处理中" : "批改已完成",
      eyebrowEn: waiting ? "Feedback is processing" : "Feedback is ready",
      titleZh: waiting ? "等待批改完成" : "阅读你的诊断报告",
      titleEn: waiting ? "Wait for feedback" : "Review your diagnostic report",
      descriptionZh: waiting
        ? "AI 任务完成后这里会自动更新。"
        : "先理解三个最高优先问题。",
      descriptionEn: waiting
        ? "This updates when the AI job completes."
        : "Start with the three highest-priority issues.",
      actionZh: waiting ? "刷新状态" : "查看报告",
      actionEn: waiting ? "Refresh status" : "View feedback",
    };
  }
  if (["START_LESSON", "CONTINUE_LESSON", "WAIT_FOR_LESSON"].includes(kind)) {
    const waiting = kind === "WAIT_FOR_LESSON";
    return {
      taskKind: "lesson",
      href: waiting ? "/today" : "/lesson",
      durationMinutes: waiting ? 0 : 60,
      eyebrowZh: waiting ? "试卷生成中" : "专项训练卷已就绪",
      eyebrowEn: waiting ? "Paper is being prepared" : "Practice paper ready",
      titleZh: waiting ? "等待专项训练卷生成" : "完成60分钟专项训练卷",
      titleEn: waiting
        ? "Wait for the focused practice paper"
        : "Complete the 60-minute practice paper",
      descriptionZh: "整张试卷围绕本篇最高优先问题组织，完成后统一交卷和批改。",
      descriptionEn:
        "The complete paper targets one priority issue and is marked after submission.",
      actionZh: waiting
        ? "刷新状态"
        : kind === "CONTINUE_LESSON"
          ? "继续答卷"
          : "开始答卷",
      actionEn: waiting
        ? "Refresh status"
        : kind === "CONTINUE_LESSON"
          ? "Continue paper"
          : "Start paper",
    };
  }
  if (
    [
      "START_REWRITE",
      "CONTINUE_REWRITE",
      "RESCHEDULE_REWRITE",
      "WAIT_FOR_REWRITE_UNLOCK",
      "WAIT_FOR_REWRITE_SCHEDULING",
    ].includes(kind)
  ) {
    const rescheduling = kind === "RESCHEDULE_REWRITE";
    const waiting = kind.startsWith("WAIT_");
    return {
      taskKind: "rewrite",
      href: waiting ? "/today" : "/rewrite",
      durationMinutes: rescheduling ? 1 : waiting ? 0 : 40,
      eyebrowZh: rescheduling
        ? "重写窗口已错过"
        : waiting
          ? "闭卷间隔中"
          : "重写窗口已开启",
      eyebrowEn: rescheduling
        ? "Rewrite window missed"
        : waiting
          ? "Closed-book interval"
          : "Rewrite window open",
      titleZh: rescheduling
        ? "重新安排闭卷重写"
        : waiting
          ? "等待延迟重写解锁"
          : "闭卷重写原题",
      titleEn: rescheduling
        ? "Reschedule the closed-book rewrite"
        : waiting
          ? "Wait for the delayed rewrite"
          : "Rewrite the original task closed-book",
      descriptionZh: rescheduling
        ? "原窗口已错过；确认后由服务器创建新窗口，不覆盖任何首答。"
        : waiting
          ? "到点后系统会把重写变成唯一下一步。"
          : "前 35 分钟不显示个人目标，最后 5 分钟只显示抽象检查。",
      descriptionEn: rescheduling
        ? "The original window was missed. The server will create a new window without replacing any first answer."
        : waiting
          ? "It becomes your one next action when due."
          : "Personal targets stay hidden for 35 minutes; only abstract checks appear in the final five.",
      actionZh: rescheduling
        ? "重新安排"
        : waiting
          ? "查看解锁时间"
          : kind === "CONTINUE_REWRITE"
            ? "继续重写"
            : "开始重写",
      actionEn: rescheduling
        ? "Reschedule"
        : waiting
          ? "View unlock time"
          : kind === "CONTINUE_REWRITE"
            ? "Continue rewrite"
            : "Start rewrite",
    };
  }
  if (kind === "WAIT_FOR_COMPARISON") {
    return {
      taskKind: "comparison",
      href: "/today",
      durationMinutes: 0,
      eyebrowZh: "对比生成中",
      eyebrowEn: "Comparison is processing",
      titleZh: "等待 V1 / V2 对比",
      titleEn: "Wait for the V1 / V2 comparison",
      descriptionZh: "系统正在检查旧问题是否在闭卷写作中复发。",
      descriptionEn:
        "The system is checking whether old issues recurred closed-book.",
      actionZh: "刷新状态",
      actionEn: "Refresh status",
    };
  }
  const rescheduling = kind === "RESCHEDULE_TRANSFER";
  return {
    taskKind: "transfer",
    href: kind.startsWith("WAIT_") ? "/today" : "/transfer",
    durationMinutes: rescheduling ? 1 : kind.startsWith("WAIT_") ? 0 : 8,
    eyebrowZh: rescheduling ? "迁移窗口已错过" : "迁移验证",
    eyebrowEn: rescheduling ? "Transfer window missed" : "Transfer check",
    titleZh: rescheduling ? "重新安排陌生题迁移" : "在陌生题中迁移目标能力",
    titleEn: rescheduling
      ? "Reschedule the unfamiliar-topic transfer"
      : "Transfer the target skill to a new topic",
    descriptionZh: rescheduling
      ? "错过窗口不会记为失败；由服务器安排新的无提示窗口。"
      : "用新的语境检查能力是否真正可迁移。",
    descriptionEn: rescheduling
      ? "Missing the window is not a failure. The server will schedule a new unprompted window."
      : "A new context checks whether the skill genuinely transfers.",
    actionZh: rescheduling ? "重新安排" : "开始迁移",
    actionEn: rescheduling ? "Reschedule" : "Start transfer",
  };
}

function actionIdentityHref(
  kind: string,
  pathname: string,
  cycleId: string | undefined,
  entityId: string,
): string {
  if (pathname === "/today" || pathname.startsWith("/today?")) return pathname;
  const searchParams = new URLSearchParams();
  if (cycleId) searchParams.set("cycle", cycleId);
  if (["START_LESSON", "CONTINUE_LESSON"].includes(kind))
    searchParams.set("lesson", entityId);
  if (
    [
      "START_REWRITE",
      "CONTINUE_REWRITE",
      "RESCHEDULE_REWRITE",
      "START_TRANSFER",
      "RESCHEDULE_TRANSFER",
    ].includes(kind)
  )
    searchParams.set("task", entityId);
  const query = searchParams.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

function invalidEssayWorkspace(): never {
  throw new LearningClientError(
    "The server did not return a usable essay workspace.",
    { code: "INVALID_RESPONSE" },
  );
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function mapEssayWorkspaceItem(
  item: WireEssayWorkspaceItem,
): EssayWorkspaceItem {
  const action = item.next_action;
  const resources = item.resources;
  const actionKind = action?.kind;
  const actionEntityId = action?.entity_id;
  if (
    !item.id ||
    !item.prompt ||
    !item.topic ||
    !item.status ||
    !validInstant(item.updated_at) ||
    !action ||
    typeof actionKind !== "string" ||
    !NEXT_ACTION_KINDS.includes(
      actionKind as (typeof NEXT_ACTION_KINDS)[number],
    ) ||
    typeof actionEntityId !== "string" ||
    actionEntityId.length === 0 ||
    typeof action.reason !== "string" ||
    !(action.due_at === null || validInstant(action.due_at)) ||
    typeof action.overdue !== "boolean" ||
    !resources ||
    resources.cycle_id !== item.id ||
    typeof resources.writing_available !== "boolean" ||
    typeof resources.feedback_available !== "boolean" ||
    !(
      resources.lesson_id === null || typeof resources.lesson_id === "string"
    ) ||
    !(
      resources.rewrite_task_id === null ||
      typeof resources.rewrite_task_id === "string"
    ) ||
    typeof resources.comparison_available !== "boolean" ||
    !(
      resources.transfer_task_id === null ||
      typeof resources.transfer_task_id === "string"
    )
  ) {
    return invalidEssayWorkspace();
  }
  const presentation = actionPresentation(actionKind);
  return {
    id: item.id,
    prompt: item.prompt,
    topic: item.topic,
    status: item.status,
    updatedAt: item.updated_at,
    nextAction: {
      kind: actionKind,
      entityId: actionEntityId,
      reason: action.reason,
      dueAt: action.due_at ?? null,
      overdue: action.overdue,
    },
    nextTask: {
      id: actionEntityId,
      kind: presentation.taskKind,
      eyebrowZh: presentation.eyebrowZh,
      eyebrowEn: presentation.eyebrowEn,
      titleZh: presentation.titleZh,
      titleEn: presentation.titleEn,
      descriptionZh: presentation.descriptionZh,
      descriptionEn: presentation.descriptionEn,
      durationMinutes: presentation.durationMinutes,
      href: actionIdentityHref(
        actionKind,
        presentation.href,
        item.id,
        actionEntityId,
      ),
      actionZh: presentation.actionZh,
      actionEn: presentation.actionEn,
      dueLabelZh: formatDue(action.due_at, "zh"),
      dueLabelEn: formatDue(action.due_at, "en"),
    },
    resources: {
      cycleId: resources.cycle_id,
      writingAvailable: resources.writing_available,
      feedbackAvailable: resources.feedback_available,
      lessonId: resources.lesson_id ?? null,
      rewriteTaskId: resources.rewrite_task_id ?? null,
      comparisonAvailable: resources.comparison_available,
      transferTaskId: resources.transfer_task_id ?? null,
    },
  };
}

function mapEssayWorkspace(value: EssayWorkspaceWire): EssayWorkspaceData {
  const activeCount = value.active_count;
  if (
    typeof activeCount !== "number" ||
    !Number.isInteger(activeCount) ||
    activeCount < 0 ||
    activeCount > 8 ||
    value.active_limit !== 8 ||
    !Array.isArray(value.essays) ||
    value.essays.length !== activeCount
  ) {
    return invalidEssayWorkspace();
  }
  return {
    activeCount,
    activeLimit: 8,
    essays: value.essays.map(mapEssayWorkspaceItem),
  };
}

function mapTimeline(status: string): TimelineStep[] {
  const current = statusIndex(status);
  const milestones = [
    { id: "v1", rank: 1, zh: "首写", en: "First attempt" },
    { id: "feedback", rank: 4, zh: "批改", en: "Feedback" },
    { id: "lesson", rank: 7, zh: "专项训练", en: "Focused lesson" },
    { id: "rewrite", rank: 11, zh: "延迟重写", en: "Delayed rewrite" },
    { id: "transfer", rank: 14, zh: "陌生题迁移", en: "Transfer" },
  ];
  let currentAssigned = false;
  return milestones.map((milestone) => {
    let state: TimelineStep["state"];
    if (current > milestone.rank) state = "done";
    else if (!currentAssigned) {
      state = "current";
      currentAssigned = true;
    } else state = "upcoming";
    return {
      id: milestone.id,
      labelZh: milestone.zh,
      labelEn: milestone.en,
      state,
      dateLabel: state === "done" ? "✓" : state === "current" ? "Now" : "—",
    };
  });
}

function mapProvider(provider: ProviderWire | undefined): AiConnection {
  if (!provider) {
    return {
      id: "missing",
      provider: "openai",
      vendor: "openai",
      displayName: "尚未连接",
      baseUrl: "",
      model: "—",
      state: "missing",
      secretSource: "none",
      secretHint: "",
      lastTestedZh: "尚未测试",
      lastTestedEn: "Not tested",
      latencyMs: null,
      structuredOutput: false,
    };
  }
  const capabilities = record(provider.capabilities);
  const mode = provider.secretMode ?? provider.secret_mode;
  return {
    id: provider.id ?? "environment-openai",
    provider: provider.kind ?? "openai",
    vendor:
      provider.vendor ??
      (provider.kind === "mock"
        ? "mock"
        : provider.kind === "compatible"
          ? "custom"
          : "openai"),
    displayName: provider.name ?? "OpenAI",
    baseUrl:
      provider.baseUrl ?? provider.base_url ?? "https://api.openai.com/v1",
    model: textValue(capabilities, ["model"], "Configured by model routes"),
    state: provider.enabled === false ? "blocked" : "connected",
    secretSource:
      mode === "environment"
        ? "environment"
        : mode === "session_only"
          ? "session"
          : "encrypted",
    secretHint: "••••••••••••",
    lastTestedZh: provider.lastTestedAt ?? "已配置",
    lastTestedEn: provider.lastTestedAt ?? "Configured",
    latencyMs:
      numberValue(capabilities, ["latencyMs", "latency_ms"], 0) || null,
    structuredOutput:
      capabilities.structuredOutput === true ||
      capabilities.structured_output === true,
  };
}

function criterionScores(assessment: WireAssessment): BandScore[] {
  const values = record(assessment.criterionScores);
  const confidence = (assessment.confidence ?? 0.7) >= 0.8 ? "high" : "medium";
  return [
    ["TR", "任务回应", "Task Response", ["taskResponse", "task_response"]],
    [
      "CC",
      "连贯与衔接",
      "Coherence & Cohesion",
      ["coherenceCohesion", "coherence_cohesion"],
    ],
    [
      "LR",
      "词汇资源",
      "Lexical Resource",
      ["lexicalResource", "lexical_resource"],
    ],
    [
      "GRA",
      "语法范围与准确度",
      "Grammar Range & Accuracy",
      ["grammar", "grammarRangeAccuracy"],
    ],
  ].map(([criterion, labelZh, labelEn, keys]) => ({
    criterion: criterion as BandScore["criterion"],
    labelZh: labelZh as string,
    labelEn: labelEn as string,
    score: numberValue(values, keys as string[], assessment.overallBand ?? 0),
    confidence,
    summaryZh: "查看下方证据与迁移规则。",
    summaryEn: "Review the evidence and transfer rule below.",
  }));
}

function diagnosisText(
  diagnosis: JsonRecord,
  zhKeys: string[],
  enKeys: string[],
  zhFallback: string,
  enFallback: string,
) {
  return {
    zh: textValue(diagnosis, zhKeys, zhFallback),
    en: textValue(diagnosis, enKeys, enFallback),
  };
}

function mapIssue(issue: WireIssue, index: number): FeedbackIssue {
  const diagnosis = record(issue.diagnosis);
  const title = diagnosisText(
    diagnosis,
    ["titleZh", "title_zh", "labelZh"],
    ["titleEn", "title_en", "labelEn"],
    issue.skillId ?? "可迁移写作问题",
    issue.skillId ?? "Transferable writing issue",
  );
  const explanation = diagnosisText(
    diagnosis,
    ["explanationZh", "explanation_zh", "diagnosisZh"],
    ["explanationEn", "explanation_en", "diagnosisEn"],
    "该问题会影响表达的准确性或自然度。",
    "This issue affects accuracy or naturalness.",
  );
  const transfer = diagnosisText(
    diagnosis,
    ["transferRuleZh", "transfer_rule_zh", "ruleZh"],
    ["transferRuleEn", "transfer_rule_en", "ruleEn"],
    "下一篇先确认意思，再调用完整英语词块。",
    "In the next essay, confirm the meaning before retrieving a complete English chunk.",
  );
  return {
    id: issue.id ?? `issue-${index + 1}`,
    priority: index + 1,
    categoryZh: title.zh,
    categoryEn: title.en,
    titleZh: title.zh,
    titleEn: title.en,
    evidence: issue.excerpt ?? "No excerpt was stored.",
    startOffset:
      typeof issue.startOffset === "number" ? issue.startOffset : null,
    endOffset: typeof issue.endOffset === "number" ? issue.endOffset : null,
    explanationZh: explanation.zh,
    explanationEn: explanation.en,
    transferRuleZh: transfer.zh,
    transferRuleEn: transfer.en,
    issueType: issueTypes.includes(
      String(diagnosis.issueType) as (typeof issueTypes)[number],
    )
      ? (String(diagnosis.issueType) as FeedbackIssue["issueType"])
      : issue.skillId === "word_form_precision"
        ? "WORD_FORM"
        : issue.skillId === "mechanism_chain"
          ? "LOGIC"
          : "COLLOCATION",
    correctedVersion: textValue(
      diagnosis,
      ["correctedVersion", "corrected_version"],
      issue.excerpt ?? "",
    ),
    knowledgePointZh: textValue(
      diagnosis,
      ["knowledgePointZh", "knowledge_point_zh"],
      transfer.zh,
    ),
    severity:
      String(diagnosis.issueType) === "OPTIONAL_POLISH"
        ? "polish"
        : ["COLLOCATION", "NATURALNESS"].includes(String(diagnosis.issueType))
          ? "naturalness"
          : "must_fix",
    confidence: issue.confidence ?? 0.7,
    skillId: issue.skillId,
  };
}

function stageAt(index: number, length: number): LessonStage {
  if (index === 0) return "diagnose";
  if (index === length - 1) return "finish";
  if (index === 1) return "understand";
  if (index === length - 2) return "apply";
  return "produce";
}

function mapExercise(
  item: WireExerciseItem,
  index: number,
  length: number,
): LessonItem {
  const prompt = record(item.prompt);
  const evaluationContract = record(item.evaluationContract);
  const canonical = record(evaluationContract.canonicalItem);
  const presentation = record(
    evaluationContract.presentation ?? prompt.presentation,
  );
  const canonicalStage = String(canonical.stage);
  const stage: LessonStage =
    canonicalStage === "notice"
      ? "diagnose"
      : canonicalStage === "understand" || canonicalStage === "control"
        ? "understand"
        : canonicalStage === "produce"
          ? "produce"
          : canonicalStage === "near_transfer"
            ? "apply"
            : canonicalStage === "self_check"
              ? "finish"
              : stageAt(index, length);
  const rawChoices = Array.isArray(prompt.choices) ? prompt.choices : [];
  const choices = rawChoices.map((choice, choiceIndex) => {
    const value = record(choice);
    const label = textValue(
      value,
      ["labelEn", "label", "text"],
      String(choice),
    );
    return {
      id: textValue(
        value,
        ["id", "value"],
        String.fromCharCode(97 + choiceIndex),
      ),
      labelZh: textValue(value, ["labelZh", "label_zh"], label),
      labelEn: label,
    };
  });
  const kind =
    choices.length > 0
      ? stage === "understand"
        ? "explain"
        : "choice"
      : stage === "apply"
        ? "transfer"
        : stage === "finish"
          ? "exit"
          : "rewrite";
  const source = textValue(prompt, ["source", "evidence"], "");
  const hintPolicy = ["NONE", "ON_REQUEST", "SCAFFOLD_LADDER"].includes(
    String(canonical.hintPolicy),
  )
    ? (canonical.hintPolicy as NonNullable<LessonItem["hintPolicy"]>)
    : "ON_REQUEST";
  const hintZh =
    hintPolicy === "NONE"
      ? ""
      : textValue(
          prompt,
          ["hintZh", "hint_zh"],
          "先检查主语、动词搭配和比较对象。",
        );
  const hintEn =
    hintPolicy === "NONE"
      ? ""
      : textValue(
          prompt,
          ["hintEn", "hint_en"],
          "Check the subject, verb collocation, and comparison target.",
        );
  const modelAnswer = textValue(
    prompt,
    ["modelAnswer", "model_answer", "answer"],
    "",
  );
  const formValues = [
    "SPOTLIGHT",
    "MEANING_FORK",
    "EXPRESSION_MAP",
    "MINIMAL_CONTRAST",
    "SKELETON",
    "OPEN_GENERATION",
    "ARGUMENT_CHAIN",
    "PARAGRAPH_LAB",
    "TARGETED_SELF_CHECK",
  ];
  const responseModeValues = [
    "span",
    "choice",
    "mapping",
    "slots",
    "sentence",
    "chain",
    "paragraph",
    "revision",
  ];
  const mappingPairs = Array.isArray(presentation.mappingPairs)
    ? presentation.mappingPairs.flatMap((entry) => {
        const pair = record(entry);
        return typeof pair.left === "string" && typeof pair.right === "string"
          ? [{ left: pair.left, right: pair.right }]
          : [];
      })
    : [];
  const canonicalCriteria = Array.isArray(canonical.grading)
    ? []
    : record(canonical.grading).criteria;
  const criteria = Array.isArray(canonicalCriteria)
    ? canonicalCriteria.flatMap((entry) => {
        const criterion = record(entry);
        return typeof criterion.id === "string" &&
          typeof criterion.description === "string" &&
          typeof criterion.passingScore === "number"
          ? [
              {
                id: criterion.id,
                description: criterion.description,
                passingScore: criterion.passingScore,
              },
            ]
          : [];
      })
    : [];
  return {
    id: item.id ?? `lesson-item-${index + 1}`,
    stage,
    kind,
    estimatedMinutes:
      item.expectedMinutes ?? numberValue(prompt, ["minutes"], 8),
    eyebrowZh: textValue(prompt, ["eyebrowZh", "titleZh"], `阶段 ${index + 1}`),
    eyebrowEn: textValue(
      prompt,
      ["eyebrowEn", "titleEn"],
      `Stage ${index + 1}`,
    ),
    ...(source ? { source } : {}),
    promptZh: textValue(
      prompt,
      ["instructionZh", "promptZh"],
      "请完成这道主动输出题。",
    ),
    promptEn: textValue(
      prompt,
      ["promptEn", "instructionEn"],
      "Complete this active-output task.",
    ),
    helperZh: textValue(
      prompt,
      ["helperZh", "supportZh"],
      "首次答案会作为真实基线保存。",
    ),
    helperEn: textValue(
      prompt,
      ["helperEn", "supportEn"],
      "Your first answer is retained as baseline evidence.",
    ),
    ...(choices.length > 0 ? { choices } : {}),
    ...(formValues.includes(String(presentation.form))
      ? { form: presentation.form as NonNullable<LessonItem["form"]> }
      : {}),
    ...(responseModeValues.includes(String(presentation.responseMode))
      ? {
          responseMode: presentation.responseMode as NonNullable<
            LessonItem["responseMode"]
          >,
        }
      : {}),
    ...(mappingPairs.length > 0 ? { mappingPairs } : {}),
    ...(Array.isArray(presentation.slotLabels)
      ? {
          slotLabels: presentation.slotLabels.filter(
            (entry): entry is string => typeof entry === "string",
          ),
        }
      : {}),
    ...(typeof presentation.minimumWords === "number"
      ? { minimumWords: presentation.minimumWords }
      : {}),
    ...(typeof presentation.maximumWords === "number"
      ? { maximumWords: presentation.maximumWords }
      : {}),
    ...(Array.isArray(presentation.selfCheckPrompts)
      ? {
          selfCheckPrompts: presentation.selfCheckPrompts.filter(
            (entry): entry is string => typeof entry === "string",
          ),
        }
      : {}),
    ...(typeof presentation.revisionSourceItemId === "string"
      ? { revisionSourceItemId: presentation.revisionSourceItemId }
      : {}),
    ...(typeof prompt.revisionBaseline === "string"
      ? { revisionBaseline: prompt.revisionBaseline }
      : {}),
    ...(criteria.length > 0 ? { criteria } : {}),
    ...(hintZh ? { hintZh } : {}),
    ...(hintEn ? { hintEn } : {}),
    ...(modelAnswer ? { modelAnswer } : {}),
    successZh: textValue(prompt, ["successZh"], "你完成了当前阶段的主动输出。"),
    successEn: textValue(
      prompt,
      ["successEn"],
      "You completed the active output for this stage.",
    ),
    path: (["CORE", "FLEX", "OPTIONAL"].includes(
      String(evaluationContract.path),
    )
      ? evaluationContract.path
      : "CORE") as NonNullable<LessonItem["path"]>,
    evidenceOpportunity: String(canonical.evidenceOpportunity ?? "OTHER"),
    hintPolicy,
    feedbackPolicy: ([
      "IMMEDIATE",
      "BATCH_AFTER_GROUP",
      "AFTER_SUBMISSION",
    ].includes(String(canonical.feedbackPolicy))
      ? canonical.feedbackPolicy
      : "AFTER_SUBMISSION") as NonNullable<LessonItem["feedbackPolicy"]>,
    ...(typeof canonical.independentGroupId === "string"
      ? { independentGroupId: canonical.independentGroupId }
      : {}),
  };
}

function mapLessonEvaluation(
  responseId: string,
  value: WireLessonEvaluation,
  jobId: string | null = null,
): LessonEvaluationResult {
  const demoOnly = value.demo_only === true;
  const passed = typeof value.passed === "boolean" ? value.passed : null;
  const neutral = value.outcome === "NEUTRAL";
  const criterionResults = Array.isArray(value.criterion_results)
    ? value.criterion_results.flatMap((entry) => {
        const result = record(entry);
        return typeof result.id === "string" &&
          typeof result.score === "number" &&
          typeof result.passed === "boolean"
          ? [
              {
                id: result.id,
                score: result.score,
                passed: result.passed,
                evidence: Array.isArray(result.evidence)
                  ? result.evidence.filter(
                      (span): span is string => typeof span === "string",
                    )
                  : [],
              },
            ]
          : [];
      })
    : [];
  return {
    responseId,
    jobId,
    outcome: demoOnly
      ? "DEMO_ONLY"
      : neutral
        ? "NEUTRAL"
        : passed
          ? "PASS"
          : "RETRY",
    passed,
    firstAttemptPassed:
      typeof value.first_attempt_passed === "boolean"
        ? value.first_attempt_passed
        : null,
    confidence: typeof value.confidence === "number" ? value.confidence : null,
    feedbackZh: value.feedback_zh ?? "服务端已完成规范评价。",
    feedbackEn:
      value.feedback_en ?? "The server completed its canonical evaluation.",
    evidence: Array.isArray(value.evidence)
      ? value.evidence.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    dimensionScores: Object.fromEntries(
      Object.entries(record(value.dimension_scores)).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    ),
    criterionResults,
    acceptedAnswers: Array.isArray(value.accepted_answers)
      ? value.accepted_answers.filter(
          (answer): answer is string => typeof answer === "string",
        )
      : [],
    confusionId:
      typeof value.confusion_id === "string" ? value.confusion_id : null,
    suggestionZh: value.suggestion_zh ?? "",
    validForEvidence: value.valid_for_evidence === true && !demoOnly,
    demoOnly,
    remediationActive: false,
    batchFeedback: [],
  };
}

function mapLessonRuntime(value: WireLessonRuntime): LessonRuntimeData {
  const state = record(value.state);
  const autoSplit = record(state.autoSplit);
  const modules = Array.isArray(autoSplit.modules) ? autoSplit.modules : [];
  const refresherPlan = record(state.refresherPlan);
  const rawDraft = value.server_draft;
  const serverDraft =
    rawDraft && typeof rawDraft.itemId === "string"
      ? {
          lessonId: "",
          itemId: rawDraft.itemId,
          answer: String(rawDraft.answer ?? ""),
          firstAnswer: String(rawDraft.firstAnswer ?? ""),
          ...(typeof rawDraft.responseId === "string"
            ? { responseId: rawDraft.responseId }
            : {}),
          attempts: Number(rawDraft.attempts ?? 0),
          hintLevel: Number(rawDraft.hintLevel ?? 0),
          revealed: rawDraft.revealed === true,
          updatedAt: String(rawDraft.updatedAt ?? new Date(0).toISOString()),
        }
      : null;
  return {
    status: value.status ?? "READY",
    revision: value.revision ?? 1,
    startedAt: value.startedAt ?? null,
    effectiveElapsedSeconds: value.effectiveElapsedSeconds ?? 0,
    productiveSeconds: value.productiveSeconds ?? 0,
    segmentLimitSeconds: value.segmentLimitSeconds ?? 3_600,
    timeboxExpired: value.timeboxExpired === true,
    split: (["NONE", "SCHEDULED", "ACTIVE", "COMPLETED"].includes(
      String(state.split),
    )
      ? state.split
      : "NONE") as LessonRuntimeData["split"],
    refresher: (["NOT_REQUIRED", "REQUIRED", "COMPLETED"].includes(
      String(state.refresher),
    )
      ? state.refresher
      : "NOT_REQUIRED") as LessonRuntimeData["refresher"],
    interruptionCount: Array.isArray(state.interruptions)
      ? state.interruptions.length
      : 0,
    autoSplit:
      modules.length > 0
        ? {
            currentModule: Math.max(
              1,
              Number(autoSplit.currentModuleIndex ?? 0) + 1,
            ),
            moduleCount: modules.length,
            maxMinutes: Math.max(
              1,
              Math.round(Number(autoSplit.maxSegmentSeconds ?? 1500) / 60),
            ),
          }
        : null,
    refresherPlan: [
      "RULE_CONTRAST",
      "SCAFFOLD_FADE",
      "TIMED_PARAGRAPH",
    ].includes(String(refresherPlan.kind))
      ? {
          kind: refresherPlan.kind as NonNullable<
            LessonRuntimeData["refresherPlan"]
          >["kind"],
          durationMinutes: Number(refresherPlan.durationMinutes ?? 10),
        }
      : null,
    serverDraft,
    observedAtMs: Date.now(),
  };
}

function translateChecklist(goal: string): { en: string; zh: string } {
  const normalized = goal.toLowerCase();
  if (normalized.includes("question") || normalized.includes("position"))
    return { en: goal, zh: "检查题目要求与立场是否一致" };
  if (normalized.includes("paragraph") || normalized.includes("logical"))
    return { en: goal, zh: "检查段落目的与逻辑展开" };
  if (normalized.includes("personal target"))
    return { en: goal, zh: "最后 5 分钟再检查个人目标" };
  return { en: goal, zh: goal };
}

function humanizeSkillId(skillId: string): string {
  return skillId
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const AI_TASK_KIND_SET = new Set<AiTaskKind>(AI_TASK_KINDS);

function isAiTaskKind(value: unknown): value is AiTaskKind {
  return typeof value === "string" && AI_TASK_KIND_SET.has(value as AiTaskKind);
}

async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel("response body limit exceeded");
        throw new LearningClientError(
          "The server response exceeded the safe client limit.",
          { status: 502, code: "RESPONSE_TOO_LARGE" },
        );
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export class HttpLearningClient implements LearningClient {
  private readonly baseUrl: string;
  private readonly eventSourceFactory:
    | ((url: string) => JobEventSource)
    | undefined;
  private readonly fetcher: Fetch;
  private readonly idempotencyKey: () => string;
  private readonly maxJobWaitMs: number;
  private readonly now: () => Date;
  private readonly origin: string | undefined;
  private readonly pollIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly attemptEtags = new Map<string, string>();
  private readonly draftQueues = new Map<string, Promise<void>>();
  private readonly lessonIndexes = new Map<string, number>();
  private readonly lessonLengths = new Map<string, number>();
  private readonly clientId = `web-${randomId()}`;

  constructor(options: HttpLearningClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/api/v1").replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.idempotencyKey = options.idempotencyKey ?? randomId;
    this.maxJobWaitMs = options.maxJobWaitMs ?? 2 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
    this.origin = options.origin ?? this.detectOrigin();
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise<void>((resolve) =>
          globalThis.setTimeout(resolve, milliseconds),
        ));
    this.eventSourceFactory =
      options.eventSourceFactory ??
      (typeof EventSource === "undefined"
        ? undefined
        : (url) => new EventSource(url, { withCredentials: true }));
  }

  private detectOrigin(): string | undefined {
    if (typeof window !== "undefined") return window.location.origin;
    if (/^https?:\/\//.test(this.baseUrl)) return new URL(this.baseUrl).origin;
    return undefined;
  }

  private setupToken(input: Partial<BootstrapInput>): string | undefined {
    return input.setupToken;
  }

  private url(path: string): string {
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${suffix}`;
  }

  private eventUrl(path: string): string {
    const value = this.url(path);
    if (/^https?:\/\//.test(value)) return value;
    if (this.origin) return new URL(value, this.origin).toString();
    return value;
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<RequestResult<T>> {
    const method = options.method ?? "GET";
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json, application/problem+json");
    if (options.body !== undefined)
      headers.set("Content-Type", "application/json");
    if (method !== "GET" && this.origin) headers.set("Origin", this.origin);
    if (options.idempotencyKey)
      headers.set("Idempotency-Key", options.idempotencyKey);
    else if (options.idempotent)
      headers.set("Idempotency-Key", this.idempotencyKey());

    const retryInProgress = headers.has("Idempotency-Key");
    for (let requestAttempt = 0; requestAttempt < 6; requestAttempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(this.url(path), {
          ...(options.body === undefined
            ? {}
            : { body: JSON.stringify(options.body) }),
          cache: "no-store",
          credentials: "include",
          headers,
          method,
        });
      } catch (cause) {
        if (retryInProgress && requestAttempt < 5) {
          await this.sleep(50 * 2 ** requestAttempt);
          continue;
        }
        throw new LearningClientError(
          "The IELTS Writing server could not be reached.",
          { code: "NETWORK_ERROR", retryable: true, cause },
        );
      }

      const raw = response.status === 204 ? "" : await response.text();
      let payload: unknown;
      try {
        payload = raw ? JSON.parse(raw) : undefined;
      } catch {
        payload = raw;
      }
      if (
        !response.ok &&
        !(options.permitStatuses ?? []).includes(response.status)
      ) {
        if (
          retryInProgress &&
          isApiProblem(payload) &&
          payload.code === "IDEMPOTENCY_IN_PROGRESS" &&
          requestAttempt < 5
        ) {
          await this.sleep(50 * 2 ** requestAttempt);
          continue;
        }
        if (isApiProblem(payload)) throw errorFromProblem(payload);
        throw new LearningClientError(
          typeof payload === "string" && payload
            ? payload
            : `Request failed with HTTP ${response.status}.`,
          {
            status: response.status,
            code: "HTTP_ERROR",
          },
        );
      }
      return { data: payload as T, response };
    }
    throw new LearningClientError("The operation did not finish in time.", {
      status: 409,
      code: "IDEMPOTENCY_IN_PROGRESS",
      retryable: true,
    });
  }

  private async getTodayWire(): Promise<TodayWire> {
    const { data } = await this.request<TodayWire>("/today");
    return data;
  }

  private async getProviders(): Promise<ProviderWire[]> {
    const { data } = await this.request<{ providers?: ProviderWire[] }>(
      "/providers",
    );
    return data.providers ?? [];
  }

  private async getCycle(id: string): Promise<WireCycle> {
    const { data } = await this.request<CycleWire>(
      `/training-cycles/${encodeURIComponent(id)}`,
    );
    return data.cycle;
  }

  private async loadAttempt(
    id: string,
    fallbackQuestion?: WireQuestion,
  ): Promise<AttemptData> {
    const { data, response } = await this.request<AttemptWire>(
      `/writing-attempts/${encodeURIComponent(id)}`,
    );
    const attempt = data.attempt;
    const revision = attempt.revision ?? 1;
    this.attemptEtags.set(
      id,
      response.headers.get("etag") ?? `W/"${revision}"`,
    );
    return this.mapAttempt(
      attempt,
      attempt.cycle?.question ?? fallbackQuestion,
    );
  }

  private mapAttempt(
    attempt: WireAttempt,
    question?: WireQuestion,
  ): AttemptData {
    const version = attempt.kind === "version_2" ? 2 : 1;
    const startedAt = attempt.createdAt ?? this.now().toISOString();
    const startedAtMilliseconds = new Date(startedAt).getTime();
    const elapsedSeconds = Math.max(
      0,
      Number.isFinite(startedAtMilliseconds)
        ? Math.floor((this.now().getTime() - startedAtMilliseconds) / 1000)
        : 0,
    );
    return {
      id: attempt.id ?? `attempt-version-${version}`,
      version,
      prompt: mapQuestion(question),
      durationSeconds: Math.max(0, 40 * 60 - elapsedSeconds),
      draft: attempt.content ?? "",
      startedAt,
      autosaveKey: `server:${attempt.id ?? version}`,
      revision: attempt.revision ?? 1,
      ...(attempt.cycleId ? { cycleId: attempt.cycleId } : {}),
      ...(attempt.lockedAt
        ? {
            locked: true,
            submittedAt: attempt.submittedAt ?? attempt.lockedAt,
          }
        : { locked: false, submittedAt: null }),
      selfCheckSnapshotSaved:
        attempt.draftBeforeSelfCheck !== null &&
        attempt.draftBeforeSelfCheck !== undefined,
    };
  }

  private async waitForJob(jobId: string): Promise<JobWire> {
    if (this.eventSourceFactory) {
      try {
        return await this.waitForJobEvent(jobId);
      } catch (error) {
        if (
          error instanceof LearningClientError &&
          error.code !== "SSE_UNAVAILABLE"
        )
          throw error;
      }
    }
    return this.pollJob(jobId);
  }

  private waitForJobEvent(jobId: string): Promise<JobWire> {
    return new Promise<JobWire>((resolve, reject) => {
      const source = this.eventSourceFactory?.(
        this.eventUrl(`/ai-jobs/${encodeURIComponent(jobId)}/events`),
      );
      if (!source) {
        reject(
          new LearningClientError("Server-sent events are unavailable.", {
            code: "SSE_UNAVAILABLE",
            retryable: true,
          }),
        );
        return;
      }
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        source.close();
        callback();
      };
      const timeout = globalThis.setTimeout(
        () =>
          finish(() =>
            reject(
              new LearningClientError("The live job stream timed out.", {
                code: "SSE_UNAVAILABLE",
                retryable: true,
              }),
            ),
          ),
        Math.min(this.maxJobWaitMs, 30_000),
      );
      source.addEventListener("status", (event) => {
        let job: JobWire;
        try {
          job = JSON.parse(event.data) as JobWire;
        } catch {
          return;
        }
        if (!terminalJobStates.has(job.status)) return;
        if (job.status === "SUCCEEDED") finish(() => resolve(job));
        else
          finish(() =>
            reject(
              new LearningClientError(
                job.error?.safe_message ??
                  "The AI job needs administrator attention.",
                {
                  status: 503,
                  code: job.error?.code ?? job.status,
                  retryable: false,
                },
              ),
            ),
          );
      });
      source.onerror = () =>
        finish(() =>
          reject(
            new LearningClientError("The live job stream disconnected.", {
              code: "SSE_UNAVAILABLE",
              retryable: true,
            }),
          ),
        );
    });
  }

  private async pollJob(jobId: string): Promise<JobWire> {
    const deadline = Date.now() + this.maxJobWaitMs;
    while (Date.now() <= deadline) {
      const { data } = await this.request<{ job: JobWire }>(
        `/ai-jobs/${encodeURIComponent(jobId)}`,
      );
      if (terminalJobStates.has(data.job.status)) {
        if (data.job.status === "SUCCEEDED") return data.job;
        throw new LearningClientError(
          data.job.error?.safe_message ??
            "The AI job needs administrator attention.",
          {
            status: 503,
            code: data.job.error?.code ?? data.job.status,
            retryable: false,
          },
        );
      }
      await this.sleep(this.pollIntervalMs);
    }
    throw new LearningClientError("The AI job is still processing.", {
      status: 408,
      code: "JOB_WAIT_TIMEOUT",
      retryable: true,
    });
  }

  async getToday() {
    const [wire, providers, growth] = await Promise.all([
      this.getTodayWire(),
      this.getProviders().catch(() => []),
      this.getGrowth().catch(() => null),
    ]);
    const pendingJobWire = wire.cycle?.resources?.pending_job ?? null;
    const pendingJob = pendingJobWire
      ? {
          id: pendingJobWire.id,
          status: pendingJobWire.status,
          taskKind: pendingJobWire.task_kind,
          errorCode: pendingJobWire.error_code ?? null,
          errorSafeMessage: pendingJobWire.error_safe_message ?? null,
        }
      : null;
    const waitingKinds = new Set([
      "WAIT_FOR_ASSESSMENT",
      "WAIT_FOR_COMPARISON",
      "WAIT_FOR_LESSON",
    ]);
    const blocked =
      pendingJob !== null &&
      (pendingJob.status === "FAILED" || pendingJob.status === "AI_BLOCKED");
    const waitingBlocked = blocked && waitingKinds.has(wire.next_action.kind);
    const presentation = waitingBlocked
      ? blockedJobPresentation(pendingJob!)
      : actionPresentation(wire.next_action.kind);
    const blockedJobNotice = blocked && !waitingBlocked ? pendingJob : null;
    const pendingJobAction: TodayData["pendingJobAction"] = waitingBlocked
      ? pendingJob!.status === "AI_BLOCKED"
        ? "review-connection"
        : "retry"
      : "none";
    const task: NextTask = {
      id: wire.next_action.entityId,
      kind: presentation.taskKind,
      eyebrowZh: presentation.eyebrowZh,
      eyebrowEn: presentation.eyebrowEn,
      titleZh: presentation.titleZh,
      titleEn: presentation.titleEn,
      descriptionZh: presentation.descriptionZh,
      descriptionEn: presentation.descriptionEn,
      durationMinutes: presentation.durationMinutes,
      href: actionIdentityHref(
        wire.next_action.kind,
        presentation.href,
        wire.cycle?.id,
        wire.next_action.entityId,
      ),
      actionZh: presentation.actionZh,
      actionEn: presentation.actionEn,
      dueLabelZh: formatDue(wire.next_action.dueAt, "zh"),
      dueLabelEn: formatDue(wire.next_action.dueAt, "en"),
    };
    const { buildLearningDestinations } = await import("./learning-navigation");
    const navigation = buildLearningDestinations({
      cycleId: wire.cycle?.id ?? null,
      writingAvailable: wire.cycle?.resources?.writing_available === true,
      feedbackAvailable: wire.cycle?.resources?.feedback_available === true,
      lessonId: wire.cycle?.resources?.lesson_id ?? null,
      rewriteTaskId: wire.cycle?.resources?.rewrite_task_id ?? null,
      comparisonAvailable: wire.cycle?.resources?.comparison_available === true,
      transferTaskId: wire.cycle?.resources?.transfer_task_id ?? null,
    });
    return {
      learnerName: "Learner",
      greetingZh: "今天只做这一件事。",
      greetingEn: "There is only one thing to do today.",
      aiState: providers.some((provider) => provider.enabled !== false)
        ? ("connected" as const)
        : ("missing" as const),
      nextTask: task,
      pendingJob,
      pendingJobAction,
      blockedJobNotice,
      navigation,
      cycleTitle: wire.cycle?.question?.prompt ?? "IELTS Writing Task 2",
      timeline: mapTimeline(wire.cycle?.status ?? "QUESTION_READY"),
      week: {
        focusedMinutes: growth?.learningMinutes ?? null,
        completedActions: growth?.essaysCompleted ?? null,
        repeatedErrorReduction: growth?.independentNonRecurrenceRate ?? null,
      },
    };
  }

  async getEssayWorkspace(): Promise<EssayWorkspaceData> {
    const { data } = await this.request<EssayWorkspaceWire>("/essays");
    return mapEssayWorkspace(data);
  }

  async getQuestions(): Promise<QuestionOption[]> {
    const { data } = await this.request<{ questions?: WireQuestion[] }>(
      "/questions",
    );
    return (data.questions ?? []).flatMap((item) => {
      const id = item.externalId ?? item.id;
      const prompt = item.prompt;
      const type = item.questionType ?? item.type;
      const topic = item.topic;
      if (!id || !prompt || !type || !topic) return [];
      return [
        {
          id,
          prompt,
          type: type as QuestionType,
          topic: topic as QuestionTopic,
          ieltsTrack:
            item.ieltsTrack === "general_training"
              ? ("general_training" as const)
              : ("academic" as const),
          visibility:
            item.visibility === "private"
              ? ("private" as const)
              : ("public" as const),
        },
      ];
    });
  }

  async createCustomQuestion(
    input: CustomQuestionInput,
  ): Promise<QuestionOption> {
    const { data } = await this.request<{
      question?: {
        id?: string;
        prompt?: string;
        type?: QuestionType;
        topic?: QuestionTopic;
        ielts_track?: "academic" | "general_training";
        visibility?: "private";
      };
    }>("/questions", {
      body: {
        prompt: input.prompt,
        type: input.type,
        topic: input.topic,
        ielts_track: input.ieltsTrack,
      },
      idempotent: true,
      method: "POST",
    });
    const question = data.question;
    if (!question?.id || !question.prompt || !question.type || !question.topic)
      throw new LearningClientError(
        "The server did not return the private question.",
        { code: "INVALID_RESPONSE" },
      );
    return {
      id: question.id,
      prompt: question.prompt,
      type: question.type,
      topic: question.topic,
      ieltsTrack: question.ielts_track ?? input.ieltsTrack,
      visibility: "private",
    };
  }

  async startTrainingCycle(questionId: string): Promise<string> {
    const { data } = await this.request<{ cycle?: { id?: string } }>(
      "/training-cycles",
      {
        body: {
          question_id: questionId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        idempotent: true,
        method: "POST",
      },
    );
    if (!data.cycle?.id)
      throw new LearningClientError(
        "The server did not return the new training cycle.",
        { code: "INVALID_RESPONSE" },
      );
    return data.cycle.id;
  }

  async getAttempt(version: 1 | 2, cycleId: string): Promise<AttemptData> {
    const cycle = await this.getCycle(cycleId);
    const kind = version === 1 ? "version_1" : "version_2";
    const existing = cycle.writingAttempts?.find(
      (attempt) => attempt.kind === kind,
    );
    if (existing?.id) return this.loadAttempt(existing.id, cycle.question);
    if (version === 1 && cycle.status === "QUESTION_READY") {
      const { data, response } = await this.request<{
        attempt: WireAttempt;
      }>(`/training-cycles/${encodeURIComponent(cycleId)}/start`, {
        body: {},
        idempotencyKey: `start-attempt-1:${cycleId}`,
        method: "POST",
      });
      if (!data.attempt.id)
        throw new LearningClientError("The server did not return an attempt.", {
          code: "INVALID_RESPONSE",
        });
      this.attemptEtags.set(
        data.attempt.id,
        response.headers.get("etag") ?? 'W/"1"',
      );
      return this.mapAttempt(data.attempt, cycle.question);
    }
    throw new LearningClientError(
      "The requested writing attempt is not ready.",
      {
        status: 425,
        code: "ATTEMPT_NOT_READY",
        retryable: true,
      },
    );
  }

  private async queueDraftUpdate(
    attemptId: string,
    draft: string,
    snapshot?: "before" | "after",
  ): Promise<void> {
    const previous = this.draftQueues.get(attemptId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (!this.attemptEtags.has(attemptId))
          await this.loadAttempt(attemptId);
        const etag = this.attemptEtags.get(attemptId);
        if (!etag)
          throw new LearningClientError("The draft revision is unavailable.", {
            status: 428,
            code: "IF_MATCH_REQUIRED",
          });
        const { data, response } = await this.request<{
          attempt: { revision?: number };
        }>(`/writing-attempts/${encodeURIComponent(attemptId)}`, {
          body: {
            client_id: this.clientId,
            content: draft,
            ...(snapshot === "before"
              ? { draft_before_self_check: draft }
              : snapshot === "after"
                ? { draft_after_self_check: draft }
                : {}),
          },
          headers: { "If-Match": etag },
          idempotent: true,
          method: "PATCH",
        });
        const nextEtag =
          response.headers.get("etag") ??
          (data.attempt.revision === undefined
            ? null
            : `W/"${data.attempt.revision}"`);
        if (nextEtag) this.attemptEtags.set(attemptId, nextEtag);
      });
    this.draftQueues.set(attemptId, next);
    try {
      await next;
    } finally {
      if (this.draftQueues.get(attemptId) === next)
        this.draftQueues.delete(attemptId);
    }
  }

  async saveDraft(attemptId: string, draft: string): Promise<void> {
    await this.queueDraftUpdate(attemptId, draft);
  }

  async saveSelfCheckSnapshot(
    attemptId: string,
    draft: string,
    phase: "before" | "after",
  ): Promise<void> {
    await this.queueDraftUpdate(attemptId, draft, phase);
  }

  async submitAttempt(
    attemptId: string,
    draft: string,
    onSubmitted?: () => void,
  ): Promise<AttemptSubmission> {
    await this.saveDraft(attemptId, draft);
    const { data } = await this.request<{
      job_id?: string;
      job_status?: string;
    }>(`/writing-attempts/${encodeURIComponent(attemptId)}/submit`, {
      body: {},
      idempotent: true,
      method: "POST",
    });
    onSubmitted?.();
    if (
      data.job_id &&
      data.job_status !== "SUCCEEDED" &&
      data.job_status !== "WAITING_FOR_CONSENT"
    )
      await this.waitForJob(data.job_id);
    return {
      feedbackReady: data.job_status !== "WAITING_FOR_CONSENT",
      jobId: data.job_id ?? null,
      jobStatus: data.job_status ?? null,
    };
  }

  async getFeedback(cycleId: string): Promise<FeedbackData> {
    const cycle = await this.getCycle(cycleId);
    const attempt = cycle.writingAttempts?.find(
      (candidate) => candidate.kind === "version_1",
    );
    const assessment = attempt?.assessment;
    if (!attempt?.id || !assessment)
      throw new LearningClientError("Feedback is still being prepared.", {
        status: 425,
        code: "FEEDBACK_NOT_READY",
        retryable: true,
      });
    const summary = record(assessment.summary);
    const issues = [...(assessment.issues ?? [])]
      .sort((left, right) => {
        const leftStart =
          typeof left.startOffset === "number"
            ? left.startOffset
            : Number.MAX_SAFE_INTEGER;
        const rightStart =
          typeof right.startOffset === "number"
            ? right.startOffset
            : Number.MAX_SAFE_INTEGER;
        return leftStart - rightStart;
      })
      .map(mapIssue);
    const targetSkillId = cycle.lessonPlans?.[0]?.coreSkillId;
    const targetIssueId =
      issues.find((issue) => issue.skillId === targetSkillId)?.id ?? null;
    const overall = assessment.overallBand ?? 0;
    const { mergeLearningDestinations } = await import("./learning-navigation");
    mergeLearningDestinations({
      feedback: `/feedback?cycle=${encodeURIComponent(cycleId)}`,
      lesson: cycle.lessonPlans?.[0]?.id
        ? `/lesson?cycle=${encodeURIComponent(cycleId)}&lesson=${encodeURIComponent(cycle.lessonPlans[0].id)}`
        : null,
      write: `/write?cycle=${encodeURIComponent(cycleId)}`,
    });
    return {
      cycleId,
      attemptId: attempt.id,
      lessonId: cycle.lessonPlans?.[0]?.id ?? null,
      overallScore: overall,
      languageScored: assessment.isAiEstimate !== false,
      scoreRange: `${Math.max(0, overall - 0.5).toFixed(1)}–${Math.min(9, overall + 0.5).toFixed(1)}`,
      modelLabel:
        assessment.isAiEstimate === false
          ? "Mock workflow demo · not language-scored"
          : "Configured AI estimate",
      rubricVersion: assessment.schemaVersion ?? "IELTS Writing Task 2",
      strengthZh: textValue(
        summary,
        ["strengthZh", "summaryZh", "zh"],
        "报告已按四项标准生成。",
      ),
      strengthEn: textValue(
        summary,
        ["strengthEn", "summaryEn", "en"],
        "The report was generated against all four criteria.",
      ),
      scores: criterionScores(assessment),
      issues,
      targetIssueId,
      prompt: cycle.question?.prompt ?? "",
      originalEssay: attempt.content ?? "",
      overallSummaryZh: textValue(
        summary,
        ["overallSummaryZh", "summaryZh", "zh"],
        "报告已按四项标准生成。",
      ),
      overallSummaryEn: textValue(
        summary,
        ["overallSummaryEn", "summaryEn", "en"],
        "The report was generated against the four criteria.",
      ),
      paragraphFeedback: (() => {
        const serialized = textValue(summary, ["paragraphFeedback"], "[]");
        try {
          const values: unknown = JSON.parse(serialized);
          return Array.isArray(values)
            ? values.filter(
                (value): value is FeedbackData["paragraphFeedback"][number] =>
                  typeof value === "object" && value !== null,
              )
            : [];
        } catch {
          return [];
        }
      })(),
      lessonScheduledLabelZh:
        cycle.status === "LESSON_READY"
          ? "专项教学与60分钟训练卷已经生成。"
          : "专项教学与完整训练卷会在诊断完成后自动生成。",
      lessonScheduledLabelEn:
        cycle.status === "LESSON_READY"
          ? "Your focused teaching and 60-minute paper are ready."
          : "Focused teaching and the complete paper are generated after diagnosis.",
      lessonGenerationRetry: cycle.lessonGenerationRetry?.jobId
        ? {
            jobId: cycle.lessonGenerationRetry.jobId,
            code:
              cycle.lessonGenerationRetry.code ?? "LESSON_GENERATION_FAILED",
            safeMessage:
              cycle.lessonGenerationRetry.safeMessage ??
              "The focused lesson module could not be generated.",
          }
        : null,
      issueClassificationRetry: cycle.issueClassificationRetry?.jobId
        ? {
            jobId: cycle.issueClassificationRetry.jobId,
            code:
              cycle.issueClassificationRetry.code ??
              "ISSUE_CLASSIFICATION_FAILED",
            safeMessage:
              cycle.issueClassificationRetry.safeMessage ??
              "The issue classification could not be completed.",
          }
        : null,
    };
  }

  async getFocusedTeaching(
    cycleId: string,
    lessonId: string,
  ): Promise<FocusedTeachingData> {
    const cycle = await this.getCycle(cycleId);
    if (!cycle.lessonPlans?.some((candidate) => candidate.id === lessonId)) {
      throw new LearningClientError(
        "The focused teaching module is not ready.",
        {
          status: 425,
          code: "FOCUSED_TEACHING_NOT_READY",
          retryable: true,
        },
      );
    }
    const { data } = await this.request<{
      teaching: FocusedTeachingData;
    }>(`/lessons/${encodeURIComponent(lessonId)}/teaching`);
    const teaching = data.teaching;
    const { mergeLearningDestinations } = await import("./learning-navigation");
    mergeLearningDestinations({
      feedback: `/feedback?cycle=${encodeURIComponent(cycleId)}`,
      lesson: `/lesson?cycle=${encodeURIComponent(cycleId)}&lesson=${encodeURIComponent(lessonId)}`,
      write: `/write?cycle=${encodeURIComponent(cycleId)}`,
    });
    return { ...teaching, id: lessonId, cycleId };
  }

  async submitTeachingPracticeAnswer(
    lessonId: string,
    prompt: TeachingPracticePrompt,
    answer: string,
  ): Promise<TeachingPracticeResponseData> {
    const fallback = unavailableTeachingPracticeResponse({
      id: `local:${lessonId}:${prompt.id}`,
      promptId: prompt.id,
      submittedAnswer: answer,
      responseMode: prompt.responseMode,
    });
    try {
      const { data } = await this.request<{ response?: unknown }>(
        `/lessons/${encodeURIComponent(lessonId)}/teaching-practice/${encodeURIComponent(prompt.id)}/responses`,
        {
          body: { answer },
          idempotent: true,
          method: "POST",
        },
      );
      const response = projectTeachingPracticeResponse(data.response);
      if (!response)
        throw new LearningClientError(
          "The saved tutorial answer could not be restored safely.",
          {
            status: 502,
            code: "TEACHING_PRACTICE_RESPONSE_INVALID",
            retryable: true,
          },
        );
      return response;
    } catch (error) {
      if (isRecoverableTeachingAnalysisError(error)) return fallback;
      throw error;
    }
  }

  async getTeachingPracticeResponse(
    lessonId: string,
    promptId: string,
    fallback?: TeachingPracticeResponseData,
  ): Promise<TeachingPracticeResponseData | null> {
    try {
      const { data, response } = await this.request<{ response?: unknown }>(
        `/lessons/${encodeURIComponent(lessonId)}/teaching-practice/${encodeURIComponent(promptId)}/responses`,
        { permitStatuses: [404] },
      );
      if (response.status === 404) return null;
      const restored = projectTeachingPracticeResponse(data.response);
      if (!restored)
        throw new LearningClientError(
          "The tutorial response could not be restored safely.",
          {
            status: 502,
            code: "TEACHING_PRACTICE_RESPONSE_INVALID",
            retryable: true,
          },
        );
      return restored;
    } catch (error) {
      if (fallback && isRecoverableTeachingAnalysisError(error)) {
        return unavailableTeachingPracticeResponse(fallback);
      }
      if (isRecoverableTeachingAnalysisError(error)) return null;
      throw error;
    }
  }

  async retryTeachingPracticeAnalysis(
    response: TeachingPracticeResponseData,
  ): Promise<TeachingPracticeResponseData> {
    const unavailable = unavailableTeachingPracticeResponse(response);
    if (!response.id || response.id.startsWith("local:")) return unavailable;
    try {
      const { data } = await this.request<{ response?: unknown }>(
        `/teaching-practice-responses/${encodeURIComponent(response.id)}/retry`,
        { body: {}, idempotent: true, method: "POST" },
      );
      const retried = projectTeachingPracticeResponse(data.response);
      if (!retried)
        throw new LearningClientError(
          "The tutorial analysis retry could not be restored safely.",
          {
            status: 502,
            code: "TEACHING_PRACTICE_RESPONSE_INVALID",
            retryable: true,
          },
        );
      return retried;
    } catch (error) {
      if (isRecoverableTeachingAnalysisError(error)) return unavailable;
      throw error;
    }
  }

  async getLesson(cycleId: string, lessonId: string): Promise<LessonData> {
    const cycle = await this.getCycle(cycleId);
    const plan = cycle.lessonPlans?.find(
      (candidate) => candidate.id === lessonId,
    );
    if (!plan?.id)
      throw new LearningClientError("The focused lesson is not ready.", {
        status: 425,
        code: "LESSON_NOT_READY",
        retryable: true,
      });
    if (cycle.status === "LESSON_READY" || cycle.status === "LESSON_ACTIVE") {
      await this.request(`/lessons/${encodeURIComponent(plan.id)}/start`, {
        body: {},
        idempotent: true,
        method: "POST",
      });
    }
    const { data } = await this.request<{
      lesson: WireLessonPlan;
      progress?: WireLessonProgress;
      runtime?: WireLessonRuntime;
    }>(`/lessons/${encodeURIComponent(plan.id)}`);
    const allItems = data.lesson.items ?? [];
    const activeIds =
      data.progress?.active_item_ids ?? allItems.map((item) => item.id ?? "");
    const activeItems = activeIds
      .map((id) => allItems.find((item) => item.id === id))
      .filter((item): item is WireExerciseItem => Boolean(item));
    const items = activeItems.map((item, index, source) =>
      mapExercise(item, index, source.length),
    );
    if (items.length === 0)
      throw new LearningClientError("The lesson has no active-output items.", {
        code: "INVALID_LESSON",
      });
    this.lessonLengths.set(plan.id, items.length);
    const serverIndex = Math.max(
      0,
      Math.min(
        data.progress?.next_core_index ?? 0,
        Math.max(0, items.length - 1),
      ),
    );
    const currentItem = items[serverIndex];
    const wireResponse = currentItem
      ? data.progress?.responses?.[currentItem.id]
      : undefined;
    const responseId = wireResponse?.response_id;
    const firstAnswer = wireResponse?.first_answer;
    const finalAnswer = wireResponse?.final_answer;
    const allowedHintLevels = [
      "NONE",
      "KEYWORD",
      "PARTIAL_FRAME",
      "FULL_FRAME",
      "ANSWER_SHOWN",
    ];
    const initialResponse =
      currentItem && responseId
        ? {
            itemId: currentItem.id,
            responseId,
            firstAnswer:
              typeof firstAnswer === "string"
                ? firstAnswer
                : JSON.stringify(firstAnswer ?? ""),
            finalAnswer:
              typeof finalAnswer === "string"
                ? finalAnswer
                : JSON.stringify(finalAnswer ?? ""),
            attempts: wireResponse.attempt_count ?? 1,
            hintsUsed: wireResponse.hints_used ?? 0,
            hintLevel: (allowedHintLevels.includes(
              wireResponse.hint_level ?? "",
            )
              ? wireResponse.hint_level
              : "NONE") as LessonResponseInput["hintLevel"],
            referenceAnswerSeen: wireResponse.reference_answer_seen === true,
            evaluation:
              wireResponse.evaluation && responseId
                ? mapLessonEvaluation(responseId, wireResponse.evaluation)
                : null,
          }
        : null;
    this.lessonIndexes.set(plan.id, serverIndex);
    const runtime = mapLessonRuntime(data.runtime ?? {});
    if (runtime.serverDraft) runtime.serverDraft.lessonId = plan.id;
    return {
      id: plan.id,
      titleZh: "本篇作文的核心专项课",
      titleEn: "Focused lesson for this essay",
      coreTargetZh: plan.coreSkillId ?? "本篇最高优先能力",
      coreTargetEn:
        plan.coreSkillId ?? "Highest-priority skill from this essay",
      totalMinutes: data.lesson.plannedMinutes ?? 60,
      initialItemIndex: serverIndex,
      initialResponse,
      runtime,
      remediationActive: data.progress?.remediation_active === true,
      items,
      rewriteUnlockZh: "完成核心题后 24–48 小时解锁闭卷重写",
      rewriteUnlockEn:
        "Closed-book rewriting unlocks 24–48 hours after the core lesson",
    };
  }

  async getPracticePaper(
    cycleId: string,
    lessonId: string,
  ): Promise<PracticePaperData> {
    const cycle = await this.getCycle(cycleId);
    if (!cycle.lessonPlans?.some((candidate) => candidate.id === lessonId)) {
      throw new LearningClientError("The practice paper is not ready.", {
        status: 425,
        code: "PRACTICE_PAPER_NOT_READY",
        retryable: true,
      });
    }
    if (cycle.status === "LESSON_READY") {
      await this.request(`/lessons/${encodeURIComponent(lessonId)}/start`, {
        body: {},
        idempotent: true,
        method: "POST",
      });
    }
    const { data } = await this.request<{
      paper: Record<string, unknown>;
      answers?: Record<string, string>;
      result?: PracticePaperResult | null;
      submitted_at?: string | null;
      evaluation_pending?: boolean;
      runtime?: { started_at?: string | null };
    }>(`/lessons/${encodeURIComponent(lessonId)}/paper`);
    const paper = record(data.paper);
    const rawItems = Array.isArray(paper.items) ? paper.items : [];
    const questions = rawItems.map((raw, index) => {
      const item = record(raw);
      const mode = String(item.responseMode);
      const responseMode = [
        "choice",
        "short_text",
        "sentence",
        "paragraph",
      ].includes(mode)
        ? (mode as PracticePaperQuestion["responseMode"])
        : "sentence";
      return {
        id: textValue(item, ["id"], `question-${index + 1}`),
        number: Number(item.number ?? index + 1),
        section: ["FOUNDATION", "REPAIR", "GENERATION", "INTEGRATION"].includes(
          String(item.section),
        )
          ? (item.section as PracticePaperQuestion["section"])
          : "GENERATION",
        titleZh: textValue(item, ["titleZh"], `第 ${index + 1} 题`),
        titleEn: textValue(item, ["titleEn"], `Question ${index + 1}`),
        instructionZh: textValue(item, ["instructionZh"], "按题面要求作答。"),
        promptEn: textValue(item, ["promptEn"], "Write your answer."),
        sourceText: textValue(item, ["sourceText"], ""),
        responseMode,
        options: (Array.isArray(item.options) ? item.options : []).map(
          (option) => {
            const value = record(option);
            return {
              key: textValue(value, ["key"], ""),
              labelEn: textValue(value, ["labelEn"], ""),
            };
          },
        ),
        suggestedMinutes: Number(item.suggestedMinutes ?? 5),
        minimumWords: Number(item.minimumWords ?? 1),
        maximumWords: Number(item.maximumWords ?? 150),
        publicCriteria: (Array.isArray(item.publicCriteria)
          ? item.publicCriteria
          : []
        ).map((criterion) => {
          const value = record(criterion);
          return {
            labelZh: textValue(value, ["labelZh"], "完成要求"),
            labelEn: textValue(value, ["labelEn"], "Task completion"),
            descriptionZh: textValue(
              value,
              ["descriptionZh"],
              "覆盖题面要求。",
            ),
            descriptionEn: textValue(
              value,
              ["descriptionEn"],
              "Cover the stated requirements.",
            ),
            weight: Number(value.weight ?? 1),
          };
        }),
      } satisfies PracticePaperQuestion;
    });
    if (questions.length !== 8) {
      throw new LearningClientError("The complete practice paper is invalid.", {
        code: "PRACTICE_PAPER_INVALID",
      });
    }
    const { mergeLearningDestinations } = await import("./learning-navigation");
    mergeLearningDestinations({
      feedback: `/feedback?cycle=${encodeURIComponent(cycleId)}`,
      lesson: `/lesson?cycle=${encodeURIComponent(cycleId)}&lesson=${encodeURIComponent(lessonId)}`,
      write: `/write?cycle=${encodeURIComponent(cycleId)}`,
    });
    return {
      id: lessonId,
      cycleId,
      titleZh: textValue(paper, ["titleZh"], "专项训练卷"),
      titleEn: textValue(paper, ["titleEn"], "Focused practice paper"),
      objectiveZh: textValue(paper, ["objectiveZh"], "完成本轮专项训练。"),
      objectiveEn: textValue(
        paper,
        ["objectiveEn"],
        "Complete this focused practice paper.",
      ),
      durationMinutes: 60,
      instructionsZh: stringList(paper.instructionsZh),
      instructionsEn: stringList(paper.instructionsEn),
      questions,
      answers: data.answers ?? {},
      startedAt: data.runtime?.started_at ?? null,
      submittedAt: data.submitted_at ?? null,
      result: data.result ?? null,
      evaluationPending: data.evaluation_pending === true,
    };
  }

  async submitPracticePaper(
    lessonId: string,
    answers: Record<string, string>,
  ): Promise<void> {
    const { data } = await this.request<{
      job_id?: string;
      job_status?: string;
    }>(`/lessons/${encodeURIComponent(lessonId)}/paper`, {
      body: { answers },
      idempotent: true,
      method: "POST",
    });
    if (
      data.job_id &&
      data.job_status !== "WAITING_FOR_CONSENT" &&
      data.job_status !== "SUCCEEDED"
    )
      await this.waitForJob(data.job_id);
  }

  async replaceLegacyLesson(
    lessonId: string,
  ): Promise<LegacyLessonRecoveryResult> {
    const { data } = await this.request<{
      job_id?: string | null;
      job_status?: string;
      lesson_id?: string | null;
    }>(`/lessons/${encodeURIComponent(lessonId)}/replace`, {
      body: {},
      idempotent: true,
      method: "POST",
    });
    if (data.lesson_id || data.job_status === "SUCCEEDED") {
      return { state: "READY", jobId: data.job_id ?? null };
    }
    if (data.job_status === "CONTINUING_SAFELY") {
      return { state: "CONTINUING_SAFELY", jobId: null };
    }
    if (data.job_status === "QUEUED" || data.job_status === "RUNNING") {
      return { state: "PREPARING", jobId: data.job_id ?? null };
    }
    return { state: "CONTINUING_SAFELY", jobId: null };
  }

  async completePracticePaper(lessonId: string): Promise<void> {
    await this.request(
      `/lessons/${encodeURIComponent(lessonId)}/paper/complete`,
      {
        body: {},
        idempotent: true,
        method: "POST",
      },
    );
  }

  async saveLessonProgress(
    lessonId: string,
    itemIndex: number,
    response?: LessonResponseInput,
  ): Promise<LessonEvaluationResult | null> {
    if (response) {
      const { data } = await this.request<{
        response?: { id?: string; first_answer_saved?: boolean };
        job_id?: string;
        job_ids?: string[];
        job_status?: string;
        batch?: {
          groupId?: string;
          pending?: boolean;
          required?: number;
          submitted?: number;
        } | null;
      }>(`/exercise-items/${encodeURIComponent(response.itemId)}/responses`, {
        body: {
          ...(response.responseId === undefined
            ? {}
            : { response_id: response.responseId }),
          first_answer: response.firstAnswer,
          ...(response.hintedAnswer === undefined
            ? {}
            : { hinted_answer: response.hintedAnswer }),
          final_answer: response.finalAnswer,
          hints_used: response.hintsUsed,
          hint_level: response.hintLevel,
          reference_answer_seen: response.referenceAnswerSeen,
          elapsed_seconds: response.elapsedSeconds,
          self_check_confirmations: response.selfCheckConfirmations ?? [],
        },
        idempotent: true,
        method: "POST",
      });
      const responseId = data.response?.id;
      if (!responseId) {
        throw new LearningClientError(
          "The server did not confirm the saved exercise response.",
          { code: "EXERCISE_RESPONSE_NOT_CONFIRMED" },
        );
      }
      if (data.job_status === "BATCH_PENDING") {
        this.lessonIndexes.set(lessonId, itemIndex);
        return {
          responseId,
          jobId: null,
          outcome: "BATCH_PENDING",
          passed: null,
          firstAttemptPassed: null,
          confidence: null,
          feedbackZh: `答案已封存；完成本组 ${data.batch?.required ?? 2} 个独立答案后统一反馈。`,
          feedbackEn: `Answer sealed. Feedback is released after all ${data.batch?.required ?? 2} independent answers are submitted.`,
          evidence: [],
          dimensionScores: {},
          criterionResults: [],
          acceptedAnswers: [],
          confusionId: null,
          suggestionZh: "本组完成前不会显示范例或逐题评价。",
          validForEvidence: false,
          demoOnly: false,
          remediationActive: false,
          batchFeedback: [],
        };
      }
      if (data.job_status === "WAITING_FOR_CONSENT") {
        this.lessonIndexes.set(lessonId, itemIndex);
        return {
          responseId,
          jobId: data.job_id ?? null,
          outcome: "UNASSESSED",
          passed: null,
          firstAttemptPassed: null,
          confidence: null,
          feedbackZh:
            "答案已保存，但尚未配置 AI，因此不判断英语质量、不计能力证据。",
          feedbackEn:
            "Answer saved. AI is not configured, so language quality is not judged and no mastery evidence is created.",
          evidence: [],
          dimensionScores: {},
          criterionResults: [],
          acceptedAnswers: [],
          confusionId: null,
          suggestionZh: "你可以继续完成练习流程，之后在设置中连接 AI。",
          validForEvidence: false,
          demoOnly: true,
          remediationActive: false,
          batchFeedback: [],
        };
      }
      for (const jobId of data.job_ids ?? (data.job_id ? [data.job_id] : [])) {
        if (data.job_status !== "SUCCEEDED") await this.waitForJob(jobId);
      }
      const result = await this.request<{
        response: {
          id: string;
          evaluation?: WireLessonEvaluation | null;
          batch?: WireExerciseBatch | null;
          remediation_active?: boolean;
        };
      }>(
        `/exercise-items/${encodeURIComponent(response.itemId)}/responses?response_id=${encodeURIComponent(responseId)}`,
      );
      if (!result.data.response.evaluation) {
        throw new LearningClientError(
          "The evaluation job completed without a canonical result.",
          { code: "EXERCISE_EVALUATION_MISSING" },
        );
      }
      this.lessonIndexes.set(lessonId, itemIndex);
      const mapped = mapLessonEvaluation(
        responseId,
        result.data.response.evaluation,
        data.job_id ?? null,
      );
      const batchFeedback = (result.data.response.batch?.feedback ?? []).map(
        (entry) => ({
          itemId: entry.item_id ?? "",
          passed: typeof entry.passed === "boolean" ? entry.passed : null,
          feedbackZh: entry.feedback_zh ?? "",
          feedbackEn: entry.feedback_en ?? "",
          suggestionZh: entry.suggestion_zh ?? "",
          demoOnly: entry.demo_only === true,
        }),
      );
      return {
        ...mapped,
        outcome:
          result.data.response.batch?.feedback_ready === true
            ? "BATCH_COMPLETE"
            : mapped.outcome,
        remediationActive: result.data.response.remediation_active === true,
        batchFeedback,
      };
    }
    this.lessonIndexes.set(lessonId, itemIndex);
    return null;
  }

  async updateLessonRuntime(
    lessonId: string,
    update: LessonRuntimeUpdate,
  ): Promise<LessonRuntimeData> {
    const { data } = await this.request<{
      runtime: WireLessonRuntime;
      server_draft?: JsonRecord | null;
    }>(`/lessons/${encodeURIComponent(lessonId)}/progress`, {
      body: {
        revision: update.revision,
        action: update.action,
        ...(update.draft === undefined
          ? {}
          : {
              draft:
                update.draft === null
                  ? null
                  : {
                      item_id: update.draft.itemId,
                      answer: update.draft.answer,
                      first_answer: update.draft.firstAnswer,
                      ...(update.draft.responseId
                        ? { response_id: update.draft.responseId }
                        : {}),
                      attempts: update.draft.attempts,
                      hint_level: update.draft.hintLevel,
                      revealed: update.draft.revealed,
                      updated_at: update.draft.updatedAt,
                    },
            }),
        ...(update.refresherAnswer
          ? { refresher_answer: update.refresherAnswer }
          : {}),
        ...(update.interruptionKind
          ? { interruption_kind: update.interruptionKind }
          : {}),
      },
      headers: { "if-match": `W/"${update.revision}"` },
      method: "PATCH",
    });
    const runtime = mapLessonRuntime({
      ...data.runtime,
      server_draft: data.server_draft ?? null,
    });
    if (runtime.serverDraft) runtime.serverDraft.lessonId = lessonId;
    return runtime;
  }

  async completeLesson(
    lessonId: string,
    mode: "standard" | "trim_optional" = "standard",
  ): Promise<LessonCompletionResult> {
    const { data } = await this.request<{
      completion_mode?: LessonCompletionResult["completionMode"];
      mastery_evidence_created?: boolean;
      rewrite_task?: { id?: string } | null;
      segment_scheduled?: boolean;
    }>(`/lessons/${encodeURIComponent(lessonId)}/complete`, {
      body: { mode },
      idempotent: true,
      method: "POST",
    });
    return {
      completionMode: data.completion_mode ?? "PRACTICE_ONLY",
      masteryEvidenceCreated: data.mastery_evidence_created === true,
      rewriteScheduled: Boolean(data.rewrite_task?.id),
      segmentScheduled: data.segment_scheduled === true,
    };
  }

  async retryLessonItem(
    lessonId: string,
    itemId: string,
  ): Promise<LessonEvaluationResult> {
    const { data } = await this.request<{
      response_id?: string;
      job_id?: string;
    }>(`/exercise-items/${encodeURIComponent(itemId)}/retry`, {
      body: {},
      idempotent: true,
      method: "POST",
    });
    if (!data.job_id || !data.response_id) {
      throw new LearningClientError("The item retry was not confirmed.", {
        code: "EXERCISE_RETRY_NOT_CONFIRMED",
      });
    }
    await this.waitForJob(data.job_id);
    const result = await this.request<{
      response: { evaluation?: WireLessonEvaluation | null };
    }>(
      `/exercise-items/${encodeURIComponent(itemId)}/responses?response_id=${encodeURIComponent(data.response_id)}`,
    );
    if (!result.data.response.evaluation) {
      throw new LearningClientError(
        "The retried evaluation completed without a canonical result.",
        { code: "EXERCISE_EVALUATION_MISSING" },
      );
    }
    this.lessonIndexes.set(lessonId, this.lessonIndexes.get(lessonId) ?? 0);
    return mapLessonEvaluation(
      data.response_id,
      result.data.response.evaluation,
      data.job_id,
    );
  }

  async retryLessonGeneration(jobId: string): Promise<void> {
    const { data } = await this.request<{ job_id?: string }>(
      `/ai-jobs/${encodeURIComponent(jobId)}/retry`,
      {
        body: {},
        idempotent: true,
        method: "POST",
      },
    );
    if (!data.job_id) {
      throw new LearningClientError(
        "The lesson-module retry was not confirmed.",
        { code: "LESSON_GENERATION_RETRY_NOT_CONFIRMED" },
      );
    }
    await this.waitForJob(data.job_id);
  }

  async retryAiJob(jobId: string): Promise<void> {
    const { data } = await this.request<{
      job_id?: string;
      job_status?: string;
    }>(`/ai-jobs/${encodeURIComponent(jobId)}/retry`, {
      body: {},
      idempotent: true,
      method: "POST",
    });
    if (!data.job_id) {
      throw new LearningClientError("The retry was not confirmed.", {
        code: "AI_JOB_RETRY_NOT_CONFIRMED",
      });
    }
    if (data.job_status && data.job_status !== "SUCCEEDED")
      await this.waitForJob(data.job_id);
  }

  async skipLesson(lessonId: string): Promise<string> {
    const { data } = await this.request<{
      rewrite_task?: { id?: string };
    }>(`/lessons/${encodeURIComponent(lessonId)}/skip`, {
      body: {},
      idempotent: true,
      method: "POST",
    });
    if (!data.rewrite_task?.id) {
      throw new LearningClientError(
        "The skipped-prerequisite rewrite was not created.",
        { code: "LESSON_SKIP_NOT_CONFIRMED" },
      );
    }
    return data.rewrite_task.id;
  }

  async getRewrite(taskId: string, cycleId: string): Promise<RewriteData> {
    const { data } = await this.request<{
      rewrite_task?: WireRewriteTask & {
        cycle_id?: string;
        question?: WireQuestion;
      };
    }>(`/rewrite-tasks/${encodeURIComponent(taskId)}`);
    const task = data.rewrite_task;
    if (!task?.id || textValue(task, ["cycle_id", "cycleId"]) !== cycleId)
      throw new LearningClientError(
        "The rewrite task does not belong to the requested cycle.",
        { status: 404, code: "REWRITE_TASK_NOT_FOUND" },
      );
    const availableAt = textValue(task, ["available_at", "availableAt"]);
    let attempt: WireAttempt | undefined;
    let startedAt = textValue(task, ["started_at", "startedAt"]) || undefined;
    const rewriteDue =
      availableAt.length > 0 && Date.parse(availableAt) <= this.now().getTime();
    if (
      task.status === "READY" ||
      task.status === "SKIPPED_PREREQUISITE" ||
      (task.status === "RESCHEDULED" && rewriteDue)
    ) {
      const result = await this.request<{
        attempt: WireAttempt;
      }>(`/rewrite-tasks/${encodeURIComponent(task.id)}/start`, {
        body: {},
        idempotencyKey: `start-rewrite:${task.id}`,
        method: "POST",
      });
      attempt = result.data.attempt;
      startedAt = attempt.createdAt;
      if (attempt.id)
        this.attemptEtags.set(
          attempt.id,
          result.response.headers.get("etag") ?? 'W/"1"',
        );
    } else if (task.status === "PLANNED") {
      throw new LearningClientError(
        "The delayed rewrite is not scheduled until the lesson is completed.",
        { status: 423, code: "REWRITE_PENDING_LESSON" },
      );
    } else if (task.status === "LOCKED" || task.status === "RESCHEDULED") {
      throw new LearningClientError(
        `The rewrite unlocks at ${availableAt || "the scheduled time"}.`,
        {
          status: 423,
          code: "REWRITE_LOCKED",
          details: { availableAt: availableAt || null },
        },
      );
    }
    if (!attempt) {
      const cycle = await this.getCycle(cycleId);
      const existing = cycle.writingAttempts?.find(
        (candidate) => candidate.kind === "version_2",
      );
      if (existing?.id)
        return this.rewriteFromAttempt(task, existing, cycle.question);
    }
    if (!attempt?.id)
      throw new LearningClientError("The Version 2 attempt is not ready.", {
        status: 425,
        code: "ATTEMPT_NOT_READY",
        retryable: true,
      });
    return {
      ...this.mapAttempt(attempt, task.question),
      startedAt: startedAt ?? this.now().toISOString(),
      abstractGoals: [],
      unlockLabelZh: `已按计划解锁：${formatDue(availableAt, "zh")}`,
      unlockLabelEn: `Unlocked as scheduled: ${formatDue(availableAt, "en")}`,
    };
  }

  async rescheduleRewrite(taskId: string): Promise<void> {
    await this.request(
      `/rewrite-tasks/${encodeURIComponent(taskId)}/reschedule`,
      {
        body: {},
        idempotent: true,
        method: "POST",
      },
    );
  }

  private async rewriteFromAttempt(
    task: WireRewriteTask,
    attempt: WireAttempt,
    question?: WireQuestion,
  ): Promise<RewriteData> {
    const [loaded, detail] = await Promise.all([
      this.loadAttempt(attempt.id ?? "", question),
      this.request<{
        rewrite_task?: {
          abstract_checklist?: string[] | null;
          elapsed_seconds?: number;
        };
      }>(`/rewrite-tasks/${encodeURIComponent(task.id ?? "")}`),
    ]);
    const checklist = detail.data.rewrite_task?.abstract_checklist ?? [];
    const availableAt = textValue(task, ["available_at", "availableAt"]);
    return {
      ...loaded,
      abstractGoals: checklist.map(translateChecklist),
      unlockLabelZh: `已按计划解锁：${formatDue(availableAt, "zh")}`,
      unlockLabelEn: `Unlocked as scheduled: ${formatDue(availableAt, "en")}`,
    };
  }

  async getComparison(cycleId: string): Promise<ComparisonData> {
    const cycle = await this.getCycle(cycleId);
    const v1 = cycle.writingAttempts?.find(
      (attempt) => attempt.kind === "version_1",
    );
    const v2 = cycle.writingAttempts?.find(
      (attempt) => attempt.kind === "version_2",
    );
    if (!v1 || !v2 || !v1.assessment || !v2.assessment)
      throw new LearningClientError(
        "Both versions and their same-rubric assessments are required for comparison.",
        {
          status: 425,
          code: "COMPARISON_NOT_READY",
          retryable: true,
        },
      );
    const issues = v1.assessment?.issues ?? [];
    const comparisonEvidence = cycle.comparisonEvidence;
    if (!comparisonEvidence)
      throw new LearningClientError("Comparison evidence is not ready.", {
        status: 425,
        code: "COMPARISON_NOT_READY",
        retryable: true,
      });
    const comparisonPayload = record(comparisonEvidence?.payload);
    const metrics = record(comparisonPayload.comparisonMetrics);
    const scoringVersionWire = record(metrics.scoringVersion);
    const overall = record(metrics.overall);
    const criteria = record(metrics.criteria);
    const wordCounts = record(metrics.wordCounts);
    const recurrenceWire = record(metrics.coreIssueRecurrence);
    const v1Score = finiteNumber(overall.v1);
    const v2Score = finiteNumber(overall.v2);
    const overallDelta = finiteNumber(overall.delta);
    const v1Words = finiteNumber(wordCounts.v1);
    const v2Words = finiteNumber(wordCounts.v2);
    const scoringVersion = {
      schemaVersion: textValue(scoringVersionWire, ["schemaVersion"]),
      promptVersion: textValue(scoringVersionWire, ["promptVersion"]),
      rubricVersion: textValue(scoringVersionWire, ["rubricVersion"]),
      model: textValue(scoringVersionWire, ["model"]),
    };
    const assessmentMatchesScoringVersion = (value: WireAssessment) => {
      const snapshot = record(value.versionSnapshot);
      return (
        value.schemaVersion === scoringVersion.schemaVersion &&
        textValue(snapshot, ["task"]) === "ielts_assessment" &&
        textValue(snapshot, ["promptVersion"]) ===
          scoringVersion.promptVersion &&
        textValue(snapshot, ["rubricVersion"]) ===
          scoringVersion.rubricVersion &&
        textValue(snapshot, ["model"]) === scoringVersion.model
      );
    };
    const criterionLabels = [
      ["TR", "任务回应", "Task Response"],
      ["CC", "连贯与衔接", "Coherence & Cohesion"],
      ["LR", "词汇资源", "Lexical Resource"],
      ["GRA", "语法多样性与准确性", "Grammar Range & Accuracy"],
    ] as const;
    const criterionDeltas = criterionLabels.flatMap(
      ([criterion, labelZh, labelEn]) => {
        const values = record(criteria[criterion]);
        const v1Value = finiteNumber(values.v1);
        const v2Value = finiteNumber(values.v2);
        const delta = finiteNumber(values.delta);
        return v1Value === undefined ||
          v2Value === undefined ||
          delta === undefined
          ? []
          : [
              {
                criterion,
                labelZh,
                labelEn,
                v1: v1Value,
                v2: v2Value,
                delta,
              },
            ];
      },
    );
    const recurrence = {
      v1Occurrences: finiteNumber(recurrenceWire.v1Occurrences),
      v2Occurrences: finiteNumber(recurrenceWire.v2Occurrences),
      v1Per100Words: finiteNumber(recurrenceWire.v1Per100Words),
      v2Per100Words: finiteNumber(recurrenceWire.v2Per100Words),
      deltaPer100Words: finiteNumber(recurrenceWire.deltaPer100Words),
      recurred: recurrenceWire.recurred,
      evidenceVerified: recurrenceWire.evidenceVerified,
    };
    if (
      v1Score === undefined ||
      v2Score === undefined ||
      overallDelta === undefined ||
      v1Words === undefined ||
      v2Words === undefined ||
      Object.values(scoringVersion).some((value) => value.length === 0) ||
      !assessmentMatchesScoringVersion(v1.assessment) ||
      !assessmentMatchesScoringVersion(v2.assessment) ||
      criterionDeltas.length !== 4 ||
      recurrence.v1Occurrences === undefined ||
      recurrence.v2Occurrences === undefined ||
      recurrence.v1Per100Words === undefined ||
      recurrence.v2Per100Words === undefined ||
      recurrence.deltaPer100Words === undefined ||
      typeof recurrence.recurred !== "boolean" ||
      typeof recurrence.evidenceVerified !== "boolean"
    ) {
      throw new LearningClientError(
        "The authoritative comparison metrics are not ready.",
        {
          status: 425,
          code: "COMPARISON_NOT_READY",
          retryable: true,
        },
      );
    }
    const retained = comparisonEvidence?.valid === true;
    const evidenceV2 = textValue(comparisonPayload, ["evidenceV2"]);
    const modelEssay = textValue(comparisonPayload, ["modelEssay"]);
    const providerKind = textValue(comparisonPayload, [
      "referenceProviderKind",
    ]);
    return {
      promptTitle: cycle.question?.prompt ?? "IELTS Writing Task 2",
      v1Score,
      v2Score,
      overallDelta,
      criterionDeltas,
      recurrence: {
        v1Occurrences: recurrence.v1Occurrences,
        v2Occurrences: recurrence.v2Occurrences,
        v1Per100Words: recurrence.v1Per100Words,
        v2Per100Words: recurrence.v2Per100Words,
        deltaPer100Words: recurrence.deltaPer100Words,
        recurred: recurrence.recurred,
        evidenceVerified: recurrence.evidenceVerified,
      },
      scoringVersion,
      v1Words,
      v2Words,
      points: issues.slice(0, 3).map((issue, index) => ({
        id: issue.id ?? `comparison-${index + 1}`,
        state: retained ? ("improved" as const) : ("watch" as const),
        titleZh: issue.skillId ?? "目标问题",
        titleEn: issue.skillId ?? "Target issue",
        before: issue.excerpt ?? "Evidence unavailable",
        after:
          evidenceV2 ||
          "No valid pre-self-check evidence was available for this comparison.",
        noteZh: retained
          ? "闭卷证据已达到保留门槛；系统仍会在陌生题中复测。"
          : "闭卷重写已完成，但本次尚未达到保留门槛，系统不会虚报掌握。",
        noteEn: retained
          ? "The closed-book evidence passed the retention gate; a new-topic transfer check is still scheduled."
          : "The rewrite is complete, but this sample did not pass the retention gate, so mastery is not claimed.",
      })),
      nextTask: {
        id: cycle.transferTasks?.[0]?.id ?? cycleId,
        kind: "transfer",
        eyebrowZh: "下一步自动安排",
        eyebrowEn: "Next step scheduled",
        titleZh: "陌生题迁移验证",
        titleEn: "New-topic transfer check",
        descriptionZh: "系统会在间隔后用不同题目复测核心能力。",
        descriptionEn:
          "The core skill will be retested later with a different topic.",
        durationMinutes: 8,
        href: cycle.transferTasks?.[0]?.id
          ? `/transfer?${new URLSearchParams({ cycle: cycleId, task: cycle.transferTasks[0].id }).toString()}`
          : "/today",
        actionZh: "查看安排",
        actionEn: "View schedule",
        dueLabelZh: "自动排程",
        dueLabelEn: "Scheduled automatically",
      },
      retained,
      summaryZh: retained
        ? "目标能力在自检前的闭卷版本中再次出现，暂时达到 retained 证据门槛。"
        : "重写流程已完成，但自检前证据不足或目标未稳定出现；当前仍保持 applied。",
      summaryEn: retained
        ? "The target appeared again in the blind pre-check draft, provisionally meeting the retained evidence gate."
        : "The rewrite is complete, but the blind pre-check evidence was insufficient or unstable; the skill remains applied.",
      ...(modelEssay.length >= 200 ? { modelEssay } : {}),
      modelEssaySource:
        modelEssay.length < 200
          ? "unavailable"
          : providerKind === "mock"
            ? "mock"
            : "ai",
    };
  }

  async getTransferTask(
    taskId: string,
    expectedCycleId?: string,
  ): Promise<TransferTaskData> {
    const { data } = await this.request<{
      transfer_tasks?: WireTransferTask[];
    }>(`/transfer-tasks?task_id=${encodeURIComponent(taskId)}`);
    const tasks = data.transfer_tasks ?? [];
    const selected = tasks.find((task) => task.id === taskId);
    if (
      !selected ||
      (expectedCycleId && selected.source_cycle_id !== expectedCycleId)
    ) {
      throw new LearningClientError("No transfer check is available yet.", {
        status: 404,
        code: "TRANSFER_TASK_NOT_FOUND",
      });
    }
    return mapTransferTask(selected);
  }

  async submitTransferResponse(
    taskId: string,
    input: TransferResponseInput,
  ): Promise<TransferSubmission> {
    const { data } = await this.request<{
      first_answer_saved?: boolean;
      job_id?: string;
      job_status?: string;
      response_id?: string;
      transfer_task_id?: string;
    }>(`/transfer-tasks/${encodeURIComponent(taskId)}/responses`, {
      body: {
        elapsed_seconds: Math.max(0, Math.round(input.elapsedSeconds)),
        first_answer: input.firstAnswer,
        started_at: input.startedAt,
      },
      idempotent: true,
      method: "POST",
      permitStatuses: [202],
    });
    if (!data.job_id || !data.response_id || data.first_answer_saved !== true) {
      throw new LearningClientError(
        "The server did not confirm that the first answer was saved for evaluation.",
        { status: 502, code: "TRANSFER_SAVE_UNCONFIRMED", retryable: true },
      );
    }
    return {
      transferTaskId: data.transfer_task_id ?? taskId,
      responseId: data.response_id,
      firstAnswerSaved: data.first_answer_saved === true,
      jobId: data.job_id,
      jobStatus: data.job_status ?? "QUEUED",
    };
  }

  async markTransferNoOpportunity(taskId: string): Promise<TransferTaskData> {
    const current = await this.getTransferTask(taskId);
    const { data } = await this.request<{
      available_at?: string;
      result?: string;
      status?: string;
      transfer_task_id?: string;
    }>(`/transfer-tasks/${encodeURIComponent(taskId)}/no-opportunity`, {
      body: {},
      idempotent: true,
      method: "POST",
    });
    return {
      ...current,
      availableAt: data.available_at ?? current.availableAt,
      status: (data.status ?? "RESCHEDULED") as TransferTaskStatus,
      result: {
        outcome: "NO_OPPORTUNITY",
        confidence: null,
        feedbackZh: "本次没有自然迁移机会；不会计为失败，任务已重新安排。",
        feedbackEn:
          "There was no natural transfer opportunity. This is not a failure, and the task has been rescheduled.",
        evidence: "",
        evidenceStatus: "NO_OPPORTUNITY",
        transferred: false,
        gateMissing: [],
        mockLanguageScoring: false,
      },
    };
  }

  async rescheduleTransfer(taskId: string): Promise<void> {
    await this.request(
      `/transfer-tasks/${encodeURIComponent(taskId)}/reschedule`,
      { body: {}, idempotent: true, method: "POST" },
    );
  }

  async getGrowth(): Promise<GrowthData> {
    const { data } = await this.request<{
      score_history?: Array<{ assessed_at?: string; score?: number }>;
      skills?: Array<{
        definition?: {
          description_en?: string;
          dimension?: "TR" | "CC" | "LR" | "GRA";
          name_zh?: string;
        } | null;
        evidence_count?: number;
        recurrence_rate?: number | null;
        skill_id?: string;
        state?: SkillRecord["state"];
      }>;
      summary?: {
        current_estimated_band?: number | null;
        essays_completed?: number;
        independent_non_recurrence_rate?: number | null;
        recorded_learning_minutes?: number;
        target_band?: number;
      };
    }>("/growth");
    const summary = data.summary ?? {};
    return {
      essaysCompleted: summary.essays_completed ?? 0,
      learningMinutes: summary.recorded_learning_minutes ?? 0,
      currentBand: summary.current_estimated_band ?? null,
      targetBand: summary.target_band ?? defaultPreferences.targetBand,
      independentNonRecurrenceRate:
        summary.independent_non_recurrence_rate ?? null,
      weeklyScores: (data.score_history ?? []).flatMap((point, index) =>
        typeof point.score === "number"
          ? [{ label: `E${index + 1}`, score: point.score }]
          : [],
      ),
      skills: (data.skills ?? []).map((skill) => ({
        id: skill.skill_id ?? "unknown-skill",
        labelZh: skill.definition?.name_zh ?? skill.skill_id ?? "未知能力",
        labelEn:
          skill.definition?.description_en ??
          humanizeSkillId(skill.skill_id ?? "unknown-skill"),
        category: skill.definition?.dimension ?? "GRA",
        state: skill.state ?? "practicing",
        evidenceCount: skill.evidence_count ?? 0,
        recurrenceRate: skill.recurrence_rate ?? null,
        nextReviewZh: "具体证据任务以 Today 排程为准",
        nextReviewEn: "See Today for the next scheduled evidence task",
      })),
    };
  }

  async getSettings(): Promise<SettingsData> {
    const [providers, preferenceResult] = await Promise.all([
      this.getProviders().catch((error: unknown) => {
        if (error instanceof LearningClientError && error.status === 403)
          return [];
        throw error;
      }),
      this.request<{
        preferences?: {
          feedbackLocale?: "zh-CN" | "en";
          ieltsTrack?: "academic" | "general_training";
          reminderEmail?: boolean;
          targetBand?: number;
          quietHours?: { start?: string; end?: string } | null;
        };
        email?: string;
        smtp_configured?: boolean;
        smtp_state?:
          | "verified"
          | "configured_unverified"
          | "verification_failed"
          | "missing";
        slots?: Array<{
          enabled?: boolean;
          localTime?: string;
          weekday?: number;
        }>;
        timezone?: string;
      }>("/preferences"),
    ]);
    const stored = preferenceResult.data.preferences;
    const enabledSlots = (preferenceResult.data.slots ?? []).filter(
      (slot) => slot.enabled !== false,
    );
    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const preferences: UserPreferences = {
      ...defaultPreferences,
      targetBand: stored?.targetBand ?? defaultPreferences.targetBand,
      examType:
        stored?.ieltsTrack === "general_training" ? "general" : "academic",
      feedbackLanguage: stored?.feedbackLocale === "en" ? "en" : "zh-with-en",
      locale: stored?.feedbackLocale ?? defaultPreferences.locale,
      timezone: preferenceResult.data.timezone ?? defaultPreferences.timezone,
      emailNotifications: stored?.reminderEmail ?? false,
      email: preferenceResult.data.email ?? "",
      quietHoursEnabled: stored?.quietHours != null,
      quietHoursStart:
        stored?.quietHours?.start ?? defaultPreferences.quietHoursStart,
      quietHoursEnd:
        stored?.quietHours?.end ?? defaultPreferences.quietHoursEnd,
      studyTime: enabledSlots[0]?.localTime ?? defaultPreferences.studyTime,
      studyDays:
        enabledSlots.length > 0
          ? enabledSlots.map((slot) => weekdayNames[slot.weekday ?? 0] ?? "Sun")
          : defaultPreferences.studyDays,
    };
    return {
      preferences,
      ai: mapProvider(providers[0]),
      mailState: preferenceResult.data.smtp_configured ? "ready" : "missing",
    };
  }

  async updatePreferences(
    preferences: UserPreferences,
  ): Promise<UserPreferences> {
    const weekdays = new Map([
      ["Sun", 0],
      ["Mon", 1],
      ["Tue", 2],
      ["Wed", 3],
      ["Thu", 4],
      ["Fri", 5],
      ["Sat", 6],
    ]);
    await this.request("/preferences", {
      body: {
        feedback_locale: preferences.feedbackLanguage === "en" ? "en" : "zh-CN",
        ielts_track:
          preferences.examType === "general" ? "general_training" : "academic",
        reminder_email: preferences.emailNotifications,
        reminder_in_app: true,
        quiet_hours: preferences.quietHoursEnabled
          ? {
              start: preferences.quietHoursStart,
              end: preferences.quietHoursEnd,
            }
          : null,
        slots: preferences.studyDays.map((day) => ({
          enabled: true,
          local_time: preferences.studyTime,
          weekday: weekdays.get(day) ?? 0,
        })),
        target_band: preferences.targetBand,
        timezone: preferences.timezone,
      },
      idempotent: true,
      method: "PUT",
    });
    return preferences;
  }

  async downloadLearningArchive(): Promise<void> {
    const response = await this.fetcher(this.url("/data/export"), {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/zip, application/problem+json" },
      method: "GET",
    });
    if (!response.ok) {
      const raw = await response.text();
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
      if (isApiProblem(value)) throw errorFromProblem(value);
      throw new LearningClientError(
        "The learning archive could not be created.",
        {
          code: "EXPORT_FAILED",
          status: response.status,
        },
      );
    }
    const blob = await response.blob();
    if (typeof document === "undefined") return;
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename =
      disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
      "ielts-writing-learning-record.zip";
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async getCycleExportOptions(): Promise<CycleExportOption[]> {
    const { data } = await this.request<{ cycles?: WireCycle[] }>(
      "/training-cycles",
    );
    return (data.cycles ?? [])
      .filter((cycle): cycle is WireCycle & { id: string } => Boolean(cycle.id))
      .map((cycle) => ({
        id: cycle.id,
        status: cycle.status ?? "UNKNOWN",
        prompt: cycle.question?.prompt ?? "Untitled IELTS Writing cycle",
        createdAt: cycle.createdAt ?? "",
      }));
  }

  async downloadCycleBundle(cycleId: string): Promise<void> {
    const response = await this.fetcher(
      this.url(`/training-cycles/${encodeURIComponent(cycleId)}/export`),
      {
        cache: "no-store",
        credentials: "include",
        headers: {
          Accept:
            "application/vnd.ielts-writing-coach.bundle+zip, application/problem+json",
        },
        method: "GET",
      },
    );
    if (!response.ok) {
      const raw = await readBoundedResponseText(response, 256 * 1024);
      let value: unknown;
      try {
        value = raw ? JSON.parse(raw) : undefined;
      } catch {
        value = raw;
      }
      if (isApiProblem(value)) throw errorFromProblem(value);
      throw new LearningClientError(
        "The selected TrainingCycle could not be exported.",
        { code: "CYCLE_EXPORT_FAILED", status: response.status },
      );
    }
    const blob = await response.blob();
    if (typeof document === "undefined") return;
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename =
      disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
      `ielts-writing-cycle-${cycleId}.iwc-bundle.zip`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async importLearningBundle(file: File): Promise<CycleBundleImportResult> {
    const maximumBytes = 20 * 1024 * 1024;
    if (file.size > maximumBytes) {
      throw new LearningClientError(
        "CycleBundle imports cannot exceed 20 MiB.",
        { status: 413, code: "IMPORT_TOO_LARGE" },
      );
    }
    const lowerName = file.name.toLowerCase();
    const contentType = lowerName.endsWith(".json")
      ? "application/json"
      : "application/zip";
    const headers = new Headers({
      Accept: "application/json, application/problem+json",
      "Content-Type": contentType,
      "Idempotency-Key": this.idempotencyKey(),
    });
    if (this.origin) headers.set("Origin", this.origin);
    const response = await this.fetcher(this.url("/imports"), {
      body: file,
      cache: "no-store",
      credentials: "include",
      headers,
      method: "POST",
    });
    const raw = await readBoundedResponseText(response, 256 * 1024);
    let value: unknown;
    try {
      value = raw ? JSON.parse(raw) : {};
    } catch {
      throw new LearningClientError(
        "The import endpoint returned an invalid response.",
        { status: 502, code: "IMPORT_RESPONSE_INVALID" },
      );
    }
    if (!response.ok) {
      if (isApiProblem(value)) throw errorFromProblem(value);
      throw new LearningClientError("The CycleBundle could not be imported.", {
        status: response.status,
        code: "IMPORT_FAILED",
      });
    }
    const result = record(value);
    return {
      imported: result.imported === true,
      idempotent: result.idempotent === true,
      cycleId: textValue(result, ["cycle_id"], ""),
      bundleId: textValue(result, ["bundle_id"], ""),
      conflicts: Array.isArray(result.conflicts)
        ? result.conflicts.filter(
            (item): item is Record<string, unknown> =>
              item !== null && typeof item === "object",
          )
        : [],
    };
  }

  async getModelRoutes(): Promise<ModelRouteSetting[]> {
    const { data } = await this.request<{
      routes?: Array<{
        fallbackEnabled?: boolean;
        id?: string;
        model?: string;
        providerConnectionId?: string | null;
        routeVersion?: number;
        taskKind?: string;
      }>;
    }>("/model-routes");
    return (data.routes ?? [])
      .filter((route): route is typeof route & { taskKind: AiTaskKind } =>
        isAiTaskKind(route.taskKind),
      )
      .map((route) => ({
        id: route.id ?? `route-${route.taskKind}`,
        taskKind: route.taskKind,
        providerConnectionId: route.providerConnectionId ?? null,
        model: route.model ?? "",
        fallbackEnabled: route.fallbackEnabled === true,
        routeVersion: route.routeVersion ?? 1,
      }));
  }

  async updateModelRoute(input: {
    taskKind: AiTaskKind;
    providerConnectionId: string;
    model: string;
  }): Promise<ModelRouteSetting> {
    const { data } = await this.request<{
      routes?: Array<{
        fallbackEnabled?: boolean;
        id?: string;
        model?: string;
        providerConnectionId?: string | null;
        routeVersion?: number;
        taskKind?: string;
      }>;
    }>("/model-routes", {
      body: {
        tasks: [input.taskKind],
        provider_connection_id: input.providerConnectionId,
        model: input.model,
        fallback_enabled: false,
      },
      idempotent: true,
      method: "PUT",
    });
    const route = data.routes?.[0];
    if (!route || !isAiTaskKind(route.taskKind)) {
      throw new LearningClientError(
        "The server did not return the saved model route.",
        { status: 502, code: "MODEL_ROUTE_SAVE_UNCONFIRMED" },
      );
    }
    return {
      id: route.id ?? `route-${route.taskKind}`,
      taskKind: route.taskKind,
      providerConnectionId: route.providerConnectionId ?? null,
      model: route.model ?? input.model,
      fallbackEnabled: route.fallbackEnabled === true,
      routeVersion: route.routeVersion ?? 1,
    };
  }

  async deleteLearningData(): Promise<void> {
    await this.request("/data", {
      body: { confirmation: "DELETE MY LEARNING DATA" },
      idempotent: true,
      method: "DELETE",
    });
    if (typeof indexedDB !== "undefined")
      indexedDB.deleteDatabase("ielts-writing-coach");
  }

  async testConnection(
    input: Partial<BootstrapInput>,
  ): Promise<ConnectionProbe> {
    const status = await this.request<{ setup_required?: boolean }>(
      "/setup/status",
    );
    const setupToken = this.setupToken(input);
    if (status.data.setup_required && !setupToken) {
      throw new LearningClientError(
        "Open setup with the one-time token supplied by your self-hosted instance.",
        { status: 401, code: "SETUP_TOKEN_REQUIRED" },
      );
    }
    const { data } = await this.request<{
      capabilities?: JsonRecord | null;
      latency_ms?: number;
      ok?: boolean;
      safe_message?: string;
    }>(
      status.data.setup_required ? "/setup/provider-test" : "/providers/test",
      {
        body: {
          ...(status.data.setup_required ? { setup_token: setupToken } : {}),
          api_key: input.apiKey || undefined,
          base_url: input.baseUrl || undefined,
          kind: input.provider ?? "openai",
          vendor: input.providerVendor,
          model: input.model,
        },
        idempotent: true,
        method: "POST",
      },
    );
    const capabilities = record(data.capabilities);
    const structured =
      capabilities.structuredOutput === true ||
      capabilities.structured_output === true;
    const context =
      capabilities.contextWindow !== false &&
      capabilities.context_window !== false;
    return {
      status: structured ? "success" : "compatibility",
      latencyMs: data.latency_ms ?? 0,
      connection: data.ok === true,
      structuredOutput: structured,
      contextWindow: context,
      messageZh: structured
        ? "连接和结构化输出检查已通过。"
        : "连接可用，结构化输出将使用兼容模式。",
      messageEn:
        data.safe_message ??
        (structured
          ? "Connection and structured output passed."
          : "Connection works; structured output will use compatibility mode."),
    };
  }

  async completeBootstrap(input: BootstrapInput): Promise<void> {
    const status = await this.request<{
      setup_required?: boolean;
      session_only_available?: boolean;
    }>("/setup/status");
    if (
      input.configureAi !== false &&
      input.secretSource === "session" &&
      status.data.session_only_available !== true
    ) {
      throw new LearningClientError(
        "Session-only keys require a personal, single-replica Web deployment with WORKER_MODE=embedded.",
        { status: 422, code: "SESSION_ONLY_UNAVAILABLE" },
      );
    }
    if (status.data.setup_required) {
      const setupToken = this.setupToken(input);
      if (!setupToken)
        throw new LearningClientError(
          "Open setup with the one-time token supplied by your self-hosted instance.",
          { status: 401, code: "SETUP_TOKEN_REQUIRED" },
        );
      // The tested AI connection is saved atomically with the owner account;
      // a provider failure rolls the whole setup back for a clean retry.
      await this.request("/setup", {
        body: {
          email: input.email,
          deployment_mode: input.deploymentMode,
          locale: "zh-CN",
          name: input.adminName,
          password: input.password,
          setup_token: setupToken,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(input.configureAi === false || !input.providerVendor
            ? {}
            : {
                provider: {
                  api_key: input.apiKey || undefined,
                  base_url: input.baseUrl || undefined,
                  kind: input.provider,
                  vendor: input.providerVendor,
                  model: input.model,
                  secret_mode:
                    input.secretSource === "session"
                      ? "session_only"
                      : "encrypted",
                },
              }),
        },
        idempotent: true,
        method: "POST",
      });
      await this.request("/auth/sign-in/email", {
        body: {
          email: input.email,
          password: input.password,
          rememberMe: true,
        },
        method: "POST",
      });
      return;
    }
    await this.request("/auth/sign-in/email", {
      body: {
        email: input.email,
        password: input.password,
        rememberMe: true,
      },
      method: "POST",
    });
    if (input.configureAi === false) return;
    const provider = await this.request<{
      provider?: { id?: string };
    }>("/providers", {
      body: {
        api_key: input.apiKey || undefined,
        base_url: input.baseUrl || undefined,
        kind: input.provider,
        vendor: input.providerVendor,
        name: input.providerVendor,
        secret_mode:
          input.secretSource === "session" ? "session_only" : "encrypted",
        test_model: input.model,
      },
      idempotent: true,
      method: "POST",
    });
    if (provider.data.provider?.id) {
      await this.request("/model-routes", {
        body: {
          fallback_enabled: false,
          model: input.model,
          provider_connection_id: provider.data.provider.id,
          tasks: [...AI_TASK_KINDS],
        },
        idempotent: true,
        method: "PUT",
      });
    }
  }

  async configureAiConnection(input: AiConnectionInput): Promise<void> {
    const provider = await this.request<{ provider?: { id?: string } }>(
      "/providers",
      {
        body: {
          api_key: input.apiKey || undefined,
          base_url: input.baseUrl || undefined,
          kind: input.provider,
          vendor: input.providerVendor,
          name: input.providerVendor,
          secret_mode:
            input.secretSource === "session" ? "session_only" : "encrypted",
          test_model: input.model,
        },
        idempotent: true,
        method: "POST",
      },
    );
    const providerId = provider.data.provider?.id;
    if (!providerId)
      throw new LearningClientError(
        "The server did not return the saved provider connection.",
        { status: 502, code: "PROVIDER_SAVE_UNCONFIRMED" },
      );
    await this.request("/model-routes", {
      body: {
        fallback_enabled: false,
        model: input.model,
        provider_connection_id: providerId,
        tasks: [...AI_TASK_KINDS],
      },
      idempotent: true,
      method: "PUT",
    });
  }

  async deleteAiConnection(connectionId: string): Promise<void> {
    if (!connectionId || connectionId === "environment-openai") {
      throw new LearningClientError(
        "Environment-managed provider connections cannot be deleted in the UI.",
        { status: 409, code: "ENVIRONMENT_PROVIDER_READ_ONLY" },
      );
    }
    await this.request(`/providers/${encodeURIComponent(connectionId)}`, {
      idempotent: true,
      method: "DELETE",
    });
  }

  async getSystemStatus(): Promise<SystemStatus> {
    const [status, providers] = await Promise.all([
      this.request<{
        actor_role?: "owner" | "admin";
        audit_event_count?: number;
        database?: { healthy?: boolean; migrations_current?: boolean };
        deployment_mode?: "personal" | "shared";
        jobs?: Record<string, number>;
        pending_invitations?: number;
        recent_audit?: Array<{
          action?: string;
          id?: string;
          occurred_at?: string;
          result?: string;
          target_id?: string | null;
          target_type?: string;
        }>;
        smtp_configured?: boolean;
        task_executor?: { healthy?: boolean };
        versions?: { application?: string };
        smtp_state?:
          | "verified"
          | "configured_unverified"
          | "verification_failed"
          | "missing";
        users?: number;
      }>("/admin/status"),
      this.getProviders().catch(() => []),
    ]);
    const jobs = status.data.jobs ?? {};
    return {
      actorRole: status.data.actor_role ?? "admin",
      version: status.data.versions?.application ?? "unknown",
      deploymentMode: status.data.deployment_mode ?? "personal",
      ai: mapProvider(providers[0]),
      mailState:
        status.data.smtp_state === "verified"
          ? "ready"
          : status.data.smtp_state === "verification_failed"
            ? "error"
            : status.data.smtp_configured
              ? "unverified"
              : "missing",
      databaseState:
        status.data.database?.healthy === false ? "degraded" : "healthy",
      migrationsCurrent: status.data.database?.migrations_current === true,
      taskExecutorState:
        status.data.task_executor?.healthy === true ? "healthy" : "degraded",
      queue: {
        failed: (jobs.FAILED ?? 0) + (jobs.AI_BLOCKED ?? 0),
        running: (jobs.LEASED ?? 0) + (jobs.RUNNING ?? 0),
        waiting:
          (jobs.WAITING_FOR_CONSENT ?? 0) +
          (jobs.QUEUED ?? 0) +
          (jobs.RETRY_SCHEDULED ?? 0),
      },
      users: {
        active: status.data.users ?? 0,
        invited: status.data.pending_invitations ?? 0,
        publicRegistration: false,
      },
      privacy: {
        adminCanReadEssays: false,
        auditEvents: status.data.audit_event_count ?? 0,
        recentAudit: (status.data.recent_audit ?? []).map((event) => ({
          id: event.id ?? "unknown-audit-event",
          action: event.action ?? "unknown",
          targetType: event.target_type ?? "unknown",
          targetId: event.target_id ?? null,
          result: event.result ?? "unknown",
          occurredAt: event.occurred_at ?? "",
        })),
      },
    };
  }
}

export type { ApiProblemDetails };
