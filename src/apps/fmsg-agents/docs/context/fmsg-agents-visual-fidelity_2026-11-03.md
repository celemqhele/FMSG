# FMSG Agents — v0.7.1 Visual-Fidelity Pass (display type hierarchy, hero composition, real empty states)

Shipped `v0.7.1` as a renderer-only patch that closes the visual-fidelity gap between the installed app and the 18 individual mockups: the display type scale was restored (it had been flattened to roughly half the mockup size), the Home hero was rebuilt as a two-column banner, every zero-data screen got a real empty state, and the duplicate primary CTA was removed. It is the direct follow-up to `v0.7.0`: after installing that build the user compared each screen against the mockups and reported that the layout was right but everything "reads flat" — titles too small, hero composition wrong, empty widgets looking like loading skeletons — which is what this patch fixes.

**Status:** shipped. `0.7.1` published to the `agent-updates` bucket on the `stable` channel (`min_supported_version 0.7.0`, `type recommended`, `requires_installer false`), applied in-app through "Update Now", and confirmed on disk in `install-state.json` (`installed_version 0.7.1`, `active_slot_version 0.7.1`, `backup_slot_version 0.7.0`).

## Problem

`v0.7.0` derived the mockups' design *language* correctly (palette, sidebar, card/pill/ring vocabulary) but not their *proportions*. Rendering each of the 18 mockups individually and re-capturing the live app at the same viewport (1360×860 CSS, Windows 125% scaling) produced these measured gaps:

| Element | Mockup | `v0.7.0` | Effect |
|---|---|---|---|
| Hero headline | ≈36px | 18px | Flat; no focal point |
| Screen title | ≈28–30px | 17px | Every page read like a sub-section |
| Card head | ≈15–16px | 13.5px | Heading barely above body |
| Body text | 13px | 13px | Already correct |

So body size was right and display size was half — the hierarchy inverted relative to the mockups. Three composites also diverged: the hero was a centred text block with a dead right half (the mockup has copy left, feature rows right); the "Last 7 days" widget rendered seven empty bar tracks with a 2px blue baseline at zero data, which reads as a loading skeleton; and both the hero and the sidebar footer carried a `Start Applying` button, so the page had two primary CTAs.

Two new regressions came from the fix itself and had to be resolved before shipping: the enlarged hero plus stacked empty states pushed the dashboard past the fold (bottom card clipped, no scroll affordance), and the sidebar plan line `PAYG · Cap R160` wrapped onto two lines beside the collapse button.

## Fix

All renderer-side; no main-process, preload or dependency change.

- **Type hierarchy restored, body scale untouched.** Hero 18→26px, `.billing-title` (shared screen title) 17→22px with `line-height: 1.15` and `-0.025em` tracking, `.bento-card-head h3` 13.5→14.5px, `.billing-section-title` 12.5→13.5px, `.onboarding-title` 18→22px. Body/secondary/label/caption stayed at 13/12/11.5/11px, so the compact scale and the 11px minimum still hold.
- **Home hero is now two columns** (`.dashboard-hero-card` is `display: grid; grid-template-columns: minmax(0,1fr) 322px`, stacking to one column below 1100px): copy, active-profile line and CTA left; three feature rows (Find relevant roles / Tailor with AI / Apply and track) with 30px indigo icon tiles right.
- **One shared `EmptyState` component** with three shapes — default (icon + headline + body + primary action), `compact`, and `inline` — used by Applications ("No applications yet" → *Go to Run*), Review Queue ("Review queue is all clear" → *Go to Run*), the filtered-to-zero tracker ("No matching applications", no action) and the two Home widgets (`inline`, deliberately **no** action so the hero keeps the single primary CTA).
- **Quick-action tiles are horizontal** (icon left, title over subtitle, 2-column grid). Saves ~90px of height and matches the mockup tile shape — this plus the inline empty states is what brought the dashboard back inside 1360×860 with no scroll.
- **Sidebar footer CTA gated** behind `isRunning` (label `Run Controls`); the hero owns the idle-state CTA. Plan line is now `PAYG · R160 cap` with `white-space: nowrap` + ellipsis.
- **Review Queue title** reads "Review Queue" when the queue is empty instead of "0 applications need your review".

## Distribution notes (read before publishing the next patch)

- `0.7.1` is **renderer-only**, so it is legitimately OTA-eligible and was uploaded without `--requires-installer` (unlike `0.7.0`, whose main/preload/native changes made OTA invalid — see `src/apps/fmsg-agents/docs/context/fmsg-agents-ui-redesign_2026-11-03.md`).
- **The OTA changelog must be a plain-text bullet file** (`.ota.txt`), not the markdown release log. `scripts/upload-update.js` copies every non-empty line of `--changelog-file` verbatim into `manifest.changelog`, so the first upload rendered `# v0.7.1 — …` and `## Added` headers inside the update card. The fix was a second upload with `docs/changelog/2026-11-03_v0.7.1_visual-fidelity-pass.ota.txt`.
- Re-uploading the same version to the same channel is safe and was used deliberately: artifacts are re-hashed and the manifest re-signed, so the second upload replaced the first cleanly.
- Manifest read-back through the private bucket (`/storage/v1/object/agent-updates/manifest.stable.sig.json` with the service key — **not** `/object/public/`, which 404s `NoSuchBucket` for a private bucket) is the only proof of what is published. See `.opencode/context/supabase-access/supabase-direct-access_2026-10-17.md` for the `curl.exe` invocation.

