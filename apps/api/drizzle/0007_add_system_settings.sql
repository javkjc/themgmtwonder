-- Add system_settings table (single row, id=1)
CREATE TABLE "system_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"min_duration_min" integer DEFAULT 5 NOT NULL,
	"max_duration_min" integer DEFAULT 1440 NOT NULL,
	"default_duration_min" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Ensure single row exists with default values
INSERT INTO "system_settings" ("id", "min_duration_min", "max_duration_min", "default_duration_min")
VALUES (1, 5, 1440, 30)
ON CONFLICT (id) DO NOTHING;
