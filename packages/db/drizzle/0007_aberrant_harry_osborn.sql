ALTER TABLE "evaluation" ADD COLUMN "ai_job_id" uuid;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_ai_job_id_ai_job_id_fk" FOREIGN KEY ("ai_job_id") REFERENCES "public"."ai_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_ai_job_unique" ON "evaluation" USING btree ("ai_job_id");