# FMSG Agents — UI/UX Audit Remediation Tracker & Technical Validation Report

**Baseline Version:** `v0.7.1` (commit `f066b1e`)  
**Audit Source:** [`2026-11-03_fmsg-agents-ui-ux-audit_v0.7.1.md`](./2026-11-03_fmsg-agents-ui-ux-audit_v0.7.1.md) (161 findings: 4 Critical · 39 High · 81 Medium · 37 Low)  
**Remediation Plan:** [`2026-11-03_fmsg-agents-ui-ux-remediation-plan_v0.7.1.md`](./2026-11-03_fmsg-agents-ui-ux-remediation-plan_v0.7.1.md) (43 work items across Phases 0, 1A, 1B, 2, 3)  
**Active Branch:** `audit/phase-0` (branched cleanly from `production`)

---

## 1. Technical Validation Report (Pre-Implementation Codebase Verification)

### 1.1 Incorrect or Incomplete Assumptions in the Remediation Plan
1. **`App.tsx` Size & Structure:** Plan §4.1 states `App.tsx` is 2,898 lines; the actual file in `v0.7.1` is **3,040 lines** containing the shell, state, Run Setup modal, Onboarding modal, Email Verification modal, and 6 inline views (`HomeDashboardView`, `ApplicationsTrackerView`, `ReviewQueueView`, `ProfilesAndRulesView`, `OnboardingWizardModal`, `AccountView`).
2. **`SignedFileEntry.download_url` Already Exists — But Has Two Main-Process Bugs (`update-manager.ts`):**
   - Plan §2.1 proposes adding `download_url` to `SignedFileEntry` and `canonicalizeManifestForSigning`. Source inspection of `src/apps/fmsg-agents/update-manager.ts` (lines 54, 227, 257, 946) confirms `download_url?: string` is **already defined, signed, and HTTPS-checked**.
   - **Bug A (External Host Header Leak):** `downloadAndApplyVerifiedRelease` (`update-manager.ts:958-965`) unconditionally attaches `apikey: SUPABASE_ANON_KEY` and `Authorization: Bearer ${SUPABASE_ANON_KEY}` even when `entry.download_url` points to an external host (e.g. GitHub Releases / AWS S3 redirects), which causes S3 presigned URLs to reject the request with HTTP 400/403.
   - **Bug B (30s Download Timeout):** `update-manager.ts:954` hardcodes a 30-second timeout per file (`setTimeout(() => controller.abort(), 30000)`), which is too short for a ~92 MB `.exe` installer on standard connections.
   - **Bug C (`scripts/upload-update.js`):** The uploader script lacks `--installer-url` and always attempts to upload every artifact to Supabase Storage (`uploadViaCurl`), hitting `HTTP 413 EntityTooLarge`.
3. **`DialogProvider` DOM Hierarchy vs. Titlebar Offset (`DialogSystem.tsx`):**
   - `.app-root-frame .modal-backdrop` sets `inset: 36px 0 0 0` so modals do not cover the 36px frameless window title bar. However, `DialogProvider` wraps `<AppInner />` *outside* `.app-root-frame` (`App.tsx:3036`), so modals rendered by `DialogSystem.tsx` (`showModal`, `openLegalDocument`) do not match `.app-root-frame .modal-backdrop` and cover the titlebar unless `.modal-backdrop` itself uses `inset: 36px 0 0 0`.
4. **Root Cause of Run Setup Failure at 960×640 (`RS-01`, `RS-02`, `RP-01`):**
   - At `max-width: 1100px`, `.run-setup-grid` collapses from 3 columns to 1 column (`grid-template-columns: 1fr`), making `.run-setup-modal` ~780px tall inside a 604px viewport (`640 - 36`). Because `.modal-backdrop` uses `align-items: center` without `overflow-y: auto` and `.modal-card` has no `max-height`, flexbox centers the overflowing card vertically, pushing its top (title and close button) above `y = 0` where it is unreachable.
5. **Root Cause of the "DYE" Status Chip (`RN-06`):**
   - `LiveLog.tsx:753` renders `IDLE` inside `.viewport-live-badge`. In `design-system.css:1395-1404`, `.viewport-live-badge` still has its `v0.6.0` light-theme styling (`font-size: 8.5px; letter-spacing: 0.1em; background: #f1f5f9; color: #94a3b8`) because the `v0.7.0` dark override block (`design-system.css:3200-3220`) missed `.viewport-live-badge`, `.viewport-idle-title`, and `.viewport-idle-body`. At 8.5px and DPR 1.25, `IDLE` aliases into what looks like `DYE`.
6. **Shared `public.saved_jobs` Schema & Missing RLS `UPDATE` Policy:**
   - `public.saved_jobs` is shared with the Next.js web application (`src/app/dashboard/page.tsx`). Migration `005_saved_jobs_and_profiles.sql` created `SELECT`, `INSERT`, and `DELETE` RLS policies on `saved_jobs`, but **never created an `UPDATE` policy**. Adding `review_status` and `archived_at` in Migration 039 requires both safe defaults (`DEFAULT 'applied'`, `archived_at DEFAULT NULL`) so website inserts remain unaffected, and an explicit `FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` policy so RLS updates succeed.

