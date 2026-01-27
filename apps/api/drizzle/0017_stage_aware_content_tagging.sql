-- Capture the task stage when remarks and attachments are created.
ALTER TABLE attachments
  ADD COLUMN stage_key_at_creation text;

ALTER TABLE remarks
  ADD COLUMN stage_key_at_creation text;
