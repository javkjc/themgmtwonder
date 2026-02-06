-- Add validation columns to baseline_field_assignments
ALTER TABLE baseline_field_assignments
ADD COLUMN validation_valid boolean,
ADD COLUMN validation_error text,
ADD COLUMN validation_suggestion text;
