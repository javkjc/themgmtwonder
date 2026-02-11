-- Forward Migration: Add ML Suggestion Metadata to Baseline Field Assignments
ALTER TABLE "baseline_field_assignments"
    ADD COLUMN IF NOT EXISTS "suggestion_confidence" DECIMAL(3,2),
    ADD COLUMN IF NOT EXISTS "suggestion_accepted" BOOLEAN,
    ADD COLUMN IF NOT EXISTS "model_version_id" uuid REFERENCES "ml_model_versions"("id");

CREATE INDEX IF NOT EXISTS "idx_baseline_field_assignments_model_version_id"
    ON "baseline_field_assignments" USING btree ("model_version_id");
