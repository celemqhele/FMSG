# FMSG Agents v0.4.0 → v0.6.0 — Website-Parity Auth, Zero-PII OTA, Futuristic Apple-Dense GUI, Live Agent Engine & Paystack Billing

Completed the production transition of FMSG Agents (`src/apps/fmsg-agents/`) from `v0.4.0` through `v0.6.0`: resolved the `"supabaseKey is required"` and Electron 34 WebSocket auth failures (`v0.4.0`), implemented every-launch pre-login OTA updates with a zero-PII OS-protected device key and Supabase challenge-response RPCs (`v0.5.0`), redesigned the workspace into a futuristic cosmic glassmorphic layout (`v0.5.1`), and replaced all remaining prototype components with a live OpenRouter (`thinkingmachines/inkling:free`) AI proxy (`/api/agent/ai`), Google Jobs discovery (`/api/agent/tools/search-jobs`), real Playwright browser screenshots, Apple-dense UI/dock proportions, manual spend cap input without number spinners, hosted Paystack checkout (`/api/agent/billing/*`), and structured version logging (`v0.6.0`). Following `.opencode/context/fmsg-agents/agent-framework-v0.3.0_2026-10-30.md`, the user requested full production integration across the FMSG ecosystem and a permanent version log in `src/apps/fmsg-agents/docs/changelog/INDEX.md`.

## Problem

1. **`"supabaseKey is required"` & Electron 34 (`Node v20.19.1`) login failure (`v0.3.0` → `v0.4.0`)**: In `.opencode/context/fmsg-agents/agent-framework-v0.3.0_2026-10-30.md`, `createClient()` referenced `process.env.SUPABASE_SERVICE_ROLE_KEY || ''`, which evaluated to `''` in packaged builds, and `@supabase/realtime-js@2.118.0` threw `"Node.js detected but native WebSocket not found"` synchronously inside `new SupabaseClient()` under Electron 34's Node 20.19.1 main process.
2. **Incomplete OTA file download & hardware-derived device key (`v0.4.0` → `v0.5.0`)**: `v0.4.0` verified manifest signatures without downloading updated bundle files from storage before swapping slots, and derived its wrapping key from `MachineGuid` + OS username.
3. **Simulated showcase, oversized UI/dock & prototype agent/billing (`v0.5.1` → `v0.6.0`)**: `LiveLog.tsx` in `v0.5.1` rotated a hardcoded 2.4s mock showcase (`SAMPLE_COMPANIES`) instead of streaming real agent events and real browser screenshots; the dock (`76px`), active indicator (`16px × 3px`), and fonts (`16.5px`) were too large; Spend Cap had number-spinner arrows; Billing had no Paystack checkout; and `agent-controller.ts` was still a stub.

## Fix

- **Public Config & Website-Parity Auth (`src/apps/fmsg-agents/config.ts`, `session-manager.ts`)**: Bundled only validated public `SUPABASE_URL`, `SUPABASE_ANON_KEY` (`role: "anon"`), and `RELEASE_PUBLIC_KEYS_PEM`. Added `DesktopRealtimeWebSocket` polyfill for Electron 34, `keytar` + DPAPI session persistence, 6-digit email verification, ban check, and RLS-enforced profile queries (referencing `.opencode/context/search-pipeline/search-profile-fixes_2026-08-08.md`).
- **Zero-PII Device Key & Every-Launch Signed OTA (`src/apps/fmsg-agents/device-key.ts`, `update-manager.ts`, `supabase/migrations/037_*.sql`, `038_*.sql`)**: Stored a random 256-bit wrapping key in Windows OS Protected Storage (Credential Manager + DPAPI) with zero hardware/username PII, authenticated via `issue_agent_device_challenge` and `verify_or_register_agent_device` RPCs, and downloaded SHA-256-verified artifacts from `agent-updates` into `Slot-Active` / `Slot-Backup` with auto-rollback on boot failure (using `.opencode/context/supabase-access/supabase-direct-access_2026-10-17.md`).
- **Live Agent Engine, Real Screenshots & Shared `saved_jobs` Persistence (`src/apps/fmsg-agents/agent-controller.ts`, `electron-main.ts`, `preload.ts`, `LiveLog.tsx`, `src/app/api/agent/ai/route.ts`, `src/app/api/agent/tools/search-jobs/route.ts`)**:
  - Added `/api/agent/ai` (OpenRouter `thinkingmachines/inkling:free` → `inkling-small:free` → `gemini-3.5-flash-lite` → `gpt-4o-mini`) and `/api/agent/tools/search-jobs` (`searchGoogleJobs`).
  - Rewrote `AgentRunner` to rank postings, open each in visible Chrome/Edge, stream real JPEG screenshots (`page.screenshot`), classify pages, fill verified profile fields, attach CVs from `cv-files`, pause via `requestAttention` on login/captcha/sensitive/submit approval, and persist outcomes to `public.saved_jobs` under RLS.
  - Retired unused prototype files (`version-manager.ts`, `LoginPopup.tsx`, `SensitiveEntryPopup.tsx`, `ProfileBar.tsx`) to `recycle_bin/`.
- **Apple-Dense UI, Animated Profile Picker & Hosted Paystack Billing (`src/apps/fmsg-agents/renderer/design-system.css`, `App.tsx`, `BillingPanel.tsx`, `SettingsPanel.tsx`, `src/app/api/agent/billing/*`, `src/app/payment/success/page.tsx`)**:
  - Scaled down stage frame, typography, launch modal, and floating capsule dock (`54px` height, `44px` lightning button, subtle `3px` active dot).
  - Replaced native `<select>` with spring-animated `ProfilePicker` in `LiveLog.tsx`.
  - Reworked Spend Cap into a manual numeric text input (zero spinner arrows) and wired hosted Paystack checkout (`/api/agent/billing/checkout` + idempotent `/api/agent/billing/verify` → `/api/verify-payment`).
- **Committed Context Files & Version Log (`docs/context/*`, `src/apps/fmsg-agents/docs/changelog/*`)**:
  - Created `docs/context/FMSG_ECOSYSTEM_ARCHITECTURE.md`, `docs/context/FMSG_AGENTS_SUBPROJECT.md`, `docs/context/DECISIONS_LOG.md`, `docs/context/KNOWN_ISSUES_AND_GAPS.md`, and backfilled `src/apps/fmsg-agents/docs/changelog/INDEX.md` (`v0.1.0`..`v0.6.0`).

## Background Tasks / Watchers

No background processes or watchers were left running after packaging and verification completed.
