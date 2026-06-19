-- Saved jobs table
CREATE TABLE IF NOT EXISTS saved_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT DEFAULT '',
  estimated_salary TEXT DEFAULT '',
  match_score INTEGER DEFAULT 0,
  match_summary TEXT DEFAULT '',
  job_url TEXT NOT NULL,
  full_spec TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE saved_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own saved jobs"
  ON saved_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved jobs"
  ON saved_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved jobs"
  ON saved_jobs FOR DELETE
  USING (auth.uid() = user_id);

-- Search profiles for multiple profile support
CREATE TABLE IF NOT EXISTS search_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default Profile',
  job_titles TEXT[] DEFAULT '{}',
  job_types TEXT[] DEFAULT '{}',
  location TEXT DEFAULT '',
  cv_file_path TEXT DEFAULT '',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE search_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own search profiles"
  ON search_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own search profiles"
  ON search_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own search profiles"
  ON search_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own search profiles"
  ON search_profiles FOR DELETE
  USING (auth.uid() = user_id);
