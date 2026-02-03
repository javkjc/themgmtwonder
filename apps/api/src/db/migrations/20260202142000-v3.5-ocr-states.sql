-- v3.5 migration: introduce OCR state machine tracking columns and indexes

-- Rename existing worker-driven status column to processing_status (idempotent check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'attachment_ocr_outputs'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE attachment_ocr_outputs RENAME COLUMN status TO processing_status;
  END IF;
END
$$;

-- Add new business-facing status (draft/confirmed/archived) with constraint and default
ALTER TABLE attachment_ocr_outputs
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'confirmed', 'archived'));

-- Grandfather existing completed OCR results as confirmed
UPDATE attachment_ocr_outputs
SET status = 'confirmed'
WHERE processing_status = 'completed'
  AND status IS DISTINCT FROM 'confirmed';

-- Confirmation tracking
ALTER TABLE attachment_ocr_outputs
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id);

-- Utilization tracking
ALTER TABLE attachment_ocr_outputs
  ADD COLUMN IF NOT EXISTS utilized_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS utilization_type VARCHAR(30) NULL CHECK (utilization_type IN ('authoritative_record', 'workflow_approval', 'data_export')),
  ADD COLUMN IF NOT EXISTS utilization_metadata JSONB NULL;

-- Archive tracking
ALTER TABLE attachment_ocr_outputs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS archive_reason TEXT NULL;

-- Indexes for the new state machine
CREATE INDEX IF NOT EXISTS idx_ocr_status ON attachment_ocr_outputs(status);
CREATE INDEX IF NOT EXISTS idx_ocr_attachment_status ON attachment_ocr_outputs(attachment_id, status);
CREATE INDEX IF NOT EXISTS idx_ocr_utilization ON attachment_ocr_outputs(utilization_type)
  WHERE utilization_type IS NOT NULL;