### 1.2 Missing Dependencies & Testing Infrastructure
- `src/apps/fmsg-agents/package.json` lacks `ui:shots`, `ui:a11y`, `lint:content`, and `lint:tokens` scripts.
- Both `playwright` (`1.49.0` / `1.61.1`) and `axe-core` (`C:\Users\mqhel\FMSG\node_modules\axe-core\axe.js`) are already installed locally in `node_modules`, so zero external network installs are needed to build the Phase 0 verification suite.
- DeepSeek's Phase 1 audit scripts and 67 baseline screenshots exist in `C:\Users\mqhel\AppData\Local\Temp\opencode\fmsg-audit\` and will be preserved and integrated into `src/apps/fmsg-agents/tests/ui/`.

### 1.3 Ratified Day-1 Decisions (D1–D10)
| ID | Decision | Ratified Resolution |
|---|---|---|
| D1 | Approve semantics | `Approve & Open` sets `review_status = 'approved'`, opens the job URL in the system browser, and moves the item out of the Review Queue; `Mark Submitted` sets `review_status = 'submitted'`. Never delete on approve. |
| D2 | Allowance / overage | Display `used / included` clearly; when `used > totalAllowance`, display an explicit overage / bonus-exhausted label rather than contradicting `100%` with `6 / 5`. |
| D3 | Account vs Settings | Add **Account** as a first-class sidebar navigation item with active state and full identity/plan/security details; keep Settings focused on credentials, run preferences, updates, legal, and danger zone. |
| D4 | Plan naming & CTA | Standardize on `Starter`, `Lite`, `Standard`, `Power`; mark `Standard` as "Recommended" with the sole primary CTA (`btn-primary`); style the other three CTAs as secondary (`btn-secondary`). |
| D5 | Legal documents | Bundle `legal/EULA.md`, `legal/Terms_of_Service.md`, and `legal/Privacy_Policy.md` into the renderer via esbuild `--loader:.md=text`, synchronize version headers with `APP_VERSION`, and render structured typography (headings, lists, paragraphs). |
| D6 | Installer distribution | Fix external `download_url` header leak and timeout in `update-manager.ts`, add `--installer-url` to `scripts/upload-update.js`, and use local `/S /UPDATE` installer execution when storage rejects >50 MB files. |
| D7 | Profile data cleanup | Back up `search_profiles` to `recycle_bin/` before stripping trailing numeric counters and normalizing SA locations, plus apply display-level normalization in `renderer/lib/format.ts`. |
| D8 | Visual language | Preserve the deep midnight/indigo brand palette (`#040613`, `#0b0e1f`, `#0e111a`, `#203eea`), raise muted text contrast to ≥ 4.5:1 (`#94a3b8`), enforce 12px minimum font size, 4 border radii (`6px`, `10px`, `14px`, `999px`), 3 control heights (`32px`, `40px`, `48px`), `1200px` max content width, and a visible `2px solid #93c5fd` `:focus-visible` indicator. |
| D9 | Billing backoffice | Deliver billing history/invoices, payment method status, renewal/charge summary, and cancellation flow in Phase 3 (`v1.0.0`). |
| D10 | Accessibility | Enforce `axe-core` zero critical/serious violations and full keyboard operability in-repo; do not claim external WCAG certification without an external audit. |

---

## 2. Phase & Work-Item Execution Tracker

