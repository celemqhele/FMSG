# Unreleased Changes (`UNRELEASED.md`)

> **Rule:** Every change to FMSG Agents, however small, must be logged in this file in the **same commit** as the change. At release time, move these entries into a new `YYYY-MM-DD_vX.Y.Z_short-title.md` file, update `INDEX.md`, and tag the release commit.

---

## Status

No unreleased changes - all changes up to and including **`v0.7.1`** have been promoted to [`2026-11-03_v0.7.1_visual-fidelity-pass.md`](./2026-11-03_v0.7.1_visual-fidelity-pass.md).

---

## Open Bug Carried Into `v0.7.2` — Version chip lags one release after an installer upgrade

**Observed:** 2026-11-03, `v0.7.0` → `v0.7.1`. After running `FMSG Agents Setup 0.7.1.exe /S /UPDATE`, `install-state.json` read `installed_version 0.7.1` but `active_slot_version 0.7.0`, so the titlebar/Settings chip (`get-startup-status` → `appVersion`) still displayed `v0.7.0` until an OTA landed and advanced the slot to `0.7.1`.

**Cause:** `verifyStartupSlotHealth` in `update-manager.ts` (~lines 736–780) re-syncs `active_slot_version` after a binary upgrade only inside `if (fs.existsSync(activeDir))`. When the previous release's renderer slot had already been consumed/cleared, `Slot-Active` does not exist, the whole branch is skipped, and the stale value survives.

**Why it was not fixed in `v0.7.1`:** the fix is in the Electron main process, which would make that release installer-only — and installer-handoff OTA is still blocked by the Supabase storage size limit (`HTTP 413 EntityTooLarge` on the 92 MB exe). A renderer patch had to stay renderer-only to be deliverable.

**Fix direction for `v0.7.2`:** in the `state.installed_version !== APP_VERSION` branch, set `state.active_slot_version = APP_VERSION` unconditionally (and clear `activeDir` only when it exists), then persist. Verify by installing a build over a slot-less state and checking the chip without any OTA.

**Detail:** `src/apps/fmsg-agents/docs/context/fmsg-agents-visual-fidelity_2026-11-03.md` (section "Deferred to `0.7.2`").

---

## Template for Next Change

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
