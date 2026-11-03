# FMSG Agents — Redesign Spec (target visual: mockup sheet)

> Self-contained. A later session can build from this file without seeing the image.
> Reference image: `docs/design/reference/screens-sheet.jpg` (1344×768 AI-generated mockup, ~20 screens in one grid).
> **Do not copy from the sheet:** its app name ("ApplyAgent"), its logo, its garbled text, or any third-party job-site logos (LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, SimplyHired). Use FMSG branding and generic icons.

## 0. Decisions

- **Target:** the mockup sheet is the visual target for the full FMSG Agents redesign. The current v0.6.0 UI is the functional baseline; its behaviour and data wiring are kept, its look is replaced.
- **Target version: `0.7.0`** (minor). Rule basis: a substantial UI redesign with no breaking change to the auth, update, or billing contracts. It is not a major bump because nothing architectural changes. The version files are **not** bumped by this document. The bump happens at release, relative to the version in `package.json` and `config.ts` at that time (currently `0.6.0`).
- **Stack: keep it.** Electron 34 + React 19 + TypeScript + esbuild + one CSS stylesheet with custom properties. See §8.

## 1. Design tokens

Values sampled from the mockup (approximate, rounded). Treat as a starting palette; tune by eye once the first screens exist.

### Color — surfaces (dark)
| Token | Hex | Use |
|---|---|---|
| `--bg-app` | `#040613` | Window background (darkest) |
| `--bg-app-deep` | `#00062A` | Corner/vignette tone, blended with glows |
| `--bg-panel` | `#0B0E1F` | Main content panel |
| `--bg-card` | `#0E111A` | Cards, list rows |
| `--bg-card-raised` | `#141829` | Hover state of card, nested cards (proposed) |
| `--bg-input` | `#0A0D1C` | Text inputs (proposed; mockup inputs are darker than cards) |
| `--border-subtle` | `#1C2238` | 1px card and divider border (proposed) |
| `--border-strong` | `#2A3350` | Focused or emphasised border (proposed) |

### Color — accents and status
| Token | Hex | Use |
|---|---|---|
| `--primary` | `#203EEA` | Primary button (sampled `#203EEA` / `#283DEE`) |
| `--primary-hover` | `#2D4BFF` | Hover (proposed, +lightness) |
| `--primary-press` | `#1830C4` | Pressed (proposed) |
| `--accent-glow` | `#5028BF` | Violet glow behind hero art and onboarding (sampled) |
| `--success` | `#22C55E` | Connected, verified, applied (proposed; mockup chip is green) |
| `--warning` | `#F59E0B` | Needs attention, paused (proposed) |
| `--danger` | `#EF4444` | Emergency stop, delete, errors (mockup uses a red emergency button) |
| `--info` | `#38BDF8` | Info banners (proposed) |

### Color — text
| Token | Hex | Contrast on `--bg-card` `#0E111A` | Use |
|---|---|---|---|
| `--text-primary` | `#F1F5F9` | ≈17:1 (pass AAA) | Titles, values |
| `--text-secondary` | `#94A3B8` | ≈7:1 (pass AA) | Labels, descriptions |
| `--text-muted` | `#64748B` | ≈3.9:1 (**fails AA for body text**) | Captions only, ≥14px or non-essential |
| `--text-on-primary` | `#FFFFFF` | ≈6:1 on `--primary` | Button labels |

Rule: body and labels must use `--text-secondary` or brighter. `--text-muted` is for non-essential captions only.

### Radius
`--radius-sm: 8px` (chips, inputs), `--radius-md: 12px` (buttons, list rows), `--radius-lg: 16px` (cards, modals), `--radius-pill: 999px` (status pills, dock, avatar).

### Spacing (4px base, matches the 8px scale in the current app)
`4, 8, 12, 16, 20, 24, 32, 40, 48`. Card padding `16–20px`. Gap between cards `12–16px`. Section gap `24px`.

### Shadow and elevation
- `--shadow-card: 0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.35)`
- `--shadow-dock: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset`
- `--glow-primary: 0 0 24px rgba(32,62,234,0.45)` (launch button, active states)

### Typography
Font: system UI stack (`"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`). Segoe UI is on every Windows machine, so no webfont download is needed.

**Sizes are fixed in px, not rem or em.** The current stylesheet mixes `rem` (`--text-*` tokens) and `px`; the redesign uses px only, so type cannot scale with browser or root font settings. Sizes below are measured from the current `design-system.css` (body 12.5–13px, labels 10.5–11.5px) and kept at that density. The first draft of this spec used 14px body and 22px titles; those were too large and are removed.

