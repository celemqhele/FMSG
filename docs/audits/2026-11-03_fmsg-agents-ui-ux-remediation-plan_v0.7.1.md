# FMSG Agents — UI/UX Remediation Plan

**Companion to:** `docs/audits/2026-11-03_fmsg-agents-ui-ux-audit_v0.7.1.md`  
**Baseline:** FMSG Agents v0.7.1 · 161 audit findings (Critical 4 · High 39 · Medium 81 · Low 37)  
**Plan date:** 3 November 2026  
**Owner:** VP Technology / implementation lead  
**Status:** Ready to execute, subject to the Day-1 decisions in §3

---

## 0. Plan at a glance

| Release | Version | Scope | Delivery channel | Target |
|---|---|---|---|---|
| Phase 0 | — | Harness, lints, release-channel unblock, decisions | — | Week 1 |
| Phase 1A | `v0.7.2` | Trust, copy, accessibility, modals, data truth — **renderer-only** | OTA | Week 4 |
| Phase 1B | `v0.8.0` | Approve/undo state model, DB migration, IPC, version-chip fix | Installer + OTA | Week 6 |
| Phase 2 | `v0.9.0` | Design system, IA, responsive, tables, onboarding | OTA (installer if needed) | Week 13 |
| Phase 3 | `v1.0.0` | Billing backoffice, account security, async states, a11y certification, demo | Installer | Week 19 |

**Critical path:** Phase 0 installer unblock → Phase 1B migration/IPC → `v0.8.0` → Phase 2 token/primitive migration → Phase 3 certification.

**The one thing that can stop this plan:** the app’s release channel. `v0.7.1` was renderer-only and OTA-eligible. Any change to `electron-main.ts`, `preload.ts`, the database, or the legal files currently requires an installer, and installer-handoff OTA is blocked by Supabase Storage returning `413 EntityTooLarge` for the ~92 MB `.exe`. Phase 0 must resolve that, or `v0.8.0` ships as a manual installer download.

---

## 1. Scope, success criteria and assumptions

### 1.1 Scope

All 161 findings in the audit are in scope. They are grouped into 43 work items so the team does not manage 161 tickets. No finding is silently dropped: §7 maps every audit section to a phase and work item, and §12 lists the only items intentionally deferred beyond `v1.0.0` with reasons.

Out of scope:

- Website changes (this is the Electron app only).
- macOS/Linux builds.
- New product features not named in the audit.
- A full rebrand; the existing palette and identity stay.
- Payment-provider migration; Paystack stays.
- Localisation beyond `en-ZA` formatting.

### 1.2 Definition of done

A finding is closed only when all five are true:

1. The code change is merged.
2. The acceptance check in §5 passes (automated where possible, screenshot otherwise).
3. A before/after screenshot or measured value is attached to the PR.
4. `src/apps/fmsg-agents/docs/changelog/UNRELEASED.md` is updated in the same commit.
5. The audit tracker row is marked `DONE` with the commit SHA.

A phase is done when its release gate in §8 passes, not when the code is written.

### 1.3 Assumptions

- One senior front-end engineer full-time; a second front-end from Phase 1A is strongly recommended.
- Product designer at 0.5 FTE for visual sign-off and the onboarding rebuild.
- Backend support at 0.25 FTE for migration 039 and Phase 3 billing/security.
- QA at 0.25 FTE for the 960/1280/1360/1920 matrix and clean-VM installer tests.
- Legal counsel available for the three legal documents.
- Production data can be exported/backed up before migration 039.
- The GitHub repository can host release assets (public repo) or another object host is available.

---

## 2. Constraints that shape the plan

### 2.1 Release channel (critical)

The OTA engine performs a **renderer bundle swap** when `requires_installer: false`. It does not update `electron-main.ts`, `preload.ts`, native modules, or `legal/*.md` read from disk. Those require a new installer.

Current blocker: the 92 MB installer cannot be uploaded to the Supabase `agent-updates` bucket (`413 EntityTooLarge`). The `v0.7.1` release log records this explicitly.

**Phase 0 must choose one of these paths:**

| Option | Effort | Pros | Cons |
|---|---|---|---|
| **A. GitHub Releases + absolute URL support in the updater** (recommended) | 2–3 days | Free, 2 GB assets, versioned, auditable | Requires a main-process change to accept a download URL; the first build must be distributed manually |
| B. Supabase paid storage tier | 1 hour + cost | No code change | Recurring cost; still a single private bucket |
| C. Chunked upload + reassembly | 4–6 days | Keeps current host | Complex, fragile, slow installs |
| D. Manual installer downloads for every release | 0 | No code | Does not scale; beta users must be chased |

