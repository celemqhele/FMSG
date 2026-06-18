-- New fields for restructured onboarding form
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS job_titles TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS job_types TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS current_salary INTEGER,
  ADD COLUMN IF NOT EXISTS desired_salary INTEGER,
  ADD COLUMN IF NOT EXISTS cv_file_path TEXT DEFAULT '';