| Role | Size / weight / line | Current app equivalent |
|---|---|---|
| Hero (onboarding welcome only) | 24px / 700 / 1.2 | `font-size: 24px` at `design-system.css:190` |
| Screen title (H1) | 18px / 700 / 1.25 | `18px` at line 183 |
| Card title (H2) | 14px / 600 / 1.3 | `14px` at line 213 |
| Body | 13px / 400 / 1.45 | `13px` (most rows) |
| Secondary text | 12px / 400 / 1.4 | `12.5px` / `12px` |
| Label, tag, chip | 11.5px / 500 / 1.3 | `11.5px` / `11px` |
| Caption, eyebrow | 11px / 600 / 1.3, uppercase tracking 0.04em | `11px` |
| Stat number | 22px / 700, tabular numerals | new |
| Button text | 12.5px / 600 | `11.5px`–`13px` today |

**Hard minimum: 11px.** The current app has 10px and 10.5px text in several places (e.g. `design-system.css` lines 1109, 1128, 1281, 1382). Those are raised to 11px in Phase 0. Nothing below 11px ships.

### Sizing rules (apply everywhere)
- Use the spacing scale in px (`4, 8, 12, 16, 20, 24`). Max card padding `16px`; section gap `20px`; page padding `20px`.
- Control heights: compact button `28px`, default button `32px`, input `32px`, toggle `18×34px`, launch button `44px` (the only large control).
- Sidebar: `184px` expanded, `52px` collapsed. Icon size `16px` in nav, `18px` in headers, `22px` for hero only.
- Nothing scales with the window beyond the content column; cards use fixed paddings and wrap instead of growing.
- Avatars: `24px` in lists, `32px` in headers.

### Motion
- Hover and press: 120–150 ms ease-out.
- Panel and card transitions: 200–250 ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Dock active indicator and profile dropdown: spring-like easing (`cubic-bezier(0.34, 1.4, 0.64, 1)`, 280 ms).
- Skeletons: 1.4 s shimmer loop.
- Countdown ring and progress bar: continuous, linear.
- `prefers-reduced-motion: reduce` disables transforms and shimmer; keep opacity fades only.

## 2. Window and layout

- **Window:** frameless custom title bar (dark, matches `--bg-app`). Replaces the default white Windows title bar. Title bar height 36px, with app icon, "FMSG Agents" text, and min/max/close buttons (Windows 11 style, drawn in-app). Drag region covers the bar except the buttons.
- **Minimum size:** 960×640 CSS px at 100% scale (existing constraint, keep).
- **Scaling:** test at 100%, 125%, 150%. At 150% the logical width of a 1920px display is 1280px, so the 960px minimum still fits. Two-column layouts collapse to one column below 1100px wide.
- **Navigation:** the mockup uses a left sidebar (Home, Run, Applications, Review, Profiles, Billing, Settings). The current app uses a bottom floating dock. **Decision:** adopt the sidebar, because nine screens in the mockup need a labelled list of destinations, and a dock cannot hold that many labels. Keep the dock's central lightning launch button as a sidebar-bottom "Start run" button.
- **Sidebar:** 184px expanded, 52px collapsed (icons only, tooltips on hover). Items: Home, Run, Applications, Review queue (with count badge), Profiles, Billing, Settings. Account avatar at bottom.
- **Content area:** max width 1120px, padded 24px. Right-side panel (320px) used for Live preview on the run screen only.

## 3. Component inventory

Each component lists variants and states. States to implement everywhere: default, hover, pressed, focus-visible (2px `--primary` ring, 2px offset), disabled (40% opacity, no pointer), loading (spinner in place of label), error (`--danger` border or text).

