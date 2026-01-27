ALTER TABLE "audit_logs" ADD COLUMN "actor_type" text NOT NULL DEFAULT 'user';
--> statement-breakpoint
