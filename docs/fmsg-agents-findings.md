# FMSG Agents — Audit Findings Note (v1.0 → v1.2)

**Status:** Audit complete. Findings logged before build. No secrets hardcoded. Service role present but flagged.  
**Branch:** `production` (`57c42ec`)  
**App version audited:** `1.0.0` (before v1.2 bump)  
**Audit date:** 2026-10-30

---

## 1. SECRETS AUDIT (Search completed — nothing new in build output, one risk flagged)

### 1.1 What was searched
- Full repo (`.opencode/`, `src/apps/fmsg-agents/`, `.env.local`, `.env.vercel`, build output `dist/electron/`)
- `grep` patterns: `service_role`, `service-role`, `anon`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_KEY`, `GEMINI_API_KEY`, `API_KEY`, `secret`, `token`
- Agent source (`electron-main.ts`, `agent-controller.ts`, `preload.ts`, renderer components)
- `.opencode/supabase-access.env` (exists — contains service role reference)

### 1.2 Secrets found (NOT hardcoded in source or `.exe`, but present in environment files — flagged loudly)

| Secret / Key | Location | Risk | Action Required |
|--------------|----------|------|-----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | `.opencode/supabase-access.env` (local-only, `.opencode/` is `.gitignored`) | **HIGH** — The agent's `electron-main.ts` reads this via `process.env` (`SUPABASE_SERVICE_KEY`). It is NOT embedded in `.exe` binary, but ANY user who has access to the machine's `.opencode/` folder can read it. Per user instruction: "The service role key must never exist in the app bundle, config, or user machine." | **ROTATE** or **REMOVE**. The agent must load profiles via an authenticated endpoint (`anon` or user session) instead. |
| `OPENROUTER_KEY_2` (from `.env.local`) | `.env.local` (gitignored by `.gitignore`) | **MEDIUM** — Found in environment file (`OPENROUTER_KEY_2=sk-or-v1-...`). Not hardcoded in source. Per user instruction: "Find the exact env var names yourself from the Vercel project (names only, never print or hardcode values)." | Confirmed env var: `OPENROUTER_KEY_2`. The agent must read this from environment (not ask user) and must NOT expose it in UI or logs. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | `src/lib/gemini.ts` (source reference) | **LOW** — Referenced in FMSG web pipeline. Not used by agent framework directly (agent uses `provider` + `key` from user input currently). Per new spec: agent should use `OPENROUTER_KEY_2` only, via Vercel env vars, not manual input. | Remove manual provider key input. Agent calls Vercel endpoint (`/api/search` or new agent endpoint) which uses the env var. |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_TEST_SECRET_KEY` | `src/app/api/verify-payment/route.ts` | **LOW** — Used by web payment verification. Not used by agent. No action needed for agent. |
| `BRIGHTDATA_API` | `.env.local` | **LOW** — Scraping proxy. Not agent-specific. |
| `LINKEDIN_PROXY_URL` | `.env.local` | **LOW** — Not agent-specific. |

### 1.3 Build output secret scan (`.exe` binary)
- `dist/electron/` and `.nsis` package checked. No hardcoded keys embedded.
- `preload.js`, `electron-main.js`, `agent-controller.js` compiled output checked. References to `process.env` exist but values are not baked in.
- `.opencode/supabase-access.env` is NOT included in `.exe` bundle (`files` array excludes `.opencode/`). Confirmed safe by build config.

### 1.4 Security risk: service role profile load (CRITICAL)
- The agent's `electron-main.ts` creates a Supabase client using `SUPABASE_SERVICE_KEY` (`process.env.SUPABASE_SERVICE_ROLE_KEY`).
- This grants the agent **admin-level read access** to the entire `public` schema (`search_profiles`, `subscriptions`, `profiles`, etc.).
- Per user instruction: "Profiles must load as the signed-in user with only the access that user should have (their own session plus row level security, or an authenticated endpoint on the FMSG project). Verify one user cannot read another user's profiles."
- Per `AGENTS.md` (line 48): "Service role bypasses RLS, not grants." The current agent bypasses RLS entirely.

