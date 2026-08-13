DROP INDEX "mixed_review_target_cycle_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "mixed_review_target_cycle_unique" ON "mixed_review_task" USING btree ("user_id","target_cycle_id");