**Recommendation:** A, with a manual download fallback for `v0.8.0` if the updater change cannot be verified in time. Add `download_url` to `SignedFileEntry`, prefer it over the Supabase object path when present, keep signature verification over the manifest and SHA-256 over the file. The first installer carrying this change is downloaded manually; subsequent installers can use GitHub Releases.

### 2.2 Data model

`saved_jobs` currently has no status column. Review status is inferred by substring-matching `match_summary` (`deriveJobStatus` in `App.tsx`). That is the root cause of the Approve/Skip/Remove semantics and cannot be fixed reliably in the renderer.

Migration 039 adds:

- `review_status text not null default 'applied'` with a check constraint (`applied`, `needs_review`, `approved`, `submitted`, `skipped`).
- `archived_at timestamptz` for reversible removal.
- A partial index on `(user_id, review_status, created_at desc) where archived_at is null`.
- An UPDATE policy for `auth.uid() = user_id`.
- A backfill from `match_summary` for existing rows.

The agent insert path must also set `review_status` explicitly; otherwise new rows default to `applied` and skip the review queue.

### 2.3 Testing

There is no test suite today. The only verification is `tsc` and manual screenshots. The audit itself depended on a temporary Playwright harness outside the repo.

Phase 0 productionises that harness. Without it, the Phase 2 design-system migration is unsafe.

### 2.4 Versioning and logging

Per `AGENTS.md`:

- Every app change updates `src/apps/fmsg-agents/docs/changelog/UNRELEASED.md` in the same commit.
- At release, read the actual version from `package.json` and `config.ts`, move `UNRELEASED.md` to `YYYY-MM-DD_vX.Y.Z_short-title.md`, update `INDEX.md`, and tag the release commit.
- Version numbers in this plan are targets, not commitments; re-read the repo at each release.

---

## 3. Decisions required (Day 1)

Work can start on the recommendations below if no decision arrives by end of Day 1. Each decision has a named owner and a deadline; without one, the plan defaults to the recommendation.

| # | Decision | Recommendation | Owner | Needed by |
|---|---|---|---|---|
| D1 | What does “Approve” mean? | `Approve & open` sets `review_status='approved'`, opens the employer URL, removes the item from Review. Add `Mark submitted` on the application record. Never delete on approve. | Product | Day 1 |
| D2 | Allowance/overage behaviour | Show `used / included`, plus `bonus remaining` or `over allowance` in amber. Never print `6 / 5` without an overage label. | Product | Day 1 |
| D3 | Account vs Settings | Keep both. Add **Account** to the sidebar (identity, plan, security). Settings keeps credentials, run preferences, updates, legal. | Product | Day 1 |
| D4 | Plan naming and CTA | Use `Starter`, `Lite`, `Standard`, `Power` everywhere. Mark Standard “Recommended” and make it the only primary CTA; others secondary. | Product | Day 1 |
| D5 | Legal documents | Move the three `.md` files into the renderer bundle, bump to the release version, and obtain legal review. | Legal + Eng | Day 3 |
| D6 | Installer distribution | GitHub Releases + `download_url` in the manifest; manual download fallback for `v0.8.0`. | Eng | Day 2 |
| D7 | Profile data cleanup | Back up `search_profiles`, strip trailing ` N` from display names, normalise locations, and stop the source from appending counters. | Data + Product | Day 5 |
| D8 | Visual language | Keep the palette. Adopt 12px minimum text, 6/10/14/999 radii, 32/40/48 control heights, 1200px max content. | Design | Day 3 |
| D9 | Billing backoffice scope | Invoices, payment method, next charge, cancellation in `v1.0.0`; not earlier. | Product + Finance | Day 10 |
| D10 | Accessibility certification | Book an external WCAG 2.2 AA audit after Phase 2; budget owner to confirm. | Exec | Day 20 |

---

## 4. Target architecture and standards

### 4.1 Renderer structure

```
renderer/
  App.tsx                     # shell, routing, session, global state only
  views/
    HomeView.tsx
    RunView.tsx
    ApplicationsView.tsx
    ApplicationDetailView.tsx
    ReviewView.tsx
    ProfilesView.tsx
    RulesView.tsx
    BillingView.tsx
    SettingsView.tsx
    AccountView.tsx
  components/
    ui/                       # primitives: Button, IconButton, Input, Select,
                              # Checkbox, Card, Modal, Tabs, Segmented, Pill,
                              # Table, Toast, PageHeader, EmptyState, Skeleton
    ...existing feature components
  lib/
    format.ts                 # Intl date/number/location formatters
    status.ts                 # review/application status model
    legal.ts                  # bundled legal docs + markdown renderer
  styles/
    tokens.css
    base.css
    components.css
    views.css
  legal/                      # bundled .md files (OTA-able)
```

