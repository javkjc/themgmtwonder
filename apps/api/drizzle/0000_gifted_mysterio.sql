CREATE TABLE "attachment_ocr_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"extracted_text" text NOT NULL,
	"metadata" text,
	"status" text NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"stage_key_at_creation" text
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
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ocr_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_ocr_output_id" uuid NOT NULL,
	"field_name" varchar(255) NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"stage_key_at_creation" text
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"min_duration_min" integer DEFAULT 5 NOT NULL,
	"max_duration_min" integer DEFAULT 1440 NOT NULL,
	"default_duration_min" integer DEFAULT 30 NOT NULL,
	"working_hours" text DEFAULT '{"start":"09:00","end":"17:00"}' NOT NULL,
	"working_days" text DEFAULT '[1,2,3,4,5]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"start_at" timestamp,
	"duration_min" integer,
	"category" text,
	"unscheduled_at" timestamp,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"stage_key" text DEFAULT 'backlog',
	"parent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"working_hours" text DEFAULT '{"start":"09:00","end":"17:00"}' NOT NULL,
	"working_days" text DEFAULT '[1,2,3,4,5]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"lock_until" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"workflow_group_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_element_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_version" integer DEFAULT 1 NOT NULL,
	"template_group_id" uuid,
	"element_type" text NOT NULL,
	"display_label" text NOT NULL,
	"step_type" text,
	"default_config" text,
	"editable_fields" text,
	"validation_constraints" text,
	"is_deprecated" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"triggered_by" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"inputs" text,
	"outputs" text,
	"error_details" text,
	"correlation_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_step_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_execution_id" uuid NOT NULL,
	"workflow_step_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"remark" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"step_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"assigned_to" text,
	"conditions" text,
	"element_template_id" uuid,
	"element_template_version" integer,
	"instance_config" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment_ocr_outputs" ADD CONSTRAINT "attachment_ocr_outputs_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocr_results" ADD CONSTRAINT "ocr_results_attachment_ocr_output_id_attachment_ocr_outputs_id_fk" FOREIGN KEY ("attachment_ocr_output_id") REFERENCES "public"."attachment_ocr_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarks" ADD CONSTRAINT "remarks_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarks" ADD CONSTRAINT "remarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_parent_id_todos_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."todos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_element_templates" ADD CONSTRAINT "workflow_element_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_workflow_step_id_workflow_steps_id_fk" FOREIGN KEY ("workflow_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_element_template_id_workflow_element_templates_id_fk" FOREIGN KEY ("element_template_id") REFERENCES "public"."workflow_element_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_ocr_outputs_attachment_id_idx" ON "attachment_ocr_outputs" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "attachment_ocr_outputs_status_idx" ON "attachment_ocr_outputs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "attachments_todo_id_idx" ON "attachments" USING btree ("todo_id");--> statement-breakpoint
CREATE INDEX "attachments_user_id_idx" ON "attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "categories_user_name_idx" ON "categories" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "idx_ocr_results_attachment_ocr_output_id" ON "ocr_results" USING btree ("attachment_ocr_output_id");--> statement-breakpoint
CREATE INDEX "idx_ocr_results_field_name" ON "ocr_results" USING btree ("field_name");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "remarks_todo_id_idx" ON "remarks" USING btree ("todo_id");--> statement-breakpoint
CREATE INDEX "remarks_todo_created_idx" ON "remarks" USING btree ("todo_id","created_at");--> statement-breakpoint
CREATE INDEX "todos_user_id_idx" ON "todos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "todos_user_done_idx" ON "todos" USING btree ("user_id","done");--> statement-breakpoint
CREATE INDEX "todos_user_created_at_idx" ON "todos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "todos_user_start_at_idx" ON "todos" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "todos_parent_id_idx" ON "todos" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "workflow_definitions_name_idx" ON "workflow_definitions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "workflow_definitions_active_idx" ON "workflow_definitions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "workflow_definitions_group_idx" ON "workflow_definitions" USING btree ("workflow_group_id");--> statement-breakpoint
CREATE INDEX "workflow_definitions_group_version_idx" ON "workflow_definitions" USING btree ("workflow_group_id","version");--> statement-breakpoint
CREATE INDEX "workflow_element_templates_element_type_idx" ON "workflow_element_templates" USING btree ("element_type");--> statement-breakpoint
CREATE INDEX "workflow_element_templates_group_idx" ON "workflow_element_templates" USING btree ("template_group_id");--> statement-breakpoint
CREATE INDEX "workflow_element_templates_group_version_idx" ON "workflow_element_templates" USING btree ("template_group_id","template_version");--> statement-breakpoint
CREATE INDEX "workflow_element_templates_deprecated_idx" ON "workflow_element_templates" USING btree ("is_deprecated");--> statement-breakpoint
CREATE INDEX "workflow_executions_workflow_def_id_idx" ON "workflow_executions" USING btree ("workflow_definition_id");--> statement-breakpoint
CREATE INDEX "workflow_executions_triggered_by_idx" ON "workflow_executions" USING btree ("triggered_by");--> statement-breakpoint
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_executions_created_at_idx" ON "workflow_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_executions_resource_idx" ON "workflow_executions" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "workflow_step_executions_execution_id_idx" ON "workflow_step_executions" USING btree ("workflow_execution_id");--> statement-breakpoint
CREATE INDEX "workflow_step_executions_step_id_idx" ON "workflow_step_executions" USING btree ("workflow_step_id");--> statement-breakpoint
CREATE INDEX "workflow_step_executions_actor_id_idx" ON "workflow_step_executions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "workflow_step_executions_created_at_idx" ON "workflow_step_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_steps_workflow_def_id_idx" ON "workflow_steps" USING btree ("workflow_definition_id");--> statement-breakpoint
CREATE INDEX "workflow_steps_workflow_def_order_idx" ON "workflow_steps" USING btree ("workflow_definition_id","step_order");--> statement-breakpoint
CREATE INDEX "workflow_steps_element_template_id_idx" ON "workflow_steps" USING btree ("element_template_id");