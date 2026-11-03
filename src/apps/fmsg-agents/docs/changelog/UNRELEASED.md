# Unreleased Changes (`UNRELEASED.md`)

> **Rule:** Every change to FMSG Agents, however small, must be logged in this file in the **same commit** as the change. At release time, move these entries into a new `YYYY-MM-DD_vX.Y.Z_short-title.md` file, update `INDEX.md`, and tag the release commit.

---

## Status

- **`v0.10.0`** (installer-handoff) — released 2026-11-03: live browser view, identity-led profile cards, full-width update screen. Log: [`2026-11-03_v0.10.0_embedded-browser-profile-cards-full-width-update.md`](./2026-11-03_v0.10.0_embedded-browser-profile-cards-full-width-update.md)
- **`v0.9.0`** (renderer) — published to `stable` and `beta` (`requires_installer: false`). Log: [`2026-11-03_v0.9.0_design-system-and-responsive.md`](./2026-11-03_v0.9.0_design-system-and-responsive.md)

**Still required:** Migration 039 has not been applied to Supabase, so review-status writes stay local until it is.

Active work: **Founder observability/runtime initiative (2026-11-03)** — five blueprints + five Pro assignments created and queued: Run Setup modal redesign (`TASK-20261103-005`), Run workspace preview-dominant layout (`TASK-20261103-006`), live-preview active-page tracking (`TASK-20261103-007`), independent agent profiles + CV (`TASK-20261103-008`), Ubuntu runtime feasibility (`TASK-20261103-009`). No release, version bump or installer rebuild authorised for any of them. See `docs/blueprints/BLUEPRINT-20261103-004..008` and `docs/context/fmsg-agents-observability-profiles-runtime_2026-11-03.md`. **Status:** `TASK-20261103-006` is `APPROVED` (Argon review 2026-11-03T21:05+02:00) and archived; the other four remain `PENDING`.

**Priority change (2026-11-03):** the `search_profiles.cv_file_path` defect prevents every run on released v0.10.0 and is now the top functional priority. Hotfix blueprint `BLUEPRINT-20261103-009` + assignment `TASK-20261103-010` — founder-authorised 2026-11-03 and implemented (see Fixed). Revised sequence: 010 → 008 → 007 → 005/006 → 009. Founder-facing migration guide prepared: `docs/SUPABASE_MIGRATION_040_APPLICATION_GUIDE.md`.

---

## Next change

### Added
- **Hotfix blueprint + migration guide (priority change, 2026-11-03):** `BLUEPRINT-20261103-009_hotfix-run-start-cv-path.md` (smallest safe correction for the run-start failure: derive CV path from `cv_variations` instead of the dropped `search_profiles.cv_file_path`; interim, replaced by TASK-20261103-008) and `docs/SUPABASE_MIGRATION_040_APPLICATION_GUIDE.md` (founder-facing statement-by-statement dashboard procedure for migration 040 + `agent-cvs` bucket + storage policies + grants + schema-cache refresh). Corresponding Pro assignment `TASK-20261103-010` created `PENDING`, awaiting founder authorisation. Revised execution sequence recorded in the context file.
- **Governance/documentation (no app-code change):** five implementation blueprints for the founder's 2026-11-03 requests — `BLUEPRINT-20261103-004` (Run Setup modal, content-first two-column redesign; root cause: 740px three-column container-first sizing + nested 220px profile scrollbox), `BLUEPRINT-20261103-005` (Run workspace, tabbed preview-dominant layout; root cause: `.run-page-shell` never fills `.workspace-main` + 40%-fixed log column + top-anchored letterboxed image), `BLUEPRINT-20261103-006` (independent `agent_profiles` table + private `agent-cvs` bucket; root cause of the `cv_file_path` error: migration 009 dropped the column while `agent-controller.ts` still selects it), `BLUEPRINT-20261103-007` (live-preview active-page tracking; root cause: screencast CDP session attached once to the launch page, no `context.on('page')`), `BLUEPRINT-20261103-008` (Ubuntu runtime feasibility, staged with founder gates). Corresponding Pro assignments `TASK-20261103-005..009` are `PENDING` in `logs/EOT/deepseekprodelegation/` (local-only working state).
- **Delegation governance revision (founder corrective directive, 2026-11-03):** blanket `IMPLEMENT ENTIRELY YOURSELF` reconsidered per task. 007 retained Pro-only (CDP/browser lifecycle — senior boundary). 005/006/008/009 changed to `MAY DELEGATE TO FLASH` for named isolated sub-tasks only (modal CSS phase; workspace CSS phase; `tests/ui` harness updates + DDL procedure doc; benchmark execution + measurement table). Flash assignments are created by Pro only after the upstream Pro phase lands; delegation is optional; Pro reviews all Flash output. Blueprints 004/005/006/008 §17 updated to match.

