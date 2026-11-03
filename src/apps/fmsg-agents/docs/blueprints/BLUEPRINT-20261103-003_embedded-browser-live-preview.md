# BLUEPRINT-20261103-003 — Embedded Browser & Live Visual Streaming

- **Task ID:** `BLUEPRINT-20261103-003`
- **Author:** Gemini Argon (Director of Technology)
- **Created:** 2026-11-03T15:01:01+02:00
- **Related assignment:** `TASK-20261103-003_embedded-browser-live-preview.md`

## 1. Objective

Keep users inside FMSG Agents during automated application runs: pressing Start Apply must no longer leave the user watching an external Chrome window; instead the Live Run screen shows a continuously updating live view of the automation browser, synchronised with the agent's pipeline state — eliminating the need for manual screenshots.

## 2. Background and problem statement

Founder report: Start Apply opens a separate browser tab outside the app, interrupting the workflow. Users currently take screenshots to communicate the agent's browser stage. Required: an embedded browser experience, live visual streaming, and integration with agent progress indicators — without exposing credentials, session tokens, or sensitive data, and without breaking automation.

## 3. Existing implementation findings (verified)

- `browser-resolver.ts` → `launchVisibleAutomationBrowser()`: `chromium.launch({ headless: false, executablePath: <resolved Chrome/Chromium/Edge>, slowMo, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] })`. **The automation browser is a visible Chrome-family window on the user's machine** — this window is the "separate tab outside FMSG Agents".
- `agent-controller.ts` (`AgentRunner`): drives `this.page` (fill forms, navigate), and emits `{ type: 'screenshot', dataUrl, caption, job }` events from `page.screenshot()` stills (quality 62, ~line 426) at key milestones.
- `electron-main.ts` (~line 98): forwards runner events to the renderer via `mainWindow.webContents.send('agent-event', event)`.
- `preload.ts`: relays `agent-event` to the renderer (`window.electronAPI.onAgentEvent`).
- `renderer/components/LiveLog.tsx`: consumes `agent-event`; keeps the latest `screenshot` in state and renders it in a viewport panel (~lines 796–847, 982) with host + caption; pipeline steps (`PIPELINE_STEPS`) and a current-job card already show "what the agent is doing".
- **Conclusion: an in-app still-image preview already exists.** The gap is continuous streaming + the external-window interruption.

## 4. Root cause

The preview is fed by milestone screenshots (stills, on demand), and the automation Chrome runs as a separate top-level window that steals user attention.

## 5. Approved technical approach

**Chrome DevTools Protocol `Page.startScreencast` over a Playwright CDP session, streamed through the existing IPC event pipeline. No webview. No new dependency.**

1. **Streaming source (main process, `agent-controller.ts`):** after the automation page exists, open a CDP session via Playwright (`context.newCDPSession(page)`); `Page.startScreencast` with `{ format: 'jpeg', quality: ~55, maxWidth: 960, maxHeight: 540, everyNthFrame: 2 }`; on `Page.screencastFrame` → emit `{ type: 'browser-frame', dataUrl: 'data:image/jpeg;base64,…', ts }` through the runner event callback; `Page.screencastFrameAck` every frame. Throttle to ≤10 fps. Stop screencast (and ACK drain) on run stop/pause; pause emits a final frame.
2. **Transport:** reuse the existing `agent-event` channel — add the `browser-frame` event type. **No new IPC API, no preload change required.** Ensure frame payloads never reach the logger or disk (verify `logger.ts` redaction covers `dataUrl`; add explicit exclusion for frame events).
3. **Renderer (LiveLog):** upgrade the viewport panel to a live preview: render the latest `browser-frame` as an `<img>` (keep only the latest frame in state — no frame history), overlay host + current pipeline step ("what the agent is doing" + "what it sees" pairing), show a subtle LIVE indicator; controls: **Pause/Resume feed** and **Open in Chrome** (brings the automation window to front — existing behaviour, now opt-in). **View-only: no in-app navigation controls** — user navigation would race the agent and corrupt runs (architectural decision below).
4. **Window interruption fix:** after launch, keep the app window as the user's surface: position the automation Chrome behind FMSG Agents (CDP `Browser.getWindowForTarget` + `Browser.setWindowBounds`, normal state) — **do not minimize Chrome**, since minimized windows throttle rendering and stall screencast frames (risk verified below). If the user clicks "Open in Chrome", the automation window comes forward; the live feed continues either way.
5. **Fallback:** if `Page.startScreencast` fails or stalls (e.g. unusual driver combos), degrade gracefully to the existing still-screenshot path at an accelerated cadence (~1 per 2s) so the preview never goes dark.
6. **Progress integration:** the preview header displays the current pipeline step (from `PIPELINE_STEPS`/active entry) so the user sees both state and screen in one place.

## 6. Architecture and design decisions

- **CDP screencast, not `<webview>`/`BrowserView`:** a webview would create a *second* browsing context — forking session state (cookies, logins) away from the Playwright automation and creating credential-isolation risk. Screencast is a **read-only view of the actual automation surface** — session isolation preserved by construction.
- **View-only preview:** the agent owns navigation and input. User-side browser controls are limited to feed pause/resume and bring-to-front.
- **No new dependency:** Playwright (already used) exposes `newCDPSession`.
- **Security:** frames never written to disk or logs; no credentials in captions/overlays; existing password-field masking (`secret-vault.ts` ~line 453) continues to apply to any stills.
- **Performance:** ≤10 fps, 960px JPEG q55 ≈ 40–120 KB/frame → ≤ ~1.2 MB/s in-process IPC; only the latest frame retained in renderer state.

