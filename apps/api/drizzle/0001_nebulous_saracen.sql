ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "todos_user_id_idx" ON "todos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "todos_user_done_idx" ON "todos" USING btree ("user_id","done");
CREATE INDEX IF NOT EXISTS "todos_user_created_at_idx" ON "todos" USING btree ("user_id","created_at");