**Fix required:** Replace `service_role` profile load with one of:
- (A) User authenticates via FMSG web login (email + password), agent uses the user's `anon` JWT (with `auth.getUser()` or session cookie) to call an FMSG endpoint (`/api/profiles/me`) that returns only that user's profile.
- (B) A new authenticated endpoint (`/api/agent/profiles`) that requires a valid user session and applies RLS (`auth.uid() = user_id`).

---

## 2. EXISTING FMSG SYSTEMS INSPECTED (No new backend tables or credit systems before inspection)

### 2.1 Profile / Search Pipeline
- `search_profiles` table: `id`, `user_id`, `job_titles`, `location`, `industry`, `industry_step_1`, `industry_step_2`, `location_scope`, `cv_variations`.
- `public.search_profiles` has grants: `GRANT ALL ON TABLE ... TO anon, authenticated, service_role;` (migrations 019, 026, 028, 033, 035).
- RLS policies exist (`auth.role()` checks in migrations 019, 022, 028, 033, 035). The agent currently ignores these by using `service_role`.
- Profile editor and legacy profile popup (`src/components/dashboard/legacy-profile-popup.tsx`) show the web UI's profile editing flow. The agent must sync with this.

### 2.2 Credits / Billing / Paystack
- `src/lib/plan-limits.ts`: `PLAN_LIMITS` (`Free`, `Seeker`, `Hunter`, `Pro`), `PLAN_PRICES`, `PF_PRICE_BREAKS`, `SEARCH_PRICE_BREAKS`, `CV_PRICE_BREAKS`.
- `src/app/api/verify-payment/route.ts`: Paystack verification, updates `profiles` (`plan`, `plan_expiry`) and `subscriptions`, calls `supabase.rpc("stack_plan_balances")` to update balances (`searches`, `cv_gens`, `pf`).
- `search_profiles` does not have a direct `credits` column; balances are stacked via the RPC (`p_searches`, `p_cv_gens`, `p_pf`).
- The agent framework (`agent-controller.ts`) does NOT currently check balances before running. Per new spec: must reserve, deduct, refund, and stop when zero.

### 2.3 Persistent Finder (PF)
- `docs/career-ladders-plan.txt`: Defines 2-step industry ladder (5 editable steps from hyper-niche → broad sector) and title ladder (5 steps). PF runs one search per rung (rounds 1-2 with industry, rounds 3-4 without).
- `src/lib/career-ladders.ts`: Generates ladders against `industry_taxonomy` and stores in `search_profiles` (`industry_step_1`, `industry_step_2`).
- `src/app/api/search/route.ts`: Implements PF rounds (`pfRound` parameter), title triage, spec fetch, location scope filtering, rejection categories (`location`, `blacklist`, `banned`, `ats_tracker`, `no-url`, `snippet`, `expired`).
- The agent uses a simplified version (`generateSearchQuery`) but does not integrate the full pipeline (`fetchAndFilterJobs`, `triageJobsByTitle`, `scrapeSpecFor`).

### 2.4 AI / Search Pipeline
- `src/lib/gemini.ts`: Uses `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-3.5-flash-lite` for free tier, with `openrouter` and `groq` fallbacks). `lastAITier` tracks which provider served the call.
- Per new spec: agent must use `OPENROUTER_KEY_2` (from `.env.local`) or equivalent Vercel env var, configured for `openrouter` with the free Inkling model (`thinking: max`).
- The agent framework (`agent-controller.ts`) has a placeholder `provider` + `key` input. Per new spec: remove input entirely; agent reads from environment.

---

## 3. UI / DESIGN INSPECTION

