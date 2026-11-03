# FMSG Agents UI/UX Redesign — v0.7.0 Shipped (mockup shell, secret vault, bundles)

This file records the redesign of FMSG Agents from the v0.6.0 UI to the mockup sheet: what was decided, what was built, and what was shipped. The full spec is in [`docs/design/DESIGN_SYSTEM.md`](../../../docs/design/DESIGN_SYSTEM.md) (sections 0–9, including the coverage matrix in §8b and decisions in §8c), and the mockup copy is in [`docs/design/reference/screens-sheet.jpg`](../../../docs/design/reference/screens-sheet.jpg).

**Status:** built, versioned as `0.7.0`, installer built and tagged, but **delivered by installer, not OTA** — the 92 MB `FMSG Agents Setup 0.7.0.exe` is rejected by the Supabase storage file size limit, and a renderer-only OTA is not valid for a release that changes the main process. The published manifests were left on `0.6.0`. The user still has to do the visual pass in the installed app ("I want to see the full update") before agentic-search testing starts.

## Problem

The v0.6.0 desktop UI was built from a rough idea and reads as unpolished to the product owner. A mockup sheet (about 19 screens) was chosen as the redesign target. Several things the mockup shows did not exist in the code, and the mockup included two items that conflict with the product's own rules. Those were found by searching the code, not assumed. The coverage matrix in spec §8b is the record of that gap analysis.

## Decisions (agreed with the product owner)

- **Target version:** `0.7.0` (minor). One release, not phased.
- **Stack:** keep Electron 34 + React 19 + TypeScript + esbuild + one CSS stylesheet. No framework migration. Charts are hand-drawn SVG, no chart library.
- **Navigation:** the bottom dock is gone; a left sidebar (184px expanded / 56px collapsed) replaces it.
- **Window:** `frame: false` plus a 36px custom draggable title bar on every screen.
- **Sizing:** compact px-only scale — hero 24, screen title 18, card title 14, body 13, secondary 12, labels 11.5, caption 11. Hard minimum 11px. Must never read as Windows large-text mode.
- **Palette:** sampled from the mockup — primary `#203EEA` / `#283DEE`, bg `#040613` / `#0B0E1F` / `#0E111A`, glow `#5028BF`.
- **Needs-you countdown:** kept, matching the sheet. Expiry is `skip`, never a submit.
- **Notifications:** kept and restyled although it is not on the sheet.
- **Onboarding step 2:** an explainer, not six site-connect cards.
- **Secrets:** one tool, `fill_secret(name)`. Values live in Windows Credential Manager only, names like `LINKEDIN_PASSWORD` (`_2` for extra accounts), each name locked to one approved domain, masked in screenshots, never logged, optional Windows Hello.
- **Billing:** FMSG Agents only — website pricing and search untouched. PAYG R40/application; Starter 10×R349, Lite 25×R749, Standard 60×R1,499, Power 150×R3,299, searches included. One active bundle per account, monthly, renewals stack, unused applications carry over indefinitely. Upgrade charges full price now and stacks; downgrade charges now or at next renewal (user chooses); cancel keeps balance. Grace = 10% of bundle applications (rounded down), spent only after a card decline **and** balance 0. Cost cap starts at R0 and raising it requires explicit consent. Charge thresholds R40 → R100 (after 1 payment) → R250 (after 3) → R500 (after 6); a failed payment steps back one stage and pauses runs; email on every charge. Welcome bonus 5 applications, verified email, one per account/device, never expires. No refunds.
- **Website:** out of scope. The website searches, the agent applies.

## What shipped in `v0.7.0`

Full detail in [`src/apps/fmsg-agents/docs/changelog/2026-11-03_v0.7.0_mockup-redesign-secret-vault-and-bundles.md`](../../../src/apps/fmsg-agents/docs/changelog/2026-11-03_v0.7.0_mockup-redesign-secret-vault-and-bundles.md). The short version:

