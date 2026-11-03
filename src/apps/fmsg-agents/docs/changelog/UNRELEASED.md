# Unreleased Changes (`UNRELEASED.md`)

> **Rule:** Every change to FMSG Agents, however small, must be logged in this file in the **same commit** as the change. At release time, move these entries into a new `YYYY-MM-DD_vX.Y.Z_short-title.md` file, update `INDEX.md`, and tag the release commit.

---

## Status

No unreleased changes - all changes up to and including **`v0.7.0`** have been promoted to [`2026-11-03_v0.7.0_mockup-redesign-secret-vault-and-bundles.md`](./2026-11-03_v0.7.0_mockup-redesign-secret-vault-and-bundles.md).

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

---

## 2026-11-03 (after `v0.7.0`)

### Added
- `scripts/upload-update.js` gained `--requires-installer` (plus optional
  `--installer <path>`) and `--changelog-file <path>`. Before this, the uploader
  always emitted a renderer-only manifest and a hardcoded `v0.6.0` changelog, so a
  release that changed the main process or the preload IPC contract could be
  published in a form that leaves the installed app running its old main process
  against the new renderer.

### Infrastructure Changes
- `v0.7.0` is **installer-only**: `manifest.stable.sig.json` and
  `manifest.beta.sig.json` were rewritten back to the real `v0.6.0` artifacts after
  the `v0.7.0` upload. Uploading the installer is blocked by the project's storage
  file size limit (`HTTP 413 EntityTooLarge` on the 92 MB
  `FMSG Agents Setup 0.7.0.exe`). Raising that limit in Supabase is a prerequisite
  for installer-handoff OTA.

