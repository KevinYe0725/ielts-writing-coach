DROP INDEX "evaluation_attempt_unique";--> statement-breakpoint
CREATE INDEX "evaluation_attempt_idx" ON "evaluation" USING btree ("exercise_attempt_id");