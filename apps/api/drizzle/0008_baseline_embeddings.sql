CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE baseline_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id UUID REFERENCES extraction_baselines(id),
  document_type_id UUID REFERENCES document_types(id),
  embedding vector(768),
  serialized_text TEXT NOT NULL,
  confirmed_fields JSONB NOT NULL,
  is_synthetic BOOLEAN DEFAULT FALSE,
  gold_standard BOOLEAN DEFAULT FALSE,
  quality_gate TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON baseline_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
