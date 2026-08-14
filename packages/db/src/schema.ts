import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

const utcNow = () => new Date();
const domainId = (name = "id") =>
  uuid(name)
    .primaryKey()
    .$defaultFn(() => uuidv7());
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(utcNow);

export const userRole = pgEnum("user_role", ["owner", "admin", "learner"]);
export const deploymentMode = pgEnum("deployment_mode", ["personal", "shared"]);
export const providerKind = pgEnum("provider_kind", [
  "openai",
  "compatible",
  "mock",
]);
export const providerSecretMode = pgEnum("provider_secret_mode", [
  "encrypted",
  "environment",
  "session_only",
]);
export const aiJobStatus = pgEnum("ai_job_status", [
  "WAITING_FOR_CONSENT",
  "QUEUED",
  "LEASED",
  "RUNNING",
  "SUCCEEDED",
  "RETRY_SCHEDULED",
  "AI_BLOCKED",
  "FAILED",
]);
export const cycleStatus = pgEnum("cycle_status", [
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
]);
export const attemptKind = pgEnum("attempt_kind", [
  "version_1",
  "version_2",
  "transfer",
]);
export const objectiveRole = pgEnum("objective_role", [
  "CORE",
  "SECONDARY",
  "REVIEW",
]);
export const rewriteTaskStatus = pgEnum("rewrite_task_status", [
  "PLANNED",
  "LOCKED",
  "READY",
  "ACTIVE",
  "COMPLETED",
  "SKIPPED_PREREQUISITE",
  "RESCHEDULED",
]);
export const transferTaskStatus = pgEnum("transfer_task_status", [
  "PLANNED",
  "READY",
  "COMPLETED",
  "NO_OPPORTUNITY",
  "RESCHEDULED",
]);
export const notificationChannel = pgEnum("notification_channel", [
  "in_app",
  "email",
]);

export type TeachingPracticeResponseMode = "CHOICE" | "SHORT_TEXT";
export type TeachingPracticeResponseStatus =
  | "REFERENCE_READY"
  | "ANALYSIS_PENDING"
  | "ANALYSIS_READY"
  | "ANALYSIS_UNAVAILABLE"
  | "DEMO_ONLY";

