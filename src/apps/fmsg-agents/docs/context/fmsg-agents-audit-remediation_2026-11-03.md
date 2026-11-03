# FMSG Agents — Independent UI/UX Audit Remediation (Phase 0 → Phase 2)

This file records the execution of the independent UI/UX audit (`docs/audits/2026-11-03_fmsg-agents-ui-ux-audit_v0.7.1.md`) and its remediation plan against the real codebase: what the audit got right, the two places the plan was technically wrong, the engineering foundation that was built first, and the four releases (`v0.7.2`, `v0.8.0`, `v0.9.0`) that closed 150 of 161 findings. It is the follow-up to `fmsg-agents-visual-fidelity_2026-11-03.md`: the audit began right after `v0.7.1` shipped and found that the visual pass had produced a strong surface over a weak product layer.

**Status (2026-11-03):** Phase 0 complete, Phase 1A (`v0.7.2`) and Phase 1B (`v0.8.0`) and Phase 2 (`v0.9.0`) implemented and verified locally. Two items remain open and are recorded below: **Migration 039 has not been applied to Supabase**, and **no release has been uploaded** (distribution approval pending). Phase 3 is a design/legal/audit programme rather than a code slice and was only partially started (billing receipts/payment method and the Account security summary shipped early).

## Problem

The audit scored the product 5.0/10 with an 8/10 surface. Its five deal-breakers were real and reproducible:

1. `Approve & Open ↗` called `openExternalUrl` and recorded nothing (`App.tsx:2317`), so the review queue could never be cleared by its primary action.
2. Remove / Skip / Forget deleted immediately with a toast afterwards.
3. Every control's focus ring was the Chromium default `1px rgb(16,16,16)` on a near-black canvas, and `--text-muted #64748b` measured 3.96:1.
4. Run Setup was 810px tall inside a 604px content area at 960×640, top-aligned above `y = 0`, so its close control was unreachable.
5. Internal identifiers (`LINKEDIN_PASSWORD`, `fill_secret(name)`, `dev_fd813...`, “Windows Credential Manager”, “Fallback PAYG rate”, “Grace protection”) were customer-facing copy.

## What the plan got wrong (and what was done instead)

| Plan claim | Repository evidence | Resolution |
|---|---|---|
| §2.1 “add `download_url` to `SignedFileEntry`” | `download_url` already existed and was already covered by `canonicalizeManifestForSigning` | Fixed the two real defects instead: external URLs must not receive `apikey`/`Authorization` (presigned hosts reject it), and the download timeout was hardcoded to 30s. Added `--installer-url`/`--dry-run` to the uploader. |
| §4.1 `App.tsx` is 2,898 lines | It was 3,040 lines and held six inline views plus three modals | Extracted `HomeView`, `ApplicationsView`, `ReviewView` and shared primitives; the remaining views are a mechanical follow-up. |
| §2.2 “migration 039 adds a check + policy” | Migration 005 created SELECT/INSERT/DELETE policies but **no UPDATE policy**, so an RLS status write fails even with the column present | 039 adds `FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (...)` plus `GRANT ALL` (Supabase no longer auto-grants new tables). |
| “Approve sets status in the renderer” | The renderer cannot write under RLS without IPC, and the column did not exist yet | Shipped a local override cache (`fmsg_agents_job_overrides_v1`) so the UI is correct immediately, with the IPC path wired to take over once 039 is applied. |

## Fix

### Phase 0 — verification foundation (before any UI change)
- `tests/ui/shots.cjs` (`npm run ui:shots`): 13 screens × `960/1280/1360/1920`, deterministic state, real legal documents, and a `metrics.json` with layout, clipping, tiny-text, radius and height measurements.
- **Stale-bundle guard:** `index.tsx` injects the CSS from the bundle after the `<link>`, so a stale `bundle.js` silently overrides the on-disk CSS and produced false measurements (a 28px card padding that existed nowhere in the file). The harness now exits if any renderer/legal source is newer than the bundle.
- `tests/ui/a11y.cjs`: `axe-core` across 10 screens plus an explicit keyboard `:focus-visible` walk.
- `tests/ui/flows.cjs`: 29 behavioural checks (approve/skip/undo/archive/sort/search/legal/notifications/pagination/CSV/100-row/no-overflow).
- `scripts/lint-content.cjs` and `scripts/lint-tokens.cjs` (with `--strict-phase2`).
- Baseline reproduced the audit exactly: Run Setup `top -67, height 810, closeButtonReachable false`; sign-up card `top 52 → bottom 696` at 960×640.

### Phase 1A — `v0.7.2` (renderer-only trust release)
Honest status model, 10-second Undo, global focus ring, `#94a3b8` muted text (7.35:1), 12px minimum type, shared modal shell with `max-height: calc(100vh - 72px)` and content-area centring, internal-identifier purge, bundled legal documents rendered with headings at the running version, billing clarity with one recommended CTA, unified `en-ZA` date/currency/location formatting, stable page titles, Account in the sidebar, version-aware notifications, spinners and skeletons.