`App.tsx` is 2,898 lines. Phase 2 extracts one view per PR, starting with the simplest (Account, Billing) and ending with Home/Run. No behaviour changes in extraction PRs.

### 4.2 Status model

| Status | Meaning | Appears in |
|---|---|---|
| `applied` | Agent submitted the application | Applications |
| `needs_review` | Agent prepared it; user action required | Review, Applications |
| `approved` | User approved and opened the employer site | Applications |
| `submitted` | User confirmed submission | Applications |
| `skipped` | User dismissed it (reversible) | Applications (filter) |

`archived_at` removes a record from all default views; “Undo” clears it. Review queue = `needs_review` and `archived_at is null`.

### 4.3 Design tokens (target)

| Group | Values |
|---|---|
| Type | 12 / 13 / 14 / 16 / 18 / 24 / 32 px; line-heights 18 / 20 / 22 / 24 / 26 / 32 / 40 |
| Space | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 |
| Radius | 6 (controls), 10 (cards), 14 (modals), 999 (pills) |
| Control height | 32 (compact), 40 (default), 48 (primary CTA) |
| Content width | 1200px max, 24px gutters |
| Breakpoints | 1280 / 1100 / 960 |

### 4.4 Quality thresholds

- Type sizes in use: **≤ 8**.
- Border radii in use: **≤ 4**.
- Layout `!important`: **0**.
- Contrast: body ≥ 4.5:1, large/UI ≥ 3:1.
- Minimum text: 12px; minimum target: 24×24, 44×44 for primary/destructive.
- Focus: visible 2px ring on every interactive element.
- Axe: 0 critical/serious.
- Banned terms: 0 (`_PASSWORD`, `fill_secret`, `dev_`, `PAYG`, `grace protection`, `Stacks forever`, `toLocaleString()` without locale).

---

## 5. Work breakdown

Effort is in dev-days for one senior front-end, excluding design/QA/legal time.

### Phase 0 — Baseline and unblock (5 days)

| ID | Work item | Output / acceptance | Effort |
|---|---|---|---|
| P0.1 | Branch, worktree and freeze | `audit/phase-0` branch off `production`; feature freeze on `App.tsx` and `design-system.css` except audit fixes; tracker created | 0.5 |
| P0.2 | Playwright UI harness in-repo | `tests/ui/` launches the real Electron app and the mocked bundle; captures 960/1280/1360/1920; dumps metrics; `npm run ui:shots` works | 1.5 |
| P0.3 | Accessibility harness | axe-core injected on Home, Applications, Review, Profiles, Billing, Settings, Login, Signup; `npm run ui:a11y` reports violations | 0.5 |
| P0.4 | Lint scripts | `lint:content` (banned terms/formats) and `lint:tokens` (type/radius/space/`!important` counts) run report-only | 1 |
| P0.5 | Release-channel spike | GitHub Releases upload + `download_url` manifest change proven on a test build; fallback decision recorded | 1 |
| P0.6 | Baseline and tracker | Current screenshots/metrics stored; all 161 findings mapped to work items and owners | 0.5 |

**Exit gate G0:** harness reproduces the audit’s critical findings (Run Setup at 960, signup overflow, focus ring, 6/5); decisions D1–D4 recorded; installer path chosen.

### Phase 1A — Renderer-only trust release `v0.7.2` (15 days)

Strictly renderer/build-config changes. No `electron-main.ts`, `preload.ts`, DB or installer changes. This release must be OTA-eligible.

