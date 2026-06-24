# FMSG Production Readiness Audit

**Date:** June 24, 2026
**Branch:** beta (15d7a7c)
**Build status:** Compiling, no new lint errors

---

## Issues Found & Fixed

### CRITICAL

| # | Category | Issue | Fix |
|---|----------|-------|-----|
| 1 | Security | `subscriptions` RLS INSERT/UPDATE policies used `WITH CHECK (true)` — any authenticated user could modify any subscription record | Migration 016: Changed to `auth.uid() = user_id` |
| 2 | Security | Storage RLS "Service role full access to cv-files" policy had no `auth.role()` check — any authenticated user had full CRUD on all CV files | Migration 017: Added `AND auth.role() = 'service_role'` |
| 3 | AI Stack | Groq model `llama-3.3-70b-versatile` deprecated June 17, 2026 | `src/lib/gemini.ts` — updated to `openai/gpt-oss-120b` |

### HIGH

| # | Category | Issue | Fix |
|---|----------|-------|-----|
| 4 | Security | Paystack webhook `PAYSTACK_SECRET_KEY ?? ""` fell back to empty string, allowing forged webhooks if key was unset | `src/app/api/paystack/webhook/route.ts` — added `if (!PAYSTACK_SECRET_KEY) return 500` before HMAC check |

### WARNING

| # | Category | Issue | Fix |
|---|----------|-------|-----|
| 5 | Auth | Login stall on production — LoginTransition navigated at 400ms before cookies propagated, causing proxy redirect loop | `login-transition.tsx` no longer navigates. Navigation moved to `AuthModal.handleTransitionComplete` (after full animation, ~1.7s). `AutoLoginGuard` handles auto-redirect. |
| 6 | UI/UX | `pricing/page.tsx` hardcoded tier display prices/limits as string literals, duplicating `plan-limits.ts` | Replaced hardcoded `tiers` array with `PLAN_TIER_NAMES.map(...)` using `formatPlanPrice()` and `PLAN_LIMITS` |
| 7 | UI/UX | No queue/priority message for free tier users | Added "Paid users receive priority AI processing" to limit modal |
| 8 | UI/UX | Terms of Service was a single minified 3000+ character line | Full reformat with proper paragraphs, 15 sections |
| 9 | UI/UX | Em dashes (—) in user-facing content (~10 occurrences across 5 files) | Replaced with hyphens or colons |
| 10 | Data | `rejected_jobs` table used single `reason` column, spec required `rejection_category` + `rejection_reason` | Migration 018: Added both columns, backfilled from reason. Updated 3 insert sites in `search/route.ts` |
| 11 | AI Stack | Rate limit delays didn't match spec (Pass 2: 6s instead of 20s, PF OpenRouter: 12s instead of 3s) | `search/route.ts`: Pass 2 → 20s, PF OpenRouter → 3s |
| 12 | AI Stack | Only 4 OpenRouter fallback models (spec required 5) | Added `qwen/qwen3-235b-a22b:free` to `OPENROUTER_FALLBACK_MODELS` |
| 13 | Payments | No test/live Paystack key switching — single `PAYSTACK_SECRET_KEY` with no fallback | All 6 Paystack API routes now fall back to `PAYSTACK_TEST_SECRET_KEY` |
| 14 | Performance | N+1 CV downloads in search pipeline (sequential for-loop) | Parallelized with `Promise.all` |
| 15 | Performance | CSP `connect-src` allowed 7 server-side-only domains (Gemini, Groq, OpenRouter, OpenAI, SerpAPI, Jina, Google) — widened attack surface | Trimmed to only Supabase + Paystack (`next.config.ts`) |
| 16 | Code Quality | Feature lists (`TIER_FEATURES`, `TIER_POPULAR`) duplicated across `pricing-section.tsx`, `welcome/page.tsx`, and `pricing/page.tsx` | Centralized in `plan-limits.ts` — all 3 files import from there |
| 17 | Config | `.env.local.example` was missing 12 environment variables used in code | Added `GROQ_API_KEY`, `SERPAPI_API_KEY`, `JINA_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_KEY_2`, `PAYSTACK_TEST_SECRET_KEY`, 6x `PLAN_CODE_*` |
| 18 | Code Quality | 3 new migration files were missing `.explanation.txt` companions | Created `.explanation.txt` for each |

---

## SQL to Run on Supabase

