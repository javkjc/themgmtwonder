CREATE TABLE "ocr_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ocr_result_id" uuid NOT NULL,
	"corrected_by" uuid NOT NULL,
	"original_value" text,
	"corrected_value" text NOT NULL,
	"correction_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ocr_corrections" ADD CONSTRAINT "ocr_corrections_ocr_result_id_ocr_results_id_fk" FOREIGN KEY ("ocr_result_id") REFERENCES "public"."ocr_results"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ocr_corrections" ADD CONSTRAINT "ocr_corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_ocr_corrections_ocr_result_id" ON "ocr_corrections" USING btree ("ocr_result_id");
--> statement-breakpoint
CREATE INDEX "idx_ocr_corrections_corrected_by" ON "ocr_corrections" USING btree ("corrected_by");
--> statement-breakpoint
CREATE INDEX "idx_ocr_corrections_created_at" ON "ocr_corrections" USING btree ("created_at");
