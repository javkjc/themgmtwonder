CREATE TABLE "attachment_ocr_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"extracted_text" text NOT NULL,
	"metadata" text,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	FOREIGN KEY ("attachment_id") REFERENCES "attachments" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "attachment_ocr_outputs_attachment_id_idx" ON "attachment_ocr_outputs" ("attachment_id");
CREATE INDEX "attachment_ocr_outputs_status_idx" ON "attachment_ocr_outputs" ("status");
