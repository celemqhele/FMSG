# Unreleased Changes (`UNRELEASED.md`)

> **Rule:** Every change to FMSG Agents, however small, must be logged in this file in the **same commit** as the change. At release time, move these entries into a new `YYYY-MM-DD_vX.Y.Z_short-title.md` file, update `INDEX.md`, and tag the release commit.

---

## Status

`v0.7.2` (Phase 1A) is implemented, verified and logged in [`2026-11-03_v0.7.2_trust-accessibility-and-modal-shell.md`](./2026-11-03_v0.7.2_trust-accessibility-and-modal-shell.md). Its OTA upload is pending distribution approval.

Active work: **Phase 1B (`v0.8.0`)** — Migration 039 (`review_status`, `archived_at`, RLS `UPDATE`), IPC/preload contract, agent insert status, startup-slot version fix and the external `download_url` download fix.

---

## Phase 1B — Stateful Safety Release (`P1B.1`–`P1B.8`)

### Added
- *(in progress)*

### Changed
- *(in progress)*

### Relevant Files
- *(in progress)*

### Infrastructure Changes
- *(in progress)*

---

## Resolved in `v0.7.2` — Version chip lag after an installer upgrade

Fixed for `v0.8.0` instead of `v0.7.2`, because the fix lives in the Electron main process (`update-manager.ts`) and `v0.7.2` had to remain renderer-only to stay OTA-deliverable. See `P1B.7` in [`docs/audits/2026-11-03_fmsg-agents-remediation-tracker.md`](../../../../../docs/audits/2026-11-03_fmsg-agents-remediation-tracker.md).
