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

-- 2. Per-search-profile industry ladder — 1:1 with search_profiles
--    5 editable steps: hyper-niche -> niche -> sub-sector -> industry -> broad
--    Each step has a TEXT value + optional UUID FK to industry_taxonomy.
CREATE TABLE IF NOT EXISTS profile_industry_ladder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_profile_id UUID NOT NULL REFERENCES search_profiles(id) ON DELETE CASCADE UNIQUE,

  step_1 TEXT NOT NULL,
  step_1_taxonomy_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL,
  step_2 TEXT NOT NULL,
  step_2_taxonomy_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL,
  step_3 TEXT NOT NULL,
  step_3_taxonomy_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL,
  step_4 TEXT NOT NULL,
  step_4_taxonomy_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL,
  step_5 TEXT NOT NULL,
  step_5_taxonomy_id UUID REFERENCES industry_taxonomy(id) ON DELETE SET NULL,

  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- 3. Formalise the phantom industry column on search_profiles
--    (code already reads/writes it; now making it official)
ALTER TABLE search_profiles
  ADD COLUMN IF NOT EXISTS industry TEXT;

-- 4. Reanalysis tracking for search_profiles
ALTER TABLE search_profiles
  ADD COLUMN IF NOT EXISTS needs_reanalysis BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_analysed_at TIMESTAMPTZ;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_industry_taxonomy_parent
  ON industry_taxonomy(parent_id);

CREATE INDEX IF NOT EXISTS idx_industry_taxonomy_depth
  ON industry_taxonomy(depth);

CREATE INDEX IF NOT EXISTS idx_profile_industry_ladder_sp
  ON profile_industry_ladder(search_profile_id);

-- 6. RLS on profile_industry_ladder (user must own the search profile)
ALTER TABLE profile_industry_ladder ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search profile ladder"
  ON profile_industry_ladder FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM search_profiles
      WHERE search_profiles.id = search_profile_id
      AND search_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own search profile ladder"
  ON profile_industry_ladder FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM search_profiles
      WHERE search_profiles.id = search_profile_id
      AND search_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own search profile ladder"
  ON profile_industry_ladder FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM search_profiles
      WHERE search_profiles.id = search_profile_id
      AND search_profiles.user_id = auth.uid()
    )
  );
