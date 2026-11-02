# FMSG Agents — Desktop Sub-Project Context

> **Version Log Pointer:** Before investigating any bug or regression in FMSG Agents, read [`src/apps/fmsg-agents/docs/changelog/INDEX.md`](../../src/apps/fmsg-agents/docs/changelog/INDEX.md) first.

---

## 1. Purpose & Role in the FMSG Ecosystem

**FMSG Agents** (`src/apps/fmsg-agents/`) is the Windows desktop application (`.exe`) companion to `findmesomejobs.co.za`. While the FMSG website discovers jobs, scores them, and generates tailored CVs, **FMSG Agents** drives a visible Chrome/Edge browser on the user's own computer to read live job postings, fill out application forms using only verified profile data, attach the user's CV, pause for human attention when needed, and record processed jobs back into the user's shared FMSG account.

---

## 2. Module Map (`src/apps/fmsg-agents/`)

| File | Responsibility |
|------|----------------|
| `config.ts` | Defines `APP_VERSION` (`0.6.0`), `APP_VERSION_CODE` (`600`), public `SUPABASE_URL`, public `SUPABASE_ANON_KEY` (`role: "anon"`), `WEB_BASE_URL`, `UPDATE_BUCKET` (`agent-updates`), `RELEASE_PUBLIC_KEYS_PEM`, and `validateStartupConfig()`. |
| `electron-main.ts` | Immutable bootloader and Electron main process. Forces user data into `%LOCALAPPDATA%\fmsg-agents\user-data`, validates startup config, checks OTA slot health (`verifyStartupSlotHealth`) with automatic rollback on boot failure, runs pre-login update checks, manages auth/profile/billing IPC, and streams `agent-event` IPC from `AgentRunner`. |
| `preload.ts` | Context-isolated `window.electronAPI` bridge exposing auth, profile loading, agent start/stop, real-time `onAgentEvent` + `respondAgentAttention`, billing (`getBillingPlans`, `startCheckout`, `verifyCheckout`, `getBillingSummary`), and OTA update controls. |
| `session-manager.ts` | Website-parity authentication (`loginUser`, `signUpUser`, `sendPasswordResetEmail`, `sendEmailVerificationCode`, `verifySixDigitEmailCode`, ban check against `banned_accounts`), Electron 34 Node 20 `DesktopRealtimeWebSocket` polyfill, OS keyring (`keytar`) + DPAPI session persistence, 10-minute silent token refresh, and RLS-enforced `fetchUserAndProfilesUnderRLS`. |
| `device-key.ts` | Zero-PII installation identity (`Ed25519` signing key + `RSA-OAEP-SHA256` encryption key) wrapped by a random 256-bit key in Windows OS Protected Storage (Credential Manager + DPAPI). Contains zero hardware IDs, MAC addresses, serials, usernames, or hostnames. |
| `update-manager.ts` | Device-bound OTA update engine. Authenticates via Supabase challenge-response RPCs (`issue_agent_device_challenge`, `verify_or_register_agent_device`) or `/api/agent/updates/check`, verifies offline `Ed25519` manifest signatures and `SHA-256` file hashes, downloads updated bundles into `Slot-Active` / `Slot-Backup`, and supports full signed installer handoff (`/S /UPDATE`). |
| `browser-resolver.ts` | Resolves system Google Chrome, Microsoft Edge, or bundled Chromium and launches a visible Playwright automation window (`headless: false`, `slowMo: 120`). |
| `agent-controller.ts` | Live tool-using `AgentRunner`: loads `search_profiles` and `profiles` under RLS, queries `/api/agent/tools/search-jobs`, ranks matches via `/api/agent/ai` (OpenRouter `thinkingmachines/inkling:free` cascade + deterministic fallback), opens postings in Chrome, streams JPEG screenshots, classifies pages, fills forms from verified profile data, attaches CVs from `cv-files`, pauses via `requestAttention` for login/captcha/sensitive/submit approval, enforces the monthly spend cap, and saves processed jobs to `public.saved_jobs`. |
| `logger.ts` | Real-time diagnostic logger with synchronous `fsyncSync` flushing and strict redaction of passwords, tokens, API keys, cookies, and PII. Enabled locally via `.dev-diag-flag.json` or `AGENT_DIAG_LOG=1`. |
| `renderer/App.tsx` | Top-level React shell: startup update screen, login wall, email verification banner/modal, cosmic glassmorphic stage frame, bottom floating capsule dock, lightning batch launch modal, `ProfilesView`, and `AccountView`. |
| `renderer/components/LiveLog.tsx` | Two-column Live Feed: real-time `agent-event` step stream, animated `ProfilePicker`, live `<img src={dataUrl}>` browser screenshot viewport, and floating attention prompt card (`respondAgentAttention`). |
| `renderer/components/BillingPanel.tsx` | Manual monthly spend cap input (no spinner arrows), live account balances (`Searches`, `CVs`, `PF runs`), and hosted Paystack plan upgrade cards with automatic verification polling. |
| `renderer/components/SettingsPanel.tsx` | Run preferences (`Prevent computer from sleeping`), software update channel & manual check, browser/device key verification, and in-app legal document links. |
| `renderer/components/DialogSystem.tsx` | Accessible in-app modal, toast, and legal document viewer (zero native `alert`/`confirm`/`prompt` calls). |
| `scripts/upload-update.js` | Offline release signer & uploader: hashes built artifacts, signs canonical manifest with `.opencode/keys/release-private.pem`, self-verifies against `dist/config.js`, and uploads to Supabase `agent-updates`. |

