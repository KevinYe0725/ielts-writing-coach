CREATE TYPE "public"."question_generation_batch_mode" AS ENUM('WEB_RESEARCH', 'OFFLINE');--> statement-breakpoint
CREATE TYPE "public"."question_generation_batch_status" AS ENUM('QUEUED', 'SEARCHING', 'GENERATING', 'VALIDATING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."question_recommendation_action" AS ENUM('INITIAL', 'SWAP');--> statement-breakpoint
CREATE TYPE "public"."question_recommendation_status" AS ENUM('PENDING', 'READY', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."search_connection_kind" AS ENUM('BRAVE');--> statement-breakpoint
CREATE TYPE "public"."search_connection_status" AS ENUM('ACTIVE', 'INVALID', 'REVOKED');--> statement-breakpoint
CREATE TABLE "question_generation_batch" (
	"id" uuid PRIMARY KEY NOT NULL,
	"triggered_by_user_id" text,
	"status" "question_generation_batch_status" DEFAULT 'QUEUED' NOT NULL,
	"mode" "question_generation_batch_mode" NOT NULL,
	"target_mix" jsonb NOT NULL,
	"research_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_connection_id" uuid,
	"ai_job_id" uuid,
	"prompt_version" text NOT NULL,
	"rubric_version" text NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"safe_failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_generation_batch_research_sources_array_limit_check" CHECK (jsonb_typeof("question_generation_batch"."research_sources") = 'array' and jsonb_array_length("question_generation_batch"."research_sources") <= 40),
	CONSTRAINT "question_generation_batch_research_sources_payload_limit_check" CHECK (octet_length("question_generation_batch"."research_sources"::text) <= 262144)
);
--> statement-breakpoint
CREATE TABLE "question_recommendation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"question_external_id" text,
	"action" "question_recommendation_action" NOT NULL,
	"status" "question_recommendation_status" NOT NULL,
	"excluded_external_id" text,
	"shown_at" timestamp with time zone,
	"safe_failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_connection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"configured_by_user_id" text,
	"kind" "search_connection_kind" NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"encrypted_api_key_nonce" text NOT NULL,
	"encryption_key_version" integer NOT NULL,
	"status" "search_connection_status" DEFAULT 'ACTIVE' NOT NULL,
	"tested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "generation_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "question_generation_batch" ADD CONSTRAINT "question_generation_batch_triggered_by_user_id_user_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_generation_batch" ADD CONSTRAINT "question_generation_batch_search_connection_id_search_connection_id_fk" FOREIGN KEY ("search_connection_id") REFERENCES "public"."search_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_generation_batch" ADD CONSTRAINT "question_generation_batch_ai_job_id_ai_job_id_fk" FOREIGN KEY ("ai_job_id") REFERENCES "public"."ai_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_recommendation" ADD CONSTRAINT "question_recommendation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_connection" ADD CONSTRAINT "search_connection_configured_by_user_id_user_id_fk" FOREIGN KEY ("configured_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_generation_batch_status_idx" ON "question_generation_batch" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "question_recommendation_user_shown_idx" ON "question_recommendation" USING btree ("user_id","shown_at");--> statement-breakpoint
CREATE INDEX "question_recommendation_user_question_shown_idx" ON "question_recommendation" USING btree ("user_id","question_external_id","shown_at");--> statement-breakpoint
CREATE INDEX "question_recommendation_status_updated_idx" ON "question_recommendation" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "search_connection_status_idx" ON "search_connection" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "search_connection_selected_user_unique" ON "search_connection" USING btree ("configured_by_user_id") WHERE "search_connection"."status" in ('ACTIVE', 'INVALID');--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_generation_batch_id_question_generation_batch_id_fk" FOREIGN KEY ("generation_batch_id") REFERENCES "public"."question_generation_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_generated_owner_absent_check" CHECK ("question"."generation_batch_id" is null or "question"."owner_id" is null);
