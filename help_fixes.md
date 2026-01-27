# Help — Manual DB Fixes (Missing Tables / Columns)

This document contains manual recovery commands to repair a local PostgreSQL schema
when migrations were skipped, Docker volumes were reset, or the DB is out of sync
with the codebase.

These commands are NOT a replacement for migrations.
They exist solely as a last-resort, local/dev recovery toolkit.

================================================================================
SAFETY RULES (READ FIRST)
================================================================================
- Run commands ONE AT A TIME
- Verify DB name and user before executing
- Stop immediately if results look unexpected
- Intended for local / development only
- Prefer migrations whenever possible

================================================================================
1) DISCOVER AUTHORITATIVE DB NAME AND USER
================================================================================
docker compose exec db printenv | findstr POSTGRES_

You should see:
- POSTGRES_USER
- POSTGRES_DB

Use those values consistently below.

================================================================================
2) INSPECT CURRENT SCHEMA (SANITY CHECKS)
================================================================================
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "\dt"

docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "\d todos"

================================================================================
3) FIX — TASK STAGES COLUMN (v3 7.1)
================================================================================
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "ALTER TABLE todos ADD COLUMN IF NOT EXISTS stage_key text;"

docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "UPDATE todos SET stage_key = 'backlog' WHERE stage_key IS NULL;"

docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "ALTER TABLE todos ALTER COLUMN stage_key SET DEFAULT 'backlog';"

================================================================================
4) FIX — STAGE-AWARE CONTENT TAGGING (v3 7.2)
================================================================================
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "ALTER TABLE attachments ADD COLUMN IF NOT EXISTS stage_key_at_creation text;"

docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "ALTER TABLE remarks ADD COLUMN IF NOT EXISTS stage_key_at_creation text;"

================================================================================
5) FIX — OCR DERIVED OUTPUTS TABLE (v3 7.4a PREREQUISITE)
================================================================================
OCR outputs are:
- derived-only
- immutable
- insert-only
- never authoritative

ENABLE UUID GENERATION (IF MISSING)
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

CREATE OCR OUTPUTS TABLE
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "CREATE TABLE IF NOT EXISTS attachment_ocr_outputs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE, extracted_text text NOT NULL, metadata jsonb NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now() );"

ADD INDEXES
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "CREATE INDEX IF NOT EXISTS idx_attachment_ocr_outputs_attachment_id ON attachment_ocr_outputs(attachment_id);"

docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "CREATE INDEX IF NOT EXISTS idx_attachment_ocr_outputs_created_at ON attachment_ocr_outputs(created_at);"

OPTIONAL: RESTRICT ALLOWED STATUS VALUES
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "ALTER TABLE attachment_ocr_outputs ADD CONSTRAINT IF NOT EXISTS attachment_ocr_outputs_status_check CHECK (status IN ('complete','failed'));"

================================================================================
6) RESTART API AFTER SCHEMA REPAIR
================================================================================
docker compose restart api

================================================================================
7) VERIFICATION QUERIES
================================================================================
VERIFY STAGE-RELATED COLUMNS
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "SELECT table_name, column_name, column_default FROM information_schema.columns WHERE table_name IN ('todos','attachments','remarks') AND column_name LIKE 'stage_key%';"

VERIFY OCR TABLE EXISTS
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "\d attachment_ocr_outputs"

VERIFY OCR DATA PRESENCE
docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "SELECT id, status, length(extracted_text) AS text_len, created_at FROM attachment_ocr_outputs ORDER BY created_at DESC LIMIT 5;"
