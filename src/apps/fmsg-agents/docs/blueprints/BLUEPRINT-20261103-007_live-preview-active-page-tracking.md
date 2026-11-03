# BLUEPRINT-20261103-007 — Live Preview: Follow the Active Automation Page

## 1. Task ID

`BLUEPRINT-20261103-007` → assignment `TASK-20261103-007`.

## 2. Objective

Make the in-app live preview track the **actual page the automation is interacting with**, across navigations, new tabs, popups, tab switches, and page closures — instead of staying attached to whichever page the screencast was first started on.

## 3. Background and problem statement

Founder request (Workstream 2 / Workstream B of the 2026-11-03 documents): Chrome opens or uses new tabs outside the application while the in-app preview keeps showing the old page. The product requirement is that the preview shows the actual browser activity; opening Chrome externally must remain an optional user action.

## 4. Existing implementation findings (verified by inspection)

All in `src/apps/fmsg-agents/agent-controller.ts`:

- `init()` (line 1414): launches browser → `context.newPage()` → `this.page` → `startScreencast()` once.
- `startScreencast()` (line 481): `this.context.newCDPSession(this.page)` — binds the CDP screencast to **`this.page` only**, the page created at launch.
- **There is no `context.on('page')` handler.** Playwright creates new `Page` objects for `target=_blank` links and popups (very common on job-board "Apply" buttons), but the controller never sees them; the screencast keeps streaming the original page while the automation/site interacts with the new one.
- `currentHost()` (line 470) reads `this.page?.url()` — the original page's URL, so the emitted `host` is stale too.
- `placeAutomationWindowBehindApp()` (line 578) and `focusAutomationBrowser()` (line 641) select `targetInfos.find((t) => t.type === 'page')` — the **first** page target in the list, not necessarily the active one, so "Open in Chrome" can raise the wrong tab.
- `resume()` restarts the screencast on `this.page` (the original), not on the current active page.
- Playwright's `context.on('page')` and `page.on('close')` APIs are available and are the correct mechanism; `Target.setDiscoverTargets` + raw CDP target management is unnecessary complexity here.

## 5. Root cause

The streaming pipeline models "one page for the whole run". `this.page` is set exactly once at launch, the CDP session is attached to it once, and every later page the browser creates is invisible to the controller. Job sites routinely open applications in new tabs, so the preview diverges from the automation the moment that happens.

## 6. Approved technical approach

Introduce **active-page tracking** in `AgentRunner` (no new dependencies, no new IPC):

1. **Track pages:** register `context.on('page')` immediately after context creation. Every new `Page` is recorded (with its creation order). Also listen on the initial page.
2. **Promote on activity:** when a new page is created (and, to be safe, when an existing page fires `framenavigated`/`load`), promote it to `this.page` (the "active automation page"). Keep a stack/order so that if the newest page closes, the previous one is restored.
3. **Re-attach the screencast:** `startScreencast()` already creates a fresh CDP session per call; make promotion call `stopScreencast()` (old page) then `startScreencast()` (new page). Guard against races (`screencasting` flag, `paused`, abort). Emit a `phase` event like `"Switched to a new browser tab"` so the UI state is truthful (no new event type needed — `phase` is sufficient, but a `browser-frame` burst should not be missed: emit one milestone `screenshot` of the new page as an immediate visual update while the screencast spins up).
4. **Handle close:** `page.on('close')` on tracked pages → detach that page's CDP session; if it was the active page, promote the most recent remaining page and restart the screencast. If no page remains (all closed), stop streaming and report via `phase('paused', 'Browser window closed', ...)` — never leave the preview silently stale.
5. **Fix host reporting:** `currentHost()` reads the active page's URL; the emitted `browser-frame.host` then matches the streamed page.
6. **Fix window commands:** `placeAutomationWindowBehindApp()` and `focusAutomationBrowser()` must resolve the **active** page's target — match `Target.getTargets` entries to the active page (e.g. by `targetId` via `page._targetId`-equivalent or by matching the active page's CDP session target), not `find(type === 'page')` (first match). Keep `windowState: 'normal'` semantics and the conditional-restore logic unchanged.
7. **Browser disconnect:** wrap tracking handlers so a `browser.on('disconnected')` stops the fallback timer and clears streaming state without throwing.
8. **Cleanup:** on run end/stop, detach the active session and clear page tracking (existing `stopScreencast` path).

Preserved unchanged: `Page.startScreencast` parameters (jpeg q55, 960×540, everyNthFrame 2, ≤10 fps throttle, ACK-before-drop), in-memory frames, logger redaction, fallback stills, pause/resume semantics, `focusAutomationBrowser` IPC contract (one guarded `agent-focus-browser` handler, boolean result), and all window-behind-app behaviour.

## 7. Architecture and design decisions

