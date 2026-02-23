CREATE TABLE "ml_training_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"trigger_type" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_end" timestamp NOT NULL,
	"qualified_correction_count" integer NOT NULL,
	"candidate_version" text,
	"model_path" text,
	"metrics" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "ml_training_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_success_assigned_at" timestamp,
	"last_attempt_at" timestamp,
	"last_attempt_through" timestamp
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme_preference" text DEFAULT 'light' NOT NULL;--> statement-breakpoint
CREATE INDEX "ml_training_jobs_status_started_idx" ON "ml_training_jobs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "ml_training_jobs_trigger_started_idx" ON "ml_training_jobs" USING btree ("trigger_type","started_at");