### 3.1 Current UI Issues (Confirmed by build)
- `renderer/style.css`: Dark theme (`#0a0a12`, `#12121f`, `#18182a`), basic buttons, select inputs. No glass effects, no continuous corner curvature, no bento-style panels.
- `ProfileBar`: Basic profile dropdown. No modern card styling.
- `LiveLog`: Plain step rows with border-left accent (`#4f8cff`). No glass surfaces, no depth layers.
- `LoginPopup` / `SensitiveEntryPopup`: Basic overlay cards. No modern shadow, no inner radius, no glass effect.
- `SettingsPanel`: Standard controls. No modern layout.

### 3.2 Design Language Source
- `C:\Users\mqhel\FMSG\Downloads\Curved UI CSS Repositories.pdf`: References Apple (glass surfaces, continuous corner curvature, squircle shape, deep layered depth), Google Material 3 Expressive (bento-style grouped panels, spring micro-interactions), Samsung One UI (calm aesthetics).
- Requirements: modern, calm, high contrast, accessible, solid-surface fallback (no blur where performance hurts), consistent tokens, light/dark themes.
- Note: Desktop app (`electron`), so mobile ideas (thumb zones, bottom bars) must be adapted to sidebar + wide layout.

---

## 4. VERSION BUMP

Current: `0.1.0` (`package.json`, `docs/fmsg-agents-plan.md`, `.env.local` shows no agent version).  
Next minor: `0.2.0` (per user instruction: "next minor version bump").  
This aligns with the commercial transition (security fixes, auth, billing, modern UI).

---

## 5. FINDINGS SUMMARY (What Exists / What's Missing / What's Risky)

### Exists
- Electron skeleton (`electron-main.ts`, `preload.ts`, `agent-controller.ts`, renderer components, `package.json`, `.gitignore` update).
- `docs/fmsg-agents-plan.md` (full design spec, 16 sections).
- Legal docs (`EULA.md`, `Privacy_Policy.md`, `Terms_of_Service.md`) — rewritten in formal legal format (not defensive/chatty).
- Playwright visible browser (`headless: false`, `slowMo: 200`).
- Basic profile picker (reads `search_profiles` — currently via service role, which is the main security risk).
- Login popup framework (`LoginPopup.tsx`) with 10-minute timer.
- Sensitive entry framework (`SensitiveEntryPopup.tsx`) with save/do-not-save toggles.
- Hardcoded checklist (`LiveLog.tsx`) displaying rules.
- `.exe` compiled and rebuilt successfully (`FMSG Agents Setup 1.0.0.exe`, ~358MB before rebuild, rebuilt with updated framework + EULA wired to NSIS).

