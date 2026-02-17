-- Add theme_preference column to users table
ALTER TABLE "users" ADD COLUMN "theme_preference" text DEFAULT 'light' NOT NULL;
