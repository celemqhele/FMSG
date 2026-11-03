# BLUEPRINT-20261103-002 — Profiles: Centred SaaS Profile Cards & Bottom-Right Profile Component

- **Task ID:** `BLUEPRINT-20261103-002`
- **Author:** Gemini Argon (Director of Technology)
- **Created:** 2026-11-03T15:01:01+02:00
- **Related assignment:** `TASK-20261103-002_profile-cards-saas-redesign.md`

## 1. Objective

Redesign the Profiles-section cards and the bottom-right profile component into a clean, centred, SaaS-style presentation: large circular initials avatar, name, subtle CV status, and a visually separated action area — while removing redundant career metadata from the cards. Presentation-layer only; no data changes.

## 2. Background and problem statement

Founder report: the cards under the Profiles section look unsatisfactory and the bottom-right profile component looks incorrect. The founder supplied an AI-generated reference image and a written clarification. **The written clarification is the authoritative specification** (quoted in §5 below); the reference image guides visual treatment. Argon could not process the image directly (no image input in the coordinating environment); the human may relay a text transcription of the image as a design delta, which Pro must fold in only where it does not contradict this clarification.

## 3. Existing implementation findings (verified)

- **Profiles screen** — `renderer/App.tsx`, `ProfilesAndRulesView` (~lines 1889–2077): `.profiles-card-grid` of `.profile-grid-card` buttons. Each card: small left-aligned 2-initial avatar (`.profile-grid-avatar`), body with name + `tag` ("✓ Active" / "Select"), roles line (up to 3 `job_titles`), meta line (`industry · location`), facts row (expected salary, CV status). Plus a `create-new` card that opens the FMSG dashboard.
- Selection model: single-select via `onSelect(p.id)`; `selectedProfileId` state in `App.tsx`; `aria-pressed` on the card. **Preserve this logic.**
- **Run Setup** has a separate `.run-setup-profile-card` list (small left avatar + name + first title) — a different component; not the founder's target unless the reference image shows otherwise.
- **Bottom-right profile component candidates (verified):** (a) `ProfilePicker` in the Run page header controls (`renderer/components/LiveLog.tsx` ~122–230, rendered ~521–529) — trigger chip with dot, name · title, chevron, dropdown menu listing name — title + location; (b) sidebar footer user chip (`App.tsx` ~1271–1316) — email + plan, bottom-**left** of the sidebar. The founder's "bottom-right" most plausibly refers to (a) or to a profile affordance visible on the Profiles/Run screens; **Pro must identify the exact component from the human's image transcription if supplied, and treat (a) as the default target.**
- CSS: `.profiles-card-grid`, `.profile-grid-card`, `.profile-grid-avatar`, `.profile-grid-body`, `.profile-grid-top`, `.profile-grid-roles`, `.profile-grid-meta`, `.profile-grid-facts`, `.profile-cv-ok`, `.profile-cv-missing`, `.profile-picker*` — all in `renderer/design-system.css`.

## 4. Root cause

Information overload: dense text-heavy cards (roles + industry + location + salary compete with identity), small left-aligned avatars, and selection controls disconnected from card content. The founder's clarification defines the fix direction.

## 5. Approved technical approach (authoritative clarification)

Adopt a clean, centred SaaS-style profile-card design with the visual hierarchy:

**Avatar → Name → CV status → Action controls**

1. **Avatar:** large circular avatar displaying profile initials (e.g. 2 initials), centred horizontally near the top; primary visual focal point.
2. **Name:** profile owner's name clearly displayed under the avatar with appropriate font weight.
3. **CV status:** subtle status indicator beneath the name ("No CV on file" where applicable; "CV attached" otherwise).
4. **Action area:** visually separated bottom section (e.g. divider + padded footer) containing the selection controls.

**Remove from the cards:** career roles/job titles, locations, company types/industry, expected salary, and other redundant career metadata. Do **not** delete or modify underlying profile data or DB records — presentation only.

**Selection states:** selected profile shows a distinct green **Active Profile** pill; other profiles show clear **Active** / **Select** controls per the existing interaction model. Do not introduce contradictory or duplicate selection states — inspect the actual state logic first (`selectedProfileId`).

**Design objective:** minimal, balanced, visually consistent, easy to scan, differentiated by profile identity. No functionality or accessibility sacrifice.

