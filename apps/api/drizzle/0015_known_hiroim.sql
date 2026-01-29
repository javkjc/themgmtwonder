CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_definitions_name_idx" ON "workflow_definitions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "workflow_definitions_active_idx" ON "workflow_definitions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "workflow_steps_workflow_def_id_idx" ON "workflow_steps" USING btree ("workflow_definition_id");--> statement-breakpoint
CREATE INDEX "workflow_steps_workflow_def_order_idx" ON "workflow_steps" USING btree ("workflow_definition_id","step_order");