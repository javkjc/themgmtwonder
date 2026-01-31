-- v6: Add workflow versioning support (grouping + activation control)
ALTER TABLE "workflow_definitions" ALTER COLUMN "is_active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "workflow_group_id" uuid;--> statement-breakpoint
-- Backfill existing workflows: set workflowGroupId to self (their own ID)
UPDATE "workflow_definitions" SET "workflow_group_id" = "id" WHERE "workflow_group_id" IS NULL;--> statement-breakpoint
CREATE INDEX "workflow_definitions_group_idx" ON "workflow_definitions" USING btree ("workflow_group_id");--> statement-breakpoint
CREATE INDEX "workflow_definitions_group_version_idx" ON "workflow_definitions" USING btree ("workflow_group_id","version");
