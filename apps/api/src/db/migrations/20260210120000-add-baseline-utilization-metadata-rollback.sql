-- Rollback utilization_metadata column from extraction_baselines
DROP INDEX IF EXISTS idx_baseline_utilization_metadata;

ALTER TABLE extraction_baselines
  DROP COLUMN IF EXISTS utilization_metadata;
