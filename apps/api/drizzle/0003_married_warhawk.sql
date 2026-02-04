CREATE TYPE "public"."field_character_type" AS ENUM('varchar', 'int', 'decimal', 'date', 'currency');--> statement-breakpoint
CREATE TYPE "public"."field_status" AS ENUM('active', 'hidden', 'archived');--> statement-breakpoint
CREATE TABLE "field_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_key" varchar(255) NOT NULL,
	"label" varchar(255) NOT NULL,
	"character_type" "field_character_type" NOT NULL,
	"character_limit" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "field_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_key_unique" UNIQUE("field_key")
);
--> statement-breakpoint
ALTER TABLE "field_library" ADD CONSTRAINT "field_library_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "field_library_status_idx" ON "field_library" USING btree ("status");--> statement-breakpoint
CREATE INDEX "field_library_created_by_idx" ON "field_library" USING btree ("created_by");