- **Shell:** frameless window, custom title bar, sidebar, all sheet screens (Home, Run setup, Live Run, Needs You, Applications, Detail & replay, Review queue, Profiles, Rules & Answer Bank, Billing, Settings, Account, onboarding, empty/error).
- **Secrets:** new `src/apps/fmsg-agents/secret-vault.ts` — keytar with an AES-256-GCM fallback, name normalisation, domain lock, `fillSecretOnVerifiedDomain` re-checks the live `page.url()` hostname and blurs password inputs before screenshots. Plus persistent screening rules and Answer Bank, and `agent-prefs` with `costCap` defaulting to 0.
- **Agent:** `pause()` / `resume()` / `waitIfPaused()`, vault-first sign-in walls carrying `secretKeyName` / `allowedDomain` / `countdownSeconds`, Answer Bank lookup in field mapping, PAYG R40 with the 40/100/250/500 thresholds, bundle rates R35/R30/R25/R22.
- **Billing routes:** `/api/agent/billing/{plans,checkout,verify}` serve and whitelist the four bundles with their own prices, so a desktop purchase cannot be charged website pricing.
- **Dashboard honesty:** the decorative sparkline polylines were replaced with real per-day counts derived from stored application records — no mock data in shipped code.

## Traps this release created (read before touching these files)

- **`frame: false` means the renderer owns window chrome.** If the title bar fails to render, the window cannot be dragged or closed. It is rendered on boot, login, blocked, config-invalid and modal states. Any new full-screen state must go through `.app-root-frame` so the 36px offset applies (`.app-root-frame > .auth-viewport`, `.app-root-frame .modal-backdrop` are pinned to `inset: 36px 0 0 0`).
- **`keytar` is a native module.** `loadKeytar()` tolerates a load failure and falls back to a local AES-256-GCM vault bound to `%LOCALAPPDATA%\fmsg-agents\security\vault-wrap.key`; the log records which storage was used. electron-builder rebuilds the native dep during `build:all`, so a plain `build:renderer` is not enough to produce a working installer.
- **Countdown expiry, Stop and Emergency Stop all resolve attention as `skip`.** None of the three can submit an application.
- **Version strings are no longer hardcoded in the renderer.** They come from `get-startup-status` / `get-update-settings`; a hardcoded fallback was reintroduced once during this work (in `SettingsPanel.tsx` and `UpdateProgress.tsx`) and removed again — do not add one back.

## Verification performed

- `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p tsconfig.main.json --noEmit`, repo-root `npx tsc --noEmit`: clean.
- `npx eslint` on the three agent billing routes: clean.
- esbuild renderer bundle: clean (temporary artifact moved to `recycle_bin/bundle-test-v070.js`).
- `npm run build:all`: installer `dist/electron/FMSG Agents Setup 0.7.0.exe` built, `keytar` native rebuild included.
- `scripts/upload-update.js --version 0.7.0 --min-supported 0.6.0 --type required` for `stable` and again with `--beta`: both manifests were signed and uploaded, then `manifest.stable.sig.json` was read back — but that manifest was a **renderer-only bundle swap**, which is wrong for this release (see below). Both channels were subsequently rewritten back to the real `v0.6.0` artifacts (hashes recomputed from the files still in `v0.6.0/renderer/`, re-signed, verified) and read back as `version 0.6.0`, `requires_installer: false`, `withdrawn: false`.

## Why `0.7.0` is installer-only

This release changes the Electron main process, the preload IPC contract and bundles a native module (`keytar`). A renderer-only bundle swap would leave the installed main process answering none of the new channels (`window-*`, `pause-agent`, `resume-agent`, `emergency-stop-agent`, `secrets-*`, `rules-*`, `agent-prefs-*`, `saved-jobs-*`), and the window would keep its OS frame while the renderer drew a title bar inside it.

The correct path — `requires_installer: true` plus an `installer/FMSG-Agents-Setup-<version>.exe` entry, which `installer/installer.nsh` runs as `/S /UPDATE` — is implemented in `update-manager.ts` and now supported by `scripts/upload-update.js --requires-installer`. It fails at upload time: the 92 MB exe is rejected with `HTTP 413 EntityTooLarge` ("The object exceeded the maximum allowed size") because of the project's Supabase storage file size limit. Nothing was ever published in a half-updated state: the installer upload aborted before the manifest was rewritten.

**Also found:** `%LOCALAPPDATA%\fmsg-agents\updates\install-state.json` on this machine reads `installed_version: 0.5.0`, `active_slot_version: 0.6.0`, `backup_slot_version: 0.5.1`, and `%LOCALAPPDATA%\Programs\FMSG Agents\resources\app.asar` dates from the `0.5.0` installer (2026-11-01). So every main-process change since `0.5.0` — the live agent engine, Paystack IPC, and the entire `0.7.0` main/IPC surface — has never actually run in the installed app; only the renderer has been updating. `active_slot_version` is a renderer version, not the version of the running main process.

