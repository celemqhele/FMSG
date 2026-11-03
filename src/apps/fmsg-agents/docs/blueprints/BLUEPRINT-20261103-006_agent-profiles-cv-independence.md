# BLUEPRINT-20261103-006 — Independent Agent Profiles & CV Management

## 1. Task ID

`BLUEPRINT-20261103-006` → assignment `TASK-20261103-008`.

## 2. Objective

Make FMSG Agent profiles independent of the website's `search_profiles` system: a dedicated `agent_profiles` table in the existing Supabase project, a private CV storage bucket, a three-input creation flow (name, target job title, CV upload), CV upload/replace actions on the approved profile cards, and automation that validates, retrieves, tailors from, and attaches the **original** CV file. Website profiles and website functionality remain untouched.

## 3. Background and problem statement

Founder request (Workstream 1 / Workstream A of the 2026-11-03 documents). The website uses profile text/keywords to search; FMSG Agents must work from the candidate's actual CV. The founder accepts a clean agent-profile list. Existing website data must not be deleted or modified.

## 4. Existing implementation findings (verified by inspection)

- **The reported error's exact origin:** `agent-controller.ts:279` `loadProfile()` selects `cv_file_path` from `search_profiles`. Migration `supabase/migrations/009_cv_variations.sql` **dropped** `search_profiles.cv_file_path` (replaced by a `cv_variations` jsonb array). Every run start calls `loadProfile()` (line 1443) → PostgREST error `column search_profiles.cv_file_path does not exist`. The fix is **not** to re-add the column; the fix is to stop reading website-profile data in the run pipeline (this blueprint).
- `loadAccountProfile()` (`agent-controller.ts:298`) still reads `profiles.cv_file_path` (website table; column exists) — also to be replaced in the run pipeline.
- Tailoring/attachment path (`agent-controller.ts:1261`): `this.searchProfile?.cv_file_path || this.accountProfile?.cv_file_path` — the CV path the agent uses today, and it is website storage.
- Profile list IPC: `electron-main.ts:337` `load-profiles` → `fetchUserAndProfilesUnderRLS` (website `search_profiles` under RLS). The renderer `profiles` state drives the Profile picker, Profiles screen, Run Setup selector.
- Profiles screen (`App.tsx:2015`): `const hasCv = Boolean(p.cv_file_path)` — since migration 009, `p.cv_file_path` is undefined on `search_profiles` rows → **CV status is silently always "no CV"** today. This blueprint's new predicate must replace it.
- Website schema reference: `docs/context/FMSG_ECOSYSTEM_ARCHITECTURE.md` (tables `profiles`, `search_profiles`; RLS `auth.uid() = user_id`).
- **Supabase operational rules (root `AGENTS.md`):** DDL cannot run via PostgREST — migrations are applied in the Supabase dashboard SQL editor (one statement at a time, verify each with its own SELECT) or via a Management API token; new tables **must** carry `GRANT ALL ON TABLE public.<table> TO anon, authenticated, service_role;` (PostgREST v14 change) or the Data API returns permission-denied/404 even for service_role; PostgREST schema cache is stale after DDL (`select pg_notification_queue_usage();`).

## 5. Root cause

Architecture, not a typo: FMSG Agents never owned its profile data. It reads website tables whose schema evolved under the website's needs (migration 009), so agent code now references columns that no longer exist, and CV "status" silently degrades. The durable fix is a purpose-built agent profile table + private CV storage.

## 6. Approved technical approach

### 6.1 Database — new table `agent_profiles`

Migration file: `supabase/migrations/040_agent_profiles.sql` (next free number — verify against the migrations directory first; if 040 exists, use the next free).

```sql
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

alter table public.agent_profiles enable row level security;

create policy "agent_profiles_select_own" on public.agent_profiles
  for select using (auth.uid() = user_id);
create policy "agent_profiles_insert_own" on public.agent_profiles
  for insert with check (auth.uid() = user_id);
create policy "agent_profiles_update_own" on public.agent_profiles
  for update using (auth.uid() = user_id);
create policy "agent_profiles_delete_own" on public.agent_profiles
  for delete using (auth.uid() = user_id);

grant all on table public.agent_profiles to anon, authenticated, service_role;
```

