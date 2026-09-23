<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Context

- **Project:** FMSG (Find Me Some Jobs) — AI-powered South African job matching SaaS
- **Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase, Paystack, SerpAPI
- **Deploy:** Vercel (beta → production, no main branch)
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
- **GRANTS REQUIRED (Oct 30 2026 Supabase change):** New tables in `public` no longer get automatic Data API grants. Any migration that `CREATE TABLE`s MUST include `GRANT ALL ON TABLE public.<table> TO anon, authenticated, service_role;` in the same migration, or PostgREST returns `permission denied`/404 for BOTH user (anon/authenticated) AND admin (service_role) access — service_role bypasses RLS, not grants. This also applies to preview branches and `supabase db reset`. Existing tables keep their grants. Pattern already applied in migrations 019/022/026/028/030/031/033/035.
- **Gotcha:** `job_extractions` (migration 031) and `search_checkpoints` FK to `auth.users` **without** `ON DELETE CASCADE` — the app's "delete account" flow breaks on them (SQLSTATE 23503). Other user tables cascade fine.

# Context Files — organization rules

Context files live in `.opencode/context/`, grouped into category folders. Each category is a **string of related incidents**: a feature/topic plus every later problem that relates to it (e.g. a flow, then follow-up bugs on that flow). These are the curated knowledge layer; the automated per-session JSON log lives separately under `.opencode/session-context/` (see Session Context Protocol below).

### IMPORTANT: finding context files
The Glob/Grep file tools SKIP hidden/dot-directories, so `.opencode/context/` is invisible to them (`glob(".opencode/context/**/*.md")` returns nothing). To list/search context files you MUST use the shell or the Read tool instead:
```powershell
Get-ChildItem -Recurse -Filter *.md -Path ".opencode\context" | Select-Object FullName
Get-ChildItem -Recurse -Filter *.md -Path ".opencode\context" | Select-String -Pattern "keyword" -SimpleMatch
```

### Category folders
- ats-scoring/ — deterministic ATS scoring pipeline (scoring engine swap, Vercel logging, pgvector RRF fusion, spec dedup)
- search-pipeline/ — /api/search flow (search profile persistence & PF fixes, deadline awareness, screening checkpoints/pauses and their removal)
- job-boards/ — static job cards & board pages (card posts/removals lifecycle, detail pages + SEO, board navigation/global page)
- supabase-access/ — direct Supabase SQL/data operations (curl.exe workflow, storage/auth admin, schema gotchas)
- branding/ — Google Business Profile images and other brand assets

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

# Recycle Bin / Restore
**NEVER delete files directly.** When a file is "deleted", you MUST move it to `/recycle_bin` instead of running `rm` or `Remove-Item` on the original location. Add an entry to the table below detailing the original path and purpose.

| File Path | Description |
|-----------|-------------|
| - | - |
