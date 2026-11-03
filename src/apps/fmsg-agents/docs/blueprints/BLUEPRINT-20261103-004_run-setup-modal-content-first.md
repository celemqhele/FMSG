# BLUEPRINT-20261103-004 — Run Setup Modal: Content-First Redesign

## 1. Task ID

`BLUEPRINT-20261103-004` → assignment `TASK-20261103-005`.

## 2. Objective

Rebuild the Configure Application Run modal ("Run Setup", Sheet Screen #6) so its layout is derived from the space its contents genuinely need, not the reverse. End state: a generously sized two-column modal (7/12 controls, 5/12 cost summary), comfortable internal spacing, no nested scrollbars, and unchanged business logic.

## 3. Background and problem statement

Founder request "FMSG AGENTS — RUN SETUP INTERFACE REDESIGN" (2026-11-03): the modal is visually cramped. The founder's stated principle is content-first sizing — design component arrangement and spacing first, then size the container — and explicitly prohibits solving it by shrinking fonts, controls, or spacing. Reference implementation supplied by the founder: `C:\Users\mqhel\Downloads\configure_application_run_modal.tsx` (Tailwind mock; demonstration data is illustrative only and must not be copied).

Screenshot inspection note: the founder's screenshot `Screenshot 2026-11-03 173816.png` could not be visually inspected in the reviewing session (no image input available). This diagnosis is therefore derived from the written requirements, the founder's reference component, and direct code inspection. Any acceptance-criterion conflict between the screenshot and the written spec must be escalated rather than guessed.

## 4. Existing implementation findings (verified by inspection)

- Modal JSX: `renderer/App.tsx` lines 1515–1763. Structure: `.modal-backdrop.content-modal` → `.modal-card.run-setup-modal` → `.run-setup-header` / `.modal-shell-body` → `.run-setup-grid` (three columns) / `.modal-shell-footer.run-setup-footer`.
- CSS: `renderer/design-system.css` — `.modal-card` base (line 625), `.run-setup-*` (lines 3635–3802), responsive run-setup block (lines 4592–4628), `.modal-card.run-setup-modal` (line 5512), `.run-setup-footer` (line 5526).
- The modal is **740px wide** (`.modal-card.run-setup-modal { max-width: 740px }`) — the founder's reference starts at ~896px (Tailwind `max-w-4xl`).
- The grid is **three columns** `1fr 1.35fr 1fr` with 14px gaps: profile list | batch/autonomy/slider | cost box. The founder's reference is **two columns** 7/12 + 5/12 with the profile selector as a dropdown at the top of the left column.
- `.autonomy-mode-grid` is `repeat(3, 1fr)` inside the middle column → each autonomy card gets ≈90px width at 740px modal width, with 8px padding and 12px text → compressed, wrapping cards.
- `.run-setup-profile-list { max-height: 220px; overflow-y: auto }` → a nested scrollbar inside a modal whose body already scrolls (`modal-shell-body { overflow-y: auto }`). The responsive block further squeezes it to 150px.
- Padding/gap language throughout is small: 8–10px card padding, 6px gaps, 12px text everywhere.
- Business logic (verified present and to be preserved): `batchSize` (10/25/50/100 presets), `autonomyMode` (`full-auto`/`approve-each`/`aggressive` persisted via `saveAgentPrefs`), `dailyCapApps` slider 1–100, `costCap` (R0 default), `billingMode`/`bundleTier`, `perAppRateZar`, cost math `Math.min(batchSize, dailyCapApps) * perAppRateZar`, `handleLaunchAgentBatch`, Stop-in-footer while running, Escape/backdrop close, `role="dialog"` + `aria-labelledby="run-setup-title"`.

## 5. Root cause

Container-first sizing. A 740px, three-column box was defined first and every component was forced inside it: the profile list got a 220px scroll box, the autonomy cards got ~90px columns, and 8px paddings became the norm. The founder's reference sizes the container from the content (896px, 7/12–5/12 columns, 16–20px paddings, 12px+ text) — the current modal has the same components but in a third of the room.

## 6. Approved technical approach

Rebuild the modal interior as a **two-column, 7/12 + 5/12** arrangement at ≥1024px, stacking below that, inside a **min(94%, 896px)** modal with **max-height 92vh**:

1. **Header** (unchanged shell): `RUN SETUP` eyebrow + "Configure Application Run" + close control. Keep `run-setup-title` id for ARIA.
2. **Body** scrolls at `.modal-shell-body` level only. No component-level `overflow-y` except the profile dropdown menu (bounded list of many items is the one legitimate menu scroll) — and prefer raising the modal height instead of shrinking the list.
3. **Left column (7/12)**: Target Profile (dropdown selector, not a list — trigger with 40px avatar, name, CV status badge if derivable from profile data, role line; menu rows with checkmark, max-height ~260px menu scroll) → Batch size (segmented 4-preset control, reuse `.batch-preset-grid`/`.batch-preset-btn`) → Autonomy mode (3 cards, icons optional, `title` + `desc`, min-height consistent) → Daily cap slider box.
4. **Right column (5/12)**: dedicated Estimated Cost Breakdown card — application quantity hero number, rate per application, billing mode, spend cap, divider, estimated total, execution-limit note ("Execution will cap at limit R{spendCap}"). Card stretches to match the left column height.
5. **Footer** (persistent, unchanged shell): Run total + capped-at note, Cancel, Start (N) (plus Stop when running — preserve).
6. **Spacing language**: body padding 20px+, column gap 20–24px, section gaps 16px+, card padding 14–16px, control heights ≥40px, labels 13px semibold, values readable. Do not shrink text below the design system's 12px floor.
7. **Responsive**: at <1024px stack the columns (cost box moves below, rendered as a 2-column stat grid per the existing media-query pattern); at very narrow widths the autonomy cards stack vertically.

All state, handlers, persistence calls, validation, cost math, and the launch handler stay byte-identical. This is a presentation redesign; the only JSX logic changes allowed are the ones needed to restructure layout (e.g. profile dropdown open/close state local to the modal).

## 7. Architecture and design decisions

- The profile selector must keep using the real `profiles` array and `selectedProfileId` from `App.tsx` state; it must not introduce its own data source.
- CV status badge: derive from the same predicate the Profiles screen uses (`Boolean(p.cv_file_path)` at `App.tsx:2015` — note: this predicate is currently always-false due to migration 009; see BLUEPRINT-20261103-006 which fixes CV status for real. Do not fix it here; just display what the predicate gives, or omit the badge if BLUEPRINT-006 lands first and changes the predicate).
- No new dependencies. No new files required; the modal stays in `App.tsx` with CSS in `design-system.css`. If `App.tsx` growth becomes unwieldy, extracting `RunSetupModal` into `renderer/components/RunSetupModal.tsx` is permitted **only if** it is a pure move of the existing JSX (no logic changes) and the extract does not alter props/state flow. Prefer not extracting to keep the diff reviewable.
- Design tokens: use the existing token variables where they exist (`--radius-*`, `--border-*`, `--bg-card`), hardcode only what the current file already hardcodes.

## 8. Files to inspect

- `src/apps/fmsg-agents/renderer/App.tsx` (lines 1515–1763)
- `src/apps/fmsg-agents/renderer/design-system.css` (lines 618–635, 3635–3802, 4592–4628, 4688–4726, 5511–5554)
- Founder reference (read-only): `C:\Users\mqhel\Downloads\configure_application_run_modal.tsx`
- `src/apps/fmsg-agents/renderer/components/LiveLog.tsx` (ProfilePicker pattern, if reusing its dropdown structure)

## 9. Files permitted to modify

- `src/apps/fmsg-agents/renderer/App.tsx` (Run Setup modal JSX block only)
- `src/apps/fmsg-agents/renderer/design-system.css` (run-setup and modal-shell-adjacent rules only)
- `src/apps/fmsg-agents/docs/changelog/UNRELEASED.md` (mandatory same-commit log)

## 10. Files prohibited from modifying

- `src/apps/fmsg-agents/agent-controller.ts`, `electron-main.ts`, `preload.ts`, `logger.ts`
- Any `renderer/views/*`, `renderer/components/*` other than the permitted list
- `package.json`, `config.ts`, legal docs (no version bump — explicitly prohibited by the founder request)
- Supabase migrations, website code (`src/app/**`, `src/components/**`)

## 11. Required implementation steps

1. Read the blueprint files and the founder reference.
2. Capture a before-state (build and open the modal, or `npm run ui:shots`).
3. Rewrite the modal JSX interior to the two-column structure (header/body/footer preserved).
4. Update `.run-setup-*` CSS: new width/height envelope, two-column grid, spacing language, dropdown selector styles, cost card styles, stacked responsive rules.
5. Delete the `.run-setup-profile-list` nested-scroll and the three-column grid rules that no longer apply (keep only what the new structure uses; remove dead selectors rather than leaving conflicting duplicates — see the `.modal-backdrop` duplicate-cascade lesson in `src/apps/fmsg-agents/docs/context/fmsg-agents-feature-update-three-workstreams_2026-11-03.md`).
6. Verify state persistence and cost math unchanged (compare rendered values before/after).
7. Run the validation matrix (§13).
8. Log in `UNRELEASED.md`; file EOT.

## 12. Dependencies

- None. (`TASK-20261103-008` may later change the CV badge predicate; design the badge display to be predicate-driven, not hardcoded.)

## 13. Acceptance criteria

- [ ] Modal is ~896px wide (or as wide as its content needs, up to a sane cap) with max-height ~92vh.
- [ ] Two-column layout (7/12 left controls, 5/12 right cost card) at ≥1024px; columns stack naturally below.
- [ ] No nested scrollbars: the modal body is the only scroll region (profile dropdown menu excepted).
- [ ] No component is compressed: autonomy cards are readable at full width, controls ≥40px tall, card padding ≥12px, no label/value collisions.
- [ ] Header (eyebrow, title, close) and persistent footer (run total, capped-at, Cancel, Start/Stop) remain visible while the body scrolls.
- [ ] Cost summary clearly shows application quantity, rate per application, billing mode, spend cap and estimated total, and is prominent without overpowering the controls.
- [ ] Functional preservation: batch presets, autonomy persistence, daily cap, cost math, launch handler, Stop-when-running, Esc/backdrop close, ARIA labels all behave exactly as before.
- [ ] Responsive at 1360×860, 1024×700, 960×640, and a narrower width: no clipping, no horizontal overflow, footer reachable.
- [ ] No version bump, no installer rebuild, no release.

## 14. Required tests

- `npx tsc -p tsconfig.json --noEmit` and `npx tsc -p tsconfig.main.json --noEmit` clean.
- `npm run ui:shots -- --size 960,1024,1280,1360` — 0 tiny-text, 0 clipped, 0 horizontal overflow; modal operable at every size (close reachable, Start reachable).
- `npm run ui:a11y` (axe) on the modal states: 0 violations.
- Manual (or harness) functional check: change batch → footer total updates; change autonomy → persisted value; drag slider → cap math updates; Start launches the batch (or, in a probe, the launch handler fires).
- Before/after evidence: screenshots of the modal at 1280×720 and 1024×700.

## 15. Regression risks

- Removing the three-column rules may leave orphan selectors referenced by other screens (grep `.run-setup-` before deleting).
- The `.modal-card` base (max-width 440px, padding 28px) is shared with every popup — the run-setup override at line 5512 must win (specificity order matters; the override already exists and must be updated, not duplicated).
- Responsive block (4592–4628) currently re-lays the three-column grid; it must be rewritten for the two-column structure or it will fight the new base rules.

## 16. Rollback considerations

All changes are renderer-only CSS/JSX; revert = restore the two files. No data or state migration involved.

## 17. Explicit instructions and restrictions

- Delegation (per Argon's 2026-11-03 corrective-directive review): the JSX restructure, state wiring and integration remain with Pro. The isolated CSS implementation phase (`.run-setup-*` rules against Pro's class contract) **may be delegated to Flash** within the boundaries recorded in the assignment file. Delegation is optional.
- **Do not copy the reference's hardcoded data**: no fixed profiles array, no R40/R160/R52 values, no `alert()` handler, no Tailwind classes. The reference defines structure and spacing only.
- Do not change cost/billing math or validation behaviour. If a functional defect is noticed (e.g. wrong cost), document it in the EOT and do not silently "fix" it.
- No version bump. No release. No installer rebuild.

## 18. Escalation conditions

- Any conflict between the written spec and the founder's screenshot (which was not inspectable) that cannot be resolved from the reference component.
- Any need to modify a prohibited file (e.g. the CV badge needing profile data the current shape does not carry).
- A discovered functional defect in cost/validation logic (report, don't fix).
