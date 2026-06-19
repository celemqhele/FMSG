-- ============================================================
-- Combined idempotent migration for FMSG Supabase schema
-- Safe to run multiple times — all statements use IF NOT EXISTS
-- Run this in Supabase SQL Editor.
--
-- Storage bucket + RLS policies are handled separately below
-- because storage.objects is owned by supabase_storage_admin.
-- ============================================================

-- 1. PROFILES TABLE (base + dashboard + subscription columns)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT DEFAULT '',
  surname TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  job_titles TEXT[] DEFAULT '{}',
  job_types TEXT[] DEFAULT '{}',
  location TEXT DEFAULT '',
  current_salary INTEGER,
  desired_salary INTEGER,
  cv_file_path TEXT DEFAULT '',
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS search_balance INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS cv_generation_balance INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS banned_jobs TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS banned_companies TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expiry TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can read own profile') THEN
    CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 2. JOB RESULTS TABLE
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

ALTER TABLE job_results
  ADD COLUMN IF NOT EXISTS search_id UUID,
  ADD COLUMN IF NOT EXISTS match_summary TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_spec TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_query TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS profile_id UUID,
  ADD COLUMN IF NOT EXISTS domain_verified BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS domain_unverified_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS posted_at TEXT DEFAULT '';

ALTER TABLE job_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_results' AND policyname = 'Users can read own job results') THEN
    CREATE POLICY "Users can read own job results" ON job_results FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_results' AND policyname = 'Users can insert own job results') THEN
    CREATE POLICY "Users can insert own job results" ON job_results FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_results' AND policyname = 'Users can update own job results') THEN
    CREATE POLICY "Users can update own job results" ON job_results FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. SEARCH PROFILES TABLE
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'search_profiles' AND policyname = 'Users can read own search profiles') THEN
    CREATE POLICY "Users can read own search profiles" ON search_profiles FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'search_profiles' AND policyname = 'Users can insert own search profiles') THEN
    CREATE POLICY "Users can insert own search profiles" ON search_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'search_profiles' AND policyname = 'Users can update own search profiles') THEN
    CREATE POLICY "Users can update own search profiles" ON search_profiles FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'search_profiles' AND policyname = 'Users can delete own search profiles') THEN
    CREATE POLICY "Users can delete own search profiles" ON search_profiles FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 4. SAVED JOBS TABLE
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_jobs' AND policyname = 'Users can read own saved jobs') THEN
    CREATE POLICY "Users can read own saved jobs" ON saved_jobs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_jobs' AND policyname = 'Users can insert own saved jobs') THEN
    CREATE POLICY "Users can insert own saved jobs" ON saved_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_jobs' AND policyname = 'Users can delete own saved jobs') THEN
    CREATE POLICY "Users can delete own saved jobs" ON saved_jobs FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  paystack_reference TEXT,
  amount INTEGER,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Users can read own subscription') THEN
    CREATE POLICY "Users can read own subscription" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Service can manage subscriptions') THEN
    CREATE POLICY "Service can manage subscriptions" ON subscriptions FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Service can update subscriptions') THEN
    CREATE POLICY "Service can update subscriptions" ON subscriptions FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. ERROR LOGS TABLE
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  error_code TEXT NOT NULL,
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'error_logs' AND policyname = 'Service can manage error logs') THEN
    CREATE POLICY "Service can manage error logs" ON error_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 7. REJECTED JOBS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS rejected_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  search_id UUID,
  search_query TEXT DEFAULT '',
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT DEFAULT '',
  snippet TEXT DEFAULT '',
  job_url TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  passed_domain_filter BOOLEAN DEFAULT false,
  passed_banned_filter BOOLEAN DEFAULT false,
  passed_pass1 BOOLEAN DEFAULT false,
  passed_pass2 BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rejected_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rejected_jobs' AND policyname = 'Users can read own rejected jobs') THEN
    CREATE POLICY "Users can read own rejected jobs" ON rejected_jobs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rejected_jobs' AND policyname = 'Users can insert own rejected jobs') THEN
    CREATE POLICY "Users can insert own rejected jobs" ON rejected_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rejected_jobs' AND policyname = 'Users can delete own rejected jobs') THEN
    CREATE POLICY "Users can delete own rejected jobs" ON rejected_jobs FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- STORAGE BUCKET (safe to run in SQL editor)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cv-files', 'cv-files', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE RLS POLICIES
-- Paste the section below into Supabase Dashboard > SQL Editor
-- using a query connected as the database owner, OR create them
-- via Storage > Policies in the Dashboard UI.
--
-- If you get "must be owner of table objects", use the Dashboard:
--   Storage > cv-files > Policies > Create policies
--   (template: "Give users access to own folder: uid")
-- ============================================================
-- Run this separately if needed:
/*
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can upload own CVs') THEN
    CREATE POLICY "Users can upload own CVs"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'cv-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can read own CVs') THEN
    CREATE POLICY "Users can read own CVs"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'cv-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can delete own CVs') THEN
    CREATE POLICY "Users can delete own CVs"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'cv-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can update own CVs') THEN
    CREATE POLICY "Users can update own CVs"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'cv-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Service role full access to cv-files') THEN
    CREATE POLICY "Service role full access to cv-files"
      ON storage.objects FOR ALL
      USING (bucket_id = 'cv-files')
      WITH CHECK (bucket_id = 'cv-files');
  END IF;
END $$;
*/