- **Follow, don't fight:** the preview follows whatever page the automation context makes active. We do not try to force every site to stay in one tab.
- The "active page" heuristic is newest-created-wins plus promote-on-navigation; this is a deliberate first iteration — a full CDP `Target.attachToTarget`-level solution was rejected as unnecessary complexity until measurements show the heuristic failing (escalate if so).
- This is a repair of the existing architecture, not a replacement (the Ubuntu runtime question is BLUEPRINT-20261103-008 and is a separate investigation).

## 8. Files to inspect

- `src/apps/fmsg-agents/agent-controller.ts` (init, startScreencast, stopScreencast, currentHost, placeAutomationWindowBehindApp, focusAutomationBrowser, runBatch, stop)
- `src/apps/fmsg-agents/electron-main.ts` (agent-focus-browser handler, agent lifecycle)
- `src/apps/fmsg-agents/docs/context/fmsg-agents-feature-update-three-workstreams_2026-11-03.md` (screencast ACK rules, E-003-A closure)

## 9. Files permitted to modify

- `src/apps/fmsg-agents/agent-controller.ts`
- `src/apps/fmsg-agents/docs/changelog/UNRELEASED.md`

## 10. Files prohibited from modifying

- `renderer/**` (the UI consumes the same events; BLUEPRINT-20261103-005 owns the renderer restructure)
- `electron-main.ts`, `preload.ts`, `logger.ts`
- `package.json`, `config.ts`, legal docs, migrations, website code

## 11. Required implementation steps

1. Read the files and the context file; re-read SOP §3.4 escalation conditions.
2. Implement page tracking (context.on('page'), close handling, active-page promotion).
3. Wire promotion → stop/start screencast with race guards and a truthful phase event.
4. Fix currentHost + window target resolution to use the active page.
5. Add disconnect handling and run-end cleanup.
6. Build and run the scenario matrix (§14) against real Chrome (headless-false probe, same pattern as `recycle_bin/screencast-probe-2026-11-03.cjs`).
7. Log in `UNRELEASED.md`; file EOT with measured evidence.

## 12. Dependencies

- None. Runs in parallel with `TASK-20261103-006` (renderer restructure); the renderer needs no changes to benefit.

## 13. Acceptance criteria

- [ ] Navigation of the active page is reflected in the preview (host + frames).
- [ ] A new tab opened by the site/popup becomes the streamed page; the preview follows it.
- [ ] Switching between tabs reflects the active page.
- [ ] Closing the active page falls back to the previous page (or reports the browser closed) — never silently stale.
- [ ] Redirects are reflected.
- [ ] Pause/Resume and Open in Chrome still work and now target the **active** page's tab/window.
- [ ] Per-frame ACK preserved; stream stalls are ACK-ordered, not throttle-caused.
- [ ] Frames remain in-memory and redacted in logs (existing logger tests still pass).
- [ ] No duplicate or disconnected browser session is introduced.
- [ ] No version bump, no installer rebuild, no release.

## 14. Required tests

- Scenario probe against real Chrome: (1) navigate, (2) `window.open`/target=_blank new tab, (3) popup, (4) switch tabs, (5) close active tab, (6) redirect, (7) multiple pages, (8) browser disconnect. For each: record which page is being streamed vs automated (URL match), frames received, frames ACKed, page-switch latency, and whether the preview went stale (>3s without a frame while active).
- `npx tsc -p tsconfig.main.json --noEmit` clean; `npm run test:main` (existing suite) passes.
- Logger redaction check: no `data:image` or frame payloads in logs during the probe.

## 15. Regression risks

- Race between `stopScreencast` (old page) and `startScreencast` (new page) can double-start or deadlock the `screencasting` flag — serialise via the flag + try/finally.
- Promoting on `load`/`framenavigated` of background tabs could yank the preview away from the page being worked on — only promote on **new page creation** and on the **active** page's navigations (not on arbitrary tracked pages).
- `focusAutomationBrowser` currently takes the first page target; changing its resolution must not break the "restore minimized" conditional.

## 16. Rollback considerations

Main-process-only change to `agent-controller.ts`; revert = restore the file. No DB, no renderer coupling. (A future release carrying this must be installer-handoff, per existing release policy — not part of this task.)

## 17. Explicit instructions and restrictions

- `IMPLEMENT ENTIRELY YOURSELF` — no Flash delegation: streaming lifecycle code. *(Re-confirmed 2026-11-03 under the founder's corrective directive: CDP session management and browser lifecycle remain senior; no isolated sub-pieces exist.)*
- Do **not** change screencast format/quality/fps parameters; do **not** add persistence of frames; do **not** add new IPC or preload surface; do **not** modify the renderer.
- If the founder's observed failure cannot be reproduced with the scenario matrix, say so explicitly in the EOT rather than claiming a fix.
- No release, no version bump, no installer rebuild.

## 18. Escalation conditions

- The heuristic (newest page wins) proves insufficient in the probe (e.g. automation works a background tab while a spam tab appears).
- Any need to touch `electron-main.ts`/`preload.ts` or change the IPC contract.
- A discovery that the automation itself opens pages via a different browser/context than `this.context`.
