-- Migration 039: explicit review status + reversible archive for saved_jobs
--
-- Closes the audit's Approve/Skip/Remove findings without touching existing rows
-- destructively. Applied one statement at a time in the Supabase SQL editor
-- (Studio executes a pasted multi-statement script as one transaction and only
-- reports the last statement, so verification is done per step).
--
-- Rollback (only if required): see the notes at the bottom of this file.

-- ── Step 1: columns ─────────────────────────────────────────────────────────
-- Default 'applied' keeps every website INSERT valid without changes and keeps
-- the historical meaning for rows created before this migration.
ALTER TABLE public.saved_jobs
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'applied';

ALTER TABLE public.saved_jobs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ── Step 2: allowed statuses ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saved_jobs_review_status_check'
      AND conrelid = 'public.saved_jobs'::regclass
  ) THEN
    ALTER TABLE public.saved_jobs
      ADD CONSTRAINT saved_jobs_review_status_check
      CHECK (review_status IN ('applied', 'needs_review', 'approved', 'submitted', 'skipped'));
  END IF;
END $$;

-- ── Step 3: partial index for active queue/tracker queries ──────────────────
CREATE INDEX IF NOT EXISTS idx_saved_jobs_review_active
  ON public.saved_jobs (user_id, review_status, created_at DESC)
  WHERE archived_at IS NULL;

-- ── Step 4: owner-only UPDATE policy (005 created SELECT/INSERT/DELETE only) ─
DROP POLICY IF EXISTS "Users can update own saved jobs" ON public.saved_jobs;
CREATE POLICY "Users can update own saved jobs"
  ON public.saved_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Step 5: Data API grants (required since Oct 30 2026 Supabase change) ────
GRANT ALL ON TABLE public.saved_jobs TO anon, authenticated, service_role;

-- ── Step 6: one-time backfill from the legacy match_summary heuristic ───────
-- Only rows still on the default are evaluated; 'approved'/'submitted'/'skipped'
-- values written by the app are never overwritten by a re-run.
UPDATE public.saved_jobs
SET review_status = CASE
  WHEN lower(coalesce(match_summary, '')) LIKE '%not auto-submitted%'
    OR lower(coalesce(match_summary, '')) LIKE '%opened via%'
    OR lower(coalesce(match_summary, '')) LIKE '%requires manual%'
    OR lower(coalesce(match_summary, '')) LIKE '%required review%'
  THEN 'needs_review'
  ELSE 'applied'
END
WHERE review_status = 'applied'
  AND archived_at IS NULL;

-- ── Verification (run these individually, do not paste as one script) ───────
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'saved_jobs'
--    AND column_name IN ('review_status', 'archived_at');
--
-- SELECT conname FROM pg_constraint WHERE conname = 'saved_jobs_review_status_check';
--
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'saved_jobs';
--
-- SELECT review_status, count(*) FROM public.saved_jobs GROUP BY 1 ORDER BY 1;
--
-- After DDL the PostgREST schema cache can be stale: run
--   SELECT pg_notification_queue_usage();
-- and re-check that REST returns the new columns before relying on them.
--
-- Rollback (destructive; only with an explicit decision):
--   DROP POLICY IF EXISTS "Users can update own saved jobs" ON public.saved_jobs;
--   DROP INDEX IF EXISTS idx_saved_jobs_review_active;
--   ALTER TABLE public.saved_jobs DROP CONSTRAINT IF EXISTS saved_jobs_review_status_check;
--   ALTER TABLE public.saved_jobs DROP COLUMN IF EXISTS archived_at;
--   ALTER TABLE public.saved_jobs DROP COLUMN IF EXISTS review_status;