| Component | Variants | Notes |
|---|---|---|
| Title bar | default, inactive window | Custom, drag region |
| Sidebar nav item | default, hover, active (left 3px `--primary` bar + `--bg-card-raised`), collapsed | Badge for Review count |
| Launch button | idle, running (shows pause), disabled | Central in sidebar footer and on Run screen |
| Status pill | `Running`, `Paused`, `Idle`, `Needs you`, `Error`, `Offline` | Dot + text, colour from status token |
| Profile picker | closed, open (dropdown), selected | Animated open/close, avatar + name + role |
| Card | default, hover (lift 1px), selected | Radius-lg, card shadow |
| Stat card | value, label, delta sparkline | Tabular numerals |
| Button | primary, secondary (outline), ghost, danger | Heights 32px (default), 28px (compact), 44px (launch only) |
| Input | default, focus, error, disabled, with prefix icon | Height 32px |
| Toggle | off, on, disabled | 34×18px |
| Checkbox | off, on, indeterminate | Used in tables |
| Segmented control | 2–4 segments | Login/Sign up, Batch size |
| Slider | with value label | Batch size, cost cap |
| Radio card | selectable tile | Autonomy mode (Full auto / Approve each / Aggressive) |
| Table | header, row, hover row, empty | Applications tracker, rules queue |
| Badge | count, status | Sidebar count, row tags |
| Modal | info, confirm, danger, "Needs you" approval | Radius-lg, backdrop blur (with solid fallback) |
| Toast | success, info, warning, error | Bottom-right, auto-dismiss 4 s |
| Stepper | completed, current, upcoming | Onboarding "Step 1 of 4" |
| Timeline | event, current, failed | Application detail, live activity |
| Progress bar | determinate, indeterminate | Run progress, update download |
| Ring | value, countdown | Needs-you timer (10:00), usage (68%) |
| Empty state | illustration + text + one action | Live feed, tracker, queue |
| Skeleton | line, card | Loading states |
| Installer window | step 1 licence, step 2 installing | Custom NSIS, see §5 |
| Update screen | checking, downloading, installing | Existing UpdateProgress, restyled |
| Banner | info, warning, error | Offline, plan limit |

## 4. Screen specifications

Each screen lists purpose, regions, components, real data (existing FMSG systems only), and states. **No mock data in shipped code.** Where a screen needs data that does not exist today, it is marked `NEEDS NEW DATA`.

### 4.1 Login / sign up
- **Purpose:** sign in with the FMSG account.
- **Regions:** centred card 380px, logo, "Welcome back" title, Log in / Sign up segmented control, email, password (show/hide), "Keep me signed in" checkbox, primary button, "Forgot password" link.
- **Data:** Supabase Auth via existing `session-manager.ts`; 6-digit verification (`/api/auth/send-verification`, `/api/auth/verify-code`); ban check (`banned_accounts`).
- **States:** idle, loading, wrong password (inline error), unverified (goes to code step), offline (banner), rate limited.
- **Motion:** segmented indicator slides 200 ms.

### 4.2 Onboarding (4 steps)
- **Steps:** 1 Welcome (three feature tiles: Find jobs, Tailor your CV, Apply for you), 2 Connect accounts, 3 Test run, 4 Done.
- **Purpose:** get a first profile ready.
- **Regions:** stepper header ("Step n of 4"), hero, content, footer with Back / Continue.
- **Data:** `search_profiles` (create first profile), `profiles` (name, phone). CV upload to `cv-files` if provided.
- **Step 2 caveat:** the mockup shows six job-site connect buttons. **FMSG does not hold per-site logins**; the agent opens each site in the user's own browser and the user signs in there (existing rule in `agent-controller.ts`). Replace the connect cards with a "How applications work" explainer and a list of supported sources (generic icons). Do not store site passwords. `NEEDS NEW DATA` only if a per-site connection feature is later approved.
- **Step 3 test run:** uses a real saved job from `/api/agent/tools/search-jobs` (one result, opened but **not submitted**). No fake job card.
- **States:** loading job search (skeleton), no results (empty state with "change search" action), error.

### 4.3 Home (main dashboard)
- **Regions:** greeting, primary "Start applying" button, four quick-action cards (Start a search, Review queue, Applications, Top up), "This week" stat cards with sparklines, "Recent applications" list, "Usage" donut (credits used).
- **Data:** `saved_jobs` (counts, recent 5 rows), queue count, `profiles` balances (`search_balance`, `cv_generation_balance`, `persistent_finder_balance`), plan from `profiles.plan`.
- **Stat definitions** must match the table: applications this week = `saved_jobs` rows with `applied` status (**NEEDS NEW DATA**: a status column; today rows only record the job, see §6 Phase 3).
- **States:** first run (empty), loading (skeletons), offline (cached last values, labelled "last updated").

