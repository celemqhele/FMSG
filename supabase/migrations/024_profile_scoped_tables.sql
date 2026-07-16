-- Migration 024: Add profile_id to saved_jobs and rejected_jobs for per-profile isolation
-- Run this on Supabase SQL editor

-- 1. saved_jobs: add profile_id column
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES search_profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_saved_jobs_profile_id ON saved_jobs(profile_id);

-- 2. rejected_jobs: add profile_id column
ALTER TABLE rejected_jobs ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES search_profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_rejected_jobs_profile_id ON rejected_jobs(profile_id);

-- 3. job_results: add index on profile_id (column already exists)
CREATE INDEX IF NOT EXISTS idx_job_results_profile_id ON job_results(profile_id);
