CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  embedding VECTOR(768), -- nomic-embed-text outputs 768 dims
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);