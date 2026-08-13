ALTER TABLE "mixed_review_task" ADD COLUMN "target_cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "mixed_review_task" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "mixed_review_task" ADD CONSTRAINT "mixed_review_task_target_cycle_id_training_cycle_id_fk" FOREIGN KEY ("target_cycle_id") REFERENCES "public"."training_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mixed_review_target_cycle_idx" ON "mixed_review_task" USING btree ("user_id","target_cycle_id");