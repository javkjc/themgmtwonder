-- Forward Migration: Add Table Data Model
CREATE TABLE "baseline_tables" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "baseline_id" uuid NOT NULL,
    "table_index" integer NOT NULL,
    "table_label" text,
    "status" varchar(20) DEFAULT 'draft' NOT NULL,
    "row_count" integer DEFAULT 0 NOT NULL,
    "column_count" integer DEFAULT 0 NOT NULL,
    "confirmed_at" timestamp,
    "confirmed_by" uuid,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "baseline_table_unique" UNIQUE("baseline_id","table_index")
);

CREATE TABLE "baseline_table_cells" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "table_id" uuid NOT NULL,
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

CREATE TABLE "baseline_table_column_mappings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "table_id" uuid NOT NULL,
    "column_index" integer NOT NULL,
    "field_key" varchar(255) NOT NULL,
    CONSTRAINT "baseline_table_column_mapping_unique" UNIQUE("table_id","column_index")
);

-- Foreign Keys
ALTER TABLE "baseline_tables" ADD CONSTRAINT "baseline_tables_baseline_id_extraction_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."extraction_baselines"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "baseline_tables" ADD CONSTRAINT "baseline_tables_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "baseline_table_cells" ADD CONSTRAINT "baseline_table_cells_table_id_baseline_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."baseline_tables"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "baseline_table_column_mappings" ADD CONSTRAINT "baseline_table_column_mappings_table_id_baseline_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."baseline_tables"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "baseline_table_column_mappings" ADD CONSTRAINT "baseline_table_column_mappings_field_key_field_library_field_key_fk" FOREIGN KEY ("field_key") REFERENCES "public"."field_library"("field_key") ON DELETE no action ON UPDATE no action;

-- Indexes
CREATE INDEX "idx_baseline_table_cells_validation" ON "baseline_table_cells" USING btree ("table_id", "validation_status");
CREATE INDEX "idx_baseline_table_column_mappings_table_id" ON "baseline_table_column_mappings" USING btree ("table_id");
