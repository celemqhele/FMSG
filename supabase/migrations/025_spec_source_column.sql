-- Add spec_source column to track whether a job spec came from
-- Google Jobs structured data (verified) or Google Search + Jina (unverified)
ALTER TABLE job_results
  ADD COLUMN IF NOT EXISTS spec_source TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_job_results_spec_source ON job_results (spec_source);
