CREATE TYPE "public"."baseline_status" AS ENUM('draft', 'reviewed', 'confirmed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."baseline_utilization_type" AS ENUM('record_created', 'workflow_committed', 'data_exported');--> statement-breakpoint
CREATE TABLE "extraction_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"status" "baseline_status" DEFAULT 'draft' NOT NULL,
	"confirmed_at" timestamp,
	"confirmed_by" uuid,
	"utilized_at" timestamp,
	"utilization_type" "baseline_utilization_type",
	"archived_at" timestamp,
	"archived_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extraction_baselines" ADD CONSTRAINT "extraction_baselines_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_baselines" ADD CONSTRAINT "extraction_baselines_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_baselines" ADD CONSTRAINT "extraction_baselines_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_baselines_attachment_id_idx" ON "extraction_baselines" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "extraction_baselines_status_idx" ON "extraction_baselines" USING btree ("status");