Installing `dist/electron/FMSG Agents Setup 0.7.0.exe` once fixes the main process; after that, renderer-only releases can keep going out over OTA.

## Installed on 2026-11-03

`"FMSG Agents Setup 0.7.0.exe" /S /UPDATE` ran with exit code 0 and relaunched the app. Installed asar is the 0.7.0 build (27,363,990 bytes) and contains `secret-vault.js`, `0.7.0`, `window-minimize`, `pause-agent`. `install-state.json` now reads `installed_version 0.7.0`, `active_slot_version 0.7.0`, `pending_health_check false`, and `Slot-Active` was cleared automatically by `verifyStartupSlotHealth` because `installed_version !== APP_VERSION`, so the app boots the packaged 0.7.0 renderer instead of the stale 0.6.0 slot. `last_check_status` is "Up to date" against the restored `0.6.0` manifest.

Note: the unpacked `0.6.0` renderer still sits in `Slot-Backup` (`%LOCALAPPDATA%\fmsg-agents\updates\Slot-Backup`, with `backup_slot_version 0.5.1` in state). It is only reachable through `rollbackToLastKnownGood`, which needs a `pending_health_check` boot; it was left in place rather than deleted.

## Verification performed (continued)

- `npm run build:all` succeeded with `keytar` rebuilt for Electron 34 and produced `dist/electron/FMSG Agents Setup 0.7.0.exe` (92,404,819 bytes) plus its `.blockmap`.

## Still open

- **The `0.7.0` installer has been run once on this machine** (see above), so the app the user is looking at is genuinely 0.7.0. Any other machine still on a renderer-only slot needs the same one-time install.
- **Raising the Supabase storage file size limit** (Project Settings → Storage) is the prerequisite for installer-handoff OTA on every future release that touches the main process. Until then, keep publishing renderer-only manifests and expect to run an installer whenever `electron-main.ts`, `preload.ts`, `package.json` deps or a native module changes.
- **Visual pass by the user.** No app screenshots exist on this machine and the browser tool cannot drive Electron, so the redesign has not been eyeballed by anyone. This is the gate before agentic-search testing.
- **Vercel promotion.** A push to `production` lands as a **Preview**; the live domain keeps the previous build until that deployment is promoted in the Vercel dashboard. Check `https://api.github.com/repos/celemqhele/FMSG/deployments` (`environment` reads `Preview – fmsg` vs `Production – fmsg`). The repo is connected to two projects (`fmsg`, `fmsg-2`), each building every commit as a Preview.
- **Billing mechanics not implemented yet:** the automatic renewal method (Paystack recurring vs other), graceful-stop resume-after-payment wiring, and the carry-over/stacking accounting. The UI and the R0 cost cap exist; the ledger behind them does not.
- **No Supabase migration in this release.** `saved_jobs` is read through the authenticated anon client under existing RLS; the tracker/review-queue/answer-bank/artifact-bucket migrations are still planned only.

## Related

- [`docs/design/DESIGN_SYSTEM.md`](../../../docs/design/DESIGN_SYSTEM.md) — redesign spec, phases, coverage matrix
- [`src/apps/fmsg-agents/docs/changelog/2026-11-03_v0.7.0_mockup-redesign-secret-vault-and-bundles.md`](../../../src/apps/fmsg-agents/docs/changelog/2026-11-03_v0.7.0_mockup-redesign-secret-vault-and-bundles.md) — release log
- [`src/apps/fmsg-agents/docs/changelog/INDEX.md`](../../../src/apps/fmsg-agents/docs/changelog/INDEX.md) — version index and regression playbook
- [`docs/context/FMSG_AGENTS_SUBPROJECT.md`](../../../docs/context/FMSG_AGENTS_SUBPROJECT.md) — sub-project architecture
- [`.opencode/context/supabase-access/supabase-direct-access_2026-10-17.md`](../supabase-access/supabase-direct-access_2026-10-17.md) — the `curl.exe` workflow used to verify the uploaded OTA manifests
