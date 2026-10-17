-- 036: Location scope + AI-generated location ladder on search_profiles.
-- location_scope picks which ladder rung hard-filters search results:
--   local (city) | provincial (region) | country | continental | world (no filter)
-- location_step_1..4 = AI-generated broadening ladder (city → region → country → continent),
-- mirroring industry_step_1..5.

-- Existing rows land on 'country' (keeps today's SA-wide behaviour until the user
-- picks a scope); new rows default to 'provincial'.
ALTER TABLE public.search_profiles
  ADD COLUMN IF NOT EXISTS location_scope text DEFAULT 'country';

ALTER TABLE public.search_profiles
  ALTER COLUMN location_scope SET DEFAULT 'provincial';

ALTER TABLE public.search_profiles
  ADD COLUMN IF NOT EXISTS location_step_1 text DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_step_2 text DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_step_3 text DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_step_4 text DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_ladder_generated_at timestamptz;

ALTER TABLE public.search_profiles
  DROP CONSTRAINT IF EXISTS search_profiles_location_scope_check;
ALTER TABLE public.search_profiles
  ADD CONSTRAINT search_profiles_location_scope_check
  CHECK (location_scope IN ('local', 'provincial', 'country', 'continental', 'world'));
