ALTER TABLE "baseline_field_assignments" ADD COLUMN IF NOT EXISTS "validation_valid" boolean;
--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN IF NOT EXISTS "validation_error" text;
--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN IF NOT EXISTS "validation_suggestion" text;
