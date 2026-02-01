-- v6: Add workflow element templates (reusable building blocks)
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_element_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "workflow_element_templates_element_type_idx" ON "workflow_element_templates" USING btree ("element_type");--> statement-breakpoint
CREATE INDEX "workflow_element_templates_group_idx" ON "workflow_element_templates" USING btree ("template_group_id");--> statement-breakpoint
CREATE INDEX "workflow_element_templates_group_version_idx" ON "workflow_element_templates" USING btree ("template_group_id","template_version");--> statement-breakpoint
CREATE INDEX "workflow_element_templates_deprecated_idx" ON "workflow_element_templates" USING btree ("is_deprecated");--> statement-breakpoint

-- v6: Add element template reference to workflow steps
ALTER TABLE "workflow_steps" ADD COLUMN "element_template_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD COLUMN "element_template_version" integer;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD COLUMN "instance_config" text;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_element_template_id_workflow_element_templates_id_fk" FOREIGN KEY ("element_template_id") REFERENCES "public"."workflow_element_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_steps_element_template_id_idx" ON "workflow_steps" USING btree ("element_template_id");
