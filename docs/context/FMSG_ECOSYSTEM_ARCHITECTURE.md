# FMSG (Find Me Some Jobs) — Root Ecosystem Architecture & Context

> **Read this first in every new session.** This document lets a brand-new session with zero prior memory understand the entire FMSG ecosystem, how the web platform and the **FMSG Agents** desktop app fit together, which databases and third-party services are used, and where every detailed context file and version log lives.

---

## 1. Ecosystem Overview

**FMSG (Find Me Some Jobs — `findmesomejobs.co.za`)** is an AI-powered South African job matching and automated application SaaS consisting of two tightly integrated surfaces in one monorepo:

1. **FMSG Web Platform (`src/app/`, `src/components/`, `src/lib/`)**
   - Built on **Next.js 16 (App Router)**, **React 19**, and **Tailwind CSS v4**.
   - Handles account creation, 6-digit email verification, CV upload & extraction, multi-profile management (`search_profiles` with 2-step industry and career ladders), multi-source job discovery & Persistent Finder (PF) 4-round searches, deterministic ATS + LLM match scoring, tailored CV generation, static SEO job boards (`/jobs/[category]`), and Paystack billing.
2. **FMSG Agents Desktop Application (`src/apps/fmsg-agents/`)**
   - Built on **Electron 34**, **React 19**, and **Playwright** (visible system Chrome/Edge automation).
   - Signs in with the same FMSG account, loads the user's `search_profiles` and `profiles` under Supabase Row Level Security (RLS), discovers and ranks live jobs via the web platform's `/api/agent/*` routes, opens real job postings in a visible browser window, streams real screenshots to the desktop viewport, fills application forms strictly from verified profile data, attaches the user's CV from Supabase Storage (`cv-files`), pauses for user attention on sign-in walls / captchas / sensitive fields, and records outcomes in `public.saved_jobs`.

---

## 2. Environments, Branches & Vercel Deployment

- **Git Branches:**
  - `feature/*` / `beta` — Active development and staging branches.
  - `production` — Production release branch (there is no `main` branch in this repository).
  - **Branch Rule (CRITICAL):** The Google Analytics tag (`G-4QMEHZSCXF`) in `src/components/analytics/google-analytics.tsx` lives **only** on `production`. Never merge or cherry-pick that tag into `beta`, and never overwrite it when merging `beta` → `production`.
- **Vercel Projects:**
  - The GitHub repo (`celemqhele/FMSG`) is connected to two Vercel projects (`fmsg` and `fmsg-2`).
  - **Deployment Caveat:** Pushing to `production` creates a **Preview** deployment first; the live domain (`findmesomejobs.co.za`) keeps serving the previous build until the deployment is **promoted to Production in the Vercel dashboard**. Always verify deployment status via `https://api.github.com/repos/celemqhele/FMSG/deployments`.

---

## 3. Supabase Architecture, Schema & RLS

- **Supabase Project Ref:** `nnebtygloqixibbjxsjr` (`https://nnebtygloqixibbjxsjr.supabase.co`).
- **Grants Rule:** Every new table in `public` must include `GRANT ALL ON TABLE public.<table> TO anon, authenticated, service_role;` in its migration (PostgREST v14 does not auto-grant on new tables).
- **Core Shared Tables (`public` schema, RLS enabled on all):**
  - `profiles` — 1:1 with `auth.users(id)`. Stores `email`, `name`, `surname`, `phone`, `address`, `location`, `job_titles`, `current_salary`, `desired_salary`, `cv_file_path`, `plan` (`free` | `seeker` | `hunter` | `pro`), `plan_expiry`, `next_plan`, `search_balance`, `cv_generation_balance`, `persistent_finder_balance`, `email_verified`, `email_verification_hash`. RLS: `auth.uid() = id`.
  - `search_profiles` — Many-to-one with `auth.users(id)`. Stores per-profile `name`, `job_titles`, `job_types`, `location`, `location_scope`, `industry`, `industry_step_1`, `industry_step_2`, `cv_file_path`, `cv_variations`, `dynamic_requirements`, `is_default`. RLS: `auth.uid() = user_id`.
  - `subscriptions` — Payment & plan records (`user_id`, `plan`, `status`, `paystack_reference` UNIQUE, `paystack_customer_code`, `paystack_subscription_code`, `paystack_email_token`, `amount`, `billing_cycle`). RLS: `auth.uid() = user_id`.
  - `saved_jobs` — Saved and agent-processed jobs (`user_id`, `profile_id`, `job_title`, `company`, `location`, `estimated_salary`, `match_score`, `match_summary`, `job_url`, `full_spec`). RLS: `auth.uid() = user_id`.
  - `job_results` & `rejected_jobs` — Per-profile search results and categorized rejections (`location`, `blacklist`, `banned`, `ats_tracker`, `no-url`, `snippet`, `expired`).
  - `job_extractions` & `search_checkpoints` — Extracted job specs (`pgvector` embeddings in migration `032`) and search checkpoints. *(Note: FK to `auth.users` without `ON DELETE CASCADE`; account deletion cleans them up explicitly).*
  - `banned_accounts` & `signup_ips` — Anti-abuse / ban enforcement (`check-signup`, `record-signup`, `appeal`).
  - `agent_devices` & `agent_device_challenges` (migrations `037` & `038`) — Zero-PII desktop installation registry (`device_id`, `sign_public_key_pem`, `enc_public_key_pem`, `ip_hash`, `channel`, `app_version`, `revoked`) and challenge-response nonces (`issue_agent_device_challenge`, `verify_or_register_agent_device`).