| Work Item | Phase / Target | Audit IDs | Description | Status | Commit / Evidence |
|---|---|---|---|---|---|
| **P0.1** | Phase 0 | — | Create `audit/phase-0` branch, validate plan vs repo, create remediation tracker | `DONE` | Branch `audit/phase-0` |
| **P0.2** | Phase 0 | — | In-repo Playwright UI screenshot & metrics harness (`npm run ui:shots -- --size 960,1280,1360,1920`) | `DONE` | `tests/ui/shots.cjs` |
| **P0.3** | Phase 0 | — | In-repo `axe-core` accessibility harness (`npm run ui:a11y`) | `DONE` | `tests/ui/a11y.cjs` |
| **P0.4** | Phase 0 | — | Content & design-token linters (`npm run lint:content`, `npm run lint:tokens`) | `DONE` | `scripts/lint-content.cjs`, `scripts/lint-tokens.cjs` |
| **P0.5** | Phase 0 | — | Release-channel spike (`download_url` auth-header fix & `--installer-url` verification) | `DONE` | `scripts/upload-update.js` (`--installer-url`, `--dry-run`) |
| **P0.6** | Phase 0 | — | Capture baseline screenshots, metrics, a11y & lint baselines; map all 161 findings | `DONE` | `tests/ui/baseline-v0.7.1/metrics.json` |
| **P1A.1** | Phase 1A (`v0.7.2`) | AP-03, HM-01, HM-02, HM-04, HM-08, ST-06, CT-01, CT-02, CT-04, CT-05, LS-01 | `renderer/lib/format.ts`, usage overage truth, active-profile name, 7-day chart dates/values, loading skeleton | `DONE` | `renderer/lib/format.ts`; ui:flows usage/format assertions |
| **P1A.2** | Phase 1A (`v0.7.2`) | ST-01, ST-02, ON-02, NT-04, CT-07 | Purge internal identifiers (`_PASSWORD`, `fill_secret`, `dev_`, Windows Credential Manager jargon) from user copy | `DONE` | `lint:content` = 0 violations |
| **P1A.3** | Phase 1A (`v0.7.2`) | BL-01, BL-02, BL-03, BL-04, BL-05, BL-06, BL-08, BL-10, BL-13, CT-03 | Billing clarity: single primary CTA (`Standard`), unified plan names, clear spend cap, remove internal threshold memo | `DONE` | `renderer/components/BillingPanel.tsx`; 1360 billing screenshot |
| **P1A.4** | Phase 1A (`v0.7.2`) | ST-11, ST-12, DL-05 | Bundle legal `.md` files in renderer, update to current version, structured markdown renderer, secondary Close button | `DONE` | `renderer/lib/legal.tsx`; ui:flows legal assertions (8 headings, VERSION 0.7.2) |
| **P1A.5** | Phase 1A (`v0.7.2`) | RV-02, RN-01, RN-02, RN-05, RN-06, PF-02, RL-01, AP-09, AC-01, AC-04, GS-12 | Stable page titles & subtitles, Run H1 + wider profile picker, Account in sidebar, neutral Sign Out, single version chip | `DONE` | ui:flows H1 contract (8/8) |
| **P1A.6** | Phase 1A (`v0.7.2`) | GS-01, GS-03, GS-04, GS-07, AU-02, AU-09, AU-10, AU-11, LS-02 | Global `:focus-visible` ring, `--text-muted` contrast ≥ 4.5:1, 12px minimum text, styled checkboxes, validation summary, password rules | `DONE` | `ui:a11y` 0 violations; tokens 7.35:1, 0 sub-12px; focus 10/10 |
| **P1A.7** | Phase 1A (`v0.7.2`) | RS-01, RS-02, RS-03, RS-09, AU-08, AU-13, AU-15, DL-02, RP-01, RP-02 | Shared `Modal` shell with `max-height`, sticky header/footer, content-area centering, Esc/backdrop, 960×640 Run Setup & Sign Up fit | `DONE` | ui:shots: setup 54→622 close reachable; signup fits 960/1280/1360/1920 |
| **P1A.8** | Phase 1A (`v0.7.2`) | NT-01, NT-03, NT-04 | Notifications dynamic `appVersion`, mark-all-read, clear unread on open, empty state, user-relevant welcome message | `DONE` | ui:flows notification assertions |
| **P1A.9** | Phase 1A (`v0.7.2`) | AU-03, LS-02, LS-03, LS-04 | Async button spinners, disabled explanations, persistent saved-state timestamps, inline login error recovery link | `DONE` | `DialogSystem`/`LoginScreen`/`BillingPanel` spinners; `Saved at` marker |
| **P1A.10** | Phase 1A (`v0.7.2`) | — | Build, verify Gate G1 (axe=0, content lint=0, 4-size shots), bump to `v0.7.2`, sign & publish renderer OTA | `PARTIAL` | Built + verified + version bumped; OTA upload withheld pending distribution approval (see release log) |
| **P1B.1** | Phase 1B (`v0.8.0`) | AP-05, RV-01, RV-03, RV-06, AP-10 | Migration 039 (`review_status`, `archived_at`, index, RLS `UPDATE` policy) + backup & backfill of `saved_jobs` | `DONE (code) / BLOCKED (apply)` | `supabase/migrations/039_saved_jobs_review_status.sql`; backup `recycle_bin/backup_saved_jobs_2026-11-03.json` (0 rows); REST confirms 42703 until applied |
| **P1B.2** | Phase 1B (`v0.8.0`) | RV-01, AP-05, RV-03 | IPC & preload contract: `saved-jobs-update-status`, `saved-jobs-archive`, agent insert sets `review_status` | `DONE` | `electron-main.ts`, `preload.ts`, `agent-controller.ts`; ui:flows IPC assertions |
| **P1B.3** | Phase 1B (`v0.8.0`) | RV-01, RV-02, RV-03, RV-05, RV-06, AP-10 | Honest Approve (`approved` + open URL), `Mark Submitted`, reversible `Skip` (`skipped`), distinct status pills | `DONE` | ui:flows 24/24 |
| **P1B.4** | Phase 1B (`v0.8.0`) | AP-05, RV-03, ST-03, DL-01, DL-03, DL-04 | Destructive safety: confirm modal for credential forget, 10s Undo toast for archive/skip, clear account deletion consequence | `DONE` | `DialogSystem` typed confirm + undo; ui:flows undo assertions |
| **P1B.5** | Phase 1B (`v0.8.0`) | AP-04, AP-05, AP-07, AD-01, AD-02, AD-04 | Applications Actions header, rich Application Detail view (salary, dates, profile, status actions, copy/open link, 40px back button) | `DONE` | `ApplicationsTrackerView` detail view; 1360 screenshots |
| **P1B.6** | Phase 1B (`v0.8.0`) | PF-01, PF-03, CT-04 | Backup `search_profiles`, strip trailing numeric suffixes, normalize SA location strings in DB | `DONE` | 12 rows updated; backups + `recycle_bin/rollback_search_profiles_2026-11-03.json`; verified 0 suffixes / 0 bad locations |
| **P1B.7** | Phase 1B (`v0.8.0`) | — | Fix `verifyStartupSlotHealth` in `update-manager.ts` + external `download_url` header/timeout fix | `DONE` | `npm run test:main` 3/3; `download_url` no longer receives Supabase keys, 15-min external timeout |
| **P1B.8** | Phase 1B (`v0.8.0`) | — | Build `FMSG Agents Setup 0.8.0.exe`, install `/S /UPDATE`, verify Gate G2 | `PARTIAL` | Installer built (92,415,932 bytes) and asar verified; clean-VM install + `/S /UPDATE` run pending (distribution decision) |
| **P2.1** | Phase 2 (`v0.9.0`) | GS-02, GS-04, GS-05, GS-06, GS-10, GS-11, GS-13, GS-14 | CSS token enforcement & split (`tokens.css`, `base.css`, `components.css`, `views.css`), ≤8 font sizes, ≤4 radii, 0 layout `!important` | `PENDING` | — |
| **P2.2** | Phase 2 (`v0.9.0`) | GS-08, GS-09, AU-05, AU-10, DL-02, ST-08, PF-05, RS-05, AP-06, NT-02 | Shared UI primitives (`renderer/components/ui/*`) & incremental view extraction (`renderer/views/*`) | `PENDING` | — |
| **P2.3** | Phase 2 (`v0.9.0`) | AC-01..06, AU-01, AU-04, AU-06, AU-07, AU-12, AU-14, AU-16, AU-17, PF-09, CT-08 | Navigation, Account & Auth polish (keep-signed-in default off, value prop, single consent/signup clarity, Forgot layout) | `PENDING` | — |
| **P2.4** | Phase 2 (`v0.9.0`) | ST-04, ST-05, ST-07, ST-09, ST-10, ST-13, ST-14, RL-02, RL-03, RL-06 | Settings sub-nav/sections, equal-width vault grid at 960, aligned card actions, Danger Zone section, editable Answer Bank | `PENDING` | — |
| **P2.5** | Phase 2 (`v0.9.0`) | PF-02, PF-04..09, RL-01..07 | Profiles & Rules separation, richer profile cards, salary numeric + slider control, unified save model | `PENDING` | — |
| **P2.6** | Phase 2 (`v0.9.0`) | ON-01..06 | Onboarding rebuild: custom SVG illustrations, no emoji/env-vars, explain allowance/cap & Approve Each, Skip Tour button | `PENDING` | — |
| **P2.7** | Phase 2 (`v0.9.0`) | AP-01, AP-02, AP-06..08, AD-03, RV-04, RV-07, RV-08 | Applications table sorting, pagination, CSV export, search clear button, match score legend/tooltip, breadcrumb in detail | `PENDING` | — |
| **P2.8** | Phase 2 (`v0.9.0`) | HM-03, HM-05..07, HM-09, HM-10, RN-03, RN-04, RN-06..08, RS-04, RS-06..08 | Home operational summary (last run, spend, next action), Run layout & dark preview bezel, Run Setup profile count & numeric cap | `PENDING` | — |
| **P2.9** | Phase 2 (`v0.9.0`) | BL-08, BL-09, BL-11, BL-12, BL-13 | Billing comparison clarity, popular badge alignment, formal financial terminology | `PENDING` | — |
| **P2.10** | Phase 2 (`v0.9.0`) | RP-03, RP-04, RP-05, ST-04, HM-06 | Responsive system across `1920`, `1360`, `1280`, `1100`, `960` breakpoints | `PENDING` | — |
| **P2.11** | Phase 2 (`v0.9.0`) | CT-03, CT-06, CT-07, CT-08, LS-04 | Content style guide enforcement, single action labels, plain-English explanations | `PENDING` | — |
| **P2.12** | Phase 2 (`v0.9.0`) | — | Release `v0.9.0`, verify Gate G3 | `PENDING` | — |
| **P3.1** | Phase 3 (`v1.0.0`) | BL-07, AC-05 | Billing backoffice: subscription/invoice history, payment method summary, renewal & cancellation controls, spend forecast | `PENDING` | — |
| **P3.2** | Phase 3 (`v1.0.0`) | AC-05, ST-02 | Account & Security Centre: profile identity, active device/session management, password reset/change, data export, local security log | `PENDING` | — |
| **P3.3** | Phase 3 (`v1.0.0`) | LS-01..04, HM-09 | Complete async state system: skeletons, retry banners, offline indicator, stale-data timestamp | `PENDING` | — |
| **P3.4** | Phase 3 (`v1.0.0`) | RS-06 | Motion, density toggle (Compact / Comfortable) & keyboard shortcuts (`Ctrl+1..8`, `Ctrl+K` / `?`) | `PENDING` | — |
| **P3.5** | Phase 3 (`v1.0.0`) | GS-01, GS-03 | Accessibility verification: axe-core 0 violations across all states, 200% zoom & high-contrast compatibility, VPAT readiness report | `PENDING` | — |
| **P3.6** | Phase 3 (`v1.0.0`) | — | End-to-end enterprise demonstration workflow verification | `PENDING` | — |
| **P3.7** | Phase 3 (`v1.0.0`) | — | Release `v1.0.0`, build installer, verify Gate G4 | `PENDING` | — |

