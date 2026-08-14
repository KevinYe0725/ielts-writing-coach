CREATE TABLE "teaching_practice_response" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lesson_plan_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"submitted_answer" text NOT NULL,
	"response_mode" text NOT NULL,
	"status" text NOT NULL,
	"ai_job_id" uuid,
	"analysis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teaching_practice_response" ADD CONSTRAINT "teaching_practice_response_lesson_plan_id_lesson_plan_id_fk" FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_practice_response" ADD CONSTRAINT "teaching_practice_response_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_practice_response" ADD CONSTRAINT "teaching_practice_response_ai_job_id_ai_job_id_fk" FOREIGN KEY ("ai_job_id") REFERENCES "public"."ai_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_practice_response_prompt_unique" ON "teaching_practice_response" USING btree ("lesson_plan_id","user_id","prompt_id");