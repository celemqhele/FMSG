# Unreleased Changes (`UNRELEASED.md`)

> **Rule:** Every change to FMSG Agents, however small, must be logged in this file in the **same commit** as the change. At release time, move these entries into a new `YYYY-MM-DD_vX.Y.Z_short-title.md` file, update `INDEX.md`, and tag the release commit.

---

## Status

Active development on `audit/phase-0` toward **`v0.7.2`** (Phase 1A renderer-only trust release) and **`v0.8.0`** (Phase 1B stateful safety release).

---

## Phase 0 — UI/UX Audit Verification Harness, Linters & Release-Channel Spike (`P0.1`–`P0.6`)

### Added
- **`tests/ui/shots.cjs` (`npm run ui:shots`)**: Reproducible Playwright UI screenshot and layout metrics harness capturing 13 screens/modals across `960x640`, `1280x720`, `1360x860`, and `1920x1080` viewports with deterministic state and real legal documents.
- **`tests/ui/a11y.cjs` (`npm run ui:a11y`)**: Automated `axe-core` WCAG 2.1 A/AA and keyboard `:focus-visible` tab-walk verification harness across all workspace and authentication screens.
- **`scripts/lint-content.cjs` (`npm run lint:content`)**: Static content and terminology linter detecting user-facing internal identifiers (`_PASSWORD`, `fill_secret`, `Windows Credential Manager`), pricing-memo jargon, stale version strings, and bare `.toLocaleString()` calls.
- **`scripts/lint-tokens.cjs` (`npm run lint:tokens`)**: CSS design-token consistency and WCAG AA contrast auditor checking `--text-muted` contrast, sub-12px font declarations, distinct font-size/border-radius counts, and layout `!important` overrides.
- **`docs/audits/2026-11-03_fmsg-agents-remediation-tracker.md`**: Complete 43-work-item and 161-finding implementation tracker and technical validation report.

### Changed
- **`scripts/upload-update.js`**: Added `--installer-url <https://...>` and `--dry-run` flags so signed installer-handoff manifests can reference external HTTPS release assets (e.g. GitHub Releases) without hitting Supabase Storage's 50 MB upload limit.
- **`package.json` & `renderer/css.d.ts`**: Added `ui:shots`, `ui:a11y`, `lint:content`, and `lint:tokens` scripts, enabled `--loader:.md=text` in `build:renderer`, declared `*.md` module types, and excluded `tests/**` from packaged installer builds.

### Relevant Files
- `src/apps/fmsg-agents/package.json`
- `src/apps/fmsg-agents/renderer/css.d.ts`
- `src/apps/fmsg-agents/scripts/upload-update.js`
- `src/apps/fmsg-agents/scripts/lint-content.cjs`
- `src/apps/fmsg-agents/scripts/lint-tokens.cjs`
- `src/apps/fmsg-agents/tests/ui/shots.cjs`
- `src/apps/fmsg-agents/tests/ui/a11y.cjs`
- `docs/audits/2026-11-03_fmsg-agents-remediation-tracker.md`

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
