# Persistent Finder 4-round plan with 2-rung title + industry ladders

- **Category:** search-pipeline
- **Incident date:** 2026-10-26
- **Status:** Shipped to `production` (commit `9ecfdc7`), data backfill applied
- **Source session:** `.opencode/session-context/sessions/pf-4-round-ladder_2026-10-26_20-08-09_INCOMPLETE.json`

Persistent Finder (PF) now runs **4 rounds instead of 5**, driven by a declarative `PF_ROUND_PLAN` instead of two positionally-paired 5-element arrays, and both career ladders are **2 rungs deep** (title: main + secondary; industry: niche + main industry). The user asked for the trim after noticing that a 5-rung ladder forced a 5-round walk that a single request could rarely finish — rounds 3-5 existed mostly to consume deeper ladder rungs — and that "industry off" widening was never reachable. This file records the round plan, the ladder trim, the profile backfill, and the harness gotchas hit while applying it.

## Problem

- `MAX_ROUNDS = 5` and `titleChainSteps[i]` / `industryChain[i]` were paired **by index**: round *i* always used title rung *i* with industry rung *i*. That coupling meant the ladder depth *had* to equal the round count, so you could not ask for "same title, no industry keyword" without inventing a 6th rung.
- The 5-rung industry ladder (`industry_step_1..5`) was a slow broadening walk (hyper-niche → niche → sub-sector → industry → broad sector) where consecutive rungs were frequently near-duplicates (`Technology → Technology`). Rounds built from those rungs returned the same postings, which the dedupe layer then dropped — billable queries that produced nothing.
- Onboarding/profile editors exposed all 5 industry steps and an unbounded "+ Add another title", so most profiles carried 3-5 titles and 5 industry steps that no longer made sense to search.

## Decision

The user chose a **4-round plan** with the industry keyword **on for rounds 1-2 and off for rounds 3-4**, and **2 rungs per ladder** (full trim — generator, prompts, onboarding, both profile editors). Industry rungs = **step 1 + step 2** (niche, then main industry). PF-only: normal (non-PF) searches get no on/off alternation.

Round plan (declared as `PF_ROUND_PLAN` in `src/app/api/search/route.ts`):

| Round | Title rung | Industry |
|-------|-----------|----------|
| R1 | main (`job_titles[0]`) | `industry_step_1` (niche) |
| R2 | secondary (`job_titles[1]`) | `industry_step_2` (main industry) |
| R3 | main | **— keyword removed** |
| R4 | secondary | **— keyword removed** |

Query is still `[buildOrQuery(titles), buildIndustryQuery(industry), "jobs"].filter(Boolean).join(" ")` from `src/lib/search-query.ts`, so an empty industry simply drops that token.

## Fix

**`src/lib/career-ladders.ts`** — `IndustryLadderSteps` is now `step_1`/`step_2` (+ taxonomy ids). Both prompts (taxonomy-branch and knowledge-fallback) rewritten as a 2-step "functional niche → main industry" ladder; step 2 must be *meaningfully broader*, never a near-duplicate. Parse clamp changed to `idx <= 2`; the error fallback fills both rungs with the single concept.

**`src/app/api/suggest-industry-ladder/route.ts`** — returns 2 steps (`industry_step_3/4/5` no longer echoed).

**`src/app/api/extract-cv/route.ts`** — `job_titles` prompt asks for exactly 2 titles (main + ONE lateral move at the same seniority band); examples trimmed to 2 entries. Consequence: the AI raw-job title filter and scoring context now see a 2-title ladder, so recall is intentionally tighter.

**`src/app/api/search/route.ts`**
- `SEARCH_PROFILE_COLUMNS` reduced to `industry_step_1, industry_step_2`; both profile load paths slice `job_titles` to 2 and read only rungs 1-2 into `state.industryStep1/2`.
- PF block replaced with `PF_ROUND_PLAN`; `MAX_ROUNDS = PF_ROUND_PLAN.length`; `industryChain` has 2 entries; `startRoundIndex` is clamped to `MAX_ROUNDS` so an in-flight token carrying `nextRoundIndex: 4` is safe.
- Per-round resolution: `titles = pfTitles[plan.title] ? [that] : [...pfTitles]`; `industry = plan.industry == null ? "" : (industryChain[plan.industry] || pfIndustry || "")`.
- **`usedQueries` now travels in the continuation token** (`usedQueries: [...usedQueries]`, rehydrated on resume) — a resumed round whose query is byte-identical cannot re-run and re-bill. This is what makes R2-vs-R1 collisions (single-title profiles, identical industry rungs) safe: the round is skipped with a `[PF] Round N: skipping duplicate query` debug line.
- Both pause-token payloads drop `titleChainSteps` (nothing positional to restore any more).

