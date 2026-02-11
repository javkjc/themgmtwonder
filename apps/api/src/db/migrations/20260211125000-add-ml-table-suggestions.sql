-- Forward Migration: Add ML Table Suggestions Table
CREATE TABLE IF NOT EXISTS "ml_table_suggestions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "attachment_id" uuid NOT NULL REFERENCES "attachments"("id") ON DELETE CASCADE,
    "region_id" uuid,
    "row_count" integer NOT NULL,
    "column_count" integer NOT NULL,
    "confidence" numeric(5, 4),
    "bounding_box" jsonb,
    "cell_mapping" jsonb,
    "suggested_label" text,
    "status" varchar(20) DEFAULT 'pending' NOT NULL,
    "suggested_at" timestamp DEFAULT now() NOT NULL,
    "ignored_at" timestamp,
    "converted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_ml_table_suggestions_attachment_status" 
    ON "ml_table_suggestions" USING btree ("attachment_id", "status");
