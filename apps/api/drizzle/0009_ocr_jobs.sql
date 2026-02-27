CREATE TABLE IF NOT EXISTS "ocr_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL REFERENCES "attachments"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"status" varchar(30) NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"dismissed_at" timestamp,
	"error" text,
	"output_id" uuid REFERENCES "attachment_ocr_outputs"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ocr_jobs_user_status" ON "ocr_jobs" ("user_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ocr_jobs_status_requested" ON "ocr_jobs" ("status","requested_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ocr_jobs_attachment_id" ON "ocr_jobs" ("attachment_id");