| ID | Work item | Findings | Key changes | Acceptance | Effort |
|---|---|---|---|---|---|
| P1A.1 | Formatting and data truth | AP-03, HM-01, HM-02, HM-04, HM-08, ST-06, CT-01, CT-02, CT-04, CT-05, LS-01 | `lib/format.ts`; usage overage state; active-profile label; chart dates/values; loading skeleton | One date/currency/location format; no `6 / 5` without overage label; active profile shows a name or “None”; chart has dates and values; loading ≠ empty | 2 |
| P1A.2 | Internal identifier purge | ST-01, ST-02, ON-02, NT-04, CT-07 | Rewrite vault/onboarding/toast copy; hide device key behind “Advanced”; site labels only | Grep finds no `_PASSWORD`, `fill_secret`, `dev_`, “Windows Credential Manager” in renderer strings | 1 |
| P1A.3 | Billing clarity | BL-01…BL-06, BL-10, BL-13, CT-03 | One primary CTA (Standard), plan names, cap label, remove threshold/stage/grace memo, explain bonus | A first-time user can state monthly cost and cap in 30 seconds; one primary CTA; no “Default R0” contradiction | 2 |
| P1A.4 | Legal bundle and rendering | ST-11, ST-12, DL-05 | Bundle `.md` via esbuild `--loader:.md=text`; `renderLegalMarkdown`; version check script | ToS/Privacy/EULA render with headings and no ASCII rules; version matches the app; no IPC dependency | 1.5 |
| P1A.5 | Titles, nav and layout quick wins | RV-02, RN-01, RN-02, RN-05, PF-02, RL-01, AP-09, AC-01, AC-04, GS-12 | Stable Review title; Run H1 and selector width; footer clipping; per-tab Profiles/Rules header; Account in sidebar; sign-out neutral; one version chip | Every route has one stable noun H1 + subtitle; Account reachable in one click with active nav; no clipped selector/footer | 1.5 |
| P1A.6 | Accessibility baseline | GS-01, GS-03, GS-04, GS-07, AU-02, AU-09, AU-10, AU-11, LS-02 | Global `:focus-visible`; `--text-muted` change; 12px minimum; styled checkbox; error association; loading spinner | Tab walk shows a ring on every control; axe critical/serious = 0; contrast ≥ 4.5:1; no text < 12px | 2 |
| P1A.7 | Modal shell and minimum window | RS-01, RS-02, RS-03, RS-09, AU-08, AU-13, AU-15, DL-02, RP-01, RP-02 | Shared `Modal`; max-height, sticky header/footer, content-area centring, Esc/backdrop, signup scroll | Run Setup fully operable and dismissible at 960×640; signup fits or scrolls with visible footer; all modals share one shell | 2 |
| P1A.8 | Notifications correctness | NT-01, NT-03, NT-04 | Version from `appVersion`; read state on open; empty state; timestamps; remove internal announcement | Badge clears on open; no stale version; empty state exists | 0.5 |
| P1A.9 | Loading, disabled and success states | AU-03, LS-02, LS-03, LS-04 | Spinner + label on async buttons; disabled reason; saved-state indicator | No async action without progress; saves show a persistent confirmation | 1 |
| P1A.10 | Release `v0.7.2` | — | Version bump, changelog, OTA manifest, screenshots | Installed 0.7.1 → OTA → 0.7.2; audit P1A checks pass | 1 |

**Exit gate G1:** all P1A findings closed; axe 0 critical/serious; 960/1360 screenshots match the acceptance; `tsc` clean; content lint clean; OTA applied to a real 0.7.1 install.

### Phase 1B — Stateful safety release `v0.8.0` (11 days)

Requires installer delivery (Phase 0) and migration 039.

| ID | Work item | Findings | Key changes | Acceptance | Effort |
|---|---|---|---|---|---|
| P1B.1 | Migration 039 + backfill | AP-05, RV-01, RV-03, RV-06, AP-10 | `review_status`, `archived_at`, check, index, UPDATE policy; backfill from `match_summary` | Migration applied and verified in `information_schema`; PostgREST schema cache reloaded; 6/6 existing rows backfilled correctly | 1.5 |
| P1B.2 | IPC and preload contract | RV-01, AP-05, RV-03 | `saved-jobs-update-status`, `saved-jobs-archive`; list returns new fields; agent inserts set status | IPC calls succeed under RLS; no service-role use in renderer | 1.5 |
| P1B.3 | Approve / submit / skip flow | RV-01, RV-02, RV-03, RV-05, RV-06, AP-10 | Approve sets `approved`, opens URL, removes from queue; “Mark submitted”; Skip sets `skipped`; status pills | Clicking Approve changes the record and the queue count; reload persists; nothing is deleted | 2 |
| P1B.4 | Confirmation and undo | AP-05, RV-03, ST-03, DL-01, DL-03, DL-04 | Shared confirm modal; toast action support; archive/skip undo; credential confirm | Forget requires typing the site name; Remove archives with 10s Undo; Skip is reversible | 2 |
| P1B.5 | Applications actions and detail | AP-04, AP-05, AP-07, AD-01, AD-02, AD-04 | Actions column header/menu; salary, match profile, dates, status history, open-posting link; 40px back control | Detail shows salary/match/status/actions; no unlabeled column; destructive actions confirmed | 1.5 |
| P1B.6 | Profile data cleanup | PF-01, PF-03, CT-04 | Export/backup, strip trailing counters, normalise locations, prevent new suffixes | No profile name ends in ` N`; one location format; backup exists | 0.5 |
| P1B.7 | Version-chip fix | — | `verifyStartupSlotHealth` unconditionally syncs `active_slot_version` | Install over slot-less state; chip reads the installed version without an OTA | 0.5 |
| P1B.8 | Release `v0.8.0` | — | Installer build, sign, manifest, clean-VM install, changelog | Clean VM: install → login → approve → undo → update; no data loss | 1 |