### 4.4 Run setup
- **Regions:** profile picker (left), batch size segmented control (10 / 25 / 50 / 100), autonomy mode radio cards, estimated cost card, daily-cap slider, Start button.
- **Data:** `search_profiles` list; cost from `plan-limits.ts` rate per application; balance from `profiles`; daily cap stored locally (existing spend-cap behaviour).
- **Rules:** Start disabled if balance is below estimated cost; show the reason inline.
- **Autonomy modes:** Full auto (submit without review), Approve each (review before submit), Aggressive (higher batch, same review rules). Mode names should describe behaviour, not marketing. Confirm wording before release.

### 4.5 Live run
- **Regions:** left column = progress bar with count, step list (Finding jobs, Filtering, Tailoring, Applying, Monitoring, Complete), current job card (title, company, match %, progress); right column = Activity feed; bottom = Pause, Stop, Emergency stop (red).
- **Data:** existing `agent-event` IPC stream (phases, screenshots, attention). Screenshots come from `page.screenshot` as now.
- **States:** running, paused, waiting for you (opens Needs-you modal), finished, error, offline.
- **Motion:** step list active step pulses (opacity only under reduced motion).

### 4.6 Needs you (approval modal)
- **Purpose:** a sign-in wall, captcha, sensitive field, or submit approval.
- **Regions:** title, job card, reason text, countdown ring (10:00), input (if the agent needs a value), primary "Save and continue", secondary "Skip this job".
- **Data:** existing `attention` IPC (`requestAttention`, `respondAgentAttention`). Sensitive values are not stored; they are passed to the form and discarded.
- **States:** waiting, answered, timed out (job skipped, refund applied as now).
- **Rule:** the timer ends in skip, never in submit.

### 4.7 Review queue
- **Purpose:** approve or skip applications that are waiting for the user (Approve each mode).
- **Regions:** header "N applications need your review", list rows (job title, company, match, tailored CV thumbnail, Approve, Skip).
- **Data:** `NEEDS NEW DATA`: queued applications with status `pending_review`. Store the tailored CV path and form values until decided.
- **States:** empty (all clear state), loading, error.

### 4.8 Applications tracker
- **Purpose:** history of every job the agent handled.
- **Regions:** search box, filter chips (status, date), table (Company, Role, Status, Applied, Match, action), pagination footer.
- **Data:** `saved_jobs` (existing RLS table) plus `NEEDS NEW DATA`: `status` (`applied`, `skipped`, `failed`, `pending_review`), `applied_at`. Migration needed; grants per the `GRANT ALL` rule in `AGENTS.md`.
- **States:** empty, loading (table skeleton), error.

### 4.9 Application detail and replay
- **Purpose:** show what the agent did for one job.
- **Regions:** header (job, company, status pill), timeline (left), screenshot viewer (centre, click to zoom), tailored CV preview (right), Download CV button.
- **Data:** `NEEDS NEW DATA`: step log and screenshots per application. Screenshots today live only in memory; they must be written to a private bucket (e.g. `agent-run-artifacts`, owner RLS, auto-delete after N days). Tailored CV from `/api/tailor-cv` output in `cv-files`.
- **States:** no replay recorded (explain why), loading, error.

### 4.10 Profiles
- **Purpose:** manage search profiles.
- **Regions:** grid of profile cards (avatar, name, role, location, status), "New profile" card, edit, set default.
- **Data:** `search_profiles`; edit opens the web profile editor (existing link), not a duplicate editor, unless a later phase approves an in-app editor.
- **States:** empty (create first), loading, error.

### 4.11 Rules and answer bank
- **Purpose:** saved answers to common application questions and rules (e.g. notice period, salary expectation, work authorisation).
- **Regions:** categories (Personal, Experience, Preferences), rows with question, answer, and "Ask me each time" toggle, rules list (e.g. "Skip roles under R X").
- **Data:** `NEEDS NEW DATA`: `answer_bank` table (user_id, key, value, ask_each_time), RLS owner-only, grants included. Sensitive answers (ID numbers) are **not** allowed in the bank.
- **States:** empty (seeded suggestions are not created; user adds), loading, error.

### 4.12 Billing (plans and pay-as-you-go)
- **Purpose:** see balance, choose a plan, set a monthly spend cap.
- **Regions:** balance card (searches, CV generations, PF runs), spend cap input (manual text, no spinner arrows, from the current v0.6.0 control), plan cards (Seeker, Hunter, Pro), usage donut, invoices list if available.
- **Data:** `profiles` balances; `/api/agent/billing/plans`, `/checkout`, `/verify` (existing); `subscriptions` for history.
- **Pay-as-you-go:** the mockup shows a per-application price. **FMSG has no pay-per-application product today.** Show it only after a product decision and a Paystack price model exist. `NEEDS NEW DATA` / product decision.
- **States:** plans loading (skeleton), plans error (retry button, never a silent failure), payment pending (polling), payment failed.

