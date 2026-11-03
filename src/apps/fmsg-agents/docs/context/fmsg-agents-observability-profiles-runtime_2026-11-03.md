# FMSG Agents — Observability, Independent Profiles & Ubuntu Runtime (investigation 2026-11-03)

Investigated the founder's four 2026-11-03 requests (Run Setup modal redesign, Run workspace space utilisation, independent agent profiles/CV, live-preview + Ubuntu runtime) and produced five blueprints (`BLUEPRINT-20261103-004..008` in `docs/blueprints/`) and five `PENDING` Pro assignments (`TASK-20261103-005..009` in `logs/EOT/deepseekprodelegation/`). This file records the verified root causes; it follows the earlier feature-update work in `src/apps/fmsg-agents/docs/context/fmsg-agents-feature-update-three-workstreams_2026-11-03.md` (screencast ACK rules, E-003-A closure) and extends it with the four new diagnoses.

## Root cause 1 — Run Setup modal is cramped (container-first sizing)

The modal was sized before its content: `.modal-card.run-setup-modal { max-width: 740px }` with a **three**-column grid (`1fr 1.35fr 1fr`), forcing the autonomy cards into ~90px columns, the profile list into a 220px `overflow-y: auto` scrollbox (nested inside a body that already scrolls), and 8–10px paddings throughout. The founder's reference is ~896px (`max-w-4xl`), two columns 7/12 + 5/12, dropdown profile selector, 92vh max height. Fix direction: `BLUEPRINT-20261103-004` — content-first two-column rebuild, body-level scrolling only, no logic changes.

## Root cause 2 — Run workspace wastes the bottom half and demotes the preview

- `.workspace-main` (flex column, `overflow-y: auto`) contains `.run-page-shell` which has `width: 100%; min-height: 0` but **no `flex: 1`/height** → the whole run page is content-height and the empty lower half of the screen is unused workspace space.
- `.matrix-log-column { flex: 0 0 40%; max-width: 42% }` permanently gives 40% of the width to the activity log; the preview gets ~58% in a side-by-side split (the founder reference is a tabbed workspace with a full-canvas preview).
- `.viewport-shot { object-fit: contain; object-position: top center }` pins the 16:9 image to the top of a taller monitor → dark dead space below it.
Fix direction: `BLUEPRINT-20261103-005` — tabbed workspace (Preview | Pipeline | History), compact header/toolbar, full-canvas centred preview, `flex`/`min-height: 0` chain fixed at every level, runtime-agnostic canvas.

## Root cause 3 — Live preview does not follow the active page

`agent-controller.ts` models "one page per run": `this.page` is set once at launch, `startScreencast()` attaches `newCDPSession(this.page)` once, and there is **no `context.on('page')` handler** — so tabs/popups opened by job sites are never tracked, `currentHost()` reads the original page's URL, and `placeAutomationWindowBehindApp()`/`focusAutomationBrowser()` pick the **first** page target (wrong tab for "Open in Chrome"). Fix direction: `BLUEPRINT-20261103-007` — active-page tracking, promotion on new page/navigation, stop/start screencast re-attach with race guards, close fallback, active-target window commands.

## Root cause 4 — `column search_profiles.cv_file_path does not exist` and agent profiles

Migration `supabase/migrations/009_cv_variations.sql` **dropped** `search_profiles.cv_file_path` (replaced by `cv_variations` jsonb). `agent-controller.ts:279` (`loadProfile`) still selects the dropped column → every run start errors. `App.tsx:2015` (`hasCv`) reads the same dropped column → CV status silently always false. The fix is architectural, not a column re-add: `BLUEPRINT-20261103-006` — new `agent_profiles` table (name, target_job_title, CV metadata; RLS `auth.uid() = user_id`; **must** include `GRANT ALL ... TO anon, authenticated, service_role` per the Oct-30-2026 PostgREST change), private `agent-cvs` bucket with `<user_id>/<profile_id>/<uuid>.<ext>` paths, three-input creation flow, original-file CV usage for tailoring + attachments, run validation gate. Website tables/objects untouched.

## Root cause 5 — no isolated runtime exists (strategic gap, not a defect)

Current runtime = external Windows Chrome + CDP screencast. The founder's vision (watch the agent operate a real computer) may warrant an FMSG-managed Ubuntu VM runtime. `BLUEPRINT-20261103-008` stages this: Phase 1 read-only host capability detection → founder approval gate → Phase 2 measured prototype (options A–D, same-session proof, full measurement matrix) → Phase 3 custom-appliance assessment + recommendation. **No host-level changes without founder approval; no production replacement yet.**

## Process notes

- The founder's modal screenshot could not be visually inspected in the authoring session (no image input). Diagnoses for the modal/workspace therefore rest on the written spec, the founder's reference components (`C:\Users\mqhel\Downloads\configure_application_run_modal.tsx`, `fmsg_agents_workspace.tsx`) and code inspection; blueprint 004's escalation conditions cover any spec/screenshot conflict.
- No release, version bump or installer rebuild is authorised for any of the five tasks. At release time: renderer-only tasks (005/006) would be a renderer OTA; 007 and 008 touch the main process (installer-handoff); 008 additionally requires the founder-applied migration.
- DDL application for migration 040 is a **founder step** (Supabase dashboard SQL editor, one statement at a time, verify with SELECT — per the root `AGENTS.md` Supabase rules and the PostgREST stale-schema-cache trap documented in `.opencode/context/supabase-access/supabase-direct-access_2026-10-17.md`).