---

## 3. Shared Server Endpoints Used by FMSG Agents

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/agent/ai` | `POST` | Bearer User JWT | Proxies agent LLM turns to OpenRouter (`thinkingmachines/inkling:free` → `inkling-small:free` → `gemini-3.5-flash-lite` → `gpt-4o-mini`) using server-side keys (`OPENROUTER_API_KEY` / `OPENROUTER_KEY_2`). Rate limit: 90/min per user. |
| `/api/agent/tools/search-jobs` | `POST` | Bearer User JWT | Discovers live job postings via `searchGoogleJobs` (`src/lib/serpapi.ts`) and normalizes apply URLs, salaries, and descriptions. Rate limit: 40/min per user. |
| `/api/agent/billing/plans` | `GET` | Bearer User JWT | Returns the shared plan catalogue (`Seeker`, `Hunter`, `Pro`) from `src/lib/plan-limits.ts`. |
| `/api/agent/billing/checkout` | `POST` | Bearer User JWT | Initializes a Paystack ZAR card transaction server-side (`PAYSTACK_SECRET_KEY`) and returns `authorizationUrl` + `reference`. |
| `/api/agent/billing/verify` | `POST` | Bearer User JWT | Verifies a Paystack reference idempotently against `subscriptions.paystack_reference` and delegates plan activation & balance stacking to `/api/verify-payment`. |
| `/api/agent/updates/check` | `POST` | Ed25519 Device Signature | Verifies device challenge signature, checks IP device limit (max 5), signs URLs for `agent-updates`, and wraps per-device content encryption keys. |
| `/api/auth/*` | `POST` | Public / Bearer JWT | Shared website auth routes (`check-signup`, `record-signup`, `send-verification`, `verify-code`). |

---

## 4. Release & OTA Update Process

1. Check the current version in `src/apps/fmsg-agents/package.json` and `src/apps/fmsg-agents/config.ts`.
2. Bump the version relative to the repo version across `config.ts`, `package.json`, `App.tsx`, `SettingsPanel.tsx`, `UpdateProgress.tsx`, `design-system.css`, and `legal/*`.
3. Move any previous installer `.exe` / `.blockmap` in `src/apps/fmsg-agents/dist/electron/` to `recycle_bin/` and log it in `AGENTS.md`.
4. Compile and package:
   ```powershell
   cd src/apps/fmsg-agents
   npx tsc --noEmit
   npm run build:code
   npx electron-builder --win nsis
   ```
5. Sign and upload OTA manifests (`stable` and/or `beta`):
   ```powershell
   node scripts/upload-update.js --version <X.Y.Z> --min-supported <X.Y.Z> --type required
   node scripts/upload-update.js --version <X.Y.Z> --min-supported <X.Y.Z> --type required --beta
   ```
6. Move `UNRELEASED.md` entries into `src/apps/fmsg-agents/docs/changelog/YYYY-MM-DD_vX.Y.Z_short-title.md`, update `INDEX.md`, commit, and create git tag `vX.Y.Z`.
