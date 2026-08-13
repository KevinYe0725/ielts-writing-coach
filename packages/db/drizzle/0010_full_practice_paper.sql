ALTER TABLE "lesson_plan" ADD COLUMN "practice_format" text DEFAULT 'TIMED_PAPER_V2' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "paper_content" jsonb;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "paper_answers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "paper_result" jsonb;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "paper_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "paper_evaluation_job_id" uuid;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD CONSTRAINT "lesson_plan_paper_evaluation_job_id_ai_job_id_fk" FOREIGN KEY ("paper_evaluation_job_id") REFERENCES "public"."ai_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "lesson_plan" SET "practice_format" = 'LEGACY_INTERACTIVE_V1' WHERE "paper_content" IS NULL;