- **Atomic Database RPCs:**
  - `decrement_search_balance(p_user_id, p_amount)`
  - `decrement_cv_balance(p_user_id, p_amount)`
  - `decrement_pf_balance(p_user_id, p_amount)`
  - `stack_plan_balances(p_user_id, p_searches, p_cv_gens, p_pf)`
  - `issue_agent_device_challenge(p_device_id)`
  - `verify_or_register_agent_device(...)`
- **Storage Buckets:**
  - `cv-files` — User-uploaded PDF/DOCX CVs under `<user_id>/<filename>`, protected by storage RLS (`auth.uid()::text = (storage.foldername(name))[1]`).
  - `agent-updates` — Private bucket storing signed FMSG Agents release manifests (`manifest.stable.sig.json`, `manifest.beta.sig.json`) and versioned bundles (`v0.6.0/renderer/bundle.js`, `v0.6.0/renderer/design-system.css`).

---

## 4. Third-Party Services & Data Flows

| Service | Purpose | Data Sent | Where Configured (Env Var Names Only) |
|---------|---------|-----------|---------------------------------------|
| **Supabase** | Auth, Postgres DB, pgvector, Storage (`cv-files`, `agent-updates`) | User credentials, profile fields, CV files, job results, device public keys | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **OpenRouter / Gemini / Groq** | AI CV extraction, industry ladder suggestion, job scoring, CV tailoring, and FMSG Agents decision proxy (`/api/agent/ai`) | Job descriptions, profile job titles/skills/summary, detected form field labels (never passwords or sensitive IDs) | `OPENROUTER_API_KEY`, `OPENROUTER_KEY_2`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL` |
| **SerpAPI / Job Sources** | Google Jobs discovery (`src/lib/serpapi.ts`) for `/api/search`, `/api/guest-search`, and `/api/agent/tools/search-jobs` | Role title query, location string, country (`gl=za`) | `SERPAPI_API_KEY`, `BRIGHTDATA_API`, `LINKEDIN_PROXY_URL` |
| **Paystack** | South African ZAR card checkout, plan upgrades, add-on purchases, and webhooks | User email, ZAR amount in kobo/cents, plan name, reference string, user ID in metadata | `PAYSTACK_SECRET_KEY`, `PAYSTACK_TEST_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `NEXT_PUBLIC_PAYSTACK_TEST_PUBLIC_KEY` |
| **Transactional Email** | 6-digit verification codes, account deletion codes, payment receipts, appeals (`src/lib/email.ts`) | User email address, first name, verification code or receipt summary | `RESEND_API_KEY` / `MAILTRAP_API_TOKEN` / `SMTP_*` |

---

## 5. How Secrets Are Handled (Names Only — Never Values)

