ALTER TABLE ocr_results
ADD COLUMN field_type varchar(20) NOT NULL DEFAULT 'text';
