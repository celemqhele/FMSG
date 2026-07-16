-- 023_dynamic_requirements: Add dynamic requirements checklist to job_results
-- Stores the per-job spec requirements extracted and scored by the AI

ALTER TABLE job_results
  ADD COLUMN IF NOT EXISTS dynamic_requirements JSONB DEFAULT NULL;
