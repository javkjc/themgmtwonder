-- Rollback validation columns from baseline_field_assignments
ALTER TABLE baseline_field_assignments
DROP COLUMN IF EXISTS validation_valid,
DROP COLUMN IF EXISTS validation_error,
DROP COLUMN IF EXISTS validation_suggestion;