### Changed
- **Run workspace is now a tabbed, preview-dominant interface** (`TASK-20261103-006`, blueprint `BLUEPRINT-20261103-005`): `LiveLog.tsx` renders a compact workspace header (status chip, applied/skipped counters, batch chip, profile picker, run controls), a 34px tab strip (**Live Browser Preview | Execution Pipeline | History & Logs**) and exactly one full-canvas tab panel at a time. The preview monitor now fills the whole main area: the broken height chain is fixed (`.run-page-shell` gets `flex: 1`/`min-height: 0`, and `.workspace-main`'s padding/overflow are tightened **for the Run view only** via `:has(> .run-page-shell)`), the permanently 40%-wide log column is gone, and the streamed frame is `object-fit: contain` **centred** (`object-position: center`) so it scales to the largest practical area with centred letterboxing. Pause feed / Open in Chrome / Clear preview moved from a footer line into the browser toolbar (one compact row with traffic dots, URL pill and the LIVE/standby/paused badge). A `Needs You` prompt force-switches to the preview tab so a blocking prompt can never be hidden behind another tab. Idle state keeps the full canvas dimensions with a centred empty state; the Execution Pipeline tab keeps the 6-step stepper, current-job spotlight and activity log, and History & Logs adds a four-stat run summary above its own single scroll region. Component state (`entries`, frame, feed pause, attention) stays in `LiveLog`, so tab switches never clear the feed or the log. No new IPC, props, dependencies or streaming changes; renderer-only.

### Removed
- **Dead side-by-side run-workspace CSS** (`TASK-20261103-006`): `.live-feed-root`, `.matrix-log-column`, `.matrix-log-header`, `.matrix-log-heading`, `.matrix-log-title`, `.matrix-log-meta`, `.matrix-counter`, `.matrix-live-dot` (+ `.running`/`.idle`), `.agent-action-row`, `.agent-primary-action`, `.agent-action-hint`, `.live-viewport-column`, `.viewport-footer`, `.viewport-footer span`, `.viewport-footer-actions` and `.viewport-window-icon`. Superseded by the `.run-tab*`, `.run-panel*`, `.run-workspace-*`, `.run-status-*`, `.run-history-*` and `.viewport-toolbar-*` rules; no other screen referenced them (grep-verified before deletion).

### Fixed
- **Run workspace wasted-space defect** (`TASK-20261103-006`, approved): the page shell now fills the workspace, the live preview is the dominant full-canvas tab, and the streamed frame is centred — all three root causes diagnosed in `BLUEPRINT-20261103-005` are fixed. *(Remaining diagnosed root causes — Run Setup modal cramping, `cv_file_path` run-start failure, active-page tracking — are still open under their own tasks.)*
- **Run-start failure on released v0.10.0** (hotfix `TASK-20261103-010`, blueprint `BLUEPRINT-20261103-009`): `loadProfile` no longer selects the dropped `search_profiles.cv_file_path` column; the CV path for form attachments now derives from `cv_variations` (the migration-009 replacement) with the account-profile fallback; the Profiles-screen CV badge reads `cv_variations` presence instead of the dead column. Both sites carry "replaced by TASK-20261103-008" markers — interim correction, superseded by the independent `agent_profiles` architecture. No website schema, website code, IPC surface or dependency changed.

### Relevant Files
- `docs/blueprints/BLUEPRINT-20261103-004..008`
- `docs/context/fmsg-agents-observability-profiles-runtime_2026-11-03.md`
- `renderer/components/LiveLog.tsx`, `renderer/design-system.css` (tabbed preview-dominant run workspace, `TASK-20261103-006`)

### Infrastructure Changes
- *(none yet — migration 040 (`agent_profiles`) is designed but not applied; application is a founder-gated step)*
