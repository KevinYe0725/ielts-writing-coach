ALTER TABLE "assessment" ADD COLUMN "portable_contract" jsonb;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "instructions" text DEFAULT 'Write at least 250 words. Give reasons for your answer and include relevant examples.' NOT NULL;--> statement-breakpoint
ALTER TABLE "rewrite_task" ADD COLUMN "contract_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "training_cycle" ADD COLUMN "bundle_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_cycle" ADD COLUMN "bundle_parent_revision" integer;--> statement-breakpoint
ALTER TABLE "training_cycle" ADD COLUMN "bundle_content_hash" text;--> statement-breakpoint
ALTER TABLE "training_cycle" ADD COLUMN "bundle_entity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "training_cycle" ADD COLUMN "bundle_conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_task" ADD COLUMN "contract_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transfer_task" ADD COLUMN "natural_opportunity_definition" text DEFAULT 'Apply the target independently in a fresh Task 2 context without a direct target prompt.' NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_task" ADD COLUMN "no_hint_required" boolean DEFAULT true NOT NULL;