## 7. Files to inspect

- `agent-controller.ts` (runner lifecycle, `screenshot()`, event emission, start/stop/pause hooks)
- `browser-resolver.ts` (launch options)
- `electron-main.ts` (~line 98 event forwarding; agent lifecycle wiring)
- `preload.ts` (event relay)
- `renderer/components/LiveLog.tsx` (viewport panel, pipeline state)
- `logger.ts` (redaction — frame payload exclusion)
- `secret-vault.ts` (~line 453 password masking)

## 8. Files permitted to modify

- `agent-controller.ts`
- `electron-main.ts` (event forwarding only)
- `renderer/components/LiveLog.tsx`
- `renderer/design-system.css`
- `logger.ts` (frame-payload exclusion only)

## 9. Files prohibited from modifying

Everything else — in particular `browser-resolver.ts` (launch options stay), `preload.ts`, `config.ts`, `secret-vault.ts`, `update-manager.ts`, `App.tsx` (unless a trivial prop-pass proves unavoidable → escalate first).

## 10. Required implementation steps

1. Inspect §7 files; confirm the runner event callback signature and pause/stop hooks.
2. Implement screencast lifecycle in `agent-controller.ts` (start after page ready; throttled frame emission; ACK; stop/drain on pause/stop/error; restart on resume).
3. Add `browser-frame` passthrough in `electron-main.ts` (if the existing forwarder is generic, verify it passes the new type through — no payload logging).
4. Exclude frame payloads from logs in `logger.ts`.
5. Rebuild the LiveLog viewport panel as the live preview: latest-frame `<img>`, LIVE indicator, host + current-step overlay, Pause/Resume feed, Open in Chrome; keep still-screenshot fallback rendering when no frames arrive.
6. Window management: position automation Chrome behind the app after launch (CDP window bounds); bring-to-front on demand.
7. Test the fallback path (screencast disabled → accelerated stills).
8. Typecheck both configs, build renderer + full installer, run a small real batch end-to-end (§12/§13).

## 11. Dependencies

None external. Sequence: this workstream runs **first** (highest risk, longest test cycle) — see the assignment for ordering.

## 12. Acceptance criteria

1. Start Apply no longer leaves the user watching the external Chrome tab; the app window remains the primary surface (Chrome stays open behind the app and can be brought forward on demand).
2. The user observes browser activity as it happens: page loads, navigation, form interactions, stage changes — live, no manual screenshots.
3. Preview updates automatically (≤10 fps); no refresh action needed.
4. Navigation and agent interactions are reflected in the live preview and paired with the current pipeline step.
5. Existing automation (search → tailor → apply → record) remains fully operational.
6. Security preserved: view-only, session isolation intact, frames never persisted/logged, password masking still effective.

## 13. Required tests

- `npx tsc -p tsconfig.json --noEmit` and `npx tsc -p tsconfig.main.json --noEmit` — clean.
- `npm run build:renderer` and `npm run build:all` — succeed (installer).
- Live end-to-end: run a small batch (≤5 jobs) in the packaged/installed app; verify frames stream during navigation and form fill; verify pause/resume of the feed; verify run stop tears down screencast (no orphaned CDP listeners); verify logger contains no frame payloads.
- Fallback test: force screencast failure (dev flag) → accelerated stills still render.

## 14. Regression risks

- **Minimized-window stall:** Chrome throttles rendering for minimized/hidden windows — screencast frames may stop. Mitigation: keep Chrome in normal state behind the app window (§5.4); never auto-minimize.
- Frame flood: un-ACKed screencast frames pile up in Chrome — always ACK (§5.1).
- Run lifecycle: screencast must survive navigation (it does — it's page-agnostic) but must be torn down on context close to avoid leaks.
- IPC payload size: cap via maxWidth/quality/everyNthFrame; renderer keeps only the latest frame.

## 15. Rollback considerations

The change is additive to the event stream. Rolling back the renderer to still-screenshot mode is possible while keeping the screencast emitter (harmless no-op) or vice versa. No data migration; no persisted state.

## 16. Explicit instructions and restrictions

- `IMPLEMENT ENTIRELY YOURSELF` — security-sensitive and architecture-adjacent; **no Flash delegation**.
- Do not switch automation to headless mode; do not change launch options in `browser-resolver.ts`.
- Do not add in-app navigation/input controls to the preview.
- Do not add dependencies without Argon approval.
- Follow SOP §2.3/§2.4: no credentials, tokens, or sensitive values anywhere in code comments, assignments, or EOTs.

## 17. Escalation conditions

- CDP screencast proves unreliable on the actual deployment (frames stall >5s repeatedly) → escalate with measurements; Argon will decide between fallback cadence and alternative streaming (e.g. video container per frame batch).
- Any change requires touching `browser-resolver.ts` launch semantics, `preload.ts`, or `config.ts` → stop and escalate.
- Performance problem (renderer jank at target fps) → escalate with profiling data.
