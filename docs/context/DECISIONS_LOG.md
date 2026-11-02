# FMSG & FMSG Agents — Engineering Decisions Log

> Dated log of architectural decisions, root causes of prototype failures, and how each issue was resolved. Cross-referenced with [`src/apps/fmsg-agents/docs/changelog/INDEX.md`](../../src/apps/fmsg-agents/docs/changelog/INDEX.md).

---

## 2026-10-30 — Initial FMSG Agents Prototype (`v0.1.0` → `v0.3.0`) & Why It Had to Be Replaced

- **Context:** Versions `0.1.0` through `0.3.0` (`de761d3`..`57c42ec` and working-tree builds) were created rapidly as a desktop prototype.
- **Mistakes Made in the Prototype:**
  1. **Service role key referenced in client code:** `electron-main.ts`, `agent-controller.ts`, and `update-manager.ts` called `createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || '')`. In local dev this bypassed RLS; in packaged `.exe` builds (where `.env` is absent) it evaluated to `''` and threw `"supabaseKey is required"`.
  2. **Dummy agent loop:** `agent-controller.ts` only opened a Google search URL and iterated placeholder steps without real job discovery, LLM page analysis, form filling, or browser screenshots.
  3. **Unwired UI & missing CSS variables:** `v0.2.0` had dead `href="#"` sidebar links and referenced `--space-5` / `--font-weight-semibold` before they were defined in `design-system.css`.
  4. **Recursive build bloat:** `.gitignore` and `electron-builder` did not isolate `dist/electron/`, causing `.nsis.7z` archives to balloon to 3.7 GB.
- **Decision:** Replace every prototype piece with production implementations connected to the shared FMSG backend (`v0.4.0` → `v0.6.0`).

---

## 2026-10-31 — Public Anon Key Only, Electron 34 WebSocket Fix & Signed Device-Bound OTA (`v0.4.0` → `v0.5.0`)

- **Decision 1 (Public Anon Key + RLS Only in Desktop Client):**
  - Created `src/apps/fmsg-agents/config.ts` bundling only `SUPABASE_URL`, `SUPABASE_ANON_KEY` (`role: "anon"`), and `RELEASE_PUBLIC_KEYS_PEM`, enforced at startup by `validateStartupConfig()`. All profile reads (`search_profiles`, `profiles`) and writes (`saved_jobs`) execute under the signed-in user's JWT with Postgres RLS.
- **Decision 2 (Electron 34 / Node 20.19.1 WebSocket Polyfill):**
  - **Root cause:** Electron 34.5.8 embeds Node.js `v20.19.1` in its main process where `globalThis.WebSocket` is `undefined`. `@supabase/realtime-js@2.118.0` eagerly calls `WebSocketFactory.getWebSocketConstructor()` inside `new SupabaseClient()`, throwing synchronously before any Auth HTTP request can be sent.
  - **Fix:** Provided `DesktopRealtimeWebSocket` in `src/apps/fmsg-agents/session-manager.ts` and passed `realtime: { transport: DesktopRealtimeWebSocket }` to `createClient()`.
- **Decision 3 (Zero-PII Device Key & Challenge-Response OTA):**
  - **Mistake in `v0.4.0`:** `device-key.ts` derived its wrapping key from Windows `MachineGuid` + OS username, and `update-manager.ts` verified manifest signatures without downloading the updated `renderer/bundle.js` and `renderer/design-system.css` files from storage before swapping slots.
  - **Fix in `v0.5.0`:** Replaced hardware/username derivation with a random 256-bit key stored in Windows OS Protected Storage (`keytar` + DPAPI), added Supabase challenge-response RPCs (`issue_agent_device_challenge`, `verify_or_register_agent_device` in migration `038`), and implemented full SHA-256-verified artifact downloading into `Slot-Active` / `Slot-Backup` before login on every launch.

---

## 2026-11-01 — Futuristic Cosmic Glassmorphic GUI (`v0.5.1`)

- **Decision:** Replaced the legacy left-sidebar layout with a cosmic nebula/stardust backdrop, a rounded glassmorphic stage frame, a two-column Live Feed + Viewport layout, and a floating bottom capsule dock with a central lightning launch trigger.
- **Mistake in `v0.5.1`:** `LiveLog.tsx` used a 2.4-second rotating mock showcase (`SAMPLE_COMPANIES`) instead of real IPC events and real screenshots, and the dock/typography proportions were too large (`76px` dock, `16px × 3px` active bar, `16.5px` log rows).

---

## 2026-11-02 — Production Agent Engine, Real Screenshots, Apple-Dense UI & Paystack Billing (`v0.6.0`)

- **Decision 1 (Server-Side AI Proxy on OpenRouter `thinkingmachines/inkling:free`):**
  - Desktop clients never hold LLM API keys. Added `POST /api/agent/ai` which authenticates the user's Supabase JWT, applies per-user rate limiting (`90/min`), and calls OpenRouter with `thinkingmachines/inkling:free` primary, cascading to `thinkingmachines/inkling-small:free`, `google/gemini-3.5-flash-lite`, and `openai/gpt-4o-mini`, with `HTTP-Referer: https://findmesomejobs.co.za`, `X-Title: FMSG Agents`, and `reasoning: { effort: "low", exclude: true }`.
- **Decision 2 (Shared Job Discovery via `/api/agent/tools/search-jobs`):**
  - Added `POST /api/agent/tools/search-jobs` reusing `searchGoogleJobs` (`src/lib/serpapi.ts`) so the desktop agent discovers live South African job postings from the same source as the website.
- **Decision 3 (Hybrid Deterministic + LLM Browser Runner with Real Screenshots & `saved_jobs` Persistence):**
  - Rewrote `src/apps/fmsg-agents/agent-controller.ts` and `LiveLog.tsx` to stream real `phase`, `screenshot` (`page.screenshot({ type: 'jpeg', quality: 62 })`), `attention` (sign-in wall, captcha, protected fields, submit approval), and `run-done` events over IPC, and to persist processed jobs into `public.saved_jobs` under RLS.
  - Retired unused prototype components (`version-manager.ts`, `LoginPopup.tsx`, `SensitiveEntryPopup.tsx`, `ProfileBar.tsx`) to `recycle_bin/`.
- **Decision 4 (Hosted Paystack Checkout & Manual Spend Cap):**
  - Added `/api/agent/billing/plans`, `/api/agent/billing/checkout`, `/api/agent/billing/verify`, and `/payment/success`. Card checkout opens in the user's system browser (`shell.openExternal`) and polls `/api/agent/billing/verify` (which checks `subscriptions.paystack_reference` for idempotency and delegates balance stacking to `/api/verify-payment`).
  - Reworked the monthly Spend Cap input in `BillingPanel.tsx` into a clean manual numeric text input with zero browser spinner arrows.
- **Decision 5 (Structured Version Log & Regression Playbook):**
  - Created `src/apps/fmsg-agents/docs/changelog/` (`INDEX.md`, `UNRELEASED.md`, `README.md`, and per-version files `v0.1.0`..`v0.6.0`) and added a permanent rule in `AGENTS.md` requiring every change to be logged in `UNRELEASED.md` and every bug investigation to start with `INDEX.md`.
