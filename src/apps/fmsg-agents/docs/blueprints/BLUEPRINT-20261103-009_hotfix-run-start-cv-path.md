# BLUEPRINT-20261103-009 — Hotfix: Restore Run Start (cv_file_path Defect)

## 1. Task ID

`BLUEPRINT-20261103-009` → assignment `TASK-20261103-010` (proposed hotfix; execution pending founder approval).

## 2. Objective

Restore the run pipeline on released v0.10.0: remove every read of the dropped `search_profiles.cv_file_path` column, derive the CV path from the column that replaced it (`cv_variations`), and repair the CV-status predicate in the Profiles screen. Smallest safe correction — no website schema change, fully superseded by the independent-profile architecture (`BLUEPRINT-20261103-006`).

## 3. Background and problem statement

Founder priority change (2026-11-03): the `search_profiles.cv_file_path` defect affects the released v0.10.0 and reportedly prevents every automation run from starting. Verified origin: migration `supabase/migrations/009_cv_variations.sql` dropped `search_profiles.cv_file_path`; `agent-controller.ts` still selects it (`loadProfile`, line 279), so `runBatch` throws before any work happens. The same defect makes the Profiles screen's CV badge silently always "no CV" (`App.tsx:2015` reads `p.cv_file_path`, which no longer exists on rows).

## 4. Existing implementation findings (verified by inspection)

- `agent-controller.ts:279` — `loadProfile()` select includes `cv_file_path` (dropped) alongside `cv_variations` (exists). PostgREST rejects the whole query → run start fails.
- `agent-controller.ts:1261` — `attachCv()` reads `this.searchProfile?.cv_file_path || this.accountProfile?.cv_file_path` to locate the CV in the website `cv-files` bucket. `searchProfile.cv_file_path` will be undefined even after the select is fixed.
- `session-manager.ts:617` — `fetchUserAndProfilesUnderRLS` already selects `cv_variations`, so renderer profile rows carry the replacement column today.
- `App.tsx:2015` — `const hasCv = Boolean(p.cv_file_path)` — always false now.
- Migration 009 replaced `cv_file_path TEXT` with `cv_variations jsonb` (array of `{ name, file_path }`; see migration file for the exact shape).

## 5. Root cause

Schema drift: a website-side migration dropped a column while the agent's run pipeline kept referencing it. Not reintroduced by v0.10.0; the pipeline has been broken since migration 009 was applied. (The fix is interim: the independent `agent_profiles` architecture in BLUEPRINT-20261103-006 removes website-profile dependence entirely.)

## 6. Approved technical approach

Interim correction only — explicitly marked for replacement by TASK-20261103-008:

1. `loadProfile()`: remove `cv_file_path` from the select (keep `cv_variations`).
2. `attachCv()`: derive the CV path as `first existing file_path from Array.isArray(searchProfile.cv_variations) ? cv_variations : []` → fall back to `accountProfile?.cv_file_path`. Everything else (bucket `cv-files`, download, setInputFiles, mime detection) unchanged.
3. `App.tsx:2015`: `hasCv = Array.isArray(p.cv_variations) && p.cv_variations.length > 0` (row shape already carries `cv_variations` per `session-manager.ts:617`).
4. Add a one-line code comment at each site: "Interim derivation — replaced by agent_profiles (TASK-20261103-008)."

**Explicitly rejected:** re-adding `cv_file_path` to `search_profiles` (founder prohibition; the column's replacement already exists); touching website code; any new IPC/dependency.

## 7. Architecture and design decisions

- The interim keeps runs working on the website profile model they already use (website CVs in `cv-files`). 008 replaces this path with `agent_profiles` + `agent-cvs`; 008's implementation removes the interim derivation wholesale.
- Release mechanics: the change spans the main process → any release is installer-handoff (existing policy). Version/release decisions are founder-gated and NOT part of this task.

## 8. Files to inspect

- `src/apps/fmsg-agents/agent-controller.ts` (lines 268–287, 1254–1284)
- `supabase/migrations/009_cv_variations.sql` (replacement shape)
- `src/apps/fmsg-agents/renderer/App.tsx` (line ~2015)

## 9. Files permitted to modify

- `src/apps/fmsg-agents/agent-controller.ts` (the three sites only)
- `src/apps/fmsg-agents/renderer/App.tsx` (the hasCv predicate only)
- `src/apps/fmsg-agents/docs/changelog/UNRELEASED.md`

## 10. Files prohibited from modifying

- `session-manager.ts`, `electron-main.ts`, `preload.ts`, `logger.ts`
- `renderer/components/**`, `renderer/views/**`
- `package.json`, `config.ts`, `legal/*` (no version bump without separate approval)
- Supabase migrations, website code

## 11. Required implementation steps

1. Apply the three edits per §6.
2. `npx tsc -p tsconfig.json --noEmit` + `npx tsc -p tsconfig.main.json --noEmit`.
3. Run the existing main-process test suite (`npm run test:main`) and a live-run probe if a session is available; otherwise state "not run" honestly.
4. Verify the Profiles screen badge shows per-`cv_variations` (harness/probe).
5. Log `UNRELEASED.md`; file EOT. **Do not bump, build or release** — founder-gated.

## 12. Dependencies

- None.

## 13. Acceptance criteria

- [ ] `runBatch` no longer throws the `cv_file_path` error; `loadProfile` returns rows.
- [ ] `attachCv` locates the CV from `cv_variations[0].file_path` (or account fallback) and attaches as before.
- [ ] Profiles-screen CV badge reflects actual `cv_variations` presence.
- [ ] No website schema, website code, IPC surface or dependency changed.
- [ ] Interim sites carry the replacement markers for TASK-20261103-008.
- [ ] No version bump, build, release or distribution performed.

## 14. Required tests

tsc both projects; `npm run test:main`; `ui:shots`/`ui:a11y` on the Profiles screen (badge states); honest EOT statement of what was not run (live batch).

## 15. Regression risks

- `cv_variations` element shape must be verified against migration 009 (`file_path` key) — one-line check during implementation.
- Tailoring elsewhere may have its own CV reference; grep `cv_file_path` after editing — any remaining site must be removed or derived the same way (the grep is part of the task).

## 16. Rollback considerations

Three-file revert. No data or schema involved.

## 17. Explicit instructions and restrictions

- `IMPLEMENT ENTIRELY YOURSELF` — main-process run pipeline; no Flash.
- Hotfix scope only. Do not start the 008 architecture here.
- No version bump / build / release / distribution without separate founder approval.

## 18. Escalation conditions

- Any additional `cv_file_path` consumer outside the three known sites.
- `cv_variations` shape differs from migration 009.
- Any sign the failure has a second cause beyond this column drift.
