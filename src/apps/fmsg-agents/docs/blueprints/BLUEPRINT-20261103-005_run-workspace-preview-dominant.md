# BLUEPRINT-20261103-005 — Run Workspace: Preview-Dominant Layout Remediation

## 1. Task ID

`BLUEPRINT-20261103-005` → assignment `TASK-20261103-006`.

## 2. Objective

Reorganise the Run workspace so the live browser preview is the dominant visual component: it extends across practically the entire available main workspace, from immediately below a compact header/toolbar to the bottom of the usable application area. The workspace becomes a proper automation monitoring interface instead of small components inside a large empty container.

## 3. Background and problem statement

Founder request "Run Workspace Layout & Space Utilisation Remediation" (2026-11-03), consolidated with Workstream D of "Independent CV Profiles, Live Agent Observability & Integrated Ubuntu Runtime" (same day; the founder directed that these be consolidated rather than duplicated). Reference: `C:\Users\mqhel\Downloads\fmsg_agents_workspace.tsx` (Tailwind mock — dummy data, simulated browser content, "60 FPS" claims and mock pipeline metrics are illustrative only and must not be copied).

The layout must work for both the current Windows-Chrome screencast and the future Ubuntu desktop runtime stream (see BLUEPRINT-20261103-008). The preview canvas must scale the real stream without distortion or cropping; letterboxing is acceptable.

## 4. Existing implementation findings (verified by inspection)

- Run view = `renderer/components/LiveLog.tsx` (1,122 lines), mounted at `App.tsx:1366` inside `<main className="workspace-main">`.
- **Primary root cause — the page shell does not fill the workspace.** `.workspace-main { padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column }` (line 2863) but `.run-page-shell { width: 100%; min-height: 0 }` (line 5306) has **no `flex: 1` / height**, so it sizes to content and the entire lower half of the workspace is unused dark space below the page.
- **Secondary — the preview is not dominant.** `.matrix-log-column { flex: 0 0 40%; max-width: 42% }` (line 1133) permanently reserves ~40% of the width for the activity log, so the preview column (`flex: 1`) gets ~58% in a side-by-side arrangement. The founder's reference is a **tabbed** workspace where the preview is a full-canvas tab (Live Browser Preview | Execution Pipeline | History & Logs).
- **Tertiary — stacked headers eat vertical space.** The page has a billing-header, then a matrix-log-header status strip, then a progress bar, then the two-column content — multiple stacked bands above the content.
- **Quaternary — letterboxed image anchored top.** `.viewport-shot { object-fit: contain; object-position: top center }` (line 1641) pins the 16:9 image to the top of a taller monitor, leaving dark space below; it should be centred and scaled to the largest practical area.
- The founder reference's toolbar (URL pill, status badge, browser controls) already exists as `.viewport-browser-bar` + `.viewport-footer`; controls currently split across the bottom action row (Pause/Resume/Stop/Emergency) and the preview footer (Open in Chrome / Pause feed / Clear preview).
- Existing functionality to preserve: `agent-event` phases, screencast frame handling, feed pause (renderer-side `feedPausedRef`), attention ("Needs You") modal with countdown, Pause/Resume/Stop/Emergency IPC handlers, Open in Chrome (`focusAutomationBrowser`), clear preview, pipeline stepper, current-job spotlight, activity log entries, run progress, profile picker in the header.

## 5. Root cause

Container-first sizing again, at page level: the workspace shell gives the run page a full-size area, but the run page's own shell never claims it (`flex`/`min-height` chain broken), and what space the page does claim is partitioned 40/60 between a log column and the preview. The preview is treated as one column among two rather than the workspace's primary surface.

## 6. Approved technical approach

Restructure `LiveLog.tsx` into a **tabbed workspace**, mirroring the founder reference's structure while keeping every existing behaviour:

1. **Compact workspace header** (replaces the current billing-header band): H1 "Run", one-line subtitle, batch info chip, ProfilePicker (unchanged), and the primary run controls (Start Applying (N) / Pause Run / Resume Run / Stop Run / Emergency Stop — same handlers, relocated into the header). Remove the separate matrix-log-header status strip and merge its live status into the toolbar (no duplicate status indicators).
2. **Tab strip** (compact, ≤40px): Live Browser Preview | Execution Pipeline | History & Logs. Tab state is local to the component (`useState`), defaulting to the preview tab; the tab strip must not consume meaningful vertical space and must stay distinct without dominating.
3. **Live Browser Preview tab (default, dominant):**
   - A browser monitor panel filling `100%` of the remaining width/height (`flex: 1; min-height: 0` at every level of the chain from `.workspace-main` down).
   - **Compact browser toolbar** (one row): traffic dots, URL pill (host from frames/active page), LIVE/standby/paused badge, current-step text, and the controls: Pause/Resume feed, Open in Chrome, Clear preview. No duplicate status/controls elsewhere in the tab.
   - **Viewport canvas**: fills the monitor; idle state keeps full canvas dimensions with a centred empty state; active state renders the frame `object-fit: contain` **centred** (`object-position: center`), scaling to the largest practical area; overlay strip (current step + live dot) retained; attention modal retained, rendered inside the monitor.
4. **Execution Pipeline tab**: the existing stepper + current-job spotlight + activity log + progress bar, reflowed to use the full canvas width (grid with the stepper as a left rail and the log as the main area; no fixed 40% column). Reuses the same `entries` state and `PIPELINE_STEPS`.
5. **History & Logs tab**: the activity log + run-progress + past-run information already produced by the agent events (the current "matrix log" content), full-canvas with its own single scroll region.
6. **Spacing**: remove `workspace-main`'s oversized padding around the run page (or reduce to ~8px for this view only), remove the monitor's outer bezel margins, keep internal paddings sane (12–16px) — the founder reference uses "minimal unnecessary padding around the preview".
7. **Height chain fix**: `.run-page-shell` gets `flex: 1; height: 100%; min-height: 0` (or the equivalent) so `.live-feed-root { height: 100% }` resolves against a real height; verify `min-height: 0` at each flex level (the classic broken-flex-height chain).
8. **Runtime-agnostic canvas**: the preview tab renders whatever frame events arrive (`browser-frame` today; future desktop-stream events later). No hardcoded "browser" layout assumptions inside the canvas itself beyond the existing toolbar labels, which may be relabelled per the active runtime later.

## 7. Architecture and design decisions

- Tabs replace the side-by-side split. This matches the founder's reference exactly and makes the preview the dominant surface; Pipeline/History remain one click away and fully functional.
- The preview monitor is **not** given a fixed width/height cap of any kind. Its bounds are the flex container.
- `LiveLog.tsx` remains the single home for run state; no state moves to `App.tsx` except if a prop is already passed (do not add new props to App.tsx beyond what exists unless the header controls require one — escalate if so).
- No new dependencies. No version bump.

## 9. Files permitted to modify

- `src/apps/fmsg-agents/renderer/components/LiveLog.tsx`
- `src/apps/fmsg-agents/renderer/design-system.css` (run-page/live-feed/viewport/matrix rules only)
- `src/apps/fmsg-agents/docs/changelog/UNRELEASED.md`

## 10. Files prohibited from modifying

- `src/apps/fmsg-agents/agent-controller.ts`, `electron-main.ts`, `preload.ts`, `logger.ts` (the streaming backend itself — see BLUEPRINT-20261103-007, a separate task)
- `src/apps/fmsg-agents/renderer/App.tsx` except, if unavoidable, the `LiveLog` mount props (escalate first)
- `package.json`, `config.ts`, legal docs, supabase migrations, website code

## 11. Required implementation steps

1. Read this blueprint, the founder reference, and the current LiveLog/design-system CSS.
2. Capture before-state screenshots (harness `npm run ui:shots`).
3. Fix the height chain first (`.run-page-shell` etc.) and verify the run page now fills the workspace at 1360×860.
4. Restructure into header + tab strip + tab panels (preview default).
5. Build the toolbar and full-canvas preview; centre the frame image.
6. Reflow pipeline/history tabs to full canvas.
7. Remove dead CSS (old side-by-side column rules) rather than leaving conflicting duplicates.
8. Run the validation matrix (§13); fix regressions.
9. Log in `UNRELEASED.md`; file EOT.

