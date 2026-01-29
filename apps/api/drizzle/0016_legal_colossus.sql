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
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_workflow_step_id_workflow_steps_id_fk" FOREIGN KEY ("workflow_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_executions_workflow_def_id_idx" ON "workflow_executions" USING btree ("workflow_definition_id");--> statement-breakpoint
CREATE INDEX "workflow_executions_triggered_by_idx" ON "workflow_executions" USING btree ("triggered_by");--> statement-breakpoint
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_executions_created_at_idx" ON "workflow_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_executions_resource_idx" ON "workflow_executions" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "workflow_step_executions_execution_id_idx" ON "workflow_step_executions" USING btree ("workflow_execution_id");--> statement-breakpoint
CREATE INDEX "workflow_step_executions_step_id_idx" ON "workflow_step_executions" USING btree ("workflow_step_id");--> statement-breakpoint
CREATE INDEX "workflow_step_executions_actor_id_idx" ON "workflow_step_executions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "workflow_step_executions_created_at_idx" ON "workflow_step_executions" USING btree ("created_at");