---

## 3. Complete 161-Finding Traceability Matrix

| Audit ID | Sev | Type | Summary | Assigned Work Item | Status |
|---|---|---|---|---|---|
| GS-01 | High | V | Focus ring invisible app-wide | P1A.6 | `PENDING` |
| GS-02 | High | V | Two content widths (1040 vs 1090+) causing width jump | P2.1 | `PENDING` |
| GS-03 | High | V | `--text-muted #64748b` fails WCAG AA contrast (3.96:1) | P1A.6 | `PENDING` |
| GS-04 | Medium | V | 18 font sizes in a 7-token system; 10.5px metadata | P1A.6 / P2.1 | `PENDING` |
| GS-05 | Medium | V | 22+ border radii across components | P2.1 | `PENDING` |
| GS-06 | Medium | V | 62 padding values and 17 gap values | P2.1 | `PENDING` |
| GS-07 | Medium | V | `.viewport-footer` 10.5px at 70% alpha, clipped on Run | P1A.5 / P1A.6 | `PENDING` |
| GS-08 | Medium | V | 36px titlebar text glyphs `─ □ ✕` instead of crisp SVG icons | P2.2 | `PENDING` |
| GS-09 | Medium | V | "Tour" text button among icon buttons; inline notification count | P2.2 | `PENDING` |
| GS-10 | Medium | V | Unconstrained width at 1920×1080 | P2.1 | `PENDING` |
| GS-11 | Medium | V | Only one responsive breakpoint (`1100px`) | P2.1 / P2.10 | `PENDING` |
| GS-12 | Low | V | Version string repeated in 4 places | P1A.5 | `PENDING` |
| GS-13 | Low | V | 18 `!important` declarations in `design-system.css` | P2.1 | `PENDING` |
| GS-14 | Low | V | macOS traffic-light dots & legacy light rules in Windows app | P2.1 / P2.8 | `PENDING` |
| AU-01 | Medium | F | "Keep me signed in" checked by default | P2.3 | `PENDING` |
| AU-02 | Medium | V | Unanchored login failure banner shifts layout | P1A.6 | `PENDING` |
| AU-03 | Medium | V | Text-only loading state on auth CTA | P1A.9 | `PENDING` |
| AU-04 | Low | C | Two unexplained signup paths (tab vs external footer link) | P2.3 | `PENDING` |
| AU-05 | Low | V | Outlined active auth tab differs from app selection style | P2.2 | `PENDING` |
| AU-06 | Low | C | No value proposition on auth card | P2.3 | `PENDING` |
| AU-07 | Low | V | Version repeated in auth card footer and titlebar | P1A.5 / P2.3 | `PENDING` |
| AU-08 | High | V | Sign Up card overflows viewport at 1360×860 and 960×640 | P1A.7 | `PENDING` |
| AU-09 | High | V | Sign Up validation reveals one error at a time and shifts layout | P1A.6 | `PENDING` |
| AU-10 | Medium | V | Unstyled native white consent checkboxes | P1A.6 / P2.2 | `PENDING` |
| AU-11 | Medium | C | No visible password requirements before submit failure | P1A.6 | `PENDING` |
| AU-12 | Low | C | Three separate consent checkboxes add friction | P2.3 | `PENDING` |
| AU-13 | Low | V | Competing action hierarchy inside Sign Up card | P1A.7 | `PENDING` |
| AU-14 | Low | V | Narrow Name/Surname fields at 420px card width | P2.3 | `PENDING` |
| AU-15 | Low | V | Forgot password hides tabs and leaves awkward spacing | P1A.7 | `PENDING` |
| AU-16 | Low | C | Four competing exits on Forgot Password screen | P2.3 | `PENDING` |
| AU-17 | Low | V | Forgot password explanation measure/size | P2.3 | `PENDING` |
| ON-01 | High | V | Emoji icons (🔍 📄 🚀) in Onboarding step 1 | P2.6 | `PENDING` |
| ON-02 | High | C | Onboarding exposes `SITE_PASSWORD` and Credential Manager | P1A.2 / P2.6 | `PENDING` |
| ON-03 | Medium | V | Narrow 105px onboarding feature cards at 960×640 | P2.6 | `PENDING` |
| ON-04 | Medium | C | Onboarding repeats hero copy instead of explaining cap & review | P2.6 | `PENDING` |
| ON-05 | Low | V | Unlabelled progress dots and no "Skip tour" control | P2.6 | `PENDING` |
| ON-06 | Low | V | Duplicate version chip visible behind onboarding modal | P1A.5 / P2.6 | `PENDING` |
| HM-01 | High | F | Usage shows "100% used" and "6 / 5" simultaneously | P1A.1 | `PENDING` |
| HM-02 | Medium | F | "Active profile 1" renders boolean as a number | P1A.1 | `PENDING` |
| HM-03 | Medium | V | Same metrics repeated four times on Home | P2.8 | `PENDING` |
| HM-04 | Medium | V | 7-day chart uses ambiguous `W T F S S M T` labels without dates/values | P1A.1 | `PENDING` |
| HM-05 | Medium | V | Top-heavy dashboard layout and fixed column heights | P2.8 | `PENDING` |
| HM-06 | Medium | V | Hero stacks tall at narrow widths, pushing data below fold | P2.8 / P2.10 | `PENDING` |
| HM-07 | Medium | V | Text star `★` in CTA and three different labels for starting a run | P2.8 / P2.11 | `PENDING` |
| HM-08 | Medium | C | Ungrammatical location strings ("Gauteng South Africa") | P1A.1 | `PENDING` |
| HM-09 | Low | C | Home lacks operational summary (last run, spend, next action) | P2.8 / P3.3 | `PENDING` |
| HM-10 | Low | V | Company avatars lack consistent semantic styling | P2.8 | `PENDING` |
| RN-01 | High | V | Run screen has no page H1 title or subtitle | P1A.5 | `PENDING` |
| RN-02 | High | V | Profile selector truncates at 1360×860 | P1A.5 | `PENDING` |
| RN-03 | High | V | Empty-state instruction and primary CTA are 400px apart | P2.8 | `PENDING` |
| RN-04 | Medium | V | Progress tracker and 6-step list look disabled when idle | P2.8 | `PENDING` |
| RN-05 | Medium | V | Preview footer sentence is 10.5px and clipped mid-word | P1A.5 | `PENDING` |
| RN-06 | Medium | V | Status badge at top-right of preview renders as unreadable "DYE" (`8.5px` `IDLE`) | P1A.5 / P2.8 | `PENDING` |
| RN-07 | Medium | V | Legacy light browser chrome styles & macOS dots | P2.8 | `PENDING` |
| RN-08 | Low | C | Three different labels for starting a run | P2.8 / P2.11 | `PENDING` |
| RS-01 | Critical | V | Run Setup modal unusable at 960×640 (title/close off-screen) | P1A.7 | `PENDING` |
| RS-02 | High | V | Modal centered on window instead of workspace content area | P1A.7 | `PENDING` |
| RS-03 | High | V | No sticky footer; primary Start CTA buried inside 3rd column | P1A.7 | `PENDING` |
| RS-04 | Medium | V | Profile list scrolls 4 of 6 rows with no count or search | P2.8 | `PENDING` |
| RS-05 | Medium | V | Three different single-select patterns in one modal | P2.2 | `PENDING` |
| RS-06 | Medium | V | Autonomy mode descriptions wrap to 4 lines at 11px | P2.8 / P3.4 | `PENDING` |
| RS-07 | Medium | C | Daily cap slider lacks numeric input and clear scale label | P2.8 | `PENDING` |
| RS-08 | Low | C | Estimated cost card mixes run-level and account-level concepts | P2.8 | `PENDING` |
| RS-09 | Low | V | Close button is a small 24px glyph with no Esc hint | P1A.7 | `PENDING` |
| AP-01 | High | V | No sorting, pagination, bulk actions, or export in Applications table | P2.7 | `PENDING` |
| AP-02 | High | C | Match percentages have no legend, profile reference, or explanation | P2.7 | `PENDING` |
| AP-03 | Medium | C | Dates formatted as `2026/11/02` instead of `2 Nov 2026` | P1A.1 | `PENDING` |
| AP-04 | Medium | V | 7th table column has no header and tiny 14px "Remove" link | P1B.5 | `PENDING` |
| AP-05 | High | F | "Remove" deletes saved job immediately with no confirm or undo | P1B.1–P1B.5 | `PENDING` |
| AP-06 | Medium | V | 38px table rows and 10.5px headers inconsistent with control scale | P2.2 / P2.7 | `PENDING` |
| AP-07 | Medium | C | Ambiguous "DATE" column header | P1B.5 / P2.7 | `PENDING` |
| AP-08 | Medium | V | Search input and filter pills split 500px apart; no clear `×` button | P2.7 | `PENDING` |
| AP-09 | Low | C | Inconsistent naming ("Applications" vs "Applications Tracker") | P1A.5 | `PENDING` |
| AP-10 | Low | V | Status pills don't distinguish auto-submitted vs approved vs manual | P1B.1 / P1B.3 | `PENDING` |
| AD-01 | High | V | Application detail view lacks salary, dates, profile, status history & actions | P1B.5 | `PENDING` |
| AD-02 | Medium | V | Back button is 28px high (smallest navigation target in app) | P1B.5 | `PENDING` |
| AD-03 | Medium | V | No breadcrumb or parent "Applications" context in detail view | P2.7 | `PENDING` |
| AD-04 | Low | C | Missing copy-link and clear external posting actions | P1B.5 | `PENDING` |
| RV-01 | Critical | F | "Approve & Open ↗" only opens URL and does not approve or update queue | P1B.1–P1B.3 | `PENDING` |
| RV-02 | High | V | Review page title mutates into a sentence based on item count | P1A.5 / P1B.3 | `PENDING` |
| RV-03 | High | F | "Skip" deletes the saved job immediately with no confirm or undo | P1B.1–P1B.4 | `PENDING` |
| RV-04 | Medium | C | "84% Match" badge is unexplained | P2.7 | `PENDING` |
| RV-05 | Medium | V | "Skip" uses identical secondary button styling to "Details" | P1B.3 | `PENDING` |
| RV-06 | Medium | C | Blocker summary offers no way to mark submitted or resolve | P1B.1 / P1B.3 | `PENDING` |
| RV-07 | Medium | C | Subtitle uses unexplained "Approve Each mode" jargon | P2.7 | `PENDING` |
| RV-08 | Low | V | Metadata separator and location formatting inconsistency | P1A.1 / P2.7 | `PENDING` |
| PF-01 | High | C | Profile names expose numeric suffixes ("Nomkhosi Mpungose 1") | P1A.1 / P1B.6 | `PENDING` |
| PF-02 | High | C | Profiles and Rules tabs share the same H1 and subtitle | P1A.5 / P2.5 | `PENDING` |
| PF-03 | Medium | C | Ungrammatical profile location strings ("Gauteng South Africa") | P1A.1 / P1B.6 | `PENDING` |
| PF-04 | Medium | V | "Create / Edit Profile on FMSG" occupies a full profile card slot | P2.5 | `PENDING` |
| PF-05 | Medium | V | Small 68×28 "Select" tag and no checkmark on active profile card | P2.2 / P2.5 | `PENDING` |
| PF-06 | Medium | V | Profile cards omit salary, CV status, and application count | P2.5 | `PENDING` |
| PF-07 | Medium | V | Header mixes tabs ("Profiles", "Rules") with action button ("Refresh") | P2.5 | `PENDING` |
| PF-08 | Low | V | Role titles render as a dense 4-line paragraph | P2.5 | `PENDING` |
| PF-09 | Low | V | Inconsistent count display between sidebar badges and tab labels | P2.3 / P2.5 | `PENDING` |
| RL-01 | High | C | Wrong subtitle shown when Rules & Answer Bank tab is active | P1A.5 / P2.5 | `PENDING` |
| RL-02 | Medium | V | Two conflicting save models on Rules screen ("Save Rules" vs auto-save) | P2.4 / P2.5 | `PENDING` |
| RL-03 | Medium | C | Inconsistent action verbs ("Add", "Add Answer", "Save Rules") | P2.4 / P2.5 | `PENDING` |
| RL-04 | Medium | V | Salary slider lacks scale labels and numeric input | P2.5 | `PENDING` |
| RL-05 | Medium | V | "Remove" answer is a 14px text link with no confirmation/undo | P2.5 | `PENDING` |
| RL-06 | Medium | V | Saved answers cannot be edited in place | P2.4 / P2.5 | `PENDING` |
| RL-07 | Low | V | Rules layout leaves >50% empty canvas | P2.5 | `PENDING` |
| BL-01 | High | C | Contradictory Spend Cap labels ("Default R0" vs "R160 max" vs "R 160") | P1A.3 | `PENDING` |
| BL-02 | High | F | Application Balance ring shows "100% used" with "6 / 5" | P1A.1 / P1A.3 | `PENDING` |
| BL-03 | High | C | Internal pricing memo terms ("Stage 2", "Fallback PAYG rate", "Grace protection") | P1A.3 | `PENDING` |
| BL-04 | High | V | Four identical primary blue plan CTAs compete in one row | P1A.3 | `PENDING` |
| BL-05 | High | C | Plan naming drift ("Starter Pack" / "Starter Bundle" / "Starter") | P1A.3 | `PENDING` |
| BL-06 | Medium | V | "Save Cap" button is smaller than plan CTAs | P1A.3 | `PENDING` |
| BL-07 | Medium | C | No billing history, invoices, payment method, renewal date, or cancel path | P3.1 | `PENDING` |
| BL-08 | Medium | C | "Welcome bonus 5 apps" has no explanation or exhausted state | P1A.3 / P2.9 | `PENDING` |
| BL-09 | Medium | V | 10.5px per-application chips and discount badges | P1A.6 / P2.9 | `PENDING` |
| BL-10 | Medium | V | Four inconsistent currency formats (`R160`, `R 160`, `R40/app`, `R1,499`) | P1A.1 / P1A.3 | `PENDING` |
| BL-11 | Low | C | Informal slang ("Stacks forever", "Grace protection") in billing UI | P1A.3 / P2.9 | `PENDING` |
| BL-12 | Low | V | "POPULAR" badge collides with card top border | P2.9 | `PENDING` |
| BL-13 | Low | V | Spend cap repeated four times across shell and billing | P1A.3 / P2.9 | `PENDING` |
| ST-01 | Critical | C | Env-var names (`LINKEDIN_PASSWORD`) and `fill_secret(name)` in primary UI copy | P1A.2 | `PENDING` |
| ST-02 | High | C | Raw installation device ID (`dev_fd813828a7f8…`) exposed in Settings | P1A.2 / P3.2 | `PENDING` |
| ST-03 | High | F | "Forget" deletes stored site credential immediately with no confirmation | P1B.4 | `PENDING` |
| ST-04 | High | V | Ragged vault card column widths at 960×640 | P2.4 / P2.10 | `PENDING` |
| ST-05 | High | V | Five unrelated domains on a single 1,500px scroll with no sub-navigation | P2.4 | `PENDING` |
| ST-06 | Medium | C | US-formatted timestamp (`11/3/2026, 4:33:08 AM`) from bare `toLocaleString()` | P1A.1 | `PENDING` |
| ST-07 | Medium | V | "Launch Setup Wizard" and "Check for updates" wrap onto two lines | P2.4 | `PENDING` |
| ST-08 | Medium | V | Unstyled native checkbox and native OS `<select>` in Settings | P1A.6 / P2.2 | `PENDING` |
| ST-09 | Medium | V | Unconnected vault cards have 40–56px dead space above action buttons | P2.4 | `PENDING` |
| ST-10 | Medium | C | Status badge vocabulary drift ("Saved / Not set" vs "Connected") | P2.4 | `PENDING` |
| ST-11 | Medium | V | Legal documents render as raw ASCII markdown with 72-dash lines | P1A.4 | `PENDING` |
| ST-12 | Medium | C | Legal documents stamped `VERSION 0.6.0` inside a `0.7.1` app | P1A.4 | `PENDING` |
| ST-13 | Low | V | Account deletion sits next to legal links without a dedicated Danger Zone | P2.4 | `PENDING` |
| ST-14 | Low | C | Engineering-style section headings in Settings | P1A.2 / P2.4 | `PENDING` |
| AC-01 | High | V | Account screen is missing from sidebar navigation | P1A.5 / P2.3 | `PENDING` |
| AC-02 | High | V | Account screen is a single 112px card leaving 92% of canvas empty | P2.3 / P3.2 | `PENDING` |
| AC-03 | Medium | V | "Security Vault & Account Settings" button navigates without link affordance | P2.3 | `PENDING` |
| AC-04 | Medium | V | "Sign Out" is styled as a destructive danger button | P1A.5 | `PENDING` |
| AC-05 | Medium | C | Account lacks name, plan details, renewal, devices, sessions, password & security | P2.3 / P3.1 / P3.2 | `PENDING` |
| AC-06 | Low | C | Inconsistent chip punctuation/casing on Account screen | P2.3 | `PENDING` |
| NT-01 | High | C | Seeded notification says "Welcome to FMSG Agents v0.7.0" on `0.7.1` | P1A.8 | `PENDING` |
| NT-02 | Medium | V | Notifications popover overlaps header without scrim/layering | P2.2 | `PENDING` |
| NT-03 | Medium | V | Unread badge stays "1" while open; no "Mark all read" or empty state | P1A.8 | `PENDING` |
| NT-04 | Low | C | Notification body is an internal feature announcement | P1A.2 / P1A.8 | `PENDING` |
| DL-01 | High | F | Destructive actions have inconsistent safety (no confirm on Forget/Remove/Skip) | P1B.4 | `PENDING` |
| DL-02 | Medium | V | Four bespoke modal widths and three different dismissal patterns | P1A.7 / P2.2 | `PENDING` |
| DL-03 | Medium | V | Toasts auto-dismiss in 4.2s with no Undo action | P1B.4 | `PENDING` |
| DL-04 | Medium | C | Delete-account modal does not state that code entry deletes immediately | P1B.4 | `PENDING` |
| DL-05 | Low | V | Legal modal styles "Close" as a primary blue CTA | P1A.4 | `PENDING` |
| LS-01 | Medium | V | Loading state is indistinguishable from zero-data empty state | P1A.1 / P3.3 | `PENDING` |
| LS-02 | Medium | V | Disabled buttons only dim to `opacity: 0.6` with no explanation or spinner | P1A.6 / P1A.9 | `PENDING` |
| LS-03 | Medium | V | Save Cap and Save Rules have no persistent saved timestamp/indicator | P1A.9 | `PENDING` |
| LS-04 | Low | V | Login error banner offers no inline password-reset recovery action | P1A.9 / P2.11 | `PENDING` |
| RP-01 | Critical | V | Run Setup modal unusable at 960×640 minimum window | P1A.7 | `PENDING` |
| RP-02 | High | V | Sign Up card overflows at 1360×860 and 960×640 | P1A.7 | `PENDING` |
| RP-03 | High | V | Single breakpoint (`1100px`) fails to reflow 960×640 layouts cleanly | P2.10 | `PENDING` |
| RP-04 | Medium | V | Inconsistent max-width strategy at 1360×860 and 1920×1080 | P2.10 | `PENDING` |
| RP-05 | Medium | V | Minimum window is 960×640 but grids assume ≥1280px | P2.10 | `PENDING` |
| CT-01 | High | C | Three conflicting date formats across screens | P1A.1 | `PENDING` |
| CT-02 | High | C | Three conflicting location formats across screens | P1A.1 | `PENDING` |
| CT-03 | Medium | C | Plan naming drift across cards, headers, and copy | P1A.3 / P2.11 | `PENDING` |
| CT-04 | Medium | C | Numeric suffixes on profile names | P1A.1 / P1B.6 | `PENDING` |
| CT-05 | Medium | C | Four conflicting currency formats | P1A.1 / P1A.3 | `PENDING` |
| CT-06 | Medium | C | Four different labels for starting an application run | P2.11 | `PENDING` |
| CT-07 | Medium | C | Unexplained internal jargon (`PAYG`, `fill_secret`, `grace protection`) | P1A.2 / P2.11 | `PENDING` |
| CT-08 | Low | C | Inconsistent page-title grammar across routes | P1A.5 / P2.3 / P2.11 | `PENDING` |
