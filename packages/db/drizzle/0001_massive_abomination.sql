ALTER TABLE "evaluation" ADD COLUMN "response_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "evaluation" ADD COLUMN "dimension_scores" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation" ADD COLUMN "user_answer_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation" ADD COLUMN "most_important_suggestion" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation" ADD COLUMN "adjudication_status" text DEFAULT 'ACCEPTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation" ADD COLUMN "supersedes_evaluation_id" uuid;--> statement-breakpoint
ALTER TABLE "exercise_attempt" ADD COLUMN "schema_version" text DEFAULT '1.0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_attempt" ADD COLUMN "first_attempt_event_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_attempt" ADD COLUMN "final_attempt_event_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_attempt" ADD COLUMN "contract_attempts" jsonb NOT NULL;