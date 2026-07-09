-- ============================================================
-- 022_career_ladders: Cached dual-ladder career chains + industry taxonomy
-- ============================================================

-- 1. Industry taxonomy tree (seeded once by Prompt A)
CREATE TABLE IF NOT EXISTS industry_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0 AND depth <= 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Industry ladder on search_profiles (5 broadening steps, hyper-niche -> broad)
ALTER TABLE search_profiles
  ADD COLUMN IF NOT EXISTS industry_step_1 TEXT,
  ADD COLUMN IF NOT EXISTS industry_step_1_taxonomy_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS industry_step_2 TEXT,
  ADD COLUMN IF NOT EXISTS industry_step_2_taxonomy_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS industry_step_3 TEXT,
  ADD COLUMN IF NOT EXISTS industry_step_3_taxonomy_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS industry_step_4 TEXT,
  ADD COLUMN IF NOT EXISTS industry_step_4_taxonomy_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS industry_step_5 TEXT,
  ADD COLUMN IF NOT EXISTS industry_step_5_taxonomy_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL;

-- 3. Formalise the phantom industry column on search_profiles
ALTER TABLE search_profiles
  ADD COLUMN IF NOT EXISTS industry TEXT;

-- 4. Reanalysis tracking for search_profiles
ALTER TABLE search_profiles
  ADD COLUMN IF NOT EXISTS needs_reanalysis BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_analysed_at TIMESTAMPTZ;

-- 5. Industry ladder generated_at timestamp
ALTER TABLE search_profiles
  ADD COLUMN IF NOT EXISTS industry_ladder_generated_at TIMESTAMPTZ;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_industry_taxonomy_parent
  ON industry_taxonomy(parent_id);

CREATE INDEX IF NOT EXISTS idx_industry_taxonomy_depth
  ON industry_taxonomy(depth);