```sql
-- 1. Fix subscriptions RLS
DROP POLICY IF EXISTS "Service can manage subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Service can update subscriptions" ON subscriptions;
CREATE POLICY "Users can insert own subscription" ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subscription" ON subscriptions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own subscription" ON subscriptions FOR DELETE USING (auth.uid() = user_id);

-- 2. Fix storage RLS
DROP POLICY IF EXISTS "Service role full access to cv-files" ON storage.objects;
CREATE POLICY "Service role full access to cv-files" ON storage.objects FOR ALL
  USING (bucket_id = 'cv-files' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'cv-files' AND auth.role() = 'service_role');

-- 3. Add rejection category columns
ALTER TABLE rejected_jobs ADD COLUMN IF NOT EXISTS rejection_category TEXT DEFAULT '';
ALTER TABLE rejected_jobs ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT '';
UPDATE rejected_jobs SET rejection_category = 'system', rejection_reason = reason WHERE reason != '' AND rejection_category = '';
```

---

## Not Yet Fixed (Lower Priority)

| # | Severity | Category | Issue | Reason |
|---|----------|----------|-------|--------|
| 1 | WARNING | Performance | Jina fetches in search pipeline are still sequential (N+1 per job) | Safe to parallelize, but requires testing to ensure no rate limits |
| 2 | WARNING | Performance | Rate limiting is in-memory `Map` — resets on cold start, doesn't scale across Vercel instances | Needs Redis/Upstash for production scale. In-memory is fine for initial launch |
| 3 | INFO | RLS | No DELETE policies on `profiles`, `job_results`. No UPDATE on `saved_jobs` | Mitigated by `SUPABASE_SERVICE_ROLE_KEY` usage in API routes |
| 4 | INFO | AI | AI training opt-out not explicitly configured in API call headers | Gemini API key defaults to no-training. Groq doesn't train on API data. OpenRouter free models are public checkpoints |
| 5 | INFO | Tests | 12 E2E Playwright tests exist but only cover unauthenticated flows | No tests for search, CV gen, payment, or authenticated dashboard |
| 6 | INFO | Database | No standalone `created_at` index on `subscriptions` or `rejected_jobs` tables | Only `job_results` has `(user_id, created_at DESC)` |
| 7 | INFO | Branch | No `main` branch — deployment is `beta` → `production` directly | Intentional, but worth documenting in team docs |

---

## Files Modified (30 total)

### New files
- `supabase/migrations/016_fix_subscriptions_rls.sql`
- `supabase/migrations/016_fix_subscriptions_rls.explanation.txt`
- `supabase/migrations/017_fix_storage_rls.sql`
- `supabase/migrations/017_fix_storage_rls.explanation.txt`
- `supabase/migrations/018_rejected_jobs_categories.sql`
- `supabase/migrations/018_rejected_jobs_categories.explanation.txt`

### Modified source files
- `src/lib/gemini.ts` — Groq model, 5th OpenRouter model
- `src/lib/plan-limits.ts` — `TIER_FEATURES`, `TIER_POPULAR` exports
- `src/components/ui/login-transition.tsx` — removed navigation from animation
- `src/components/auth/auth-modal.tsx` — navigation in onComplete, signup handler
- `src/components/auth/auto-login-guard.tsx` — handles login redirects
- `src/app/api/search/route.ts` — rate delays, N+1 CV, rejection_category columns
- `src/app/api/paystack/webhook/route.ts` — empty secret check, test key fallback
- `src/app/api/verify-payment/route.ts` — test key fallback
- `src/app/api/update-payment-method/route.ts` — test key fallback
- `src/app/api/cancel-subscription/route.ts` — test key fallback
- `src/app/api/paystack/change-plan/route.ts` — test key fallback
- `src/app/api/paystack/create-plans/route.ts` — test key fallback
- `src/app/api/paystack/purchase-pf/route.ts` — test key fallback
- `src/app/pricing/page.tsx` — plan-limits centralization
- `src/app/terms/page.tsx` — reformat from minified
- `src/app/welcome/page.tsx` — plan-limits centralization, em dashes
- `src/app/dashboard/page.tsx` — free tier message, em dashes
- `src/components/landing/pricing-section.tsx` — plan-limits centralization
- `src/components/onboarding/onboarding-form.tsx` — em dashes
- `src/components/dashboard/pf-promo-banner.tsx` — em dashes
- `src/components/dashboard/pf-purchase-modal.tsx` — em dash
- `src/components/dashboard/search-pill.tsx` — em dash
- `next.config.ts` — CSP connect-src narrowed
- `.env.local.example` — added missing env vars
