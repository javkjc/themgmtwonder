-- Introduce explicit task stage/status column.
ALTER TABLE todos
  ADD COLUMN stage_key text DEFAULT 'backlog';

-- Backfill existing tasks and keep the default for future rows.
UPDATE todos
SET stage_key = 'backlog'
WHERE stage_key IS NULL;

ALTER TABLE todos
  ALTER COLUMN stage_key SET DEFAULT 'backlog';