**Component alignment:** the bottom-right profile component must be brought in line with the same visual language (avatar-led identity, clear name, unobtrusive metadata, clear selection state). If the human's image transcription identifies a different component, Pro must match the transcription and record the identification in the EOT.

## 6. Architecture and design decisions

- Renderer-only. No IPC, preload, main-process, or data changes.
- Keep the card as a `<button>` with `aria-pressed` (accessibility and selection preserved).
- Keep the `create-new` card; restyle to match the new card language (centred avatar + label + hint).
- Use existing design-system tokens (radius, borders, spacing scale, green success token for the Active pill). Add new profile-card classes rather than overloading generic ones.
- The Run Setup list (`.run-setup-profile-card`) stays unchanged unless it is confirmed to be the founder's target.

## 7. Files to inspect

- `renderer/App.tsx` — `ProfilesAndRulesView` (~1889–2077), `selectedProfileId` handling (~1128, 1416–1490).
- `renderer/components/LiveLog.tsx` — `ProfilePicker` (~122–230) and its usage (~521–529).
- `renderer/design-system.css` — all `.profile-grid-*` and `.profile-picker*` rules.

## 8. Files permitted to modify

- `renderer/App.tsx` (ProfilesAndRulesView card markup only)
- `renderer/components/LiveLog.tsx` (ProfilePicker markup/styles only — for the bottom-right component alignment)
- `renderer/design-system.css`

## 9. Files prohibited from modifying

Everything else — in particular `preload.ts`, `electron-main.ts`, `agent-controller.ts`, `config.ts`, `components/SettingsPanel.tsx`, and any data-loading logic (`loadProfiles` IPC call sites).

## 10. Required implementation steps

1. Inspect §7 files; read the authoritative clarification in §5 again.
2. Identify the bottom-right profile component definitively (human transcription if available; default = Run-page `ProfilePicker`).
3. Restructure `.profile-grid-card` markup: centred large avatar → name → CV status → separated action footer with the green Active Profile pill / Active / Select controls.
4. Remove career metadata from the cards (keep CV status only).
5. Restyle the `create-new` card consistently.
6. Align the bottom-right component's presentation with the same identity hierarchy; preserve its dropdown behaviour.
7. Add/adjust CSS with responsive grid rules (card grid must stay usable at 1360×860 and below).
8. Typecheck + build + visual verification (§12).

## 11. Dependencies

None technical. Optional input: the human's text transcription of the reference image (design delta).

## 12. Acceptance criteria

- Cards follow Avatar → Name → CV status → Action controls with centred layout.
- Career roles, locations, company types, and salary are gone from the card presentation.
- Selected card shows a distinct green **Active Profile** pill; other cards show Active/Select controls; single-selection behaviour unchanged; no duplicate/contradictory states.
- Bottom-right profile component visually aligned; functionality intact.
- Responsive behaviour maintained; accessibility preserved (`aria-pressed`, contrast, 11px minimum text).
- Profile data untouched (list, selection, refresh, create/edit card link all work).

## 13. Required tests

- `npx tsc -p tsconfig.json --noEmit` and `npx tsc -p tsconfig.main.json --noEmit` — clean.
- `npm run build:renderer` — succeeds.
- Manual/visual verification on the Profiles screen: select/deselect across cards; confirm Refresh and Create/Edit still work; check at 1360×860 and a narrower window.

## 14. Regression risks

- Changing `ProfilePicker` could break the Run-page profile switch — verify dropdown open/select/Escape/outside-click still work.
- Card markup restructure must keep `onClick`/`aria-pressed` wiring.

## 15. Rollback considerations

Renderer-only; revert the three files to restore the previous presentation. No data migration.

## 16. Explicit instructions and restrictions

- `IMPLEMENT ENTIRELY YOURSELF` — design-sensitive, needs one coherent visual system across two components; do not delegate to Flash.
- Written clarification governs; the reference image (via human transcription) only guides.
- Do not remove profile data fields, DB records, or any non-presentational logic.

## 17. Escalation conditions

- The human's image transcription contradicts this clarification → escalate to Argon before changing design direction.
- The "bottom-right component" turns out to be a component outside the permitted files → escalate with evidence.
- Selection-state logic is more complex than single-select (e.g. hidden multi-select states) → escalate.