### 4.13 Notifications
- **Purpose:** short list of run completions, needs-you requests, and update notices.
- **Regions:** popover from the top-right bell, grouped list, mark all read.
- **Data:** `NEEDS NEW DATA`: `agent_notifications` table or derived from `agent-event` history. Derived-only version is cheapest and needs no table.
- **States:** empty, unread dot.

### 4.14 Settings
- **Regions:** Run preferences (Prevent computer from sleeping, toggle), Updates (channel select, last check, Check now), Browser and installation (browser status pill, device key status, Re-register), Agreements (EULA, Terms, Privacy), Account (sign out, **delete account**).
- **Data:** existing `electronAPI` calls (`setPreventSleep`, `checkForUpdates`, `setUpdateChannel`, `resetDeviceKey`, `openLegalDocument`). Account deletion: `NEEDS NEW DATA` (app-side flow calling the web deletion route; the web flow exists, the desktop entry point does not).
- **Note:** the current v0.6.0 Settings page already does most of this; restyle, do not rebuild.
- **Danger zone:** delete account uses the danger button and a two-step confirm.

### 4.15 Update and installer screens
- **Update screen (startup):** checking → downloading (progress bar, MB count) → installing → done. Existing `UpdateProgress.tsx` logic; restyle only. Shows version number on the screen.
- **Installer wizard:** custom NSIS pages in dark style: licence (scroll box, "I accept" checkbox, Install button disabled until ticked), install progress, finish with "Run FMSG Agents". The mockup's purple/violet hero is allowed for the installer sidebar art only (brand-owned, FMSG colours, not the sheet's placeholder).
- **Data:** existing `installer/installer.nsh`, `installerHeader.bmp`, `installerSidebar.bmp`, `legal/LICENSE.txt`.

### 4.16 Empty, error and offline states (shared)
- Empty: icon, one line of text, one action. No "Lorem".
- Error: what happened, what to do, Retry button, and a "Copy diagnostic" action that uses the existing redacted logger.
- Offline: top banner "Offline — showing last saved data"; actions that need network are disabled with a reason.

## 5. Accessibility
- **Contrast:** primary text ≈17:1, secondary ≈7:1, muted ≈3.9:1 (muted is for captions only). Buttons: white on `#203EEA` ≈6:1.
- **Keyboard:** Tab order follows the visual order (sidebar → header → content). Every interactive element has a focus ring. Escape closes modals and dropdowns. Enter activates the primary action in a modal. The dock/sidebar can be reached with arrow keys inside the nav group.
- **Screen readers:** icon-only buttons have `aria-label`. Live feed uses `aria-live="polite"`; approval modal uses `role="dialog"` and focuses its first control.
- **Reduced motion:** see §1.
- **Colour is never the only signal:** status pills include text.

## 6. Performance
- **Blur and glow:** `backdrop-filter` and large `box-shadow` glows are the main GPU cost in Electron. Use them on the title bar, modals and the hero only.
- **Solid fallback:** a `.no-blur` class (applied when `prefers-reduced-transparency` is set, or when the app detects low GPU) replaces `backdrop-filter` with a solid `--bg-panel` background.
- **Images:** run screenshots are JPEG at quality 62 (current). Thumbnails in lists use a smaller render.
- **Lists:** tracker and queue virtualise past 200 rows.

## 7. Implementation phases

Difficulty: **S** small, **M** medium, **L** large. Pick a model per phase accordingly. Each phase ends with `npx tsc --noEmit`, `npm run build:code`, and screenshot comparison at 100%, 125% and 150%.

