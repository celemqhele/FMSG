-- Migration 040 — Independent FMSG Agent Profiles
--
-- Gives FMSG Agents its own profile system, independent of the website's
-- search_profiles. Additive only: no website table, column, object or policy
-- is altered. Website functionality is unaffected.
--
-- Application procedure (founder-gated, dashboard SQL editor, ONE statement
-- at a time, verify each with its own SELECT):
--   docs/SUPABASE_MIGRATION_040_APPLICATION_GUIDE.md

-- 2a. Table ------------------------------------------------------------------

create table if not exists public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  target_job_title text not null default '',
  cv_storage_path text,
  cv_filename text,
  cv_mime text,
  cv_size_bytes bigint,
  cv_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2b. RLS --------------------------------------------------------------------

alter table public.agent_profiles enable row level security;

-- 2c. Ownership policies ------------------------------------------------------

create policy "agent_profiles_select_own" on public.agent_profiles
  for select using (auth.uid() = user_id);

create policy "agent_profiles_insert_own" on public.agent_profiles
  for insert with check (auth.uid() = user_id);

create policy "agent_profiles_update_own" on public.agent_profiles
  for update using (auth.uid() = user_id);

create policy "agent_profiles_delete_own" on public.agent_profiles
  for delete using (auth.uid() = user_id);

-- 2d. Data API grants (mandatory since the 2026-10-30 PostgREST change) --------

grant all on table public.agent_profiles to anon, authenticated, service_role;
