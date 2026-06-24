-- Fix error_logs RLS: restrict to user's own errors and service role only
-- Previous policy allowed ALL authenticated users to read all error logs

DROP POLICY IF EXISTS "Service can manage error logs" ON error_logs;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'error_logs' AND policyname = 'Users can read own error logs') THEN
    CREATE POLICY "Users can read own error logs" ON error_logs
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'error_logs' AND policyname = 'Users can insert own error logs') THEN
    CREATE POLICY "Users can insert own error logs" ON error_logs
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'error_logs' AND policyname = 'Service role full access to error logs') THEN
    CREATE POLICY "Service role full access to error logs" ON error_logs
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
