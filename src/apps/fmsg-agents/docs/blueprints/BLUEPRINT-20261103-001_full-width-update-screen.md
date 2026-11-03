# BLUEPRINT-20261103-001 — Full-Width Feature-Update Screen

- **Task ID:** `BLUEPRINT-20261103-001`
- **Author:** Gemini Argon (Director of Technology)
- **Created:** 2026-11-03T15:01:01+02:00
- **Related assignment:** `TASK-20261103-001_full-width-update-screen.md`

## 1. Objective

Rework the "New Feature Update Available" interface so it occupies the full 16:9 application viewing area and behaves like a regular application page — long update information flows naturally instead of scrolling inside a small embedded container.

## 2. Background and problem statement

Founder report: the update interface is too small; when update information is lengthy the container develops its own vertical scrollbar, producing an awkward constrained appearance.

## 3. Existing implementation findings (verified)

- `renderer/components/UpdateProgress.tsx` renders all four phases (`checking`, `downloading`, `installing`, `optional-prompt`) inside one `.update-screen-card` element. The `optional-prompt` phase renders the changelog in a `.card-nested` block with `maxHeight: '140px', overflowY: 'auto'` (lines ~226–261) — **this is the nested scrollbar**.
- `renderer/design-system.css`: `.update-screen-card` (~line 686) is `max-width: 430px; padding: 44px 40px; text-align: center` — the small centred card.
- The card sits inside `.auth-viewport` (~line 150): `position: fixed; inset: 0; overflow-y: auto; padding: 40px 24px;` with the branded radial-gradient background. `mode === 'modal'` wraps the card in `.modal-backdrop` (~line 614) instead.
- CSS ~2150–2151 has an app-frame override for `.auth-viewport` / `.modal-backdrop` — **inspect this rule before changing anything**; it affects how the screen behaves when hosted inside the main window.
- `.auth-viewport` / `.auth-card` are shared with login/auth screens — those are out of scope and must keep working.

## 4. Root cause

Two stacked constraints: the fixed `max-width: 430px` card and the changelog's fixed `maxHeight: 140px` + `overflow-y: auto`. The screen never uses the available viewport, and long changelogs are squeezed into a 140px scrollbox.

## 5. Approved technical approach

Convert **the update screen only** from a centred card into a full-width page inside the existing viewport:

1. Add a dedicated container class (e.g. `.update-screen-page`) for the update phases: `width: 100%; max-width: 1080px; margin: 0 auto; text-align: left;` with comfortable padding that scales down on smaller windows (media queries at ~1100px and ~720px).
2. Reuse `.update-screen-card`'s visual language (bg, border, radius, shadow) or drop the card chrome entirely in favour of the page layout — **decision left to Pro within the design system**, but the `.auth-viewport` branded backdrop must remain so the screen still reads as FMSG Agents.
3. **Remove** the changelog's `maxHeight`/`overflowY` inline styles; render it as a normal block so content flows and the viewport itself scrolls (`overflow-y: auto` already exists on `.auth-viewport` — verify it works under the app-frame override rules).
4. Keep all four phases' content, copy, version tags, buttons, deferred-batch logic, and handlers **unchanged**. Preserve `mode` behaviour (`startup` / `wizard` / `modal`) — for `modal` the wider layout must still fit the dialog shell without horizontal overflow.
5. Responsive: at narrow widths the header/brand row stacks and padding reduces; the changelog list must never overflow horizontally.

## 6. Architecture and design decisions

- Renderer-only change; **no** main-process, preload, or OTA-engine changes.
- Do not modify `.auth-card`, login, or onboarding styles — scope is the update screen.
- Keep the same type scale tokens; headline stays 18px display, body 13px (design-system tokens).
- Long changelogs: no inner scrolling — page scroll only.

## 7. Files to inspect

- `renderer/components/UpdateProgress.tsx`
- `renderer/design-system.css` (`.update-screen-card`, `.auth-viewport`, `.modal-backdrop`, `.card-nested`, the app-frame overrides ~2150)

## 8. Files permitted to modify

- `renderer/components/UpdateProgress.tsx`
- `renderer/design-system.css`

## 9. Files prohibited from modifying

Everything else, in particular: `update-manager.ts`, `electron-main.ts`, `preload.ts`, `App.tsx`, `components/LiveLog.tsx`, `config.ts`.

## 10. Required implementation steps

1. Inspect the files listed in §7; verify the app-frame override rules (~CSS 2150) and where `UpdateProgress` is mounted (search `App.tsx`/`electron-main` usage of `mode`).
2. Introduce the page container class and restructure `UpdateProgress`'s outer markup for update phases.
3. Remove the changelog scrollbox; make it flow.
4. Add responsive rules; verify the `modal` variant has no horizontal overflow.
5. Verify all four phases render correctly with the new layout (short and long changelogs).
6. Build + typecheck (§12), then report via EOT.

## 11. Dependencies

None. Independent of the other two workstreams.

## 12. Acceptance criteria

- The update screen occupies the full 16:9 viewing area like a normal app page; no 430px card, no nested vertical scrollbar.
- A long changelog (20+ bullets) reads naturally with page-level scrolling.
- Layout remains usable at 1360×860 and at smaller windows (≥1024×700) without horizontal overflow.
- All four phases preserve content, copy, buttons, deferred logic, and interactions.
- Visual consistency with the rest of FMSG Agents (brand backdrop, tokens, buttons).
- Login/onboarding screens are visually unchanged.

## 13. Required tests

- `npx tsc -p tsconfig.json --noEmit` and `npx tsc -p tsconfig.main.json --noEmit` — clean.
- `npm run build:renderer` — succeeds; bundle size sane.
- Manual visual verification of every phase with a long changelog at 1360×860 and 1024×700 (dev run or packaged build). Screenshot-harness lesson: confirm findings in CSS pixels before changing code (`docs/context/fmsg-agents-visual-fidelity_2026-11-03.md`, "Screenshot harness lessons").

## 14. Regression risks

- `.auth-viewport` shared with auth screens — keep changes scoped to update-screen markup/classes.
- App-frame override rules could clip the wider layout — verify inside the real window, not just a dev preview.

## 15. Rollback considerations

Renderer-only, CSS + one component: revert the two files to restore prior behaviour; no data or state involved.

## 16. Explicit instructions and restrictions

- `MAY DELEGATE TO FLASH`: isolated, well-defined sub-edits inside `design-system.css` (e.g. adding the responsive media-query block) may be delegated to Flash **only after Pro has defined the exact class names and rules**; the component restructure in `UpdateProgress.tsx` stays with Pro. Each Flash sub-task needs its own assignment file in `logs/EOT/deepseekflashdelegation/` and a Flash EOT.
- Do not touch any file outside §8.
- Preserve existing update content/functionality — this is layout, not a feature change.

## 17. Escalation conditions

- The app-frame override rules conflict with a full-width layout in a way that needs an architectural decision → escalate to Argon.
- Any change would require touching `update-manager.ts` or the OTA flow → stop and escalate.
