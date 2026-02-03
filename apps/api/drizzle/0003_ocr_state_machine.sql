-- v3.5 migration: introduce OCR lifecycle columns and indexes

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'attachment_ocr_outputs'
      AND column_name = 'status'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'attachment_ocr_outputs'
          AND column_name = 'processing_status'
      )
  ) THEN
    ALTER TABLE attachment_ocr_outputs RENAME COLUMN status TO processing_status;
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE attachment_ocr_outputs
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft' NOT NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id),
  ADD CONSTRAINT IF NOT EXISTS attachment_ocr_outputs_status_check CHECK (status IN ('draft', 'confirmed', 'archived'));
--> statement-breakpoint
UPDATE attachment_ocr_outputs
SET status = 'confirmed'
WHERE processing_status = 'completed'
  AND (status IS DISTINCT FROM 'confirmed' OR status IS NULL);
--> statement-breakpoint
ALTER TABLE attachment_ocr_outputs
  ADD COLUMN IF NOT EXISTS utilized_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS utilization_type VARCHAR(30) NULL CHECK (utilization_type IN ('authoritative_record', 'workflow_approval', 'data_export')),
  ADD COLUMN IF NOT EXISTS utilization_metadata JSONB NULL;
--> statement-breakpoint
ALTER TABLE attachment_ocr_outputs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS archive_reason TEXT NULL;
--> statement-breakpoint
ALTER TABLE attachment_ocr_outputs
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ocr_status ON attachment_ocr_outputs(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ocr_attachment_status ON attachment_ocr_outputs(attachment_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ocr_utilization ON attachment_ocr_outputs(utilization_type) WHERE utilization_type IS NOT NULL;
