-- Cold-start seed: Invoice document type + core field library entries.
-- Safe to run multiple times (idempotent).

BEGIN;

WITH seed_user AS (
  SELECT id
  FROM users
  WHERE is_admin = true
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO field_library (
  field_key,
  label,
  character_type,
  character_limit,
  status,
  version,
  created_by
)
SELECT
  v.field_key,
  v.label,
  v.character_type::field_character_type,
  v.character_limit,
  'active'::field_status,
  1,
  su.id
FROM (
  VALUES
    ('invoice_number', 'Invoice Number', 'varchar', 255),
    ('invoice_date', 'Invoice Date', 'date', NULL),
    ('vendor_name', 'Vendor Name', 'varchar', 255),
    ('due_date', 'Due Date', 'date', NULL),
    ('subtotal', 'Subtotal', 'currency', NULL),
    ('tax', 'Tax', 'currency', NULL),
    ('total', 'Total', 'currency', NULL)
) AS v(field_key, label, character_type, character_limit)
CROSS JOIN seed_user su
ON CONFLICT (field_key) DO UPDATE SET
  label = EXCLUDED.label,
  character_type = EXCLUDED.character_type,
  character_limit = EXCLUDED.character_limit,
  status = 'active'::field_status;

INSERT INTO document_types (name, description)
VALUES ('Invoice', 'Default invoice document type')
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description;

WITH dt AS (
  SELECT id
  FROM document_types
  WHERE name = 'Invoice'
)
INSERT INTO document_type_fields (
  document_type_id,
  field_key,
  required,
  zone_hint,
  sort_order
)
VALUES
  ((SELECT id FROM dt), 'invoice_number', true, NULL, 1),
  ((SELECT id FROM dt), 'invoice_date', true, NULL, 2),
  ((SELECT id FROM dt), 'vendor_name', false, NULL, 3),
  ((SELECT id FROM dt), 'due_date', false, NULL, 4),
  ((SELECT id FROM dt), 'subtotal', true, 'role:subtotal', 5),
  ((SELECT id FROM dt), 'tax', false, 'role:tax', 6),
  ((SELECT id FROM dt), 'total', true, 'role:total', 7)
ON CONFLICT (document_type_id, field_key) DO UPDATE SET
  required = EXCLUDED.required,
  zone_hint = EXCLUDED.zone_hint,
  sort_order = EXCLUDED.sort_order;

COMMIT;
