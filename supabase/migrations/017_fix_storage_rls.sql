-- Fix storage RLS: restrict "Service role" policy to actual service role
-- Previous policy only checked bucket_id = 'cv-files' without auth.role() check,
-- effectively granting all authenticated users full CRUD access to every CV.

DROP POLICY IF EXISTS "Service role full access to cv-files" ON storage.objects;

-- Service role gets full access (auth.role() = 'service_role' required)
CREATE POLICY "Service role full access to cv-files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'cv-files' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'cv-files' AND auth.role() = 'service_role');
