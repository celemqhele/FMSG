# Unreleased Changes (`UNRELEASED.md`)

> **Rule:** Every change to FMSG Agents, however small, must be logged in this file in the **same commit** as the change. At release time, move these entries into a new `YYYY-MM-DD_vX.Y.Z_short-title.md` file, update `INDEX.md`, and tag the release commit.

---

## Status

Phase 0–2 of the independent UI/UX audit remediation is implemented and verified locally:

- **`v0.7.2`** (renderer) — trust, accessibility, modal shell. Superseded before publication. Log: [`2026-11-03_v0.7.2_trust-accessibility-and-modal-shell.md`](./2026-11-03_v0.7.2_trust-accessibility-and-modal-shell.md)
- **`v0.8.0`** (installer) — review status, IPC, migration 039, main-process fixes. Log: [`2026-11-03_v0.8.0_stateful-safety-and-review-status.md`](./2026-11-03_v0.8.0_stateful-safety-and-review-status.md)
- **`v0.9.0`** (renderer) — design system, view extraction, tables, responsive. **Published to `stable` and `beta`** (`requires_installer: false`, `min_supported_version 0.7.0`); `Setup 0.9.0.exe` built for the main-process alignment. Log: [`2026-11-03_v0.9.0_design-system-and-responsive.md`](./2026-11-03_v0.9.0_design-system-and-responsive.md)

**Still required:** Migration 039 has not been applied to Supabase, so review-status writes stay local until it is.

Active work: **Phase 3 (`v1.0.0`)** — invoices/cancellation wiring, device/session management, motion & density, external accessibility audit.

---

## Next change

### Added
- *(none yet)*

### Changed
- *(none yet)*

### Removed
- *(none yet)*

### Fixed
- *(none yet)*

### Relevant Files
- *(none yet)*

### Infrastructure Changes
- *(none yet)*