**UI trim** — `src/components/onboarding/onboarding-form.tsx`, `src/components/dashboard/profile-onboarding-modal.tsx`, `src/components/dashboard/mobile/mobile-profile-onboarding-sheet.tsx`: steps 3-5 state/select/fill/save removed, 2-rung industry UI ("Step 1: Niche" / "Step 2: Main Industry"), `MAX_JOB_TITLES = 2` with the add-button hidden at 2 and saves sliced to 2. `src/components/dashboard/pf-promo-popup.tsx` and `src/components/dashboard/mobile/mobile-pf-promo-popup.tsx` copy rewritten from "all 5 job titles and all 5 industry steps" to "both of your job titles and both industry rungs … then repeats both titles with the industry keyword removed".

**DB:** no DDL. `industry_step_3/4/5` remain as dead, nullable columns (nothing reads or writes them). Dropping them was deliberately deferred.

## Profile backfill

Existing profiles stored the *main industry* in `industry_step_4` (the old ladder's broad rung), so trimming to 2 rungs would have left `industry_step_2` holding a mid-walk value (e.g. `Wealth Management`) instead of the broad sector. Backfill:

```sql
UPDATE public.search_profiles
   SET industry_step_2 = industry_step_4
 WHERE industry_step_2 IS DISTINCT FROM industry_step_4
   AND industry_step_4 IS NOT NULL;
```

Applied 2026-10-26 via the service-role key + `curl.exe` PATCH (PostgREST cannot copy column→column, so the harness read all rows and PATCHed the 27 differing ones by `id`). Verified 0 mismatches, 28 rows with a ladder. Rollback data: `recycle_bin/pf_all.json` (pre-change dump of all rows) and `recycle_bin/pf_before.json` / `recycle_bin/pf_current.json`. Harness: `recycle_bin/backfill_industry_step2.ps1`.

Two inherited values are odd because the *old* ladder was already inconsistent — `Health Safety and Environment → Corporate Governance and Operations` and `Software Development → Telecommunications`. Backfilled mechanically; users can edit either rung.

## Verification (2026-10-26)

- `npx tsc --noEmit` clean.
- eslint on the 9 changed files: 7 findings, all pre-existing (baseline in `recycle_bin/eslint-out.json` had 9 — the 2 lost were the removed industry-step suggestion effect in `onboarding-form.tsx`).
- `npm run build` succeeded (all routes compiled, `/jobs/[category]` still SSG'd).
- Backfill verified 27/27 patched, `still-mismatched=0`.

## Gotchas / traps hit

- **PowerShell `"$base?select=..."` silently breaks the URL.** In a double-quoted string, `$base?select` is parsed as a variable named `base?select` (empty), so `curl.exe` received `=id,...` and returned HTTP **000** with no body. Use `"${base}?select=..."`. The interactive one-liners worked only because the URL was fully literal — the failure appeared for the first time in the script form; always brace the variable before a `?`.
- PostgREST cannot express `SET col_a = col_b`; use a read-then-PATCH loop, or the dashboard SQL editor / Management API for real SQL.
- Old continuation tokens in flight at deploy time may carry `nextRoundIndex: 4` and step 3-5 fields; the clamp plus ignoring unknown fields makes them safe (worst case: a resume starts at the last round, or falls back to `pfIndustry`).

## Open risk

R3/R4 re-issue R1/R2's titles **without** the industry keyword. Postings that already matched R1/R2 are dropped by `seenUrls`/history dedupe/spec fingerprints, so R3/R4 only pay off if the industry keyword was the binding constraint. If Vercel logs show R3/R4 returning nothing extra, swap R4 to `title: 2` (a third title rung) instead of repeating the secondary title.

## Related files

- Round loop, pause/resume tokens and the 240s deadline plumbing this sits inside: `.opencode/context/search-pipeline/pf-deadline-awareness-round-pauses_2026-08-09.md`
- Streaming/SSE shape of the `pf_round` status events: `.opencode/context/search-pipeline/streaming-search-pipeline_2026-10-18.md`
- Profile persistence + ladder columns: `.opencode/context/search-pipeline/search-profile-fixes_2026-08-08.md`
- Location scope/ladder columns loaded alongside the industry rungs: `.opencode/context/search-pipeline/location-scope-filter_2026-10-18.md`
- `curl.exe` + service-role PATCH workflow used for the backfill: `.opencode/context/supabase-access/supabase-direct-access_2026-10-17.md`
