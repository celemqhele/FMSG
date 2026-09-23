-- Track which title/industry combo was used last for a profile,
-- so single searches rotate through the hierarchy instead of always using index 0.
CREATE TABLE IF NOT EXISTS search_rotation (
  profile_id UUID PRIMARY KEY REFERENCES search_profiles(id) ON DELETE CASCADE,
  last_title_index INT NOT NULL DEFAULT 0,
  last_industry_index INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Data API access (new tables need explicit grants since Supabase Oct 30 2026 change)
GRANT ALL ON TABLE public.search_rotation TO anon, authenticated, service_role;

-- RLS: users can only see their own rotation
ALTER TABLE search_rotation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own search rotation"
  ON search_rotation FOR SELECT
  USING (auth.uid() = (SELECT user_id FROM search_profiles WHERE id = profile_id));

CREATE POLICY "Users can upsert own search rotation"
  ON search_rotation FOR ALL
  USING (auth.uid() = (SELECT user_id FROM search_profiles WHERE id = profile_id));
