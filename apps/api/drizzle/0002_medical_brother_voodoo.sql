ALTER TABLE "todos" ADD COLUMN IF NOT EXISTS "start_at" timestamp;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN IF NOT EXISTS "duration_min" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "todos_user_start_at_idx" ON "todos" USING btree ("user_id","start_at");