**Exit gate G2:** Approve/Skip/Remove E2E passes; undo restores state; migration verified; installer installed on a clean Windows VM; `v0.7.2 → v0.8.0` upgrade path works.

### Phase 2 — Design system, IA and responsive `v0.9.0` (37 days)

| ID | Work item | Findings | Key changes | Acceptance | Effort |
|---|---|---|---|---|---|
| P2.1 | Tokens and CSS split | GS-02, GS-04, GS-05, GS-06, GS-10, GS-11, GS-13, GS-14 | `tokens.css`/`base.css`/`components.css`/`views.css`; new scale; delete override layer | ≤8 font sizes, ≤4 radii, 0 layout `!important`; token lint passes | 4 |
| P2.2 | Primitives and `App.tsx` split | GS-08, GS-09, AU-05, AU-10, DL-02, ST-08, PF-05, RS-05, AP-06, NT-02 | `components/ui/*`; extract views one PR each | All screens compose primitives; no bespoke button/input/modal styles | 6 |
| P2.3 | Navigation, account and auth polish | AC-01…AC-06, AU-01, AU-04, AU-06, AU-07, AU-12, AU-14, AU-16, AU-17, PF-09, CT-08 | Sidebar + Account; Settings sub-nav; one signup path; consistent page titles; auth copy/defaults | Every screen one click away with active state; no duplicate destination; no dead-end auth exits | 4 |
| P2.4 | Settings vault UX | ST-04, ST-05, ST-07, ST-09, ST-10, ST-13, ST-14, RL-02, RL-03, RL-06 | Equal grid; connect editor; advanced disclosure; danger zone; save model labels | 960 grid equal widths; no wrapped button labels; no dead space; edit answers | 3 |
| P2.5 | Profiles and Rules split | PF-02, PF-04…PF-09, RL-01…RL-07 | Separate routes/headers; richer cards; rule save model; slider input | No shared wrong subtitle; cards answer “which profile?”; one save model per screen | 3 |
| P2.6 | Onboarding rebuild | ON-01…ON-06 | Real screenshots/SVG, no emoji, no env vars, skippable, teach cap/review | 4 steps, no jargon, ≤60s, skip works | 2 |
| P2.7 | Applications table and review | AP-01, AP-02, AP-06…AP-08, AD-03, RV-04, RV-07, RV-08 | Sortable headers, pagination, filters, export, action menu, match explanation | 100-row dataset usable at 1360; sort/filter/export work; match has a legend | 4 |
| P2.8 | Home and Run layout | HM-03, HM-05…HM-07, HM-09, HM-10, RN-03, RN-04, RN-06…RN-08, RS-04, RS-06, RS-07, RS-08 | Operational summary, chart labels, Run stacking, preview chrome, setup copy | Home answers “what happened?”; Run has a title and visible action; no clipped preview; setup options readable | 3 |
| P2.9 | Billing layout | BL-08, BL-09, BL-11, BL-12, BL-13 | Comparison table, recommended plan, cap control, bonus state | One recommended action; no slang; plan comparison readable at 960 | 2 |
| P2.10 | Responsive system | RP-03, RP-04, RP-05, ST-04, HM-06 | 1280/1100/960 breakpoints; sidebar rail; grids 3→2→1; table scroll | Full pass at 960/1280/1360/1920 with no clipping | 3 |
| P2.11 | Content system | CT-03, CT-06, CT-07, CT-08, LS-04 | Content guide + lint; rewrite all screen copy; one label per action; error recovery copy | Content lint passes; glossary exists; no banned terms; every error offers a next step | 2 |
| P2.12 | Release `v0.9.0` | — | Version bump, changelog, OTA/installer, screenshots | Gate G3 passes | 1 |

**Exit gate G3:** token thresholds met; 4-size visual pass; 100-row table test; keyboard walk; content lint; no new Critical/High regressions.

### Phase 3 — Enterprise readiness `v1.0.0` (26 days)

| ID | Work item | Findings | Key changes | Acceptance | Effort |
|---|---|---|---|---|---|
| P3.1 | Billing backoffice | BL-07, AC-05 | Invoices, payment method, next charge, cancellation, spend forecast | Finance lead reconciles a month without support | 8 |
| P3.2 | Account and security centre | AC-05, ST-02 | Name, plan, renewal, devices/sessions, password, 2FA, export, audit log | Passes a standard enterprise security questionnaire | 8 |
| P3.3 | Async state system | LS-01…LS-04, HM-09 | Skeletons, retry, offline banner, stale-data marker, empty illustrations | Every async surface has 4 documented states | 3 |
| P3.4 | Motion, density and keyboard | — | 120/200/320ms, two easings, compact/comfortable, shortcuts | Motion audit; no layout shift; keyboard shortcuts documented | 2 |
| P3.5 | Accessibility certification | GS-01, GS-03 | External WCAG 2.2 AA audit, screen-reader pass, 200% zoom, high contrast | Signed VPAT/AA statement | 2 + audit |
| P3.6 | Demo narrative and data | — | 5-minute scripted run → review → approve → invoice; demo data | Demo completes without “ignore that” | 2 |
| P3.7 | Release `v1.0.0` | — | Installer, manifest, release notes, tag | Gate G4 passes | 1 |

