-- Storage bucket and RLS policies for CV uploads

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cv-files', 'cv-files', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow users to upload to their own folder
CREATE POLICY "Users can upload own CVs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cv-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to read their own CVs
CREATE POLICY "Users can read own CVs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cv-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to delete their own CVs
CREATE POLICY "Users can delete own CVs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'cv-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to update their own CVs
CREATE POLICY "Users can update own CVs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'cv-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow service role full access (for admin operations)
CREATE POLICY "Service role full access to cv-files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'cv-files')
  WITH CHECK (bucket_id = 'cv-files');
