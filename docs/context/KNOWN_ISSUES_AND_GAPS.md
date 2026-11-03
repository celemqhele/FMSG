# FMSG Agents — Ecosystem Audit Table, Known Issues & Production Promotion Checklist

> Complete Phase 1 / Phase 2 audit of every FMSG Agents component against the shared FMSG ecosystem, plus what requires manual promotion or external credentials.

---

## 1. Component Audit Table (Prototype State vs. `v0.6.0` Production State)

| Component / Area | Prior State (`v0.1.0`–`v0.5.1`) | `v0.6.0` Production State | Shared FMSG System Used |
|------------------|---------------------------------|---------------------------|-------------------------|
| **Startup Config & Keys (`config.ts`)** | `v0.1.0`–`v0.3.0` referenced `SUPABASE_SERVICE_ROLE_KEY`. Fixed in `v0.4.0`. | **Real:** Bundles only public `SUPABASE_URL`, `SUPABASE_ANON_KEY` (`role: "anon"`), and `RELEASE_PUBLIC_KEYS_PEM`, validated at boot by `validateStartupConfig()`. | Supabase project `nnebtygloqixibbjxsjr` public anon key. |
| **Authentication & Session (`session-manager.ts`, `LoginScreen.tsx`)** | `v0.1.0` had no login; `v0.3.0` crashed in packaged `.exe`; fixed in `v0.4.0`. | **Real:** Full website-parity sign-in, sign-up, password reset, 6-digit email verification, ban check, and OS keyring (`keytar` + DPAPI) persistence with 10-min refresh. | Supabase Auth, `public.profiles`, `public.banned_accounts`, `/api/auth/check-signup`, `/api/auth/record-signup`, `/api/auth/send-verification`, `/api/auth/verify-code`. |
| **Profile Loading (`session-manager.ts`, `agent-controller.ts`)** | `v0.1.0`–`v0.3.0` used service role; fixed in `v0.4.0` + expanded in `v0.6.0`. | **Real:** Loads both `search_profiles` (titles, industry ladder, location, CV path) and `profiles` (name, surname, email, phone, address, desired salary, plan, balances) under the user's RLS JWT. | `public.search_profiles` & `public.profiles` (RLS `auth.uid() = user_id` / `id`). |
| **Device Identity & OTA Updates (`device-key.ts`, `update-manager.ts`, `UpdateProgress.tsx`)** | `v0.4.0` used hardware IDs and missed file downloads; fixed in `v0.5.0`. | **Real:** Zero-PII 256-bit random key in OS Protected Storage, challenge-response RPC auth, Ed25519 signature + SHA-256 verification, atomic `Slot-Active`/`Slot-Backup` swap with auto-rollback. | `public.agent_devices`, `public.agent_device_challenges`, RPCs `issue_agent_device_challenge` & `verify_or_register_agent_device`, `agent-updates` bucket, `/api/agent/updates/check`. |
| **Language Model Access (`agent-controller.ts`, `/api/agent/ai`)** | **Mock/Stub:** No LLM calls were made during runs in `v0.1.0`–`v0.5.1`. | **Real:** Calls authenticated `POST /api/agent/ai` which proxies to OpenRouter (`thinkingmachines/inkling:free` primary + 3 fallback models) using server-side keys and per-user rate limits (`90/min`). | `/api/agent/ai`, `src/lib/rate-limit.ts`, server env `OPENROUTER_API_KEY` / `OPENROUTER_KEY_2`. |
| **Job Discovery (`agent-controller.ts`, `/api/agent/tools/search-jobs`)** | **Mock/Stub:** Opened a raw Google search URL without structured job results. | **Real:** Calls authenticated `POST /api/agent/tools/search-jobs` which runs `searchGoogleJobs` (`src/lib/serpapi.ts`) and returns normalized South African job postings with apply links. | `src/lib/serpapi.ts` (`searchGoogleJobs`), `/api/agent/tools/search-jobs`. |
| **Browser Automation & Form Filling (`agent-controller.ts`, `browser-resolver.ts`)** | **Partial/Stub:** Launched Chrome but did not inspect fields, fill forms, attach CVs, or detect confirmation pages. | **Real:** Opens each ranked posting in visible Chrome/Edge, dismisses cookie banners, detects visible `input`/`textarea`/`select`/`file` fields, uses LLM + deterministic fallback to map verified profile values, attaches the user's CV from `cv-files`, pauses on sign-in walls / captchas / sensitive fields / submit approval, and checks confirmation receipts. | Supabase Storage bucket `cv-files` (RLS), `public.profiles`, `public.search_profiles`. |
| **Live Feed & Browser Preview (`LiveLog.tsx`)** | **Mock:** `v0.5.1` rotated a hardcoded `SAMPLE_COMPANIES` timer every 2.4s with fake HTML preview cards. | **Real:** Renders live `agent-event` IPC steps, real JPEG screenshots (`page.screenshot`) from Playwright, an in-viewport attention prompt wired to `respondAgentAttention`, and an animated `ProfilePicker`. | Electron IPC (`agent-event`, `agent-attention-response`). |
| **Application History Persistence (`agent-controller.ts`)** | **In-memory only:** `this.results` array was discarded when the run ended. | **Real:** `persistJobOutcome()` inserts processed jobs into `public.saved_jobs` under the user's RLS session (with duplicate URL check). | `public.saved_jobs` (migrations `005` & `024`, RLS `auth.uid() = user_id`). |
| **Spend Cap & Plan Billing (`BillingPanel.tsx`, `/api/agent/billing/*`)** | **Mock/Unwired:** Spend cap had number-spinner arrows; plan buttons had no payment gateway. | **Real:** Manual numeric text input (zero spinner arrows) enforced before every job in `reserveCredits()`; live account balances from `profiles`; live plan cards from `/api/agent/billing/plans`; hosted Paystack checkout via `/api/agent/billing/checkout` + idempotent verification polling via `/api/agent/billing/verify` → `/api/verify-payment`. | `src/lib/plan-limits.ts`, `/api/verify-payment`, `public.profiles`, `public.subscriptions`, Paystack API. |
| **Settings View (`SettingsPanel.tsx`)** | **Partial:** `fullPage` mode omitted the Prevent Sleep toggle; dead non-fullPage branch remained. | **Real:** Includes Run Preferences (`Prevent computer from sleeping` wired to `powerSaveBlocker`), Software Updates channel & manual check, Browser & Device Key verification, and Legal Agreements modal links. | Electron `powerSaveBlocker`, `update-manager.ts`, `device-key.ts`, `legal/*`. |
| **Retired Prototype Components (`LoginPopup.tsx`, `SensitiveEntryPopup.tsx`, `ProfileBar.tsx`, `version-manager.ts`)** | **Dead code:** Unreferenced or behind never-called state variables. | **Removed:** Moved to `recycle_bin/` and logged in `AGENTS.md`. | Replaced by `LiveLog.tsx` attention card, `ProfilePicker`, and `docs/changelog/`. |