- **Server-only secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_KEY_2`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `SERPAPI_API_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_TEST_SECRET_KEY`) live only in Vercel environment variables and gitignored local `.env*` files.
- **Desktop client (`src/apps/fmsg-agents/`)** bundles **only** the public `SUPABASE_URL`, the public `SUPABASE_ANON_KEY` (`role: "anon"`, verified at boot by `validateStartupConfig()`), and the offline release verification public key (`RELEASE_PUBLIC_KEYS_PEM`).
- **Offline release signing private key** lives only at `.opencode/keys/release-private.pem` (gitignored, never bundled in `.exe`, never uploaded to Supabase).
- **Local Supabase admin access** for agent/developer scripts uses `.opencode/supabase-access.env` (`SUPABASE_SERVICE_KEY`, gitignored) via `curl.exe`.

---

## 6. Index of Context Files & Changelogs

### Committed Project Context (`docs/context/`)
1. [`docs/context/FMSG_ECOSYSTEM_ARCHITECTURE.md`](./FMSG_ECOSYSTEM_ARCHITECTURE.md) — *(this file)* Root architecture map, tables, services, and secret handling.
2. [`docs/context/FMSG_AGENTS_SUBPROJECT.md`](./FMSG_AGENTS_SUBPROJECT.md) — FMSG Agents desktop architecture, auth, device key, OTA update engine, live runner, and release workflow.
3. [`docs/context/DECISIONS_LOG.md`](./DECISIONS_LOG.md) — Chronological engineering decisions, root causes of prototype failures (`v0.1.0`–`v0.5.1`), and production fixes (`v0.6.0`).
4. [`docs/context/KNOWN_ISSUES_AND_GAPS.md`](./KNOWN_ISSUES_AND_GAPS.md) — Full Phase 1 / Phase 2 component audit table, test evidence, and production promotion checklist.

### FMSG Agents Structured Version Log (`src/apps/fmsg-agents/docs/changelog/`)
- [`src/apps/fmsg-agents/docs/changelog/INDEX.md`](../../src/apps/fmsg-agents/docs/changelog/INDEX.md) — **Read first before any bug/regression investigation.**
- [`src/apps/fmsg-agents/docs/changelog/UNRELEASED.md`](../../src/apps/fmsg-agents/docs/changelog/UNRELEASED.md) — Active change collector between releases.
- [`src/apps/fmsg-agents/docs/changelog/README.md`](../../src/apps/fmsg-agents/docs/changelog/README.md) — Git diff playbook and semver rules.

### FMSG Agents Incident Chains (`src/apps/fmsg-agents/docs/context/`)
Kept inside the sub-project so agent context never mixes with website context (moved out of `.opencode/context/fmsg-agents/` on 2026-11-03).
- [`agent-framework-v0.3.0_2026-10-30.md`](../../src/apps/fmsg-agents/docs/context/agent-framework-v0.3.0_2026-10-30.md) — `v0.3.0` framework: semver/OTA skeleton, config, auth.
- [`agent-release-v0.6.0_2026-11-02.md`](../../src/apps/fmsg-agents/docs/context/agent-release-v0.6.0_2026-11-02.md) — `v0.4.0`→`v0.6.0`: auth failure, zero-PII device key, live engine, Paystack.
- [`fmsg-agents-ui-redesign_2026-11-03.md`](../../src/apps/fmsg-agents/docs/context/fmsg-agents-ui-redesign_2026-11-03.md) — `v0.7.0` mockup redesign, secret vault, bundles.
- [`fmsg-agents-visual-fidelity_2026-11-03.md`](../../src/apps/fmsg-agents/docs/context/fmsg-agents-visual-fidelity_2026-11-03.md) — `v0.7.1` display type hierarchy, hero rebuild, empty states, OTA notes.
- [`fmsg-agents-audit-remediation_2026-11-03.md`](../../src/apps/fmsg-agents/docs/context/fmsg-agents-audit-remediation_2026-11-03.md) — independent UI/UX audit execution: Phase 0 harness/lints, `v0.7.2` trust release, `v0.8.0` review-status migration + IPC, `v0.9.0` design-system enforcement, and the Migration 039 / distribution blockers.

### Historical Incident Chains (`.opencode/context/`)
- `.opencode/context/ats-scoring/` — Deterministic ATS scoring engine, pgvector RRF fusion, AI cascade fallbacks.
- `.opencode/context/search-pipeline/` — Search profile persistence, PF 4-round career ladder, location-scope filtering, streaming pipeline.
- `.opencode/context/job-boards/` — Static job cards, category boards, and SEO detail pages.
- `.opencode/context/supabase-access/` — `curl.exe` direct REST/Storage/Auth workflow and PostgREST schema-cache notes.
