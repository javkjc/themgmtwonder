CREATE TYPE "public"."baseline_status" AS ENUM('draft', 'reviewed', 'confirmed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."baseline_utilization_type" AS ENUM('record_created', 'process_committed', 'data_exported');--> statement-breakpoint
CREATE TYPE "public"."field_character_type" AS ENUM('varchar', 'int', 'decimal', 'date', 'currency');--> statement-breakpoint
CREATE TYPE "public"."field_status" AS ENUM('active', 'hidden', 'archived');--> statement-breakpoint
CREATE TABLE "attachment_ocr_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"extracted_text" text NOT NULL,
	"metadata" text,
	"processing_status" text NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"confirmed_at" timestamp,
	"confirmed_by" uuid,
	"utilized_at" timestamp,
	"utilization_type" varchar(30),
	"utilization_metadata" jsonb,
	"archived_at" timestamp,
	"archived_by" uuid,
	"archive_reason" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"stored_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"stage_key_at_creation" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"actor_type" text DEFAULT 'user' NOT NULL,
	"action" text NOT NULL,
	"module" text,
	"resource_type" text,
	"resource_id" text,
	"details" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baseline_field_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baseline_id" uuid NOT NULL,
	"field_key" varchar(255) NOT NULL,
	"assigned_value" text,
	"source_segment_id" uuid,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"corrected_from" text,
	"correction_reason" text,
	CONSTRAINT "baseline_field_unique" UNIQUE("baseline_id","field_key")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_text_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_ocr_output_id" uuid NOT NULL,
	"text" text NOT NULL,
	"confidence" numeric(5, 4),
	"bounding_box" jsonb,
	"page_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ocr_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ocr_result_id" uuid NOT NULL,
	"corrected_by" uuid NOT NULL,
	"original_value" text,
	"corrected_value" text NOT NULL,
	"correction_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ocr_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_ocr_output_id" uuid NOT NULL,
	"field_name" varchar(255) NOT NULL,
	"field_type" varchar(20) DEFAULT 'text' NOT NULL,
	"field_value" text,
	"confidence" numeric(5, 4),
	"bounding_box" jsonb,
	"page_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"stage_key_at_creation" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"default_duration_min" integer DEFAULT 30 NOT NULL,
	"min_duration_min" integer DEFAULT 5 NOT NULL,
	"max_duration_min" integer DEFAULT 1440 NOT NULL,
	"working_hours" text,
	"working_days" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text,
	"title" text NOT NULL,
	"description" text,
	"done" boolean DEFAULT false NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_date" timestamp,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"start_at" timestamp,
	"unscheduled_at" timestamp,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"stage_key" text DEFAULT 'backlog' NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"lock_until" timestamp,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
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
CREATE TABLE "field_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_key" varchar(255) NOT NULL,
	"label" varchar(255) NOT NULL,
	"character_type" "field_character_type" NOT NULL,
	"character_limit" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "field_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_key_unique" UNIQUE("field_key")
);
--> statement-breakpoint
ALTER TABLE "attachment_ocr_outputs" ADD CONSTRAINT "attachment_ocr_outputs_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_ocr_outputs" ADD CONSTRAINT "attachment_ocr_outputs_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_ocr_outputs" ADD CONSTRAINT "attachment_ocr_outputs_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD CONSTRAINT "baseline_field_assignments_baseline_id_extraction_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."extraction_baselines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD CONSTRAINT "baseline_field_assignments_field_key_field_library_field_key_fk" FOREIGN KEY ("field_key") REFERENCES "public"."field_library"("field_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD CONSTRAINT "baseline_field_assignments_source_segment_id_extracted_text_segments_id_fk" FOREIGN KEY ("source_segment_id") REFERENCES "public"."extracted_text_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD CONSTRAINT "baseline_field_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_text_segments" ADD CONSTRAINT "extracted_text_segments_attachment_ocr_output_id_attachment_ocr_outputs_id_fk" FOREIGN KEY ("attachment_ocr_output_id") REFERENCES "public"."attachment_ocr_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocr_corrections" ADD CONSTRAINT "ocr_corrections_ocr_result_id_ocr_results_id_fk" FOREIGN KEY ("ocr_result_id") REFERENCES "public"."ocr_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocr_corrections" ADD CONSTRAINT "ocr_corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocr_results" ADD CONSTRAINT "ocr_results_attachment_ocr_output_id_attachment_ocr_outputs_id_fk" FOREIGN KEY ("attachment_ocr_output_id") REFERENCES "public"."attachment_ocr_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarks" ADD CONSTRAINT "remarks_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarks" ADD CONSTRAINT "remarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_baselines" ADD CONSTRAINT "extraction_baselines_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_baselines" ADD CONSTRAINT "extraction_baselines_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_baselines" ADD CONSTRAINT "extraction_baselines_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_library" ADD CONSTRAINT "field_library_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_ocr_outputs_attachment_id_idx" ON "attachment_ocr_outputs" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "idx_ocr_status" ON "attachment_ocr_outputs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ocr_attachment_status" ON "attachment_ocr_outputs" USING btree ("attachment_id","status");--> statement-breakpoint
CREATE INDEX "idx_ocr_utilization" ON "attachment_ocr_outputs" USING btree ("utilization_type");--> statement-breakpoint
CREATE INDEX "attachments_todo_id_idx" ON "attachments" USING btree ("todo_id");--> statement-breakpoint
CREATE INDEX "attachments_user_id_idx" ON "attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_baseline_field_assignments_baseline_id" ON "baseline_field_assignments" USING btree ("baseline_id");--> statement-breakpoint
CREATE INDEX "idx_baseline_field_assignments_field_key" ON "baseline_field_assignments" USING btree ("field_key");--> statement-breakpoint
CREATE INDEX "idx_baseline_field_assignments_source_segment_id" ON "baseline_field_assignments" USING btree ("source_segment_id");--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "categories_user_name_idx" ON "categories" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "idx_extracted_text_segments_output_id" ON "extracted_text_segments" USING btree ("attachment_ocr_output_id");--> statement-breakpoint
CREATE INDEX "idx_ocr_corrections_ocr_result_id" ON "ocr_corrections" USING btree ("ocr_result_id");--> statement-breakpoint
CREATE INDEX "idx_ocr_corrections_corrected_by" ON "ocr_corrections" USING btree ("corrected_by");--> statement-breakpoint
CREATE INDEX "idx_ocr_corrections_created_at" ON "ocr_corrections" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ocr_results_output_id" ON "ocr_results" USING btree ("attachment_ocr_output_id");--> statement-breakpoint
CREATE INDEX "idx_ocr_results_field_name" ON "ocr_results" USING btree ("field_name");--> statement-breakpoint
CREATE INDEX "todos_user_id_idx" ON "todos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "todos_category_idx" ON "todos" USING btree ("category");--> statement-breakpoint
CREATE INDEX "todos_done_idx" ON "todos" USING btree ("done");--> statement-breakpoint
CREATE INDEX "todos_priority_idx" ON "todos" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "todos_due_date_idx" ON "todos" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "todos_scheduling_idx" ON "todos" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "todos_parent_id_idx" ON "todos" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "extraction_baselines_attachment_id_idx" ON "extraction_baselines" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "extraction_baselines_status_idx" ON "extraction_baselines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "field_library_status_idx" ON "field_library" USING btree ("status");--> statement-breakpoint
CREATE INDEX "field_library_created_by_idx" ON "field_library" USING btree ("created_by");