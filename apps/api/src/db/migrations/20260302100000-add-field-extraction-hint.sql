-- Forward Migration: Add extraction_hint column to field_library
ALTER TABLE "field_library" ADD COLUMN IF NOT EXISTS "extraction_hint" text;
