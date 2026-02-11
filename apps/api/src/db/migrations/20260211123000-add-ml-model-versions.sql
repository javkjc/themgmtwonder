-- Forward Migration: Add ML Model Versions
CREATE TABLE IF NOT EXISTS "ml_model_versions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "model_name" text NOT NULL,
    "version" text NOT NULL,
    "file_path" text NOT NULL,
    "metrics" jsonb,
    "trained_at" timestamp DEFAULT now() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_by" text,
    CONSTRAINT "ml_model_versions_model_name_version_unique" UNIQUE("model_name","version")
);

CREATE INDEX IF NOT EXISTS "ml_model_versions_is_active_idx"
    ON "ml_model_versions" USING btree ("is_active");
