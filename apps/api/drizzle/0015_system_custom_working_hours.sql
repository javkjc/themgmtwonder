-- Add system-wide working hours and working days to system_settings
ALTER TABLE "system_settings"
ADD COLUMN IF NOT EXISTS "working_hours" text NOT NULL DEFAULT '{"start":"09:00","end":"17:00"}',
ADD COLUMN IF NOT EXISTS "working_days" text NOT NULL DEFAULT '[1,2,3,4,5]';

-- Ensure the singleton row has defaults populated
UPDATE "system_settings"
SET
  "working_hours" = COALESCE("working_hours", '{"start":"09:00","end":"17:00"}'),
  "working_days" = COALESCE("working_days", '[1,2,3,4,5]')
WHERE "id" = 1;