| Phase | What is built | Real systems | Test | Difficulty |
|---|---|---|---|---|
| **0** | Split `design-system.css` into `tokens.css` + `components.css` + `screens.css`; add tokens from §1; no visual change yet | none | Build; visual diff must be ~0 | S |
| **1** | Custom title bar (frameless window, drag region, min/max/close); fix the white default title bar | Electron `BrowserWindow` config | Manual + screenshot at 3 scales | M |
| **2** | Base components: buttons, inputs, toggle, checkbox, segmented control, slider, card, badge, status pill, toast, modal, skeleton | none | Storybook-style test page (dev only, not shipped) + screenshots | M |
| **3** | Sidebar navigation replacing the dock (collapsed + expanded); keep dock code removable behind a flag until verified | local state | Keyboard path, 3 scales | M |
| **4** | Home dashboard | `saved_jobs`, `profiles` balances | Real data check with a test account; empty and error states | M |
| **5** | Run setup + Live run + Needs-you modal restyle. **Add what is missing:** Pause (new IPC to pause the runner loop), Emergency stop (immediate stop, distinct from Stop), needs-you countdown ring (10:00, expires into *skip*, never submit), and an input field for values the agent asks for | existing `agent-event`, `attention` IPC; new pause IPC | Live run on a test job; approval flow on a sign-in wall test page; countdown expiry test confirms skip + refund | M–L |
| **6** | Applications tracker + detail + replay | **new** status columns and private artifact bucket (migration, grants, RLS) | Migration on a test project first; RLS check with two accounts | L |
| **7** | Review queue | **new** `pending_review` flow in runner | Approve/skip against a test job | L |
| **8** | Profiles, Billing, Settings restyle; delete-account entry point | existing billing and profile routes; delete route | Paystack test mode; delete on a throwaway account | M |
| **9** | Onboarding (4 steps) | `search_profiles`, `/api/tailor-cv`, `cv-files` | New-account walkthrough | M |
| **10** | Rules and answer bank | **new** `answer_bank` table, RLS, grants | Two-account RLS test | L |
| **11** | Notifications popover | derived from IPC history (cheap) | Visual + event test | S |
| **12** | Installer and update screens restyle | NSIS assets, `UpdateProgress.tsx` | Clean install, upgrade from 0.6.0, uninstall | M |
| **13** | Motion polish, reduced-motion, solid fallback | none | Reduced-motion toggle check; GPU check on a low-end machine | S |

**Sizing check (every phase, before merge):**
1. Capture each screen at 960×640, 1280×800 and 1920×1080 at 100%, 125% and 150% Windows scaling.
2. Overlay the new capture on the current v0.6.0 capture of the same screen (same scale). Text heights and control heights must not grow by more than about 10%, except the one hero element.
3. No text clipped, truncated with an ellipsis where the full label matters, or wrapped to a third line in a button.
4. Confirm no text is below 11px with a DOM check (`getComputedStyle` sweep in a dev-only script; not shipped).
5. Open Windows Settings → Accessibility → Text size at 125% and confirm the app's layout is unchanged (Electron web content does not follow this setting by default; verify and record the result).

**Order matters:** phases 0–3 change the shell and must land before screens (4+), so every screen is built on the final tokens and navigation. Phases 6, 7 and 10 need database migrations; apply them to a test project first and follow the `AGENTS.md` DDL rules (one statement at a time, verify with `SELECT`, `GRANT ALL` in the migration).

**Product decisions needed before the phases below can finish:**
1. Pay-as-you-go per application (mockup billing screen) — not in the current price model.
2. Per-site connect cards (mockup onboarding) — conflicts with the rule that site passwords are never stored; recommended replacement in §4.2.
3. Autonomy mode names and the exact behaviour of "Approve each".
4. Whether applications and replays are kept (and for how long) — affects storage cost and privacy wording.

## 8. Stack audit and recommendation

**Current stack (verified in `src/apps/fmsg-agents/package.json` and `renderer/`):**
- Electron 34 (main process + context-isolated preload).
- React 19 + TypeScript 5.
- esbuild bundles `renderer/index.tsx` to `renderer/bundle.js` (CSS is imported as text).
- Styling: one hand-written `renderer/design-system.css` with custom properties, plus many inline `style={{}}` objects.
- No component library, no state library (`useState`, `useEffect`, `useCallback` only), no charting library, no animation library.
- Backend: `@supabase/supabase-js`, Playwright for the browser, `keytar` for the OS keychain, `electron-updater` listed.

**Recommendation: keep the stack.** It can produce the mockup's look. Changing it would re-test auth, OTA, and the installer for no visual gain.

**Changes to make inside the existing stack:**
1. Split CSS into tokens, components and screens (Phase 0). Biggest maintainability win.
2. Replace repeated inline styles with named classes, screen by screen as each is redesigned. Do not do it all at once.
3. Charts: hand-written SVG for the donut, rings and sparklines (small, no dependency).
4. Animation: CSS transitions plus the spring easing in §1. Add Framer Motion only if the dock/dropdown springs look wrong after Phase 3.
5. Component library: do not add one (MUI, Chakra, etc.). They add weight and a styling conflict; the app has a small, fixed component set.