### Phase 1B — `v0.8.0` (installer)
Migration 039 (`review_status`, `archived_at`, partial index, UPDATE policy, grants, safe backfill), `saved-jobs-update-status` / `saved-jobs-archive` IPC, explicit agent insert status, approval audit note appended to `match_summary`, the deferred `verifyStartupSlotHealth` fix with `tests/main/startup-slot-health.cjs`, the external-download header/timeout fix, and a backed-up `search_profiles` cleanup (12 rows, rollback snapshot retained).

### Phase 2 — `v0.9.0` (renderer)
Type scale collapsed to 7 sizes, radii to 4 families, **0 layout `!important`** (the dark browser chrome is now the implementation, not an override), one 1200px content width, 64px icon rail below 1100px, sortable/paginated Applications with CSV export, and view extraction with `components/ui/primitives.tsx`.

## Traps this work created (read before touching these files)

- **`renderer/bundle.js` is gitignored but load-bearing.** Any measurement or screenshot must run after `npm run build:renderer`; the guard exists because this cost real debugging time.
- **PowerShell `Set-Content -Encoding UTF8` writes a BOM.** `@electron/rebuild` fails on a BOM in `package.json` (`Unexpected token '﻿'`), and `Set-Content -Raw` round-trips mangled em dashes in `design-system.css` (`â€”`). Use `[System.IO.File]::WriteAllText(path, text, New-Object System.Text.UTF8Encoding($false))`.
- **Migration 039 is not applied.** `GET /rest/v1/saved_jobs?select=review_status` returns `42703`. `saved-jobs-list` detects this and falls back to the legacy column set (`schema: 'legacy'`); status/archive IPC calls fail softly and the local override keeps the UI correct. Do not remove the fallback until every environment has 039.
- **Renderer-only vs installer:** `v0.7.2` and `v0.9.0` are OTA-eligible; `v0.8.0` changes main/preload/schema and must be installed. `agent-updates` still rejects ~92 MB files (`413 EntityTooLarge`), so installer handoff needs either a raised limit or `--installer-url` (now supported).
- **The flows harness reads `APP_VERSION` from `config.ts`**, so it must be rebuilt/rerun after every version bump; the legal-document version is synced at runtime via `setActiveAppVersion`.

## Verification performed

- `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p tsconfig.main.json --noEmit`: clean at every release.
- `npm run test:main`: 3/3 (chip sync without a slot, stale slot cleared, healthy slot preserved).
- `npm run ui:flows`: 29/29.
- `npm run ui:a11y`: 0 violations, all impacts, 10 screens; 10/10 visible focus rings.
- `npm run lint:content`: 0. `npm run lint:tokens -- --strict-phase2`: 7 sizes, 4 radii, 0 `!important`.
- `npm run ui:shots` at four sizes: 0 tiny text, 0 clipped nodes, 0 horizontal overflow; sign-up fits; Run Setup `top 54 → bottom 622`, close reachable.
- Production backups before writes: `recycle_bin/backup_saved_jobs_2026-11-03.json` (0 rows), `recycle_bin/backup_search_profiles_2026-11-03.json` (30 rows), rollback `recycle_bin/rollback_search_profiles_2026-11-03.json`.

## Still open

- **Apply Migration 039** in the Supabase SQL editor, statement by statement, then run its verification queries and `select pg_notification_queue_usage();`. Until then approvals are local-only even though the UI is correct.
- **Main-process alignment.** The `0.9.0` renderer was published to both channels and applied over the installed `0.7.1` main process. Review-status IPC needs `0.8.0+`, so run `dist/electron/FMSG Agents Setup 0.9.0.exe` once; the installer clears the OTA slot and the next update check re-applies `0.9.0`.
- **Clean-VM installer test** for `0.9.0` and the `0.7.x → 0.9.0` upgrade path.
- **Phase 3 residuals:** invoices/cancellation wiring against Paystack (UI is present), device/session management with real data, motion/density tokens, and an external WCAG 2.2 AA audit (never claim certification before it).
- **`App.tsx` still contains** `ProfilesAndRulesView`, `OnboardingWizardModal`, `AccountView` and the three modals.

## Relevant files

- `docs/audits/2026-11-03_fmsg-agents-ui-ux-audit_v0.7.1.md`, `docs/audits/2026-11-03_fmsg-agents-ui-ux-remediation-plan_v0.7.1.md`, `docs/audits/2026-11-03_fmsg-agents-remediation-tracker.md`
- `src/apps/fmsg-agents/docs/changelog/2026-11-03_v0.7.2_trust-accessibility-and-modal-shell.md`
- `src/apps/fmsg-agents/docs/changelog/2026-11-03_v0.8.0_stateful-safety-and-review-status.md`
- `src/apps/fmsg-agents/docs/changelog/2026-11-03_v0.9.0_design-system-and-responsive.md`
- `supabase/migrations/039_saved_jobs_review_status.sql`
- `src/apps/fmsg-agents/renderer/lib/{format,status,legal}.tsx`, `renderer/views/*`, `renderer/components/ui/primitives.tsx`
- `src/apps/fmsg-agents/tests/{ui,main}/*`, `src/apps/fmsg-agents/scripts/{lint-content,lint-tokens}.cjs`
