-- Add rejection_category and rejection_reason columns to rejected_jobs
-- to support structured rejection tracking for the rejected jobs tab

ALTER TABLE rejected_jobs ADD COLUMN IF NOT EXISTS rejection_category TEXT DEFAULT '';
ALTER TABLE rejected_jobs ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT '';

-- Backfill existing rows from the reason column
UPDATE rejected_jobs SET rejection_category = 'system', rejection_reason = reason WHERE reason != '' AND rejection_category = '';
