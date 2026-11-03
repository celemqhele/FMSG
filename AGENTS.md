<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Context

- **Project:** FMSG (Find Me Some Jobs) — AI-powered South African job matching SaaS
- **Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase, Paystack, SerpAPI
- **Deploy:** Vercel (beta → production, no main branch). **Caveat (observed 2026-10-17):** a push to `production` lands as a **Preview** deployment — the live domain keeps serving the previous build until that deployment is **promoted to Production in the Vercel dashboard**. Don't assume a push is live: probe a route you changed, or check `https://api.github.com/repos/celemqhele/FMSG/deployments` (public, no auth; the `environment` field reads `Preview – fmsg` vs `Production – fmsg`). The repo is connected to **two** Vercel projects (`fmsg`, `fmsg-2`), each building every commit as a Preview.
- **Audit log:** See `PRODUCTION_AUDIT.md` for full list of issues found & fixed on June 24, 2026
- **SQL to run:** 3 migrations must be applied on Supabase before production go-live (see PRODUCTION_AUDIT.md)

# Branch Rules

- **DO NOT** merge or cherry-pick the Google Analytics tag (`G-4QMEHZSCXF`) into the `beta` branch. It lives only in `src/components/analytics/google-analytics.tsx` on `production`. When merging `beta` into `production`, always check that this tag wasn't accidentally removed.

# Job Post Workflow (CRITICAL)

When the user asks to "create a job post", "post a job", "add a job", or "write a job post", they mean adding a **static job card to a FMSG job board** — NOT a generic hiring packet, job description document, interview guide, or offer letter. Do NOT use the `job-post-builder` skill or anything unrelated.

## Steps

