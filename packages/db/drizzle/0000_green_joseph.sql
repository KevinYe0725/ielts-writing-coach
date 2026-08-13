CREATE TYPE "public"."ai_job_status" AS ENUM('WAITING_FOR_CONSENT', 'QUEUED', 'LEASED', 'RUNNING', 'SUCCEEDED', 'RETRY_SCHEDULED', 'AI_BLOCKED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."attempt_kind" AS ENUM('version_1', 'version_2', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."cycle_status" AS ENUM('QUESTION_READY', 'ATTEMPT_1_ACTIVE', 'SUBMITTED', 'ANALYZING', 'FEEDBACK_READY', 'LESSON_GENERATING', 'LESSON_READY', 'LESSON_ACTIVE', 'LESSON_RESOLVED', 'REWRITE_LOCKED', 'REWRITE_READY', 'ATTEMPT_2_ACTIVE', 'COMPARING', 'CORE_CYCLE_COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."deployment_mode" AS ENUM('personal', 'shared');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email');--> statement-breakpoint
CREATE TYPE "public"."objective_role" AS ENUM('CORE', 'SECONDARY', 'REVIEW');--> statement-breakpoint
CREATE TYPE "public"."provider_kind" AS ENUM('openai', 'compatible', 'mock');--> statement-breakpoint
CREATE TYPE "public"."provider_secret_mode" AS ENUM('encrypted', 'environment', 'session_only');--> statement-breakpoint
CREATE TYPE "public"."rewrite_task_status" AS ENUM('PLANNED', 'LOCKED', 'READY', 'ACTIVE', 'COMPLETED', 'SKIPPED_PREREQUISITE', 'RESCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."transfer_task_status" AS ENUM('PLANNED', 'READY', 'COMPLETED', 'NO_OPPORTUNITY', 'RESCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'learner');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"task_kind" text NOT NULL,
	"status" "ai_job_status" DEFAULT 'WAITING_FOR_CONSENT' NOT NULL,
	"provider_connection_id" uuid,
	"model_route_id" uuid,
	"protected_reference" jsonb NOT NULL,
	"version_snapshot" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"graphile_job_key" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_safe_message" text,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"schema_version" text NOT NULL,
	"overall_band" real NOT NULL,
	"criterion_scores" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"is_ai_estimate" boolean DEFAULT true NOT NULL,
	"version_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"result" text NOT NULL,
	"ip_digest" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"exercise_attempt_id" uuid NOT NULL,
	"passed" boolean NOT NULL,
	"confidence" real NOT NULL,
	"feedback" jsonb NOT NULL,
	"version_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_for_evidence" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"exercise_item_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"first_answer" jsonb NOT NULL,
	"hinted_answer" jsonb,
	"final_answer" jsonb,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"hint_level" text DEFAULT 'NONE' NOT NULL,
	"reference_answer_seen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lesson_plan_id" uuid NOT NULL,
	"learning_objective_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"item_type" text NOT NULL,
	"prompt" jsonb NOT NULL,
	"evaluation_contract" jsonb NOT NULL,
	"expected_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_record" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_record_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "import_record" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bundle_id" uuid NOT NULL,
	"checksum" text NOT NULL,
	"schema_version" text NOT NULL,
	"status" text NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_configuration" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deployment_mode" "deployment_mode" DEFAULT 'personal' NOT NULL,
	"setup_completed_at" timestamp with time zone,
	"setup_token_digest" text,
	"public_registration_enabled" boolean DEFAULT false NOT NULL,
	"admin_content_access_enabled" boolean DEFAULT false NOT NULL,
	"default_locale" text DEFAULT 'zh-CN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'learner' NOT NULL,
	"token_digest" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assessment_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"excerpt" text NOT NULL,
	"diagnosis" jsonb NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hard_grammar_error" boolean DEFAULT false NOT NULL,
	"severity" integer NOT NULL,
	"confidence" real NOT NULL,
	"adjudication_status" text DEFAULT 'ACCEPTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_objective" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"role" "objective_role" NOT NULL,
	"source_evidence_ids" jsonb NOT NULL,
	"priority" integer NOT NULL,
	"success_criterion" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"target_band" real DEFAULT 7 NOT NULL,
	"ielts_track" text DEFAULT 'academic' NOT NULL,
	"feedback_locale" text DEFAULT 'zh-CN' NOT NULL,
	"reminder_in_app" boolean DEFAULT true NOT NULL,
	"reminder_email" boolean DEFAULT false NOT NULL,
	"quiet_hours" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_slot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"local_time" text NOT NULL,
	"timezone" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"core_skill_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"planned_minutes" integer DEFAULT 60 NOT NULL,
	"core_minutes" integer NOT NULL,
	"active_output_ratio" real NOT NULL,
	"selection_ratio" real NOT NULL,
	"remediation_minutes" integer DEFAULT 0 NOT NULL,
	"stages" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mixed_review_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_cycle_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_route" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"task_kind" text NOT NULL,
	"provider_connection_id" uuid,
	"model" text NOT NULL,
	"fallback_provider_connection_id" uuid,
	"fallback_model" text,
	"fallback_enabled" boolean DEFAULT false NOT NULL,
	"route_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_connection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "provider_kind" NOT NULL,
	"base_url" text,
	"secret_mode" "provider_secret_mode" NOT NULL,
	"secret_ciphertext" text,
	"secret_nonce" text,
	"key_version" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp with time zone,
	"capabilities" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" uuid PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"owner_id" text,
	"source" text DEFAULT 'original_open_bank' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"ielts_track" text DEFAULT 'academic' NOT NULL,
	"question_type" text NOT NULL,
	"topic" text NOT NULL,
	"prompt" text NOT NULL,
	"prompt_zh" text,
	"attribution" text,
	"bank_version" text DEFAULT '1.0.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"bucket" text NOT NULL,
	"subject_digest" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_bucket_bucket_subject_digest_window_started_at_pk" PRIMARY KEY("bucket","subject_digest","window_started_at")
);
--> statement-breakpoint
CREATE TABLE "rewrite_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "rewrite_task_status" DEFAULT 'PLANNED' NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"abstract_checklist" jsonb NOT NULL,
	"last_instruction_exposure_at" timestamp with time zone,
	"assisted" boolean DEFAULT false NOT NULL,
	"prerequisite_skipped" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_evidence_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"cycle_id" uuid,
	"skill_id" text NOT NULL,
	"evidence_stage" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"valid" boolean NOT NULL,
	"confidence" real NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_cycle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"question_id" uuid NOT NULL,
	"status" "cycle_status" DEFAULT 'QUESTION_READY' NOT NULL,
	"schema_version" text NOT NULL,
	"timezone" text NOT NULL,
	"core_skill_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_cycle_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"question_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"objective_id" uuid,
	"status" "transfer_task_status" DEFAULT 'PLANNED' NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'learner' NOT NULL,
	"locale" text DEFAULT 'zh-CN' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_skill_state" (
	"user_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"applied_at" timestamp with time zone,
	"retained_at" timestamp with time zone,
	"transferred_at" timestamp with time zone,
	"stability" real DEFAULT 0 NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_skill_state_user_id_skill_id_pk" PRIMARY KEY("user_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" "attempt_kind" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer,
	"locked_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"abnormal_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assisted" boolean DEFAULT false NOT NULL,
	"interrupted" boolean DEFAULT false NOT NULL,
	"draft_before_self_check" text,
	"draft_after_self_check" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_attempt_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"base_revision" integer,
	"content" text NOT NULL,
	"word_count" integer NOT NULL,
	"branch" text DEFAULT 'canonical' NOT NULL,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_provider_connection_id_provider_connection_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_model_route_id_model_route_id_fk" FOREIGN KEY ("model_route_id") REFERENCES "public"."model_route"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_attempt_id_writing_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."writing_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_exercise_attempt_id_exercise_attempt_id_fk" FOREIGN KEY ("exercise_attempt_id") REFERENCES "public"."exercise_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_attempt" ADD CONSTRAINT "exercise_attempt_exercise_item_id_exercise_item_id_fk" FOREIGN KEY ("exercise_item_id") REFERENCES "public"."exercise_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_attempt" ADD CONSTRAINT "exercise_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_item" ADD CONSTRAINT "exercise_item_lesson_plan_id_lesson_plan_id_fk" FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_item" ADD CONSTRAINT "exercise_item_learning_objective_id_learning_objective_id_fk" FOREIGN KEY ("learning_objective_id") REFERENCES "public"."learning_objective"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_record" ADD CONSTRAINT "import_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_consumed_by_user_id_fk" FOREIGN KEY ("consumed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_evidence" ADD CONSTRAINT "issue_evidence_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_objective" ADD CONSTRAINT "learning_objective_cycle_id_training_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_preference" ADD CONSTRAINT "learning_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_slot" ADD CONSTRAINT "learning_slot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD CONSTRAINT "lesson_plan_cycle_id_training_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mixed_review_task" ADD CONSTRAINT "mixed_review_task_source_cycle_id_training_cycle_id_fk" FOREIGN KEY ("source_cycle_id") REFERENCES "public"."training_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mixed_review_task" ADD CONSTRAINT "mixed_review_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_route" ADD CONSTRAINT "model_route_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_route" ADD CONSTRAINT "model_route_provider_connection_id_provider_connection_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_route" ADD CONSTRAINT "model_route_fallback_provider_connection_id_provider_connection_id_fk" FOREIGN KEY ("fallback_provider_connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewrite_task" ADD CONSTRAINT "rewrite_task_cycle_id_training_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewrite_task" ADD CONSTRAINT "rewrite_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence_event" ADD CONSTRAINT "skill_evidence_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence_event" ADD CONSTRAINT "skill_evidence_event_cycle_id_training_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycle" ADD CONSTRAINT "training_cycle_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycle" ADD CONSTRAINT "training_cycle_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_task" ADD CONSTRAINT "transfer_task_source_cycle_id_training_cycle_id_fk" FOREIGN KEY ("source_cycle_id") REFERENCES "public"."training_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_task" ADD CONSTRAINT "transfer_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_task" ADD CONSTRAINT "transfer_task_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_task" ADD CONSTRAINT "transfer_task_objective_id_learning_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objective"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_state" ADD CONSTRAINT "user_skill_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_attempt" ADD CONSTRAINT "writing_attempt_cycle_id_training_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_attempt" ADD CONSTRAINT "writing_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_attempt_revision" ADD CONSTRAINT "writing_attempt_revision_attempt_id_writing_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."writing_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_owner_idempotency_unique" ON "ai_job" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_job_status_available_idx" ON "ai_job" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_attempt_unique" ON "assessment" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "audit_event_time_idx" ON "audit_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_attempt_unique" ON "evaluation" USING btree ("exercise_attempt_id");--> statement-breakpoint
CREATE INDEX "exercise_attempt_item_user_idx" ON "exercise_attempt" USING btree ("exercise_item_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_item_lesson_ordinal_unique" ON "exercise_item" USING btree ("lesson_plan_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "import_record_user_bundle_unique" ON "import_record" USING btree ("user_id","bundle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_token_digest_unique" ON "invitation" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "issue_evidence_assessment_idx" ON "issue_evidence" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_objective_cycle_role_unique" ON "learning_objective" USING btree ("cycle_id","role");--> statement-breakpoint
CREATE INDEX "learning_objective_cycle_idx" ON "learning_objective" USING btree ("cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_slot_unique" ON "learning_slot" USING btree ("user_id","weekday","local_time");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_plan_cycle_unique" ON "lesson_plan" USING btree ("cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mixed_review_cycle_unique" ON "mixed_review_task" USING btree ("source_cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_route_owner_task_unique" ON "model_route" USING btree ("owner_id","task_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe_unique" ON "notification" USING btree ("user_id","channel","dedupe_key");--> statement-breakpoint
CREATE INDEX "provider_owner_idx" ON "provider_connection" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_external_id_unique" ON "question" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "question_taxonomy_idx" ON "question" USING btree ("question_type","topic");--> statement-breakpoint
CREATE UNIQUE INDEX "rewrite_task_cycle_unique" ON "rewrite_task" USING btree ("cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_evidence_source_unique" ON "skill_evidence_event" USING btree ("source_type","source_id","evidence_stage");--> statement-breakpoint
CREATE INDEX "skill_evidence_user_skill_time_idx" ON "skill_evidence_event" USING btree ("user_id","skill_id","occurred_at");--> statement-breakpoint
CREATE INDEX "training_cycle_user_status_idx" ON "training_cycle" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "transfer_task_user_available_idx" ON "transfer_task" USING btree ("user_id","status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "writing_attempt_cycle_kind_unique" ON "writing_attempt" USING btree ("cycle_id","kind");--> statement-breakpoint
CREATE INDEX "writing_attempt_user_idx" ON "writing_attempt" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "writing_revision_canonical_unique" ON "writing_attempt_revision" USING btree ("attempt_id","revision") WHERE "writing_attempt_revision"."branch" = 'canonical';--> statement-breakpoint
CREATE INDEX "writing_revision_attempt_idx" ON "writing_attempt_revision" USING btree ("attempt_id","created_at");