## Deferred to `0.7.2` (known bug, not fixed here)

**The version chip can lag one release after an installer upgrade.** The titlebar/Settings chip renders `appVersion` from `get-startup-status`, which returns `active_slot_version` — not `APP_VERSION`. `verifyStartupSlotHealth` (`src/apps/fmsg-agents/update-manager.ts`, ~lines 736–780) only re-syncs `active_slot_version` after an installer upgrade when `fs.existsSync(activeDir)` is true; after `0.7.0` → `0.7.1` the app had already promoted its renderer into `Slot-Active` and then consumed it, so `activeDir` did not exist, the branch was skipped, and the chip kept reading `v0.7.0` until the OTA landed. Fixing it means changing `update-manager.ts` (main process), which would make the release installer-only — and installer-handoff OTA is still blocked by the Supabase storage size limit — so it was deliberately deferred rather than bundled into a renderer patch. Workaround until `0.7.2`: publish an OTA (any renderer slot promotion refreshes the value) or delete `%LOCALAPPDATA%\fmsg-agents\updates\install-state.json`'s `active_slot_version`.

## Verification performed

- `npx tsc -p tsconfig.json --noEmit` and `npx tsc -p tsconfig.main.json --noEmit`: clean.
- `npm run build:renderer`: `renderer/bundle.js` 382.6kb.
- `npm run build:all`: installer `dist/electron/FMSG Agents Setup 0.7.1.exe` (92,405,843 bytes).
- Installed with `/S /UPDATE` → `install-state.json` `installed_version 0.7.1`; then OTA applied in-app → `active_slot_version 0.7.1`, `backup_slot_version 0.7.0`, `last_check_status "Up to date"`, chip reads `v0.7.1`.
- Visual check of Home, Applications, Review, Billing, Profiles and Settings at 1360×860 CSS: dashboard fits without scroll, exactly one primary CTA, empty states render, 22px titles do not overflow any header row.

## Screenshot harness lessons (the false findings cost real time)

The browser tool cannot drive Electron, so captures come from a DPI-aware `PrintWindow` harness (`recycle_bin/shot.ps1`, local only):

- The display runs at **125% (`DPI=120`)**. Without `SetProcessDpiAwarenessContext(-4)` before `GetWindowRect`, the capture crops to ~80% of the window and looks like a layout bug.
- `PrintWindow` returns an **all-black bitmap when the window is occluded**. `ShowWindow(SW_MINIMIZE)` → `SW_RESTORE` → `SetWindowPos(HWND_TOPMOST)` → `SetForegroundWindow` reliably brings the real surface forward; `SetForegroundWindow` alone is refused by the focus-stealing guard.
- Two "findings" in the first pass were harness artefacts, not product bugs: the hero looked *smaller* than the mockup because the crop was scaled, and the dashboard looked like it scrolled because the capture was clipped. Always confirm a layout finding by measuring CSS pixels before changing code.
- Sidebar nav click targets in window-relative CSS px (x≈92): Home 65, Run 103, Applications 141, Review 179, Profiles 217, Billing 255, Settings 293. The first click after a view change is sometimes swallowed — retry once.

## Relevant files

- `src/apps/fmsg-agents/renderer/App.tsx` — `EmptyState`, hero grid + feature rows, `onStartRun` props, sidebar footer gating, Review title.
- `src/apps/fmsg-agents/renderer/design-system.css` — type-scale tokens, `.dashboard-hero-card` grid/features, `.empty-state*`, horizontal `.quick-action-tile`, `.sidebar-user-plan` ellipsis, `@media (max-width: 1100px)` hero stack.
- `src/apps/fmsg-agents/docs/changelog/2026-11-03_v0.7.1_visual-fidelity-pass.md` — release log (type-scale table, risk areas).
- `src/apps/fmsg-agents/docs/changelog/2026-11-03_v0.7.1_visual-fidelity-pass.ota.txt` — plain-text OTA changelog actually published.
- `src/apps/fmsg-agents/docs/changelog/INDEX.md` — version table entry for `v0.7.1`.
- `src/apps/fmsg-agents/update-manager.ts` — `verifyStartupSlotHealth`, where the deferred version-chip fix belongs.
- `src/apps/fmsg-agents/scripts/upload-update.js` — `--version/--min-supported/--type/--changelog-file/--requires-installer`; changelog copied line-by-line.
