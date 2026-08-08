<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Context

- **Project:** FMSG (Find Me Some Jobs) — AI-powered South African job matching SaaS
- **Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase, Paystack, SerpAPI
- **Deploy:** Vercel (beta → production, no main branch)
- **Audit log:** See `PRODUCTION_AUDIT.md` for full list of issues found & fixed on June 24, 2026
- **SQL to run:** 3 migrations must be applied on Supabase before production go-live (see PRODUCTION_AUDIT.md)

# Branch Rules

- **DO NOT** merge or cherry-pick the Google Analytics tag (`G-4QMEHZSCXF`) into the `beta` branch. It lives only in `src/components/analytics/google-analytics.tsx` on `production`. When merging `beta` into `production`, always check that this tag wasn't accidentally removed.

# Job Post Workflow (CRITICAL)

When the user asks to "create a job post", "post a job", "add a job", or "write a job post", they mean adding a **static job card to a FMSG job board** — NOT a generic hiring packet, job description document, interview guide, or offer letter. Do NOT use the `job-post-builder` skill or anything unrelated.

## Steps

1. **Confirm the board.** Ask which board the job belongs to (currently `finance` — empty — and `life-sciences`). If no existing board fits, offer to create a new one.
2. **Create the job card file** at `src/data/jobs/<board>/<kebab-slug>.ts` exporting a named `JobCard` (see `src/data/jobs/types.ts`): fields are `slug`, `title`, `company`, `location`, `salary`, `applyUrl`, `description` (full spec, `\n` separated), `snippet` (short summary shown on the card), and optional `featured: true`. Match the style of `src/data/jobs/life-sciences/esco-country-manager.ts`.
3. **Register it** in the board's `index.ts` (e.g. `src/data/jobs/life-sciences/index.ts`) — import and append to the jobs array. The board page renders the card automatically.
4. **New board?** Add it to `jobBoards` in `src/data/jobs/categories.ts` (`slug`, `name`, `tagline`, `search: { title, location }`, `jobs`). `search.title`/`search.location` pre-fill the search pill and drive the opt-in live "More jobs like this" search. The route `/jobs/[category]` SSG's any board in `categories.ts`.
5. **Verify:** `npx tsc --noEmit`, eslint on changed files, `npm run build` (confirms the new card/board is SSG'd).
6. **Commit + push to `production`** (Vercel auto-deploys), then share the link: `https://findmesomejobs.co.za/jobs/<board>`.