Notes:
- Keep the first model simple: `name`, `target_job_title`, CV metadata. Multiple target titles can be added later without migration pain (jsonb or child table) — do not build it now.
- `cv_*` columns hold metadata only; the file lives in Storage. `cv_storage_path` is the bucket path `<user_id>/<profile_id>/<random>.ext`.

### 6.2 Storage — private bucket `agent-cvs`

- Create (dashboard UI or Management API): private bucket `agent-cvs` (never public).
- Storage policies (apply in dashboard SQL editor — Storage policies live in `storage.policies`; simplest reliable form: restrict object ops to the owner prefix):

```sql
insert into storage.policies (name, definition, bucket_id)
values
('agent_cvs_read_own', '(storage.foldername(name))[1] = (select auth.uid()::text)', 'agent-cvs'),
('agent_cvs_write_own', '(storage.foldername(name))[1] = (select auth.uid()::text)', 'agent-cvs');
```

The exact storage-policy DDL must be verified against the deployed Supabase version during implementation (the installer of this migration must check `storage.policies` column names; if the dashboard UI policy editor is available, prefer it and document exactly what was configured). Path convention `<user_id>/<profile_id>/<uuid>.<ext>` guarantees one profile can never receive another profile's CV and makes ownership checks trivial.

- Allowed types: `application/pdf`, DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`). Size cap: 10 MB. Validate type/size **client-side in main process before upload**.
- Upload flow: upload to a **new** unique path first → on success update `agent_profiles.cv_*` → then delete the old object (best-effort). A failed replacement never destroys the previous CV. Never log CV contents, signed URLs, or storage paths into ordinary logs (logger redaction list must cover `cv_storage_path`, `cv_filename` payloads if they pass through events — prefer they never pass through events).

### 6.3 Application — profile management

- New main-process module for agent profiles (e.g. `agent-profiles.ts` in the fmsg-agents root, or extend an existing profiles lib — inspect first): CRUD via Supabase anon client + session token under RLS (mirror the `loadProfile` pattern), storage upload/download via `storage.from('agent-cvs')`, download via signed URL (short expiry) for CV retrieval.
- IPC surface: `load-agent-profiles`, `create-agent-profile`, `update-agent-profile` (name/title), `delete-agent-profile`, `upload-agent-cv`, `get-agent-cv-url` (short-lived). This **is** a preload/main-process change — permitted in this task's file list; keep the surface minimal and mirror the existing `load-profiles` handler style.
- **Website profile data is untouched.** The app stops loading `search_profiles` as the profile source of truth. Do not delete any website rows or objects. The founder accepts an initially empty agent profile list.
- Renderer: Profiles screen switches to agent profiles. Creation flow: **Candidate name** + **Target job title** + **Upload CV** (three inputs; immediate "CV uploaded" confirmation; profile not run-ready until CV present). Cards keep the approved identity-led design (TASK-20261103-002) and gain footer actions: Upload CV (no CV) → uploading state → CV uploaded → Replace CV; the green Active Profile pill stays independent of CV status; upload/replace must not change selection.
- Run Setup selector and Profile picker switch to agent profiles.

### 6.4 Automation integration

- `runBatch` validation **before** starting: profile selected → agent profile exists (agent_profiles RLS read) → CV present (`cv_storage_path` not null) → CV retrievable (signed URL fetch or storage metadata) → supported format. On failure: `phase('paused', ...)`-style event with a plain-English explanation and the exact remediation ("Upload a CV on the Profiles screen"), and do not launch. (The `Needs You`/toast channel to surface this to the UI is the existing `attention`/phase path — do not invent a new one.)
- Tailoring: extract text from the **agent** CV (the existing `src/app/api/extract-cv` route is website-side; the agent needs its own extraction path — reuse the parsing library the website uses, called from the main process, or call the same extraction utility code if it is importable; do not call the website route). Store extracted text in memory for the run only; never persist it into logs or the DB unless a future task decides so.
- Attachment upload: when a form requests a CV file, upload the **original file** from the bucket (downloaded locally to a temp path, cleaned up after the run), never the extracted text.
- Keep `generateSearchQuery` working: it reads `job_titles`, `industry`, `location` — with agent profiles, derive the query from `target_job_title` (title) and let location default to the agent's stored location or South Africa-wide if absent (decide in implementation: use `target_job_title` for titles; industry can be omitted or derived from tailoring; document the choice in the EOT).
- If the run moves into a Linux VM later (BLUEPRINT-20261103-008), CV transfer will use the controlled bridge defined there; for now the local temp-file pattern is the only path and must clean up in `finally`.

### 6.5 Versioning

No version bump in this task. This work (main process + preload + DB) will require an installer-handoff release later, decided at release time.

## 7. Architecture and design decisions

- One Supabase project, new table + new bucket. A separate Supabase project was rejected (no compelling reason; adds auth complexity).
- RLS ownership: `auth.uid() = user_id` on every policy; bucket path prefix ownership; grants to all three roles (PostgREST requirement).
- The website tables stay the canonical website source; the agent app's reads of `search_profiles`/`profiles` in the **run pipeline** are removed/replaced — website code is not modified.
- CV status is derived from `cv_storage_path`/`cv_uploaded_at`, never from `cv_file_path` (which no longer exists on search_profiles).

## 8. Files to inspect

- `src/apps/fmsg-agents/agent-controller.ts` (loadProfile, loadAccountProfile, runBatch, tailoring/attachment ~line 1261, search query gen)
- `src/apps/fmsg-agents/electron-main.ts` (load-profiles handler, IPC registration pattern)
- `src/apps/fmsg-agents/preload.ts` (API surface pattern)
- `src/apps/fmsg-agents/renderer/App.tsx` (profiles state, ProfilesAndRulesView mount, hasCv at 2015)
- `src/apps/fmsg-agents/renderer/views/` profiles view + components (card design from TASK-20261103-002)
- `supabase/migrations/` (list to pick the next number; read 009 to confirm the drop)
- `docs/context/FMSG_ECOSYSTEM_ARCHITECTURE.md`; root `AGENTS.md` Supabase section (DDL procedure, grants requirement)

## 9. Files permitted to modify

- `src/apps/fmsg-agents/agent-controller.ts` (profile loading + run validation + CV usage)
- `src/apps/fmsg-agents/electron-main.ts` (new agent-profile IPC handlers only)
- `src/apps/fmsg-agents/preload.ts` (new agent-profile API methods only)
- New: `src/apps/fmsg-agents/agent-profiles.ts` (or an approved equivalent location)
- New: `supabase/migrations/040_agent_profiles.sql` (or next free number)
- `src/apps/fmsg-agents/renderer/App.tsx`, `renderer/views/*` profiles view, profile card components (agent-profile data wiring + creation flow + CV actions)
- `src/apps/fmsg-agents/renderer/design-system.css` (creation form + CV action styles only)
- `src/apps/fmsg-agents/docs/changelog/UNRELEASED.md`

## 10. Files prohibited from modifying

- Website code: `src/app/**`, `src/components/**`, `src/lib/**` (website-side), existing website migrations (001–039)
- Website storage bucket operations (`cv-files` bucket policies/objects)
- `package.json`, `config.ts`, legal docs (no version bump)
- `logger.ts` (unless the redaction list requires a new key — escalate first)

## 11. Required implementation steps

1. Read everything in §8; confirm the next free migration number; confirm the deployed `search_profiles` schema via information_schema (per root AGENTS.md verification rules).
2. Write migration `040_agent_profiles.sql` (+ storage policy DDL documented for dashboard application). **Do not apply it yourself** unless the founder grants dashboard/Management-API access — the task's DDL step is a founder-applied action (§12).
3. Build `agent-profiles.ts` (CRUD + storage upload/download + validation).
4. Wire IPC + preload.
5. Switch renderer profile state to agent profiles; build the 3-input creation flow; add CV actions to cards; fix the CV-status predicate.
6. Rework the run pipeline: validation gate, agent-profile-based search query, CV text extraction for tailoring, original-file attachment upload, temp-file cleanup.
7. Verify against a locally applied schema if available (local Supabase or against production once the founder applies the migration); otherwise document what was verified vs deferred.
8. Log in `UNRELEASED.md`; file EOT (including exactly what was and was not verified against a live database).

## 12. Dependencies

- **Founder action:** apply migration 040 in the Supabase dashboard SQL editor (or provide a Management API token) and create/configure the `agent-cvs` bucket + storage policies. Until applied, runtime verification of CRUD/RLS is limited to code inspection + local mocks — state this in the EOT.
- None between tasks (BLUEPRINT-007 and -005 are independent).

## 13. Acceptance criteria

- [ ] FMSG Agent profiles no longer depend on website `search_profiles` records; website profiles/functionality unchanged; no website data deleted or modified.
- [ ] Independent profile created with name + target job title + actual CV upload (PDF/DOCX, ≤10 MB, type/size validated).
- [ ] CV upload/replace works; failed replacement never destroys the previous CV; one profile can never receive another profile's CV.
- [ ] Profile card states visually distinct: Active Profile (green pill), CV uploaded, CV missing, uploading, upload failed; CV status independent of selection; upload/replace never changes selection.
- [ ] The missing `search_profiles.cv_file_path` error is resolved at its source (run pipeline no longer reads website profile columns).
- [ ] Runs validate profile + CV presence + retrievability + format before starting; failure blocks the run with a clear explanation and route to the profile action.
- [ ] The selected profile's **original** CV is used for tailoring (extracted text) and uploaded for form attachments (original file); temp copies cleaned up.
- [ ] CVs never exposed via public URLs; ownership enforced (RLS + bucket prefix); CV contents/signed URLs/paths never enter ordinary logs.
- [ ] Migration, grants, and RLS policies are consistent and documented; PostgREST schema-cache refresh verified.
- [ ] No version bump, no installer rebuild, no release.

## 14. Required tests

- `npx tsc -p tsconfig.json --noEmit` + `npx tsc -p tsconfig.main.json --noEmit`.
- Supabase verification (once migration applied): information_schema columns; `GRANT` applied; RLS policies listed; storage policy blocks cross-user object access (probe with two test users if possible); PostgREST returns rows after cache refresh.
- CV flow tests: upload → replace → delete profile (cascades) → failed-replace rollback → oversized/wrong-type rejection → cross-profile path guard.
- Run-gate tests: run blocked without CV (message correct), run proceeds with CV.
- `npm run ui:shots`/`ui:a11y`/`ui:flows` on the new creation form and card states.
- Log hygiene check: no CV paths/content in logs during a full flow.

## 15. Regression risks

- The website app must keep working — no website files touched, but the shared Supabase project gains a table/bucket; verify website queries are unaffected (table-level isolation).
- `generateSearchQuery` signature is shared; changing its inputs must not break other callers (grep before changing).
- Renderer state `profiles`/`selectedProfileId` is used by Home, Run, Profiles, Settings; switching the source must keep those mounts working or replace their wiring consistently.
- PostgREST schema-cache staleness will make the new table invisible to the Data API immediately after DDL — refresh per root AGENTS.md before claiming "permission denied" is a grant problem.

## 16. Rollback considerations

- Migration is additive (new table/bucket); rollback = stop using agent profiles and restore the previous renderer wiring + run pipeline from git. No website data at risk. Deleting agent profile rows is safe (user-owned, new).

## 17. Explicit instructions and restrictions

- Delegation (per Argon's 2026-11-03 corrective-directive review, revised 2026-11-03T20:10:00+02:00): DB architecture, migration design, storage/RLS security, CV handling, IPC and the run pipeline remain with Pro. Isolated `tests/ui` harness updates for the creation form and card CV states **may be delegated to Flash** within the boundaries recorded in the assignment file. (The founder-facing DDL guide was drafted by Argon directly — `docs/SUPABASE_MIGRATION_040_APPLICATION_GUIDE.md` — and is no longer a delegation candidate.)
- Database architecture decisions beyond this blueprint require Argon approval (SOP §3.1).
- Do not apply DDL to production Supabase yourself; DDL application is the founder's step (dashboard SQL editor or Management API token).
- Do not delete/modify website rows, objects, or migrations. Do not auto-clear the founder's existing website profiles.
- Do not log CV contents, storage paths, or signed URLs. Do not make the bucket public.
- No release, no version bump, no installer rebuild.

## 18. Escalation conditions

- The deployed Supabase storage-policy DDL shape differs from this blueprint and blocks owner-prefix enforcement.
- `generateSearchQuery` consumers beyond the run pipeline are found.
- CV extraction requires a library not already in the repo (new dependency decision → Argon).
- Any need to modify website-side files.
