-- Add utilization_metadata column to extraction_baselines
ALTER TABLE extraction_baselines
  ADD COLUMN IF NOT EXISTS utilization_metadata JSONB NULL;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_baseline_utilization_metadata
  ON extraction_baselines USING gin (utilization_metadata)
  WHERE utilization_metadata IS NOT NULL;