## 12. Dependencies

- None. `TASK-20261103-007` (backend target tracking) runs in parallel and must not block this; the canvas is frame-event driven and will benefit automatically.

## 13. Acceptance criteria

- [ ] The preview occupies the overwhelming majority of the usable Run workspace, extending to the bottom of the available main content area (no large empty lower section).
- [ ] The preview is not restricted by arbitrary max-width/max-height or fixed dimensions anywhere in its ancestor chain.
- [ ] The browser image scales without distortion or cropping (aspect ratio preserved at all tested sizes); letterboxing centred when needed.
- [ ] Workspace header and controls are compact, readable, accessible; tab strip is visually distinct but does not consume excessive height.
- [ ] Live streaming, Pause/Resume feed, Open in Chrome, Clear preview, attention modal, Stop/Pause/Resume/Emergency all retain existing behaviour.
- [ ] Idle state keeps full canvas dimensions with a centred, balanced empty state.
- [ ] Pipeline and History tabs remain functional, coherent, and use the available workspace.
- [ ] No nested scrollbars in the preview tab; intentional scrolling only in pipeline/history log areas.
- [ ] Responsive at 1360×860, 1024×700, a narrower width, and a reduced height: no horizontal overflow, no clipped controls, no overlap.
- [ ] Before/after visual evidence shows a meaningful improvement.
- [ ] No regression of TASK-20261103-001 (full-width update screen), 002 (profile cards), 003/004 (embedded preview + Open in Chrome).
- [ ] No version bump, no installer rebuild, no release.

## 14. Required tests

- `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p tsconfig.main.json --noEmit`.
- `npm run ui:shots -- --size 960,1024,1280,1360` — 0 tiny-text/clipped/overflow; preview canvas geometry measured (report its width/height per viewport).
- `npm run ui:a11y` — 0 axe violations on all three tabs.
- `npm run ui:flows` (existing flows) — no regressions in picker/card/update flows.
- Functional probe: start a stub run (existing harness pattern), confirm frames render centred in the full canvas, feed pause/resume toggles, tabs switch preserving log state.

## 15. Regression risks

- The attention modal is positioned inside `.viewport-body`; moving the body must not break its overlay stacking (`position: relative` on the right ancestor).
- `feedPausedRef`/frame state must survive tab switches (state lives at component level — verify no unmount clears it).
- The old side-by-side CSS is shared with nothing else (`.live-feed-root`, `.matrix-log-*`, `.live-viewport-*` are run-only), but grep before deleting.
- `workspace-main` padding reduction must not affect other views (Home/Applications/etc. also use `.workspace-main`); prefer scoping the padding change to the run view (e.g. a `.run-view` class on the mount or `.workspace-main > .run-page-shell` selectors).

## 16. Rollback considerations

Renderer-only. Revert = restore `LiveLog.tsx` + `design-system.css`.

## 17. Explicit instructions and restrictions

- `IMPLEMENT ENTIRELY YOURSELF` — no Flash delegation: the restructuring is tightly coupled to the streaming event flow and the attention modal.
- **Do not copy the reference's mock data, simulated page content, fictional URLs, "60 FPS" claims, or pipeline metrics.** The reference defines structure only.
- Do not introduce new IPC, new dependencies, or new persistence. The renderer keeps consuming the same events.
- Do not modify the CDP streaming parameters (fps, quality, dimensions) — that belongs to BLUEPRINT-20261103-007/008 if ever needed.
- No version bump. No release. No installer rebuild.

## 18. Escalation conditions

- The tabbed restructure requires moving state to `App.tsx` or new props beyond the existing mount.
- Any acceptance criterion that requires changing streaming backend behaviour.
- Discovery that any other screen depends on the removed side-by-side CSS classes.