1. **Confirm the board.** Ask which board the job belongs to (currently `finance` — empty — and `life-sciences`). If no existing board fits, offer to create a new one.
2. **Create the job card file** at `src/data/jobs/<board>/<kebab-slug>.ts` exporting a named `JobCard` (see `src/data/jobs/types.ts`): fields are `slug`, `title`, `company`, `location`, `salary`, `applyUrl`, `description` (full spec, `\n` separated), `snippet` (short summary shown on the card), and optional `featured: true`. Match the style of `src/data/jobs/life-sciences/esco-country-manager.ts`.
3. **Register it** in the board's `index.ts` (e.g. `src/data/jobs/life-sciences/index.ts`) — import and append to the jobs array. The board page renders the card automatically.
4. **New board?** Add it to `jobBoards` in `src/data/jobs/categories.ts` (`slug`, `name`, `tagline`, `search: { title, location }`, `jobs`). `search.title`/`search.location` pre-fill the search pill and drive the opt-in live "More jobs like this" search. The route `/jobs/[category]` SSG's any board in `categories.ts`.
5. **Verify:** `npx tsc --noEmit`, eslint on changed files, `npm run build` (confirms the new card/board is SSG'd).
6. **Commit + push to `production`** (Vercel auto-deploys), then share the link: `https://findmesomejobs.co.za/jobs/<board>`.

# Supabase Direct Access (SQL / data operations)

**This is how we run SQLs / data operations on Supabase directly** — no `psql`, no Supabase CLI `db execute` (that command doesn't exist).

- **Method that works on this machine:** `curl.exe` + the service role key. Project ref `nnebtygloqixibbjxsjr`, base `https://nnebtygloqixibbjxsjr.supabase.co`. Key lives in `.opencode/supabase-access.env` (local-only, `.opencode/` is gitignored). Full recipes in the session file `supabase-sql-direct-access_2026-08-09_11-00-00_COMPLETE.json`.
- **CRITICAL:** Do NOT use PowerShell `Invoke-RestMethod`/`Invoke-WebRequest` for Supabase calls — a system proxy on this machine returns 401 for them. Always use `curl.exe` with headers `-H "apikey: <key>" -H "Authorization: Bearer <key>"`.
- **Works today (service key bypasses RLS):**
  - CRUD any exposed `public` table: `DELETE/GET/PATCH /rest/v1/<table>?<col>=eq.<value>`.
  - Row counts: add headers `-H "Prefer: count=exact" -H "Range: 0-0"`, read the `Content-Range: 0-0/N` header.
  - Storage list: `POST /storage/v1/object/list/<bucket>` — JSON body from a file (`-d '@file'`, PowerShell mangles inline JSON); files live under `<user_id>/<filename>`.
  - Storage delete: `DELETE /storage/v1/object/<bucket>/<path>` (URL-encode the filename).
  - Auth users: `GET/DELETE /auth/v1/admin/users` (PostgREST does NOT expose the `auth` schema).
- **New tables / migrations (DDL):** PostgREST can't run DDL. Either apply `supabase/migrations/*.sql` in the Supabase dashboard SQL editor, or add a Management API access token (`sbp_...`) to hit `POST /v1/projects/{ref}/database/query`.
- **DDL in the dashboard SQL editor: run statements ONE AT A TIME.** Studio executes a pasted multi-statement script as a single transaction and the Results tab effectively reports only the *last* statement — so a script whose earlier statement failed (or that never actually ran) still reads `Success. No rows returned.` Verify each step with its own `SELECT`.
- **Never treat REST as proof that a migration ran (PostgREST v14 stale schema cache).** After DDL the Data API can still return `{"code":"42703","message":"column ... does not exist"}`, omit the new column from the OpenAPI spec at `/rest/v1/`, AND omit it from `select=*`, while the column exists in Postgres. Fix: `select pg_notification_queue_usage();` (Supabase-documented; `NOTIFY pgrst, 'reload schema';` is the blunt version and silently no-ops if a reload is already in flight). Authoritative check: `select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='<table>' and column_name like '<prefix>%';`. Full write-up: `.opencode/context/supabase-access/supabase-direct-access_2026-10-17.md`.
- **curl.exe gotcha:** `-o $null` is silently dropped by PowerShell, so curl consumes the next flag as its output filename and the request goes out malformed → `401 Unauthorized` with no body. Always pass a real path (`-o recycle_bin\out.txt`).
- **GRANTS REQUIRED (Oct 30 2026 Supabase change):** New tables in `public` no longer get automatic Data API grants. Any migration that `CREATE TABLE`s MUST include `GRANT ALL ON TABLE public.<table> TO anon, authenticated, service_role;` in the same migration, or PostgREST returns `permission denied`/404 for BOTH user (anon/authenticated) AND admin (service_role) access — service_role bypasses RLS, not grants. This also applies to preview branches and `supabase db reset`. Existing tables keep their grants. Pattern already applied in migrations 019/022/026/028/030/031/033/035.
- **Gotcha:** `job_extractions` (migration 031) and `search_checkpoints` FK to `auth.users` **without** `ON DELETE CASCADE` — the app's "delete account" flow breaks on them (SQLSTATE 23503). Other user tables cascade fine.

# Context Files — organization rules

Context files live in `.opencode/context/`, grouped into category folders. Each category is a **string of related incidents**: a feature/topic plus every later problem that relates to it (e.g. a flow, then follow-up bugs on that flow). These are the curated knowledge layer; the automated per-session JSON log lives separately under `.opencode/session-context/` (see Session Context Protocol below).

**Exception — FMSG Agents context lives in the sub-project, not here:** `src/apps/fmsg-agents/docs/context/`. The desktop app has its own architecture, release cadence and OTA rules, and its incidents were polluting the website context tree. Do not create new FMSG Agents context files under `.opencode/context/`.

### Which context files to read (route by task)

Read **one** chain — the one that matches the task — plus `docs/context/FMSG_ECOSYSTEM_ARCHITECTURE.md` when the task crosses subsystems. Reading every chain wastes context and buries the relevant incident.

| Task is about… | Read first | Then (if the first file points there) |
|---|---|---|
| FMSG Agents UI, screens, design system, renderer CSS | `src/apps/fmsg-agents/docs/context/fmsg-agents-visual-fidelity_2026-11-03.md` | `src/apps/fmsg-agents/docs/context/fmsg-agents-ui-redesign_2026-11-03.md` |
| FMSG Agents release, version bump, OTA manifest, installer | `src/apps/fmsg-agents/docs/changelog/INDEX.md` | `src/apps/fmsg-agents/docs/context/agent-release-v0.6.0_2026-11-02.md` → `agent-framework-v0.3.0_2026-10-30.md` |
| FMSG Agents auth, zero-PII device key, Paystack billing, live runner | `src/apps/fmsg-agents/docs/context/agent-release-v0.6.0_2026-11-02.md` | `docs/context/FMSG_AGENTS_SUBPROJECT.md` |
| Website search pipeline (`/api/search`) | `.opencode/context/search-pipeline/` | `docs/context/FMSG_ECOSYSTEM_ARCHITECTURE.md` |
| ATS / AI scoring, pgvector fusion | `.opencode/context/ats-scoring/` | — |
| Job boards, job cards, board SEO pages | `.opencode/context/job-boards/` | — |
| Supabase SQL, storage, auth admin, DDL verification | `.opencode/context/supabase-access/` | — |
| Branding / Google Business Profile assets | `.opencode/context/branding/` | — |
| Architecture, past decisions, known gaps (any subsystem) | `docs/context/FMSG_ECOSYSTEM_ARCHITECTURE.md` | `docs/context/DECISIONS_LOG.md`, `docs/context/KNOWN_ISSUES_AND_GAPS.md` |
| A specific FMSG Agents bug / regression | `src/apps/fmsg-agents/docs/changelog/INDEX.md` (find `vGOOD`..`vBAD`) | that version's file only |

### IMPORTANT: finding context files
The Glob/Grep file tools SKIP hidden/dot-directories, so `.opencode/context/` is invisible to them (`glob(".opencode/context/**/*.md")` returns nothing). To list/search website context files you MUST use the shell or the Read tool instead:
```powershell
Get-ChildItem -Recurse -Filter *.md -Path ".opencode\context" | Select-Object FullName
Get-ChildItem -Recurse -Filter *.md -Path ".opencode\context" | Select-String -Pattern "keyword" -SimpleMatch
```
`src/apps/fmsg-agents/docs/context/` and `docs/context/` are **not** hidden, so normal Glob/Grep works there.

### Category folders
- ats-scoring/ — deterministic ATS scoring pipeline (scoring engine swap, Vercel logging, pgvector RRF fusion, spec dedup)
- search-pipeline/ — /api/search flow (search profile persistence & PF fixes, deadline awareness, screening checkpoints/pauses and their removal)
- job-boards/ — static job cards & board pages (card posts/removals lifecycle, detail pages + SEO, board navigation/global page)
- supabase-access/ — direct Supabase SQL/data operations (curl.exe workflow, storage/auth admin, DDL verification & PostgREST schema-cache traps, schema gotchas)
- branding/ — Google Business Profile images and other brand assets

> FMSG Agents context is **not** here — it lives in `src/apps/fmsg-agents/docs/context/` (see the exception above and the routing table).

### Committed Architecture & Sub-Project Context (`docs/context/`)
In addition to `.opencode/context/`, the repository tracks four canonical context documents in `docs/context/` that **every session must read first**:
- `docs/context/FMSG_ECOSYSTEM_ARCHITECTURE.md` — Root architecture overview, tables, RLS, services, data flows, secret handling (names only), and file index.
- `docs/context/FMSG_AGENTS_SUBPROJECT.md` — FMSG Agents desktop sub-project architecture, IPC, OTA engine, and release workflow.
- `docs/context/DECISIONS_LOG.md` — Dated log of architectural decisions, prototype mistakes (`v0.1.0`–`v0.5.1`), and production fixes (`v0.6.0`).
- `docs/context/KNOWN_ISSUES_AND_GAPS.md` — Full component audit table, known external dependencies, and production promotion checklist.

### FMSG Agents Context (`src/apps/fmsg-agents/docs/context/`)
Tracked in-repo alongside the sub-project, so these are normal `git add` (no `-f` needed). File naming and intro-paragraph rules are the same as `.opencode/context/`:
- `agent-framework-v0.3.0_2026-10-30.md` — `v0.3.0` framework (semver/OTA skeleton, config, auth).
- `agent-release-v0.6.0_2026-11-02.md` — `v0.4.0`→`v0.6.0` (auth failure, zero-PII device key, live runner, Paystack).
- `fmsg-agents-ui-redesign_2026-11-03.md` — `v0.7.0` mockup redesign, secret vault, bundles.
- `fmsg-agents-visual-fidelity_2026-11-03.md` — `v0.7.1` visual-fidelity pass, OTA notes, deferred version-chip bug.

# FMSG Agents Version Log Rules (`src/apps/fmsg-agents/docs/changelog/`)

- **Read `INDEX.md` first before any bug investigation:** Before investigating any bug or regression in FMSG Agents, read `src/apps/fmsg-agents/docs/changelog/INDEX.md` first, identify the version boundary (`vGOOD`..`vBAD`), open only that version's file, and diff the git tags (`git diff vGOOD..vBAD -- src/apps/fmsg-agents src/app/api/agent`).
- **Log every change in `UNRELEASED.md` in the same commit:** Every change to FMSG Agents, however small, must be recorded in `src/apps/fmsg-agents/docs/changelog/UNRELEASED.md` in the **same commit** as the change. A task is not finished until the log is updated.
- **Relative version bumps at release:** At release time, always read the actual version currently in the repo (`src/apps/fmsg-agents/package.json` and `src/apps/fmsg-agents/config.ts`) — never bump from a number remembered from an earlier prompt:
  - Small fix → raise the **patch** number (`x.y.Z`).
  - Modest update / feature → raise the **minor** number (`x.Y.0`, resetting patch to `0`; may jump more than one step if requested).
  - Big breaking / architectural change → raise the **major** number (`X.0.0`, resetting minor and patch to `0`).
  - Report the resulting version number, move `UNRELEASED.md` into `src/apps/fmsg-agents/docs/changelog/YYYY-MM-DD_vX.Y.Z_short-title.md`, update `INDEX.md`, and create the git tag (`vX.Y.Z`).
- **Disagreement rule:** If the version log and the code ever disagree, state the discrepancy explicitly and fix the log immediately.

### Naming requirement
Every context file MUST be named `topic_YYYY-MM-DD.md`, where YYYY-MM-DD is the file's last-modified date. New files use the current date. When a file is substantially edited on a later day, rename it to the new date.

### Placement rule
When creating a new context file, decide whether it is part of an existing string of related incidents or a brand-new string:
- **Part of an existing chain** (a follow-up problem/change on something already documented) → place it in that chain's category folder.
- **Brand-new string** → create a new category folder (kebab-case theme name) AND add it to the list above. This is only allowed when the file is unrelated to every existing category — never create a folder just to isolate a single file that could join an existing chain.

### Opening intro (summary paragraph)
Every context file starts with a short intro paragraph right under the title, before
any `## Problem` / `## Fix` sections:
- First sentence: what was done — the change/fix at a glance.
- For a follow-up file in a topic chain, add one sentence noting what the user
  reported *after* the earlier change (a regression or a newly-surfaced issue), so
  a reader sees how this file connects to the chain.

### Cross-references (by path)
When a point, issue, or action relates to another context file, reference it by its
**full path** (e.g. `.opencode/context/search-pipeline/search-some-fix_2026-08-28.md`)
rather than only describing it in prose. Apply this anywhere it's relevant, not just
the overview — the intro, the `## Problem`, and especially the **`## Fix` / actions**
(e.g. "undid what was done in `xyzpath` by doing xyz, then reinstated the previous
version created in `xyz2path`"). Because Glob/Grep silently skip `.opencode/`, a
by-path reference is the only reliable way to keep a related file discoverable and
solidifies the context chain.

### Relationship to session-context
`.opencode/session-context/sessions/*.json` remain the automated per-session log managed by that skill — do not reorganize or delete them by hand. When a session produces a durable lesson (root cause, architectural decision, gotcha), distill it into the matching context file — or update the existing one — as part of session wrap-up.

# Session Context Protocol (via session-context skill)

- **On session start**: Skill reads `.opencode/session-context/index.json`, flags any `INCOMPLETE` sessions, loads recent context (last 5).
- **During session**: New session file created at first user interaction. Key decisions (confirmations, architectural choices, root causes) appended automatically.
- **On task completion**: When you confirm a fix works, run `session-context:complete <id>` or tell the agent "mark session complete". Skill sets `done: true`, `user_confirmed: true`, updates registry.
- **Rule 1**: If any prior session is `INCOMPLETE`, skill MUST surface it at session start with summary.
- **Rule 2**: Skill handles all file I/O for session logging automatically.
- **Secrets**: API keys, tokens, passwords, emails are auto-redacted before write.
- **Tracking caveat (observed 2026-10-17)**: `.opencode/` is gitignored (the Supabase service key lives there), so session JSONs and context files are **local-only** unless force-added — `git add -f .opencode/session-context .opencode/context` (never `.opencode/supabase-access.env`, never `.opencode/node_modules`). `index.json` *is* tracked, so the registry can reference session files that do not exist in the repo; check `git status --ignored` before claiming a "session bookkeeping" commit landed anything.
- **Background work must be logged too**: if a session leaves anything running (watchers, dev servers, polling jobs) or observes deploy/build state, record it in the session JSON `actions` **and** the matching context file — the exact command, the output file path, what it does, and when it expires. A silent background job must be distinguishable from a dead one.

# Recycle Bin / Restore
**NEVER delete files directly.** When a file is "deleted", you MUST move it to `/recycle_bin` instead of running `rm` or `Remove-Item` on the original location. Add an entry to the table below detailing the original path and purpose.

| File Path | Description |
|-----------|-------------|
| `scripts/tmp-geo-check.ts`, `scripts/tmp-tsconfig.json` | Throwaway ts-node harness + project config used to run the 2026-10-17 location-scope geo matrix (18 location cases × 5 scopes × 2 user locations) against `src/lib/location.ts`; the empty `scripts/` dir created for them was removed |
| `eslint-out.json`, `eslint-out2.json` | eslint JSON reports from the 2026-10-17 location-scope change, kept only to compare the 3 profile-editor components against their pre-change baseline |
| `recycle_bin/update_session_logging_steps.py`, `recycle_bin/update_context_log_completeness.py`, `recycle_bin/update_agents_recycle_row.py`, `recycle_bin/log_watchers.py`, `recycle_bin/log_watchers3.py`, `recycle_bin/log_watchers_w2.py`, `recycle_bin/deployments.json`, `recycle_bin/logs-workaround.txt` | Throwaway Python/dump harnesses written 2026-10-18 to append the Vercel-logging steps (25-28) + `background_tasks` to the `location-scope-filter` session JSON, insert the "Vercel log completeness" section into the search-pipeline context file, and to hold a GitHub deployments-API response while probing deploy state; `promotewatch.txt` / `promotewatch_aaaa5c7.txt` / `promotewatch_56a65e3.txt` / `promotewatch_any_new.txt` / `promotewatch_any_new_w2.txt` / `log_watchers.py` (this row's author) are the promotion watchers' outputs and bookkeeping (see the background-task entries in the session JSON) |
| `recycle_bin/append_streaming_steps.py` | Throwaway Python harness written 2026-10-18 to append the streaming-pipeline steps 34-37 + key decisions + files_modified to the `location-scope-filter` session JSON |
| `recycle_bin/append_ai_scoring_steps.py` | Throwaway Python harness written 2026-10-18 to append the rate-limit-fix + ATS→AI-scoring-swap steps 38-41 + key decisions to the `location-scope-filter` session JSON |
| `recycle_bin/backfill_industry_step2.ps1`, `recycle_bin/pf_before.json`, `recycle_bin/pf_current.json`, `recycle_bin/pf_after.json`, `recycle_bin/pf_patch_body.json`, `recycle_bin/pf_patch_out.txt`, `recycle_bin/pf_all.json` | 2026-10-26 PF 4-round/ladder-trim work: service-role REST PATCH loop that backfilled `search_profiles.industry_step_2` from `industry_step_4` (27 rows), plus the before/current/after dumps used to verify `still-mismatched=0`. `pf_all.json` is the earliest full dump and is the rollback snapshot |
| `recycle_bin/dbg2.ps1`, `recycle_bin/dbg2.json`, `recycle_bin/ref.txt`, `recycle_bin/commit-msg.txt`, `recycle_bin/deployments_9ecfdc7.json`, `recycle_bin/deployments2.json`, `recycle_bin/status2.json`, `recycle_bin/append_session_entry.js` | Throwaway 2026-10-26 outputs: the curl debug pair that exposed the PowerShell `"$base?select"` string-interpolation bug (HTTP 000, empty body), scratch files, GitHub deployments/commit-status dumps used to check the Vercel Preview-vs-Production state of commit `9ecfdc7`, and the node script that appended the session entry to `index.json` without reformatting the file (PowerShell's `Set-Content` round-trip had added a BOM and mojibake'd existing em dashes) |
| `recycle_bin/legacy-preview-tmp/page.tsx`, `recycle_bin/preview.html`, `recycle_bin/preview_done.html`, `recycle_bin/dev-server.log`, `recycle_bin/dev-server.err.log` | Throwaway Next.js route (moved out of `src/app/`) that rendered the legacy-profile popup with mock props so its idle and done states could be checked via SSR HTML, plus the captured HTML and the dev-server logs. The headless browser was unavailable (`connect ECONNREFUSED 127.0.0.1:9222`), so no screenshots exist |
| `recycle_bin/check_legacy_predicate.js`, `recycle_bin/pf_legacy_check.json` | Replay of the `isLegacyLadderProfile` predicate against a live `search_profiles` dump (30 rows) to confirm the legacy-popup trigger: 29 flagged, 28 by title surplus, 28 by retired rungs |
| `recycle_bin/append_legacy_actions.js`, `recycle_bin/fix_deploy_notes.js`, `recycle_bin/finalize_session.js`, `recycle_bin/commit-msg2.txt`, `recycle_bin/commit-msg3.txt`, `recycle_bin/deployments3.json`, `recycle_bin/deployments_827a328.json`, `recycle_bin/dep_status.json`, `recycle_bin/dep_status_827.json` | Session-bookkeeping harnesses and Vercel deployment/status dumps from the same 2026-10-26 session (appending the legacy-popup actions to the session JSON, correcting the deploy notes after `20d5749` was promoted, and confirming the Preview build of `827a328` succeeded) |
| `recycle_bin/bundle-test-v070.js`, `recycle_bin/commit-msg-070.txt`, `recycle_bin/commit-msg-070b.txt`, `recycle_bin/deployments_070b.json`, `recycle_bin/deployments_070c.json`, `recycle_bin/deployments_070.json`, `recycle_bin/dep_status_*.json`, `recycle_bin/manifest_stable_070.json`, `recycle_bin/list_body.json`, `recycle_bin/updates_list.json`, `recycle_bin/preview_plans.json`, `recycle_bin/live_plans_070.json` | 2026-11-03 FMSG Agents `v0.7.0` release bookkeeping: a non-minified esbuild renderer bundle used to confirm the redesign compiles, the commit-message files (the first one carried a PowerShell UTF-8 BOM into the subject line, hence the `-b` rewrite), GitHub deployments/status dumps and the Vercel preview probe used to confirm `ba60675` built as a Preview only, the re-signed `stable` manifest downloaded back to verify `version 0.7.0` / `min_supported_version 0.6.0`, the storage bucket listing body/response, and the live production `/api/agent/billing/plans` response captured to prove promotion had not happened yet |
| `recycle_bin/fmsg_agents_old_preload.js`, `recycle_bin/fmsg_agents_old_style.css`, `recycle_bin/fmsg_agents_old_keys`, `recycle_bin/fmsg_agents_old_version-manager.ts`, `recycle_bin/fmsg_agents_old_LoginPopup.tsx`, `recycle_bin/fmsg_agents_old_SensitiveEntryPopup.tsx`, `recycle_bin/fmsg_agents_old_ProfileBar.tsx`, `recycle_bin/agent-release-v0.5.0_2026-11-01.md`, `recycle_bin/agent_devices_check.json`, `recycle_bin/rpc_check.json`, `recycle_bin/del_probe.txt`, `recycle_bin/live_plans_probe.json`, `recycle_bin/upload_out.json`, `recycle_bin/manifest.*.sig.json`, `recycle_bin/old_0.4.0_*.nsis.7z`, `recycle_bin/old_0.5.0_*.nsis.7z`, `recycle_bin/old_FMSG_Agents_Setup_0.3.0.exe*`, `recycle_bin/old_FMSG_Agents_Setup_0.4.0.exe*`, `recycle_bin/old_FMSG_Agents_Setup_0.5.0.exe*`, `recycle_bin/old_FMSG_Agents_Setup_0.5.1.exe*`, `recycle_bin/slot_active_before_retest_*`, `recycle_bin/slot_backup_before_retest_*`, `recycle_bin/run_agent_verification_suite.js`, `recycle_bin/run_live_auth_rls_test.js`, `recycle_bin/reproduce_human_auth.js`, `recycle_bin/verify_human_auth_fixed.js`, `recycle_bin/run_v050_ota_matrix_tests.js`, `recycle_bin/prove_live_packaged_ota_beta.js`, `recycle_bin/verify_futuristic_gui_ota.js`, `recycle_bin/screenshots/*.png` | 2026-10-31 / 2026-11-03 FMSG Agents v0.4.0–v0.6.0 releases: retired uncompiled root `preload.js` and legacy `renderer/style.css`, retired prototype components (`version-manager.ts`, `LoginPopup.tsx`, `SensitiveEntryPopup.tsx`, `ProfileBar.tsx`), superseded `2026-11-01` context file, `curl.exe` verification probe outputs, stale empty `keys/` directory, superseded `0.3.0`/`0.4.0`/`0.5.0`/`0.5.1` installers & intermediate `.nsis.7z` archives, automated verification suites, human-speed Playwright Electron input harnesses & screenshots, 13-scenario OTA & zero-PII device-key test suite, live packaged `.exe` OTA proof, and v0.5.1 Futuristic Cosmic Glassmorphic GUI verification harness & screenshots (`recycle_bin/screenshots/futuristic_gui_v051/`) |
| `recycle_bin/old_installers/`, `recycle_bin/probe-signup-height.cjs`, `recycle_bin/cleanup_search_profiles_2026-11-03.cjs`, `recycle_bin/backup_saved_jobs_2026-11-03.json`, `recycle_bin/backup_search_profiles_2026-11-03.json`, `recycle_bin/rollback_search_profiles_2026-11-03.json`, `recycle_bin/verify_search_profiles_after.json`, `recycle_bin/check_039_columns.json` | 2026-11-03 Phase 1A/1B work: superseded `0.3.0`/`0.5.1`/`0.6.0`/`0.7.0`/`0.7.1` installers and blockmaps moved out of `dist/electron/` before building `0.8.0`; the throwaway signup-height probe that exposed the stale-injected-CSS trap in the screenshot harness; the `search_profiles` cleanup script (12 rows) with its pre-change backup, rollback snapshot and post-change verification dump; and the REST probe proving Migration 039 (`review_status` / `archived_at`) is not yet applied (`42703`). `backup_saved_jobs_2026-11-03.json` is the pre-migration snapshot (0 rows) |
