-- Add status column to job_results for tracking
ALTER TABLE job_results ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
ALTER TABLE job_results ALTER COLUMN match_score DROP NOT NULL;