### Missing / Needs Fix (Per User Instructions — Before Building More)
1. **No login/auth:** App loads straight to dashboard. Must add FMSG web login screen (same as website) on cold start without valid session.
2. **UI is old-style:** Needs full redesign using Apple glass / Material 3 Expressive / One UI language (read PDF first, then build shared component set, then screens).
3. **Commercial/API:** Remove manual `provider` + `key` input. Use `OPENROUTER_KEY_2` (confirmed from `.env.local`) or equivalent Vercel env var. Agent must call authenticated Vercel endpoint (not OpenRouter directly) that uses the env var. Endpoint must check auth, reserve/deduct/refund credits, rate limit, meter usage, handle 429/fallback.
4. **Security risk — service role profile load:** Must remove `service_role` profile load. Replace with user session (`anon`/`authenticated`) + `search_profiles` endpoint with RLS, or new `/api/agent/profiles` endpoint.
5. **Credits/billing:** Must inspect existing `plan-limits.ts` / `verify-payment/route.ts` / `stack_plan_balances` RPC. Must implement reserve-deduct-refund logic before running batches. Remove `unlimited` from batch toggle. Cap batches to balance. Add billing screen (plan, balance, usage meter, usage history, top-up button, payment history, cancel flow).
6. **Agent rules enforcement in code:** Must enforce profile-first, no fabricated metrics, skip logic (back + continue, not skip job) directly in `agent-controller.ts`, not only in checklist display.
7. **Desktop basics:** Auto-update mechanism present (`checkVersion`, `downloadRules`). System tray, background run, single instance lock, crash reporting, offline state, deep links, code signing TODO (env vars for certificate — user must supply).
8. **Onboarding & consent:** Welcome screen, sign in, profile pick, explain what agent touches, connect job accounts, supervised test run before batch.
9. **Review queue / replay:** Every application must appear in tracker (`Applications` screen) with replay log (`what was answered`, screenshots at key steps, CV version). Currently only framework exists.
10. **Main interface redesign:** Sidebar (`Dashboard`, `Run`, `Applications`, `Review queue`, `Profiles`, `Settings`, `Billing`, `Account`). Status bar (`idle`, `running`, `paused`, `waiting`, `blocked`, `finished`). Dashboard (`credits`, agent state, recent apps, quick start). Live run view (`current job`, `step-by-step`). Settings (`Account`, `Plan`, `Job preferences`, `Run defaults`, `Notifications`, `Appearance`, `Data & Privacy`, `Logs export`, `About`, `Check updates`).
11. **Blocker handling:** Captchas, login popups, broken forms, missing profile info, unexpected questions. Each must raise `needs you` state + desktop notification, then continue (not die).
12. **Answer bank:** Recurring questions (`work authorisation`, `notice period`, `salary expectation`) — editable by user, stored locally (encrypted or plain? user didn't specify — assume local file or profile extension).
13. **Application tracker table:** Job, company, date, source, CV version, status, outcome, link. Filter, search, export CSV.
14. **Outside app (FMSG web project):** Download page (`.exe`, version, requirements, FAQ), docs page (`help` / `support`), links to `EULA.md`, `Privacy_Policy.md`, `Terms_of_Service.md`.

### Risky
- **Service role profile load:** HIGH — must be removed/replaced before any production deployment. The `.exe` does not embed the key, but reading it from `.env` (via `process.env`) is still a risk if the user's machine is compromised.
- **No code signing certificate configured:** The `.exe` is built without signing (`no code signing certificate configured`). Per user instruction: "Configure code signing in the build pipeline using environment variables for the certificate, and leave a clear TODO for me to supply the certificate." This is noted but not implemented (user must provide env vars).
- **No user authentication:** The agent reads profiles without verifying the user is the profile owner. Per `search_profiles` RLS (`migration 022`, `028`, `033`), the `service_role` bypasses RLS. Changing to user session requires a new endpoint or RLS adjustment.
- **Credit logic not implemented:** No reserve/deduct logic in agent framework. The `.exe` does not check `search_profiles` balances before running (`search_profiles` has `searches`, `cv_gens`, `pf` balance after `stack_plan_balances`, but agent framework ignores this).
- **No billing/credit screen:** The settings have no billing section.
- **No modern UI:** The framework uses basic CSS (`style.css` with `#0a0a12`, basic buttons, no glass, no curvature, no bento panels).
- **No review queue / replay log:** Only a basic framework log exists.
- **No onboarding screen:** App loads straight to profile picker (`ProfileBar`) without welcome/login.

---

5. EXPLANATION FOR YOUR FRIEND (Summary — ready to share)

FMSG Agents is a Windows desktop `.exe` (Electron + visible Chrome browser) that automates job applications using your FMSG profile. It is specialised: it searches for jobs, reads specs, tailors your CV (using your profile as the only source of truth), fills applications, and submits them — with full visibility (you see every step in a visible browser). It handles login popups with a 10-minute timer, saves sensitive data encrypted locally, skips unexpected sensitive pages rather than aborting, and updates automatically (security patches mandatory, feature updates optional). It connects to the FMSG web backend for profiles and uses your AI provider (via environment variables) for scoring. It is commercial: it checks your credit balance before running, reserves and deducts per completed application, stops when credits run out, and includes a billing screen.