// Better Auth tables deliberately use text identifiers to remain adapter-compatible.
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRole("role").notNull().default("learner"),
    locale: text("locale").notNull().default("zh-CN"),
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_idx").on(table.userId),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("account_user_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const instanceConfiguration = pgTable("instance_configuration", {
  id: domainId(),
  deploymentMode: deploymentMode("deployment_mode")
    .notNull()
    .default("personal"),
  setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
  setupTokenDigest: text("setup_token_digest"),
  publicRegistrationEnabled: boolean("public_registration_enabled")
    .notNull()
    .default(false),
  adminContentAccessEnabled: boolean("admin_content_access_enabled")
    .notNull()
    .default(false),
  defaultLocale: text("default_locale").notNull().default("zh-CN"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const invitation = pgTable(
  "invitation",
  {
    id: domainId(),
    email: text("email").notNull(),
    role: userRole("role").notNull().default("learner"),
    tokenDigest: text("token_digest").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedBy: text("consumed_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("invitation_token_digest_unique").on(table.tokenDigest),
  ],
);

export const providerConnection = pgTable(
  "provider_connection",
  {
    id: domainId(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: providerKind("kind").notNull(),
    /** Product-facing preset ID; transport protocol remains in `kind`. */
    vendor: text("vendor").notNull().default("custom"),
    baseUrl: text("base_url"),
    secretMode: providerSecretMode("secret_mode").notNull(),
    secretCiphertext: text("secret_ciphertext"),
    secretNonce: text("secret_nonce"),
    keyVersion: integer("key_version"),
    enabled: boolean("enabled").notNull().default(true),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    capabilities: jsonb("capabilities").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("provider_owner_idx").on(table.ownerId)],
);

export const modelRoute = pgTable(
  "model_route",
  {
    id: domainId(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskKind: text("task_kind").notNull(),
    providerConnectionId: uuid("provider_connection_id").references(
      () => providerConnection.id,
    ),
    model: text("model").notNull(),
    fallbackProviderConnectionId: uuid(
      "fallback_provider_connection_id",
    ).references(() => providerConnection.id),
    fallbackModel: text("fallback_model"),
    fallbackEnabled: boolean("fallback_enabled").notNull().default(false),
    routeVersion: integer("route_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("model_route_owner_task_unique").on(
      table.ownerId,
      table.taskKind,
    ),
  ],
);

export const aiJob = pgTable(
  "ai_job",
  {
    id: domainId(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskKind: text("task_kind").notNull(),
    status: aiJobStatus("status").notNull().default("WAITING_FOR_CONSENT"),
    providerConnectionId: uuid("provider_connection_id").references(
      () => providerConnection.id,
    ),
    modelRouteId: uuid("model_route_id").references(() => modelRoute.id),
    protectedReference: jsonb("protected_reference")
      .$type<Record<string, string>>()
      .notNull(),
    versionSnapshot: jsonb("version_snapshot")
      .$type<Record<string, string>>()
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    graphileJobKey: text("graphile_job_key"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leasedAt: timestamp("leased_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorSafeMessage: text("last_error_safe_message"),
    usage: jsonb("usage").$type<Record<string, number>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("ai_job_owner_idempotency_unique").on(
      table.ownerId,
      table.idempotencyKey,
    ),
    index("ai_job_status_available_idx").on(table.status, table.availableAt),
  ],
);

export const question = pgTable(
  "question",
  {
    id: domainId(),
    externalId: text("external_id").notNull(),
    ownerId: text("owner_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    source: text("source").notNull().default("original_open_bank"),
    visibility: text("visibility").notNull().default("public"),
    ieltsTrack: text("ielts_track").notNull().default("academic"),
    questionType: text("question_type").notNull(),
    topic: text("topic").notNull(),
    prompt: text("prompt").notNull(),
    instructions: text("instructions")
      .notNull()
      .default(
        "Write at least 250 words. Give reasons for your answer and include relevant examples.",
      ),
    promptZh: text("prompt_zh"),
    attribution: text("attribution"),
    bankVersion: text("bank_version").notNull().default("1.0.0"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("question_external_id_unique").on(table.externalId),
    index("question_taxonomy_idx").on(table.questionType, table.topic),
  ],
);

export const learningPreference = pgTable("learning_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  targetBand: real("target_band").notNull().default(7),
  ieltsTrack: text("ielts_track").notNull().default("academic"),
  feedbackLocale: text("feedback_locale").notNull().default("zh-CN"),
  reminderInApp: boolean("reminder_in_app").notNull().default(true),
  reminderEmail: boolean("reminder_email").notNull().default(false),
  quietHours: jsonb("quiet_hours").$type<{ start: string; end: string }>(),
  updatedAt: updatedAt(),
});

export const learningSlot = pgTable(
  "learning_slot",
  {
    id: domainId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    localTime: text("local_time").notNull(),
    timezone: text("timezone").notNull(),
    enabled: boolean("enabled").notNull().default(true),
  },
  (table) => [
    uniqueIndex("learning_slot_unique").on(
      table.userId,
      table.weekday,
      table.localTime,
    ),
  ],
);

export const trainingCycle = pgTable(
  "training_cycle",
  {
    id: domainId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => question.id),
    status: cycleStatus("status").notNull().default("QUESTION_READY"),
    schemaVersion: text("schema_version").notNull(),
    timezone: text("timezone").notNull(),
    coreSkillId: text("core_skill_id"),
    /** Monotonic revision of the last exported/imported portable snapshot. */
    bundleRevision: integer("bundle_revision").notNull().default(1),
    /** The exact portable revision from which bundleRevision was derived. */
    bundleParentRevision: integer("bundle_parent_revision"),
    /** SHA-256 of canonical portable content, excluding transport metadata. */
    bundleContentHash: text("bundle_content_hash"),
    bundleEntityIds: jsonb("bundle_entity_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    bundleConflicts: jsonb("bundle_conflicts")
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("training_cycle_user_status_idx").on(table.userId, table.status),
  ],
);

export const writingAttempt = pgTable(
  "writing_attempt",
  {
    id: domainId(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => trainingCycle.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: attemptKind("kind").notNull(),
    revision: integer("revision").notNull().default(1),
    content: text("content").notNull().default(""),
    wordCount: integer("word_count").notNull().default(0),
    durationSeconds: integer("duration_seconds"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    abnormalConditions: jsonb("abnormal_conditions")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    assisted: boolean("assisted").notNull().default(false),
    interrupted: boolean("interrupted").notNull().default(false),
    draftBeforeSelfCheck: text("draft_before_self_check"),
    draftAfterSelfCheck: text("draft_after_self_check"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("writing_attempt_cycle_kind_unique").on(
      table.cycleId,
      table.kind,
    ),
    index("writing_attempt_user_idx").on(table.userId),
  ],
);

export const writingAttemptRevision = pgTable(
  "writing_attempt_revision",
  {
    id: domainId(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => writingAttempt.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    baseRevision: integer("base_revision"),
    content: text("content").notNull(),
    wordCount: integer("word_count").notNull(),
    branch: text("branch").notNull().default("canonical"),
    clientId: text("client_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("writing_revision_canonical_unique")
      .on(table.attemptId, table.revision)
      .where(sql`${table.branch} = 'canonical'`),
    index("writing_revision_attempt_idx").on(table.attemptId, table.createdAt),
  ],
);

export const assessment = pgTable(
  "assessment",
  {
    id: domainId(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => writingAttempt.id, { onDelete: "cascade" }),
    schemaVersion: text("schema_version").notNull(),
    overallBand: real("overall_band").notNull(),
    criterionScores: jsonb("criterion_scores")
      .$type<{
        taskResponse: number;
        coherenceCohesion: number;
        lexicalResource: number;
        grammar: number;
      }>()
      .notNull(),
    summary: jsonb("summary").$type<Record<string, string>>().notNull(),
    confidence: real("confidence").notNull(),
    isAiEstimate: boolean("is_ai_estimate").notNull().default(true),
    /** Exact imported contract for lossless Web/Skill round-trips. */
    portableContract:
      jsonb("portable_contract").$type<Record<string, unknown>>(),
    versionSnapshot: jsonb("version_snapshot")
      .$type<Record<string, string>>()
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("assessment_attempt_unique").on(table.attemptId)],
);

export const issueEvidence = pgTable(
  "issue_evidence",
  {
    id: domainId(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessment.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    excerpt: text("excerpt").notNull(),
    diagnosis: jsonb("diagnosis").$type<Record<string, string>>().notNull(),
    categories: jsonb("categories")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    hardGrammarError: boolean("hard_grammar_error").notNull().default(false),
    severity: integer("severity").notNull(),
    confidence: real("confidence").notNull(),
    adjudicationStatus: text("adjudication_status")
      .notNull()
      .default("ACCEPTED"),
    createdAt: createdAt(),
  },
  (table) => [index("issue_evidence_assessment_idx").on(table.assessmentId)],
);

export const learningObjective = pgTable(
  "learning_objective",
  {
    id: domainId(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => trainingCycle.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    role: objectiveRole("role").notNull(),
    sourceEvidenceIds: jsonb("source_evidence_ids").$type<string[]>().notNull(),
    priority: integer("priority").notNull(),
    successCriterion: text("success_criterion").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("learning_objective_cycle_role_unique").on(
      table.cycleId,
      table.role,
    ),
    index("learning_objective_cycle_idx").on(table.cycleId),
  ],
);

export const lessonPlan = pgTable(
  "lesson_plan",
  {
    id: domainId(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => trainingCycle.id, { onDelete: "cascade" }),
    coreSkillId: text("core_skill_id").notNull(),
    schemaVersion: text("schema_version").notNull(),
    plannedMinutes: integer("planned_minutes").notNull().default(60),
    coreMinutes: integer("core_minutes").notNull(),
    activeOutputRatio: real("active_output_ratio").notNull(),
    selectionRatio: real("selection_ratio").notNull(),
    remediationMinutes: integer("remediation_minutes").notNull().default(0),
    stages: jsonb("stages").$type<unknown[]>().notNull(),
    /**
     * Runtime state is deliberately separate from the immutable canonical
     * LessonPlan stored in `stages`.  The canonical contract describes what
     * may be taught; these fields record what this learner actually did.
     */
    runtimeStatus: text("runtime_status").notNull().default("READY"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    activeStartedAt: timestamp("active_started_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    timeboxExpiredAt: timestamp("timebox_expired_at", {
      withTimezone: true,
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
    productiveSeconds: integer("productive_seconds").notNull().default(0),
    runtimeRevision: integer("runtime_revision").notNull().default(1),
    runtimeState: jsonb("runtime_state")
      .$type<{
        adaptive?: {
          remediationDepth: number;
          activatedFlexItemIds: string[];
          skippedItemIds: string[];
          triggerAfterItemId?: string;
        };
        draft?: {
          itemId: string;
          answer: string;
          firstAnswer: string;
          responseId?: string;
          attempts: number;
          hintLevel: number;
          revealed: boolean;
          updatedAt: string;
        };
        segmentStartedElapsedSeconds?: number;
        segmentDurationSeconds?: number;
        split?: "NONE" | "SCHEDULED" | "ACTIVE" | "COMPLETED";
        refresher?: "NOT_REQUIRED" | "REQUIRED" | "COMPLETED";
        refresherAnswer?: string;
        interruptions?: Array<{
          at: string;
          kind: "BROWSER" | "NETWORK" | "TIMER" | "USER_ABNORMAL";
        }>;
        autoSplit?: {
          triggeredAt: string;
          maxSegmentSeconds: 1500;
          modules: Array<{
            itemIds: string[];
            expectedMinutes: number;
          }>;
          currentModuleIndex: number;
        };
        refresherPlan?: {
          kind: "RULE_CONTRAST" | "SCAFFOLD_FADE" | "TIMED_PARAGRAPH";
          durationMinutes: number;
          sourceItemId?: string;
        };
        completionMode?:
          | "EVIDENCE_APPLIED"
          | "PRACTICE_ONLY"
          | "TIMEBOX_TRIMMED";
        /** Unscored meaning-fork selection; changes presentation, never mastery. */
        semanticBranch?: string;
        semanticBranchSourceItemId?: string;
      }>()
      .notNull()
      .default(sql`'{"split":"NONE","refresher":"NOT_REQUIRED"}'::jsonb`),
    /**
     * Product-facing practice-paper state. Legacy lesson columns stay readable
     * for exchange compatibility, but the learner experience is one complete
     * timed paper followed by one whole-paper result.
     */
    practiceFormat: text("practice_format").notNull().default("TIMED_PAPER_V2"),
    paperContent: jsonb("paper_content").$type<Record<string, unknown>>(),
    paperAnswers: jsonb("paper_answers")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    paperResult: jsonb("paper_result").$type<Record<string, unknown>>(),
    paperSubmittedAt: timestamp("paper_submitted_at", { withTimezone: true }),
    paperEvaluationJobId: uuid("paper_evaluation_job_id").references(
      () => aiJob.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("lesson_plan_cycle_unique").on(table.cycleId)],
);

/**
 * Tutorial practice is deliberately isolated from lesson runtime, timed-paper
 * answers, and evidence tables.  The unique key makes the first submitted
 * answer the durable response for one canonical tutorial prompt.
 */
export const teachingPracticeResponse = pgTable(
  "teaching_practice_response",
  {
    id: domainId(),
    lessonPlanId: uuid("lesson_plan_id")
      .notNull()
      .references(() => lessonPlan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull(),
    submittedAnswer: text("submitted_answer").notNull(),
    responseMode: text("response_mode")
      .$type<TeachingPracticeResponseMode>()
      .notNull(),
    status: text("status").$type<TeachingPracticeResponseStatus>().notNull(),
    aiJobId: uuid("ai_job_id").references(() => aiJob.id, {
      onDelete: "set null",
    }),
    analysis: jsonb("analysis").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("teaching_practice_response_prompt_unique").on(
      table.lessonPlanId,
      table.userId,
      table.promptId,
    ),
  ],
);

export const exerciseItem = pgTable(
  "exercise_item",
  {
    id: domainId(),
    lessonPlanId: uuid("lesson_plan_id")
      .notNull()
      .references(() => lessonPlan.id, { onDelete: "cascade" }),
    learningObjectiveId: uuid("learning_objective_id")
      .notNull()
      .references(() => learningObjective.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    itemType: text("item_type").notNull(),
    prompt: jsonb("prompt").$type<Record<string, unknown>>().notNull(),
    evaluationContract: jsonb("evaluation_contract")
      .$type<Record<string, unknown>>()
      .notNull(),
    expectedMinutes: integer("expected_minutes").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("exercise_item_lesson_ordinal_unique").on(
      table.lessonPlanId,
      table.ordinal,
    ),
  ],
);

export const exerciseAttempt = pgTable(
  "exercise_attempt",
  {
    id: domainId(),
    exerciseItemId: uuid("exercise_item_id")
      .notNull()
      .references(() => exerciseItem.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    schemaVersion: text("schema_version").notNull().default("1.0.0"),
    firstAttemptEventId: uuid("first_attempt_event_id").notNull(),
    finalAttemptEventId: uuid("final_attempt_event_id").notNull(),
    contractAttempts: jsonb("contract_attempts")
      .$type<
        Array<{
          id: string;
          answer: string;
          submittedAt: string;
          elapsedSeconds: number;
          hintLevel:
            | "NONE"
            | "KEYWORD"
            | "PARTIAL_FRAME"
            | "FULL_FRAME"
            | "ANSWER_SHOWN";
          referenceAnswerSeen: boolean;
        }>
      >()
      .notNull(),
    firstAnswer: jsonb("first_answer").$type<unknown>().notNull(),
    hintedAnswer: jsonb("hinted_answer").$type<unknown>(),
    finalAnswer: jsonb("final_answer").$type<unknown>(),
    hintsUsed: integer("hints_used").notNull().default(0),
    hintLevel: text("hint_level").notNull().default("NONE"),
    referenceAnswerSeen: boolean("reference_answer_seen")
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("exercise_attempt_item_user_idx").on(
      table.exerciseItemId,
      table.userId,
    ),
  ],
);

export const evaluation = pgTable(
  "evaluation",
  {
    id: domainId(),
    /**
     * A single durable AI job may be delivered more than once by the
     * at-least-once queue.  Keeping its identity on the append-only result
     * lets a later, explicit re-evaluation use a new job while making a
     * retry of the same job a database-level no-op.
     */
    aiJobId: uuid("ai_job_id").references(() => aiJob.id, {
      onDelete: "set null",
    }),
    exerciseAttemptId: uuid("exercise_attempt_id")
      .notNull()
      .references(() => exerciseAttempt.id, { onDelete: "cascade" }),
    responseAttemptId: uuid("response_attempt_id"),
    passed: boolean("passed").notNull(),
    confidence: real("confidence").notNull(),
    feedback: jsonb("feedback").$type<Record<string, string>>().notNull(),
    dimensionScores: jsonb("dimension_scores")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    userAnswerEvidence: jsonb("user_answer_evidence")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    mostImportantSuggestion: text("most_important_suggestion")
      .notNull()
      .default(""),
    adjudicationStatus: text("adjudication_status")
      .notNull()
      .default("ACCEPTED"),
    supersedesEvaluationId: uuid("supersedes_evaluation_id"),
    versionSnapshot: jsonb("version_snapshot")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    validForEvidence: boolean("valid_for_evidence").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index("evaluation_attempt_idx").on(table.exerciseAttemptId),
    uniqueIndex("evaluation_ai_job_unique").on(table.aiJobId),
  ],
);

export const skillEvidenceEvent = pgTable(
  "skill_evidence_event",
  {
    id: domainId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").references(() => trainingCycle.id, {
      onDelete: "set null",
    }),
    skillId: text("skill_id").notNull(),
    evidenceStage: text("evidence_stage").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    valid: boolean("valid").notNull(),
    confidence: real("confidence").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("skill_evidence_source_unique").on(
      table.sourceType,
      table.sourceId,
      table.evidenceStage,
    ),
    index("skill_evidence_user_skill_time_idx").on(
      table.userId,
      table.skillId,
      table.occurredAt,
    ),
  ],
);

export const userSkillState = pgTable(
  "user_skill_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    retainedAt: timestamp("retained_at", { withTimezone: true }),
    transferredAt: timestamp("transferred_at", { withTimezone: true }),
    stability: real("stability").notNull().default(0),
    evidenceCount: integer("evidence_count").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.skillId] })],
);

export const rewriteTask = pgTable(
  "rewrite_task",
  {
    id: domainId(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => trainingCycle.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: rewriteTaskStatus("status").notNull().default("PLANNED"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    contractDueAt: timestamp("contract_due_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    abstractChecklist: jsonb("abstract_checklist").$type<string[]>().notNull(),
    lastInstructionExposureAt: timestamp("last_instruction_exposure_at", {
      withTimezone: true,
    }),
    assisted: boolean("assisted").notNull().default(false),
    prerequisiteSkipped: boolean("prerequisite_skipped")
      .notNull()
      .default(false),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("rewrite_task_cycle_unique").on(table.cycleId)],
);

export const transferTask = pgTable(
  "transfer_task",
  {
    id: domainId(),
    sourceCycleId: uuid("source_cycle_id")
      .notNull()
      .references(() => trainingCycle.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => question.id),
    skillId: text("skill_id").notNull(),
    objectiveId: uuid("objective_id").references(() => learningObjective.id, {
      onDelete: "set null",
    }),
    status: transferTaskStatus("status").notNull().default("PLANNED"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    contractDueAt: timestamp("contract_due_at", { withTimezone: true }),
    naturalOpportunityDefinition: text("natural_opportunity_definition")
      .notNull()
      .default(
        "Apply the target independently in a fresh Task 2 context without a direct target prompt.",
      ),
    noHintRequired: boolean("no_hint_required").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("transfer_task_user_available_idx").on(
      table.userId,
      table.status,
      table.availableAt,
    ),
  ],
);

export const mixedReviewTask = pgTable(
  "mixed_review_task",
  {
    id: domainId(),
    sourceCycleId: uuid("source_cycle_id")
      .notNull()
      .references(() => trainingCycle.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetCycleId: uuid("target_cycle_id").references(() => trainingCycle.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("PLANNED"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("mixed_review_cycle_unique").on(table.sourceCycleId),
    uniqueIndex("mixed_review_target_cycle_unique").on(
      table.userId,
      table.targetCycleId,
    ),
  ],
);

export const notification = pgTable(
  "notification",
  {
    id: domainId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channel: notificationChannel("channel").notNull(),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("notification_dedupe_unique").on(
      table.userId,
      table.channel,
      table.dedupeKey,
    ),
  ],
);

export const importRecord = pgTable(
  "import_record",
  {
    id: domainId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bundleId: uuid("bundle_id").notNull(),
    checksum: text("checksum").notNull(),
    schemaVersion: text("schema_version").notNull(),
    status: text("status").notNull(),
    conflicts: jsonb("conflicts")
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("import_record_user_bundle_unique").on(
      table.userId,
      table.bundleId,
    ),
  ],
);

export const idempotencyRecord = pgTable(
  "idempotency_record",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<unknown>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);

export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    bucket: text("bucket").notNull(),
    subjectDigest: text("subject_digest").notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.bucket, table.subjectDigest, table.windowStartedAt],
    }),
  ],
);

/**
 * Process-level liveness reported by a real task executor. Rows are ephemeral:
 * a graceful worker removes its row and crashed workers naturally become stale.
 * Readiness therefore never infers queue health merely from a Web process being
 * able to connect to PostgreSQL.
 */
export const workerHeartbeat = pgTable(
  "worker_heartbeat",
  {
    id: domainId(),
    mode: text("mode").notNull(),
    applicationVersion: text("application_version").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("worker_heartbeat_freshness_idx").on(table.lastHeartbeatAt),
  ],
);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: domainId(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    result: text("result").notNull(),
    ipDigest: text("ip_digest"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("audit_event_time_idx").on(table.occurredAt)],
);

export const questionRelations = relations(question, ({ many }) => ({
  trainingCycles: many(trainingCycle),
}));

export const trainingCycleRelations = relations(
  trainingCycle,
  ({ one, many }) => ({
    user: one(user, { fields: [trainingCycle.userId], references: [user.id] }),
    question: one(question, {
      fields: [trainingCycle.questionId],
      references: [question.id],
    }),
    writingAttempts: many(writingAttempt),
    lessonPlans: many(lessonPlan),
    rewriteTasks: many(rewriteTask),
    transferTasks: many(transferTask),
    objectives: many(learningObjective),
    mixedReviewTasks: many(mixedReviewTask),
  }),
);

export const writingAttemptRelations = relations(
  writingAttempt,
  ({ one, many }) => ({
    cycle: one(trainingCycle, {
      fields: [writingAttempt.cycleId],
      references: [trainingCycle.id],
    }),
    assessment: one(assessment),
    revisions: many(writingAttemptRevision),
  }),
);

export const writingAttemptRevisionRelations = relations(
  writingAttemptRevision,
  ({ one }) => ({
    attempt: one(writingAttempt, {
      fields: [writingAttemptRevision.attemptId],
      references: [writingAttempt.id],
    }),
  }),
);

export const assessmentRelations = relations(assessment, ({ one, many }) => ({
  attempt: one(writingAttempt, {
    fields: [assessment.attemptId],
    references: [writingAttempt.id],
  }),
  issues: many(issueEvidence),
}));

export const issueEvidenceRelations = relations(issueEvidence, ({ one }) => ({
  assessment: one(assessment, {
    fields: [issueEvidence.assessmentId],
    references: [assessment.id],
  }),
}));

export const lessonPlanRelations = relations(lessonPlan, ({ one, many }) => ({
  cycle: one(trainingCycle, {
    fields: [lessonPlan.cycleId],
    references: [trainingCycle.id],
  }),
  items: many(exerciseItem),
  practiceResponses: many(teachingPracticeResponse),
}));

export const teachingPracticeResponseRelations = relations(
  teachingPracticeResponse,
  ({ one }) => ({
    lessonPlan: one(lessonPlan, {
      fields: [teachingPracticeResponse.lessonPlanId],
      references: [lessonPlan.id],
    }),
    user: one(user, {
      fields: [teachingPracticeResponse.userId],
      references: [user.id],
    }),
    aiJob: one(aiJob, {
      fields: [teachingPracticeResponse.aiJobId],
      references: [aiJob.id],
    }),
  }),
);

export const exerciseItemRelations = relations(
  exerciseItem,
  ({ one, many }) => ({
    lessonPlan: one(lessonPlan, {
      fields: [exerciseItem.lessonPlanId],
      references: [lessonPlan.id],
    }),
    objective: one(learningObjective, {
      fields: [exerciseItem.learningObjectiveId],
      references: [learningObjective.id],
    }),
    attempts: many(exerciseAttempt),
  }),
);

export const learningObjectiveRelations = relations(
  learningObjective,
  ({ one, many }) => ({
    cycle: one(trainingCycle, {
      fields: [learningObjective.cycleId],
      references: [trainingCycle.id],
    }),
    items: many(exerciseItem),
  }),
);

export const mixedReviewTaskRelations = relations(
  mixedReviewTask,
  ({ one }) => ({
    cycle: one(trainingCycle, {
      fields: [mixedReviewTask.sourceCycleId],
      references: [trainingCycle.id],
    }),
  }),
);

export const exerciseAttemptRelations = relations(
  exerciseAttempt,
  ({ one, many }) => ({
    item: one(exerciseItem, {
      fields: [exerciseAttempt.exerciseItemId],
      references: [exerciseItem.id],
    }),
    evaluations: many(evaluation),
  }),
);

export const evaluationRelations = relations(evaluation, ({ one }) => ({
  attempt: one(exerciseAttempt, {
    fields: [evaluation.exerciseAttemptId],
    references: [exerciseAttempt.id],
  }),
}));

export const rewriteTaskRelations = relations(rewriteTask, ({ one }) => ({
  cycle: one(trainingCycle, {
    fields: [rewriteTask.cycleId],
    references: [trainingCycle.id],
  }),
}));

export const transferTaskRelations = relations(transferTask, ({ one }) => ({
  cycle: one(trainingCycle, {
    fields: [transferTask.sourceCycleId],
    references: [trainingCycle.id],
  }),
}));

export const schema = {
  account,
  aiJob,
  assessment,
  auditEvent,
  evaluation,
  evaluationRelations,
  exerciseAttempt,
  exerciseAttemptRelations,
  exerciseItem,
  exerciseItemRelations,
  idempotencyRecord,
  importRecord,
  instanceConfiguration,
  invitation,
  issueEvidence,
  issueEvidenceRelations,
  learningPreference,
  learningSlot,
  lessonPlan,
  lessonPlanRelations,
  learningObjective,
  learningObjectiveRelations,
  modelRoute,
  mixedReviewTask,
  mixedReviewTaskRelations,
  notification,
  providerConnection,
  question,
  questionRelations,
  rateLimitBucket,
  rewriteTask,
  rewriteTaskRelations,
  session,
  skillEvidenceEvent,
  teachingPracticeResponse,
  teachingPracticeResponseRelations,
  trainingCycle,
  trainingCycleRelations,
  transferTask,
  transferTaskRelations,
  user,
  userSkillState,
  verification,
  workerHeartbeat,
  writingAttempt,
  writingAttemptRelations,
  writingAttemptRevision,
  writingAttemptRevisionRelations,
  assessmentRelations,
};
