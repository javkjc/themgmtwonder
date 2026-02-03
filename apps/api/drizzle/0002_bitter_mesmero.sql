ALTER TABLE "ocr_corrections" DROP CONSTRAINT "ocr_corrections_corrected_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ocr_corrections" ADD CONSTRAINT "ocr_corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;