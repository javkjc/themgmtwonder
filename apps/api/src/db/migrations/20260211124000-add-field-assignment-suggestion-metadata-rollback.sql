-- Rollback Field Assignment Suggestion Metadata
DROP INDEX IF EXISTS "idx_baseline_field_assignments_model_version_id";

ALTER TABLE "baseline_field_assignments"
    DROP COLUMN IF EXISTS "model_version_id",
    DROP COLUMN IF EXISTS "suggestion_accepted",
    DROP COLUMN IF EXISTS "suggestion_confidence";
