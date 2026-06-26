-- 021_reasoning_v2: New structured reasoning columns for job_results
-- Adds pillar scores, recruiter verdict, knockout tracking, and question audit trail
-- Also adds the missing verdict_bullets column (already written by application code)

ALTER TABLE job_results
  ADD COLUMN IF NOT EXISTS verdict_bullets JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS knockout_fail BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pillar_scores JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS taxes_applied TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_questions_asked INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS yes_answers INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recruiter_verdict TEXT DEFAULT NULL;
