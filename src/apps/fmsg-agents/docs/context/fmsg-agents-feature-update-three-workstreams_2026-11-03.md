# FMSG Agents — Three-workstream feature update (live browser view, profile cards, full-width update screen)

This file records the 2026-11-03 feature update that shipped three Argon-assigned workstreams in the mandated sequence 003 → 002 → 001: a CDP screencast live browser view on the Run screen, centred SaaS profile cards plus an identity-led Run-page profile picker, and a full-width feature-update screen. It is a follow-on to the visual-fidelity and UI-redesign passes documented in `src/apps/fmsg-agents/docs/context/fmsg-agents-visual-fidelity_2026-11-03.md` and `src/apps/fmsg-agents/docs/context/fmsg-agents-ui-redesign_2026-11-03.md` — this is the first pass that added *behaviour* (live streaming) rather than only presentation. All three tasks are EOT-filed and `PENDING_REVIEW`; none is approved yet.

## Task references

| Task | Assignment | Blueprint | EOT |
|---|---|---|---|
| `TASK-20261103-003` | `logs/EOT/deepseekprodelegation/TASK-20261103-003_embedded-browser-live-preview.md` | `docs/blueprints/BLUEPRINT-20261103-003_embedded-browser-live-preview.md` | `logs/EOT/argoneot/EOT-TASK-20261103-003_embedded-browser-live-preview.md` |
| `TASK-20261103-002` | `logs/EOT/deepseekprodelegation/TASK-20261103-002_profile-cards-saas-redesign.md` | `docs/blueprints/BLUEPRINT-20261103-002_profile-cards-saas-redesign.md` | `logs/EOT/argoneot/EOT-TASK-20261103-002_profile-cards-saas-redesign.md` |
| `TASK-20261103-001` | `logs/EOT/deepseekprodelegation/TASK-20261103-001_full-width-update-screen.md` | `docs/blueprints/BLUEPRINT-20261103-001_full-width-update-screen.md` | `logs/EOT/argoneot/EOT-TASK-20261103-001_full-width-update-screen.md` |

## Durable lessons

### 1. Screencast frames ride the existing `agent-event` channel

The live browser view needed no IPC change. `sendAgentEvent()` in `electron-main.ts` forwards **any** `AgentEvent` generically, so adding a `browser-frame` member to the event union in `agent-controller.ts` was enough to get frames from the main process to the renderer. `preload.ts` and `electron-main.ts` were **not modified** for this feature. Two consequences worth remembering:

- `Page.startScreencast` requires a **per-frame ACK** (`Page.screencastFrameAck`). ACK *before* applying the throttle, otherwise the CDP session stops emitting.
- Window-state throttling silently starves a background Chrome window. `Browser.getWindowForTarget` → `Browser.setWindowBounds` with `windowState: 'normal'` is required before the stream is reliable, and it needs a **browser-level** CDP session (`browser.newBrowserCDPSession()`), not the page session used for the screencast.

Frames are view-only: held as a single frame in renderer state (no history), and `logger.ts` redacts `data:image/…;base64,…` strings plus `dataUrl|frame|screencastFrame` keys so a frame can never reach the log file.

### 2. `.modal-backdrop` is declared twice — later wins on equal specificity

`renderer/design-system.css` declares `.modal-backdrop` at **two** places (≈ line 614 and ≈ line 4603). The second adds `position: fixed; inset: 36px 0 0 0; overflow-y: auto`. A single-class override such as `.update-modal-backdrop { align-items: flex-start }` therefore **silently loses**, because specificity is equal and the second declaration is later in the file. The symptom is nasty: a tall modal that appears cut off at the top with *no scrollbar*, because the centring pushes content above the scroll origin. Use a compound selector (`.modal-backdrop.update-modal-backdrop`) or a later declaration.

This is the same class of trap as the stale-CSS-cascade problems in `src/apps/fmsg-agents/docs/context/fmsg-agents-visual-fidelity_2026-11-03.md`: adding an override near the original rule looks correct in the source and does nothing at runtime. Verify with computed styles, not by reading the edit.

### 3. Verified "no inner scrollbar" needs a negative test

