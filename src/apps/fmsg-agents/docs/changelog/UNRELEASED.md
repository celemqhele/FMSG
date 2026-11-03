# Unreleased Changes (`UNRELEASED.md`)

> **Rule:** Every change to FMSG Agents, however small, must be logged in this file in the **same commit** as the change. At release time, move these entries into a new `YYYY-MM-DD_vX.Y.Z_short-title.md` file, update `INDEX.md`, and tag the release commit.

---

## Status

- **`v0.10.0`** (installer-handoff) — released 2026-11-03: live browser view, identity-led profile cards, full-width update screen. Log: [`2026-11-03_v0.10.0_embedded-browser-profile-cards-full-width-update.md`](./2026-11-03_v0.10.0_embedded-browser-profile-cards-full-width-update.md)
- **`v0.9.0`** (renderer) — published to `stable` and `beta` (`requires_installer: false`). Log: [`2026-11-03_v0.9.0_design-system-and-responsive.md`](./2026-11-03_v0.9.0_design-system-and-responsive.md)

**Still required:** Migration 039 has not been applied to Supabase, so review-status writes stay local until it is.

Active work: **Founder observability/runtime initiative (2026-11-03)** — five blueprints + five Pro assignments created and queued (`PENDING`): Run Setup modal redesign (`TASK-20261103-005`), Run workspace preview-dominant layout (`TASK-20261103-006`), live-preview active-page tracking (`TASK-20261103-007`), independent agent profiles + CV (`TASK-20261103-008`), Ubuntu runtime feasibility (`TASK-20261103-009`). No release, version bump or installer rebuild authorised for any of them. See `docs/blueprints/BLUEPRINT-20261103-004..008` and `docs/context/fmsg-agents-observability-profiles-runtime_2026-11-03.md`.

---

## Next change

### Added
- **Governance/documentation (no app-code change):** five implementation blueprints for the founder's 2026-11-03 requests — `BLUEPRINT-20261103-004` (Run Setup modal, content-first two-column redesign; root cause: 740px three-column container-first sizing + nested 220px profile scrollbox), `BLUEPRINT-20261103-005` (Run workspace, tabbed preview-dominant layout; root cause: `.run-page-shell` never fills `.workspace-main` + 40%-fixed log column + top-anchored letterboxed image), `BLUEPRINT-20261103-006` (independent `agent_profiles` table + private `agent-cvs` bucket; root cause of the `cv_file_path` error: migration 009 dropped the column while `agent-controller.ts` still selects it), `BLUEPRINT-20261103-007` (live-preview active-page tracking; root cause: screencast CDP session attached once to the launch page, no `context.on('page')`), `BLUEPRINT-20261103-008` (Ubuntu runtime feasibility, staged with founder gates). Corresponding Pro assignments `TASK-20261103-005..009` are `PENDING` in `logs/EOT/deepseekprodelegation/` (local-only working state).

### Changed
- *(none yet)*

### Removed
- *(none yet)*

### Fixed
- *(none yet — root causes diagnosed, fixes not yet implemented)*

### Relevant Files
- `docs/blueprints/BLUEPRINT-20261103-004..008`
- `docs/context/fmsg-agents-observability-profiles-runtime_2026-11-03.md`

### Infrastructure Changes
- *(none yet — migration 040 (`agent_profiles`) is designed but not applied; application is a founder-gated step)*
