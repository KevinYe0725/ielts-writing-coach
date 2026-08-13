CREATE TABLE "worker_heartbeat" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"application_version" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "worker_heartbeat_freshness_idx" ON "worker_heartbeat" USING btree ("last_heartbeat_at");