**If a migration were ever wanted** (not recommended now): Tailwind + shadcn/ui-style components on the same React 19 base. Effort: about 2–3 weeks, risk medium (every class name changes), no functional gain. Only worth it if the team grows.

## 8b. Coverage matrix: sheet screens vs. v0.6.0 code

Checked by searching `src/apps/fmsg-agents/renderer/` (App.tsx, LiveLog.tsx, BillingPanel.tsx, SettingsPanel.tsx, UpdateProgress.tsx, LoginScreen.tsx, DialogSystem.tsx) and `installer/`. `ViewType` in App.tsx has only five views: dashboard (Live Feed), profiles, billing, settings, account.

| # | Sheet screen | In v0.6.0 code? | Where / what is missing |
|---|---|---|---|
| 1 | Login / sign up | **Exists** | `LoginScreen.tsx`. Sheet layout differs; restyle only. |
| 2 | Onboarding: welcome (4 steps) | **Missing** | No onboarding flow. |
| 3 | Onboarding: connect accounts | **Missing** | No flow. The sheet's per-site connect cards conflict with the no-stored-site-passwords rule (spec §4.2). |
| 4 | Onboarding: test run | **Missing** | No flow. |
| 5 | Main dashboard (stats, usage donut, recent applications) | **Partial** | `dashboard` view is the Live Feed only. No stats, no recent-applications list, no usage ring. |
| 6 | Run setup (profile, batch size, autonomy modes, cost, cap slider) | **Partial** | Lightning launch modal in App.tsx has batch size and Start. Missing: autonomy modes, cost estimate, batch options 10/25/50/100 as shown (confirm), cap slider. |
| 7 | Live run (progress, step list, current job, activity, Pause / Stop / Emergency stop) | **Partial** | Step list, activity and live preview exist (LiveLog.tsx). **Stop exists** (`handleStopAgent`, App.tsx:414). **Pause is missing. Emergency stop is missing.** |
| 8 | Needs-you modal with **countdown ring 10:00** | **Partial, countdown Missing** | Attention card in LiveLog.tsx has Continue and Skip only. **No countdown exists anywhere in the renderer** (searched for countdown, mm:ss, formatTime, secondsLeft: 0 matches). No input field for a value. |
| 9 | Review queue (pending approvals, Approve / Skip) | **Missing** | No queue view. Needs `pending_review` data (spec §4.7). |
| 10 | Applications tracker (table, filters, pagination) | **Missing** | Jobs are written to `saved_jobs`, but no view shows them. |
| 11 | Application detail and replay (timeline, screenshots, tailored CV) | **Missing** | Screenshots live in memory only. No replay storage. |
| 12 | Profiles | **Exists** | `ProfilesView` in App.tsx. Sheet shows cards with avatars; current view is a list. Restyle. |
| 13 | Rules and answer bank | **Missing** | No table, no view. |
| 14 | Billing: plans, pay as you go, upgrade | **Partial** | `BillingPanel.tsx` has plan cards, manual spend cap and Paystack checkout. Pay-as-you-go mode exists as a toggle. Per-application pricing is not implemented (product decision). |
| 15 | Empty and error states | **Partial** | Live Feed "Nothing running yet" and Profiles "No Profiles Found" exist. No general error or offline screens. |
| 16 | Update screen ("installing new update") | **Exists** | `UpdateProgress.tsx`, startup and modal. |
| 17 | Installer wizard (licence, install) | **Exists** | NSIS in `installer/` with licence and branded bitmaps. Visual result not verified against the sheet. |
| 18 | Delete account screen | **Missing** | Account view has Sign Out only. No delete (search found none). Web deletion exists; desktop entry point does not. |
| 19 | Settings | **Exists** (not in the sheet) | `SettingsPanel.tsx`. The sheet's sidebar lists Settings but shows no Settings screen. |

**Counts:** Exists 5 (login, profiles, update, installer, settings-not-in-sheet). Partial 6 (dashboard, run setup, live run, needs-you, billing, empty/error). Missing 8 (three onboarding screens, review queue, tracker, replay, rules and answer bank, delete account). The countdown is the one specific item the sheet shows that the code does not have at all.

