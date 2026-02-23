CREATE TABLE "document_type_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type_id" uuid NOT NULL,
	"field_key" varchar(255) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"zone_hint" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_type_fields_unique" UNIQUE("document_type_id","field_key")
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "extraction_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_name" text NOT NULL,
	"architecture" text NOT NULL,
	"version" text NOT NULL,
	"file_path" text NOT NULL,
	"document_type_id" uuid,
	"metrics" jsonb NOT NULL,
	"trained_at" timestamp NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_models_model_name_version_unique" UNIQUE("model_name","version")
);
--> statement-breakpoint
CREATE TABLE "extraction_training_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baseline_id" uuid NOT NULL,
	"field_key" varchar(255) NOT NULL,
	"assigned_value" text NOT NULL,
	"zone" text,
	"bounding_box" jsonb,
	"extraction_method" text NOT NULL,
	"confidence" numeric(5, 4),
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"trigger_type" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_end" timestamp NOT NULL,
	"qualified_example_count" integer NOT NULL,
	"candidate_version" text NOT NULL,
	"model_path" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "document_type_fields" ADD CONSTRAINT "document_type_fields_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_type_fields" ADD CONSTRAINT "document_type_fields_field_key_field_library_field_key_fk" FOREIGN KEY ("field_key") REFERENCES "public"."field_library"("field_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_models" ADD CONSTRAINT "extraction_models_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_training_examples" ADD CONSTRAINT "extraction_training_examples_baseline_id_extraction_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."extraction_baselines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_training_examples" ADD CONSTRAINT "extraction_training_examples_field_key_field_library_field_key_fk" FOREIGN KEY ("field_key") REFERENCES "public"."field_library"("field_key") ON DELETE no action ON UPDATE no action;