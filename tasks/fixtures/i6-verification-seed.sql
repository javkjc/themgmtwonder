-- I6 verification seed
-- Creates a role-ready document type and field keys for math reconciliation tests.

-- 1) Ensure test fields exist in field_library
INSERT INTO field_library (field_key, label, character_type, character_limit, status, version)
VALUES
  ('line_item_amount_1', 'Line Item Amount 1', 'decimal', NULL, 'active', 1),
  ('line_item_amount_2', 'Line Item Amount 2', 'decimal', NULL, 'active', 1),
  ('subtotal', 'Subtotal', 'decimal', NULL, 'active', 1),
  ('tax', 'Tax', 'decimal', NULL, 'active', 1),
  ('total', 'Total', 'decimal', NULL, 'active', 1)
ON CONFLICT (field_key) DO NOTHING;

-- 2) Ensure test document type exists
INSERT INTO document_types (name, description)
VALUES ('invoice_i6_test', 'I6 math reconciliation verification document type')
ON CONFLICT (name) DO NOTHING;

-- 3) Map role hints for reconciliation
WITH dt AS (
  SELECT id
  FROM document_types
  WHERE name = 'invoice_i6_test'
)
INSERT INTO document_type_fields (document_type_id, field_key, required, zone_hint, sort_order)
VALUES
  ((SELECT id FROM dt), 'line_item_amount_1', false, 'role:line_item_amount', 1),
  ((SELECT id FROM dt), 'line_item_amount_2', false, 'role:line_item_amount', 2),
  ((SELECT id FROM dt), 'subtotal', true, 'role:subtotal', 3),
  ((SELECT id FROM dt), 'tax', true, 'role:tax', 4),
  ((SELECT id FROM dt), 'total', true, 'role:total', 5)
ON CONFLICT (document_type_id, field_key)
DO UPDATE SET
  required = EXCLUDED.required,
  zone_hint = EXCLUDED.zone_hint,
  sort_order = EXCLUDED.sort_order;

-- 4) Inspect the final role map
SELECT dt.name, dtf.field_key, dtf.zone_hint
FROM document_type_fields dtf
JOIN document_types dt ON dt.id = dtf.document_type_id
WHERE dt.name = 'invoice_i6_test'
ORDER BY dtf.sort_order;
