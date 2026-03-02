-- Rollback Migration: Remove extraction_hint column from field_library
ALTER TABLE "field_library" DROP COLUMN IF EXISTS "extraction_hint";