**Exit gate G4:** external a11y audit passed; security questionnaire passed; billing reconciliation; demo script rehearsed; no Critical/High open.

---

## 6. Delivery schedule

Assumes one senior FE. A second FE compresses Phases 1A–3.

| Week | Phase | Deliverable |
|---|---|---|
| 1 | Phase 0 | Harness, lints, installer decision, decisions D1–D4 |
| 2 | Phase 1A | Formatting, data truth, internal-ID purge, billing copy |
| 3 | Phase 1A | Legal bundle, titles/nav, accessibility baseline |
| 4 | Phase 1A | Modal shell, signup fit, notifications, loading states; `v0.7.2` OTA |
| 5 | Phase 1B | Migration 039, IPC/preload, backfill |
| 6 | Phase 1B | Approve/undo, applications detail, profile cleanup, version chip; `v0.8.0` installer |
| 7 | Phase 2 | Tokens + CSS split |
| 8 | Phase 2 | Primitives (1/2) |
| 9 | Phase 2 | Primitives (2/2) + `App.tsx` extraction (1/2) |
| 10 | Phase 2 | Extraction (2/2); navigation and Account IA |
| 11 | Phase 2 | Settings, Profiles/Rules, onboarding |
| 12 | Phase 2 | Tables, Home/Run |
| 13 | Phase 2 | Billing layout, responsive, content; `v0.9.0` |
| 14 | Phase 3 | Billing backoffice (1/2) |
| 15 | Phase 3 | Billing backoffice (2/2) |
| 16 | Phase 3 | Account/security centre |
| 17 | Phase 3 | Async states; motion/density |
| 18 | Phase 3 | External a11y audit + remediation |
| 19 | Phase 3 | Demo narrative, release verification; `v1.0.0` |

Add 20% buffer: **22–23 weeks** for one FE, **14–16 weeks** with two.

---

## 7. Coverage matrix

Every audit section is mapped. Counts are the number of finding rows in the audit.

| Audit section | Count | Phase | Work items | Notes |
|---|---:|---|---|---|
| GS — global shell | 14 | 1A/2 | P1A.5–P1A.7, P2.1, P2.2 | GS-02/05/06/08/10/11/13/14 in P2; rest in 1A |
| AU — auth | 17 | 1A/2 | P1A.6, P1A.7, P2.2, P2.3 | AU-01/04/05/06/07/12/14/16/17 in P2; rest in 1A |
| ON — onboarding | 6 | 2 | P2.6 | All |
| HM — home | 10 | 1A/2 | P1A.1, P2.8 | HM-01/02/04/08 in 1A; rest in P2 |
| RN — run | 8 | 1A/2 | P1A.5, P2.8 | RN-01/02/05 in 1A; rest in P2 |
| RS — run setup | 9 | 1A/2 | P1A.7, P2.2 | RS-01/02/03/09 in 1A; rest in P2 |
| AP — applications | 10 | 1A/1B/2 | P1A.1, P1B.1–P1B.5, P2.7 | AP-03/04/05/09 in 1A/1B; rest in P2 |
| AD — detail | 4 | 1B/2 | P1B.5, P2.7 | AD-01/02/04 in 1B; AD-03 in P2 |
| RV — review | 8 | 1A/1B/2 | P1A.5, P1B.3–P1B.4, P2.7 | RV-01/02/03/05/06 in 1B; rest in P2 |
| PF — profiles | 9 | 1A/1B/2 | P1A.5, P1B.6, P2.5 | PF-01/02/03 in 1A/1B; rest in P2 |
| RL — rules | 7 | 1A/2 | P1A.5, P2.4/P2.5 | RL-01 in 1A; rest in P2 |
| BL — billing | 13 | 1A/2/3 | P1A.3, P2.9, P3.1 | BL-07 in P3; rest in 1A/2 |
| ST — settings | 14 | 1A/2/3 | P1A.2, P1A.4, P1A.6, P2.4, P3.2 | ST-01/02/03/06/07/11/12/14 in 1A; rest in P2/3 |
| AC — account | 6 | 1A/2/3 | P1A.5, P2.3, P3.2 | AC-01/04 in 1A; AC-05 in P3 |
| NT — notifications | 4 | 1A/2 | P1A.8, P2.2 | NT-01/03/04 in 1A; NT-02 in P2 |
| DL — dialogs | 5 | 1A/1B | P1A.7, P1B.4 | DL-04 in 1B |
| LS — states | 4 | 1A/2/3 | P1A.1, P1A.9, P3.3 | LS-01/02/03 in 1A; LS-04 in P2 |
| RP — responsive | 5 | 1A/2 | P1A.7, P2.10 | RP-01/02 in 1A; rest in P2 |
| CT — content | 8 | 1A/2 | P1A.1–P1A.3, P2.11 | CT-01/02/04/05 in 1A; rest in P2 |

