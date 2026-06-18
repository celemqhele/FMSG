ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS search_balance INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS cv_generation_balance INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS banned_jobs TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS banned_companies TEXT[] DEFAULT '{}';

CREATE TABLE IF NOT EXISTS job_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT DEFAULT '',
  estimated_salary TEXT DEFAULT '',
  match_score INTEGER DEFAULT 0,
  job_url TEXT NOT NULL,
  snippet TEXT DEFAULT '',
  full_description TEXT DEFAULT '',
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE job_results ADD COLUMN IF NOT EXISTS search_id UUID;
ALTER TABLE job_results ADD COLUMN IF NOT EXISTS match_summary TEXT DEFAULT '';

ALTER TABLE job_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own job results"
  ON job_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own job results"
  ON job_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own job results"
  ON job_results FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  error_code TEXT NOT NULL,
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage error logs"
  ON error_logs FOR ALL
  USING (true)
  WITH CHECK (true);
