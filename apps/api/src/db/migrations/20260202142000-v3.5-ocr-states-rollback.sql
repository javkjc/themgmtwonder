-- Rollback v3.5 OCR state machine migration: restore original schema

-- Drop indexes introduced by the migration (no-op if missing)
DROP INDEX IF EXISTS idx_ocr_utilization;
DROP INDEX IF EXISTS idx_ocr_attachment_status;
DROP INDEX IF EXISTS idx_ocr_status;

-- Remove archive tracking columns first
ALTER TABLE attachment_ocr_outputs
  DROP COLUMN IF EXISTS archive_reason,
  DROP COLUMN IF EXISTS archived_by,
  DROP COLUMN IF EXISTS archived_at;

-- Remove utilization tracking columns
ALTER TABLE attachment_ocr_outputs
  DROP COLUMN IF EXISTS utilization_metadata,
  DROP COLUMN IF EXISTS utilization_type,
  DROP COLUMN IF EXISTS utilized_at;

-- Remove confirmation tracking columns
ALTER TABLE attachment_ocr_outputs
  DROP COLUMN IF EXISTS confirmed_by,
  DROP COLUMN IF EXISTS confirmed_at;

-- Remove the draft/confirmed/archived business status
ALTER TABLE attachment_ocr_outputs
  DROP COLUMN IF EXISTS status;

-- Restore processing_status back to status if applicable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'attachment_ocr_outputs'
      AND column_name = 'processing_status'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'attachment_ocr_outputs'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE attachment_ocr_outputs RENAME COLUMN processing_status TO status;
  END IF;
END
$$;
