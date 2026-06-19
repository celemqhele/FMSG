-- Fix missing columns on profiles (from 003_dashboard + 004_subscriptions)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS search_balance INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS cv_generation_balance INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS banned_jobs TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS banned_companies TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expiry TIMESTAMPTZ;

-- Fix missing columns on job_results (code uses full_spec + search_query)
ALTER TABLE job_results
  ADD COLUMN IF NOT EXISTS search_id UUID,
  ADD COLUMN IF NOT EXISTS match_summary TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_spec TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_query TEXT DEFAULT '';

-- Create subscriptions table if missing (from 004_subscriptions)
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
    CREATE POLICY "Users can read own subscription"
      ON subscriptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Service can manage subscriptions') THEN
    CREATE POLICY "Service can manage subscriptions"
      ON subscriptions FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Service can update subscriptions') THEN
    CREATE POLICY "Service can update subscriptions"
      ON subscriptions FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Create error_logs table if missing (from 003_dashboard)
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
    CREATE POLICY "Service can manage error logs"
      ON error_logs FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Ensure storage bucket exists with policies (from 006_storage_rls)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cv-files', 'cv-files', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

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
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can read own CVs') THEN
    CREATE POLICY "Users can read own CVs"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'cv-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can delete own CVs') THEN
    CREATE POLICY "Users can delete own CVs"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'cv-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can update own CVs') THEN
    CREATE POLICY "Users can update own CVs"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'cv-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Service role full access to cv-files') THEN
    CREATE POLICY "Service role full access to cv-files"
      ON storage.objects FOR ALL
      USING (bucket_id = 'cv-files')
      WITH CHECK (bucket_id = 'cv-files');
  END IF;
END $$;
