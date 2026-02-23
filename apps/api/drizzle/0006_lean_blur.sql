ALTER TABLE "attachment_ocr_outputs" ADD COLUMN "document_type_id" uuid;--> statement-breakpoint
ALTER TABLE "attachment_ocr_outputs" ADD COLUMN "extraction_path" text;--> statement-breakpoint
ALTER TABLE "attachment_ocr_outputs" ADD COLUMN "preprocessing_applied" jsonb;--> statement-breakpoint
ALTER TABLE "attachment_ocr_outputs" ADD COLUMN "overall_confidence" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "attachment_ocr_outputs" ADD COLUMN "processing_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN "confidence_score" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN "zone" text;--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN "bounding_box" jsonb;--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN "extraction_method" text;--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN "llm_reviewed" boolean;--> statement-breakpoint
ALTER TABLE "baseline_field_assignments" ADD COLUMN "llm_reasoning" text;--> statement-breakpoint
ALTER TABLE "attachment_ocr_outputs" ADD CONSTRAINT "attachment_ocr_outputs_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE set null ON UPDATE no action;