**No finding is unmapped.** If a finding is reclassified during implementation, update this table and the tracker in the same commit.

---

## 8. Verification and release gates

### 8.1 Automated checks (every PR)

```powershell
cd src/apps/fmsg-agents
npm run build:code
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.main.json --noEmit
npm run ui:shots -- --size 960,1280,1360,1920
npm run ui:a11y
npm run lint:content
npm run lint:tokens
```

### 8.2 Manual checks (every release)

- 960×640: Run Setup open/close, signup, settings vault, billing plans, applications table.
- 1280×720: full navigation pass.
- 1360×860: full navigation pass + screenshots.
- 1920×1080: max-width and table behaviour.
- Keyboard-only pass: tab order, focus ring, modal trap, Esc.
- Screen reader spot check: login error, toast, modal title.
- Clean-VM installer: install, login, approve, undo, update.

### 8.3 Release gates

| Gate | Release | Must pass |
|---|---|---|
| G0 | Phase 0 | Harness reproduces audit findings; decisions D1–D4; installer path chosen |
| G1 | `v0.7.2` | All P1A closed; axe 0 critical/serious; OTA applied to real 0.7.1; content lint clean |
| G2 | `v0.8.0` | Approve/undo E2E; migration verified; clean-VM install; no data loss |
| G3 | `v0.9.0` | Token thresholds; 4-size pass; 100-row table; keyboard walk; no new Critical/High |
| G4 | `v1.0.0` | External a11y audit; security questionnaire; billing reconciliation; demo rehearsal |

A gate is not waived by “we’ll fix it in the next release” unless the exception is recorded with an owner and date in the tracker.

---

## 9. Risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Design-system refactor regresses screens | High | High | Harness first; migrate one screen per PR; screenshot diff; no big-bang |
| R2 | Installer channel still blocked | High | High | Phase 0 spike; manual download fallback; ship `v0.7.2` renderer-only in parallel |
| R3 | Migration 039/RLS error | Medium | High | Backup; staging project; one statement at a time; verify `information_schema` and PostgREST |
| R4 | Legal review delays copy | Medium | Medium | Code the renderer/version check first; content swap when approved |
| R5 | `App.tsx` refactor conflicts | Medium | Medium | Feature freeze on `App.tsx`; extract one view per PR; no behaviour changes |
| R6 | Scope creep | High | Medium | Only audit IDs in scope; new items go to backlog; weekly gate review |
| R7 | Profile data cleanup damages records | Low | High | Export first; dry-run count; reversible UPDATE; review sample |
| R8 | External a11y audit finds more | Medium | Medium | Budget remediation; run axe/keyboard from Phase 1, not Phase 3 |
| R9 | Timeline slips | High | Medium | Release in slices; `v0.7.2` delivers visible value early; 20% buffer |
| R10 | Version log drift | Low | Medium | Release checklist; read version from repo; tag after CI |

---

## 10. Staffing and estimates

| Role | Allocation | Responsibility |
|---|---|---|
| Senior front-end | 1.0 FTE | Plan owner; all renderer work; release builds |
| Front-end #2 | 1.0 FTE (Phase 1A onward) | Design system, tables, responsive |
| Product designer | 0.5 FTE | Tokens, onboarding, billing comparison, visual sign-off |
| Backend | 0.25 FTE | Migration 039, IPC, Phase 3 billing/security |
| QA | 0.25 FTE | Size matrix, keyboard, clean-VM installer |
| Legal counsel | Async | Three legal documents |
| External a11y auditor | Phase 3 | WCAG 2.2 AA audit |

| Phase | Dev-days | Calendar (1 FE) | Calendar (2 FE) |
|---|---:|---|---|
| 0 | 5 | 1 week | 1 week |
| 1A | 15 | 3 weeks | 2 weeks |
| 1B | 11 | 2.2 weeks | 1.5 weeks |
| 2 | 37 | 7.4 weeks | 4.6 weeks |
| 3 | 26 | 5.2 weeks | 3.5 weeks |
| **Total** | **94** | **18.8 weeks** | **12.7 weeks** |

