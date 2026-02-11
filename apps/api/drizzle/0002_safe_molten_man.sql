CREATE TABLE "ml_table_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"region_id" uuid,
	"row_count" integer NOT NULL,
	"column_count" integer NOT NULL,
	"confidence" numeric(5, 4),
	"bounding_box" jsonb,
	"cell_mapping" jsonb,
	"suggested_label" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"suggested_at" timestamp DEFAULT now() NOT NULL,
	"ignored_at" timestamp,
	"converted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN "suggestion_confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN "suggestion_accepted" boolean;--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN "model_version_id" uuid;--> statement-breakpoint
ALTER TABLE "ml_table_suggestions" ADD CONSTRAINT "ml_table_suggestions_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ml_table_suggestions_attachment_status" ON "ml_table_suggestions" USING btree ("attachment_id","status");--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD CONSTRAINT "baseline_field_assignments_model_version_id_ml_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."ml_model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_baseline_field_assignments_model_version_id" ON "baseline_field_assignments" USING btree ("model_version_id");