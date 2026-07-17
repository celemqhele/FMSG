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

- **DO NOT** merge or cherry-pick the Google Analytics tag (`G-4QMEHZSCXF`) into the `beta` branch. It lives only in `src/app/layout.tsx` on `production`. When merging `beta` into `production`, always check that this tag wasn't accidentally removed.