With 20% buffer: **22–23 weeks** (1 FE) or **14–16 weeks** (2 FE).

---

## 11. First 10 working days

| Day | Work |
|---|---|
| 1 | Confirm D1–D4; create `audit/phase-0`; copy the audit into the tracker; freeze `App.tsx`/CSS except audit fixes |
| 2 | Build the in-repo Playwright harness; capture baseline at 960/1280/1360/1920 |
| 3 | Add axe + content/token lints; add `npm run ui:*` scripts; design sign-off on D8 |
| 4 | Installer spike: GitHub Releases + `download_url`; record go/no-go |
| 5 | Legal review kickoff; profile data audit; break P1A into PRs |
| 6 | P1A.1 formatting + data truth |
| 7 | P1A.2 internal IDs + P1A.3 billing copy |
| 8 | P1A.6 accessibility baseline |
| 9 | P1A.4 legal + P1A.5 titles/nav + P1A.8 notifications |
| 10 | P1A.7 modal shell starts; mid-phase demo; remaining P1A.9 and release work in weeks 3–4 |

At the end of Day 10 the formatting, copy, billing, legal and title work should be merged, with accessibility and modals in progress. The `v0.7.2` OTA lands at the end of Week 4.

---

## 12. Deferred beyond `v1.0.0`

These are the only items intentionally not delivered by this plan. Each has a reason and a future owner.

| Item | Why deferred | Future |
|---|---|---|
| Backend notification service | Local notifications are sufficient for a single-device desktop app; a service needs infra and privacy review | Post-1.0 |
| Multi-language UI | Audit only requires `en-ZA` formatting; translation is a separate project | Post-1.0 |
| macOS/Linux builds | Product is Windows-only; native credential store and window chrome differ | If expanded |
| Full design rebrand | The identity is strong; the problem is system enforcement, not the palette | Not planned |
| Real-time collaboration / team accounts | Not in the audit; enterprise feature | Roadmap |
| Payment provider migration | Paystack works; the gap is billing history/UX | Not planned |

Everything else in the audit is mapped in §7.

---

## Appendix A — Ticket template

```
Title: [AREA] Short imperative — e.g. [Review] Approve sets status and opens posting

Audit IDs: RV-01, RV-03
Phase / release: 1B / v0.8.0
Type: Functional | Visual | Content
Files: App.tsx, preload.ts, electron-main.ts, migration 039
Change:
- ...
Acceptance:
- [ ] ...
Evidence: before/after screenshot or measured value
Changelog: UNRELEASED.md updated
Risk: ...
```

## Appendix B — Release checklist

```
[ ] Read actual version from package.json + config.ts
[ ] UNRELEASED.md complete; move to YYYY-MM-DD_vX.Y.Z_short-title.md
[ ] INDEX.md updated
[ ] build:code + tsc (both configs) clean
[ ] ui:shots + ui:a11y + lint:content + lint:tokens pass
[ ] 960/1280/1360/1920 screenshots reviewed
[ ] Renderer-only? -> OTA upload without --requires-installer
[ ] Main/DB/legal changed? -> installer build + sign + manifest
[ ] Clean-VM install/update test
[ ] Tag release commit
[ ] Update context file for any new root cause/gotcha
```

## Appendix C — Key files

| File | Role in this plan |
|---|---|
| `renderer/App.tsx` | Shell, routing, 161 findings’ source; split in Phase 2 |
| `renderer/design-system.css` | 4,157 lines; tokens/overrides; split and enforce in Phase 2 |
| `renderer/components/SettingsPanel.tsx` | Vault, updates, legal, delete account |
| `renderer/components/BillingPanel.tsx` | Plans, cap, CTA hierarchy |
| `renderer/components/LoginScreen.tsx` | Auth, validation, legal links |
| `renderer/components/DialogSystem.tsx` | Modal/toast primitive; confirm/undo |
| `renderer/components/LiveLog.tsx` | Run preview, browser chrome |
| `electron-main.ts` | IPC, saved-jobs handlers, legal document reader |
| `preload.ts` | IPC contract; new status/archive methods |
| `update-manager.ts` | Version-chip fix; `download_url` support |
| `scripts/upload-update.js` | Installer/OTA manifest |
| `supabase/migrations/039_*.sql` | Status model, archive, RLS |
| `docs/changelog/UNRELEASED.md` | Mandatory per-commit log |

---

**Bottom line:** this plan fixes the audit in four shippable slices, not one heroic rewrite. `v0.7.2` removes the visible trust failures within the first month. `v0.8.0` makes the core loop honest. `v0.9.0` makes the product consistent. `v1.0.0` makes it enterprise-ready. The only hard prerequisite is resolving installer delivery in Phase 0; without that, the most important fix — a working Approve — cannot reach users.
