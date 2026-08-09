-- 035_ats_embeddings: pgvector candidate embeddings for Phase 2 semantic scoring
-- Enables dense bi-encoder retrieval fused with deterministic lexical scoring via RRF.
-- Run on Supabase SQL editor. Enable the vector extension first.

CREATE EXTENSION IF NOT EXISTS vector;

-- Candidate embeddings: one 768-dim vector per search profile, cached across searches.
CREATE TABLE IF NOT EXISTS candidate_embeddings (
  profile_id UUID PRIMARY KEY REFERENCES search_profiles(id) ON DELETE CASCADE,
  model TEXT NOT NULL DEFAULT 'Xenova/bge-base-en-v1.5',
  embedding vector(768) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW cosine index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_hnsw
  ON candidate_embeddings USING hnsw (embedding vector_cosine_ops);

-- RLS: users can read/upsert their own candidate embedding only
ALTER TABLE candidate_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own candidate embedding"
  ON candidate_embeddings FOR SELECT
  USING (auth.uid() = (SELECT user_id FROM search_profiles WHERE id = profile_id));

CREATE POLICY "Users can upsert own candidate embedding"
  ON candidate_embeddings FOR ALL
  USING (auth.uid() = (SELECT user_id FROM search_profiles WHERE id = profile_id))
  WITH CHECK (auth.uid() = (SELECT user_id FROM search_profiles WHERE id = profile_id));