---

## 2. Known Issues & External Dependencies

1. **Migration 039 is not applied (blocks durable review status).**
   - `GET /rest/v1/saved_jobs?select=review_status,archived_at` returns `42703 column saved_jobs.review_status does not exist` (verified 2026-11-03).
   - Apply `supabase/migrations/039_saved_jobs_review_status.sql` statement-by-statement in the Supabase SQL editor, run its verification queries, then `select pg_notification_queue_usage();` to refresh the PostgREST schema cache.
   - Until then `saved-jobs-list` falls back to the legacy column set and status/archive IPC calls fail softly; the renderer keeps a local override (`fmsg_agents_job_overrides_v1`) so approvals are visible on that PC only.
2. **Release state.** `v0.9.0` is published to both `stable` and `beta` (`requires_installer: false`, `min_supported_version 0.7.0`, signature and artifact hashes read back). `v0.7.2` was superseded before publication; `v0.8.0` was built but not distributed. `dist/electron/FMSG Agents Setup 0.9.0.exe` is the current installer for the main-process alignment. A clean-VM install/upgrade test is still outstanding.
3. **Installer delivery:** `agent-updates` rejects ~92 MB objects (`413 EntityTooLarge`). `scripts/upload-update.js --installer-url <https://…>` plus the fixed external-download path (no Supabase credentials, 15-minute timeout) is the supported workaround; the first installer carrying it must still be distributed manually.
4. **Phase 3 residuals:** invoice/cancellation wiring against Paystack (UI present), real device/session management, motion/density tokens, and an external WCAG 2.2 AA audit — do not claim accessibility certification before that audit.
5. **Vercel Deployment Promotion Required for `/api/agent/*` on `findmesomejobs.co.za`:**
   - The new Next.js API routes (`/api/agent/ai`, `/api/agent/tools/search-jobs`, `/api/agent/billing/plans`, `/api/agent/billing/checkout`, `/api/agent/billing/verify`, and `/payment/success`) are committed in the repository.
   - Because `config.ts` defaults `WEB_BASE_URL` to `https://findmesomejobs.co.za` (overridable via `FMSG_WEB_BASE_URL` env var for beta/local testing), those routes only become reachable on the live domain after the deployment is promoted in the Vercel dashboard.
   - Even if `/api/agent/ai` is temporarily unreachable, `AgentRunner` has a deterministic heuristic fallback (`heuristicAnalysis` + `guessValue`) so form classification and profile field mapping never crash.
2. **Windows Authenticode Code Signing Certificate:**
   - `electron-builder` builds `FMSG Agents Setup 0.6.0.exe` without a Windows Authenticode EV/OV certificate (`no code signing certificate configured, signing is skipped`), whereas OTA update manifests are cryptographically signed with our offline `Ed25519` key (`.opencode/keys/release-private.pem`). Supplying `CSC_LINK` and `CSC_KEY_PASSWORD` in the build environment will enable Windows SmartScreen code signing automatically.

---

## 3. Production Promotion Checklist (For User Action)

When you are ready to promote `beta` to `production`:

1. **Merge `beta` into `production` (preserving the Google Analytics tag):**
   - Verify `src/components/analytics/google-analytics.tsx` on `production` still retains `G-4QMEHZSCXF`.
2. **Verify Vercel Environment Variables on the Target Environment:**
   - Ensure `OPENROUTER_API_KEY` (or `OPENROUTER_KEY_2`), `SERPAPI_API_KEY`, `PAYSTACK_SECRET_KEY` (or `PAYSTACK_TEST_SECRET_KEY` on beta/preview), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel.
3. **Promote the Vercel Preview Deployment to Production:**
   - In the Vercel dashboard (`fmsg` project), promote the deployment so `https://findmesomejobs.co.za/api/agent/*` and `https://findmesomejobs.co.za/payment/success` go live.
4. **Desktop App Auto-Update:**
   - Both `manifest.stable.sig.json` and `manifest.beta.sig.json` in Supabase `agent-updates` are already signed and uploaded for **`v0.6.0`** (`version_code: 600`, `min_supported_version: "0.6.0"`). Any installed `v0.5.0` or `v0.5.1` desktop app will automatically download, verify, and activate `v0.6.0` on launch.