**Not in the sheet, added by my spec earlier:** §4.13 Notifications. It is not on the mockup sheet, so it should be removed from the spec unless you want it.

**Earlier claim corrected:** the pre-redesign plan described the needs-you flow as fully handled. It is not. The countdown, the input field, and the pause control must be built (Phase 5).

## 8c. Decisions recorded (agreed with product owner)

**Scope.** FMSG Agents only. The FMSG website, its pricing, and its search features are separate and must not be changed by this work. The website searches and presents jobs; the desktop agent applies for the user.

**Secrets and sign-in (approved):**
- Site passwords are stored locally in Windows Credential Manager, not in Supabase. Only names and site lists may be synced later, and only if approved.
- Each secret is named `SITE_PASSWORD` (e.g. `LINKEDIN_PASSWORD`). Multiple accounts on one site get a suffix (`INDEED_PASSWORD_2`).
- The agent only ever handles the name. It calls one tool, `fill_secret(name)`, which types the value into the login field inside the app. No free-form scripts. The value never reaches the AI, the server, logs, or screenshots.
- A name is locked to its site. `LINKEDIN_PASSWORD` may only be typed on the approved LinkedIn domain.
- Each site requires explicit user permission. The user can view, forget, or replace a stored login.
- Password fields are masked in screenshots. Logs never record values or filled field contents.
- Optional Windows Hello or PIN before any fill.

**Pricing (FMSG Agents only):**
- Pay-as-you-go: R40 per application, searches included.
- Bundles (monthly subscription): Starter 10 applications R349 (R35 each); Lite 25 R749 (R30); Standard 60 R1,499 (R25); Power 150 R3,299 (R22). Searches included.
- One active bundle per account. Renewing the same bundle **stacks** unused applications with the new cycle.
- Unused applications **carry over indefinitely**. No expiry.
- Upgrade: the new plan is charged at its full price now and its applications are added to the balance.
- Downgrade: the user chooses either (a) charge the new plan's price now and stack, or (b) take effect at next renewal.
- Cancel: the subscription stops renewing. Stacked applications remain until used.
- At renewal, the balance is used before standard pay-as-you-go. Pay-as-you-go only applies if the user has a cost cap above R0.
- **Grace period:** 10% of a bundle's monthly applications, rounded down (Starter = 1). Used only after the card declines **and** the application balance is 0.
- **Gentle stop:** when the grace is used and the card still declines, the run pauses without ending. When the user pays, a Continue button resumes the same run from the same place. No start-over.
- Refunds: bundle purchases and usage charges are non-refundable.
- **Cost cap starts at R0** for every account. Users must set a cap themselves, with explicit consent. Raising the cap always requires an explicit action.
- **Out of balance prompt:** offers (a) wait until the next renewal, or (b) raise the cost cap to continue at the pay-as-you-go rate.

**Charge thresholds (pay-as-you-go, proposed and accepted in principle):**
- First charge at R40. After 1 successful payment: R100. After 3: R250. After 6 (maximum): R500.
- A failed payment steps the threshold back one stage and pauses new applications until paid.
- Every charge sends an email.

**Free allowance:** welcome bonus of **5 applications** to start (not 10). Requires verified email. One per account and no more than one per device. Bonus applications never expire.

**Billing mechanics:** deferred until the UI/UX and secrets work. Renewal method (automatic Paystack recurring vs. another method) is **still open** and must be settled before billing is built. Pricing, VAT treatment, and margin analysis are also open. The desktop prices above are separate from the website.

**Order of work:** UI/UX redesign first (phases 0–13 in §7), with the secrets and sign-in work as its own phase. Billing mechanics come after.

## 9. Open questions and what I could not determine
- **Exact font:** the mockup's typeface is not identifiable from pixels. Segoe UI is proposed; confirm after a visual check.
- **Exact colors:** sampled from single pixels of a generated image. Accept the palette, or give me a colour target and I'll adjust tokens.
- **Current v0.6.0 screenshots:** not found on this machine (the Downloads file is the mockup, not the app). Measured comparison of current vs. target still needs real screenshots; the spec above does not depend on them.
- **Backend for replay, review queue, answer bank, tracker status:** these need migrations and product decisions (§7). Not determined whether storage limits or retention periods are acceptable.
- **Brand rules:** no third-party job-site logos are used. If a site's logo is later required, its brand rules must be read first; I have not verified any brand's policy.
