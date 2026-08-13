ALTER TABLE "lesson_plan" ADD COLUMN "runtime_status" text DEFAULT 'READY' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "active_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "timebox_expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "elapsed_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "productive_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "runtime_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_plan" ADD COLUMN "runtime_state" jsonb DEFAULT '{"split":"NONE","refresher":"NOT_REQUIRED"}'::jsonb NOT NULL;