The founder's complaint was a nested scrollbar. Checking that the new layout has a page-level scrollbar is not enough — the claim that matters is that **no descendant** is a scroll container. The probe enumerates every descendant of the page and filters for `overflow-y: auto|scroll` **and** `scrollHeight > clientHeight`. That count must be `0`. A screenshot can easily hide a 4 px inner scrollbar.

Also worth noting: `canPageScroll` and the screenshot disagreed on the first modal pass, and the screenshot was right. When a metric and a rendered image conflict, investigate instead of trusting the metric.

### 4. Harness coverage gaps: copy, don't edit

Neither the update screen nor a dropdown's open state is covered by the tracked harnesses. Rather than editing `tests/ui/shots.cjs` / `tests/ui/a11y.cjs` (which Argon did not authorise and which every future run depends on), the harnesses were **copied** into `recycle_bin/` by a small generator script that rewrites `APP_ROOT` to an absolute path and redirects the report output, then injects interaction steps. The tracked files and their reports stay pristine.

Two environment facts for those copies:

- Playwright must be required from the **repository root** `node_modules/playwright`; the app-local copy has no browsers downloaded (`chromium_headless_shell-1248` missing).
- When bundling a standalone mount with esbuild, do **not** pass `--define:process.env.NODE_ENV='\"production\"'` — PowerShell strips the quotes and the define becomes a bare identifier, which makes the bundle throw `production is not defined` and render an empty page. Inject `window.process = { env: { NODE_ENV: 'production' } }` into the probe HTML instead.

### 5. Blueprint-driven card work: the written clarification outranks the reference image

For `TASK-20261103-002` the founder supplied both an image and a written clarification, with the clarification declared authoritative. The image shows **two** selection affordances on non-selected cards (`✓ Active` **and** `Select`) and a corner badge on the selected one. Copying the image would have produced exactly the contradictory, duplicate selection states the blueprint forbids. The implemented card renders one unambiguous control per state: a green **Active Profile** pill on the selected card, a single **Select** control elsewhere, no corner badge.

This is a standing pattern: when a generated reference image and a written spec disagree, follow the spec and record the divergence as a decision rather than silently reproducing the image.

### 6. Pre-existing defects inside a restyled component get fixed, not reported

The Run-page `ProfilePicker` had two latent layout bugs that the identity rework merely exposed: the dropdown menu was anchored `left: 0` on a trigger sitting at the window's right edge (so it opened off-screen), and the item row never reset an earlier `flex-direction: column` (so the new avatar stacked above its text). Both were pre-existing, not introduced by the redesign. Leaving them would have failed the task's own "functionally intact" criterion, so they were fixed and disclosed in the EOT as pre-existing.

## Current state and open items

- **All four tasks approved and archived.** `TASK-20261103-001/002` approved by Argon on `2026-11-03T18:02:54+02:00`; `TASK-20261103-003` approved via its corrective `TASK-20261103-004` on `2026-11-03T18:18:10+02:00` (original + corrective archived together). EOTs remain permanently in `logs/EOT/argoneot/`.
- **`E-003-A` closed.** Argon approved option (i): one `preload.ts` method, one guarded `ipcMain.handle('agent-focus-browser')`, `AgentRunner.focusAutomationBrowser()` on the retained browser-level CDP session (`Target.activateTarget` + conditional `setWindowBounds`). OS-level foregrounding was not observed (headless probe), so it remains a founder release-gate item.
- **Release `v0.10.0` in progress.** Version bumped in `package.json`, `config.ts` and the three legal docs; changelog finalised in `docs/changelog/2026-11-03_v0.10.0_embedded-browser-profile-cards-full-width-update.md` (+ `.ota.txt`); `INDEX.md` updated; `UNRELEASED.md` reset. Main process + preload IPC changed, so the manifest is installer-handoff (`requires_installer: true`).
- **Not verified, not claimed:** packaged-app visual verification for any of the three tasks, a live end-to-end OTA batch, sustained screencast fps, live feed pause/resume inside the real shell, Windows display scaling, and the unused `mode="wizard"` on the update screen.
- **Possible mis-target on `TASK-20261103-002`:** the "bottom-right profile component" was interpreted as the Run-page `ProfilePicker` (the blueprint's default, and structurally identical to the reference chip). The only genuinely bottom-anchored profile affordance is the **sidebar footer**, which is bottom-*left* and sits outside that task's permitted `App.tsx` region. If the founder meant that element it needs its own assignment.
