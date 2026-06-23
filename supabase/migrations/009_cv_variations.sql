-- Add cv_variations JSONB column to search_profiles
ALTER TABLE search_profiles
ADD COLUMN cv_variations JSONB DEFAULT '[]'::jsonb;

-- Backfill existing single cv_file_path entries into cv_variations
UPDATE search_profiles
SET cv_variations = jsonb_build_array(
  jsonb_build_object('name', 'CV', 'file_path', cv_file_path)
)
WHERE cv_file_path IS NOT NULL AND cv_file_path != '';

-- Drop the old single-path column
ALTER TABLE search_profiles DROP COLUMN IF EXISTS cv_file_path;

-- Add suggested_cv column to job_results
ALTER TABLE job_results
ADD COLUMN IF NOT EXISTS suggested_cv TEXT DEFAULT '';
