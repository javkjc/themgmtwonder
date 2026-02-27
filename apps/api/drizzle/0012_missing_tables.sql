CREATE TABLE IF NOT EXISTS "baseline_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baseline_id" uuid NOT NULL REFERENCES "extraction_baselines"("id") ON DELETE CASCADE,
	"table_index" integer NOT NULL,
	"table_label" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"column_count" integer DEFAULT 0 NOT NULL,
	"confirmed_at" timestamp,
	"confirmed_by" uuid REFERENCES "users"("id"),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "baseline_table_unique" UNIQUE("baseline_id","table_index")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "baseline_table_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL REFERENCES "baseline_tables"("id") ON DELETE CASCADE,
	"row_index" integer NOT NULL,
	"column_index" integer NOT NULL,
	"cell_value" text,
	"validation_status" varchar(20) DEFAULT 'valid' NOT NULL,
	"error_text" text,
	"correction_from" text,
	"correction_reason" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "baseline_table_cell_unique" UNIQUE("table_id","row_index","column_index")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "baseline_table_column_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL REFERENCES "baseline_tables"("id") ON DELETE CASCADE,
	"column_index" integer NOT NULL,
	"field_key" varchar(255) NOT NULL REFERENCES "field_library"("field_key"),
	CONSTRAINT "baseline_table_column_mapping_unique" UNIQUE("table_id","column_index")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alias_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" text NOT NULL,
	"field_key" text NOT NULL,
	"raw_pattern" text NOT NULL,
	"corrected_value" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by" text,
	"correction_event_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "unique_vendor_pattern" UNIQUE("vendor_id","field_key","raw_pattern")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "correction_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" text NOT NULL,
	"field_key" text NOT NULL,
	"raw_ocr_value" text NOT NULL,
	"corrected_value" text NOT NULL,
	"baseline_id" uuid NOT NULL REFERENCES "extraction_baselines"("id"),
	"user_id" text NOT NULL,
	"corrected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "extraction_retry_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"baseline_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"failing_field_keys" text[] NOT NULL,
	"failing_y_min" numeric(6, 4) NOT NULL,
	"failing_y_max" numeric(6, 4) NOT NULL,
	"preliminary_values" jsonb NOT NULL,
	"final_values" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_baseline_table_cells_validation" ON "baseline_table_cells" ("table_id","validation_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_baseline_table_column_mappings_table_id" ON "baseline_table_column_mappings" ("table_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alias_rules_active" ON "alias_rules" ("vendor_id","status") WHERE status = 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_correction_events_lookup" ON "correction_events" ("vendor_id","field_key","raw_ocr_value");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_retry_status_pending" ON "extraction_retry_jobs" ("status") WHERE status = 'PENDING';
