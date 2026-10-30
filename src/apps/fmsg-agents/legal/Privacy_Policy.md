# FMSG Agents — Privacy Policy

**Effective Date:** 2026-10-30  
**App:** FMSG Agents (Desktop `.exe`, Electron-based)  
**Provider:** FMSG  

---

## 1. Scope

This Privacy Policy applies to the FMSG Agents desktop application (`.exe`, Electron framework, Playwright visible browser automation) only. It does **not** replace the FMSG website privacy policy (`findmesomejobs.co.za`). Where there is overlap (profile data, Supabase access), this policy specifies the **local agent's** processing rules.

---

## 2. What Data Is Processed by the Agent

### 2.1 Profile Data (`search_profiles`)
- **Source:** Supabase (`https://nnebtygloqixibbjxsjr.supabase.co`, `public.search_profiles` table).
- **Access method:** Service-role key (`SUPABASE_SERVICE_ROLE_KEY`, stored in `.opencode/supabase-access.env` — local-only, `.opencode/` is `.gitignored`).
- **Data read:** `id`, `user_id`, `job_titles`, `location`, `industry`, `industry_step_1`, `industry_step_2`, `location_scope`, `cv_variations`.
- **Processing:** Read-only. The agent uses this to build custom search queries and to derive role JSON for CV tailoring (borrowed from `FMSG CLIENT ASSIST` `CV MAKER` rules: profile is the single source of truth).
- **Storage:** Not copied locally. Only the active profile data is held in memory during the agent run.

### 2.2 Job Search and Results
- **Source:** Job boards accessed via the visible Playwright browser (SerpAPI sources: Google Jobs, JSearch, Bing Jobs, Adzuna, etc.; Workday CXS; direct navigation to job URLs).
- **Data read:** Job titles, company names, locations, job descriptions/specs, URLs.
- **Processing:** Read by the agent to match against the profile's title ladder and industry ladder. If Persistent Finder (PF) is active (`batch > 4`), the agent runs 4 rounds: rounds 1-2 use the industry ladder (`industry_step_1`, `industry_step_2`); rounds 3-4 drop the industry keyword.
- **Storage:** Job results (`job_results` table in Supabase) are inserted by the FMSG web pipeline, not by the agent. The agent logs match results in memory (live stream) — not persisted to disk by default.

### 2.3 Login Credentials and Sensitive Data
- **When required:** When the agent navigates to a site requiring login (LinkedIn, etc.), a popup appears. When the form asks for sensitive fields (national ID, salary expectation, payslip upload, qualification file), the encrypted entry popup appears.
- **Storage location:** `%APPDATA%/fmsg-agents/secure/` (Windows) or the equivalent OS application data folder.
- **Encryption method:** AES encryption with a key derived from the user's OS user credentials via `node-keytar` / Windows Credential Manager (`keytar` package).
- **Access control:** Only the agent process can access these files. They are not accessible by other users or applications without the OS user password.
- **Retention:**
  - If you select **"Save securely"** (checkbox in the popup), the data is stored encrypted and reused for future applications.
  - If you select **"Do not save"** (toggle), the data is entered once, used for the current application, and **not stored**. The agent will ask again for the next job.
  - If you select **"Skip"**, no data is entered or stored; the job is skipped.
- **Login confirmations:** If you choose **Sign Up** mode, the agent may open Gmail (visible browser) to confirm the email address if you are logged in. No email content is read or stored by the agent — only the confirmation action is performed.

### 2.4 AI Provider Keys
- **Storage:** OS keyring (`keytar`), locally encrypted.
- **Usage:** Transmitted only to the selected AI provider endpoint (OpenRouter, Gemini) to generate CV content, ATS scores, or search expansions.
- **Retention:** Stored until you delete or change the provider in settings. Not transmitted to any other service.

### 2.5 Update and Version Checks
- **Endpoint checked:** `https://findmesomejobs.co.za/api/agent-version` (Vercel endpoint, public, no authentication required).
- **Data transmitted:** App version number only (`version` from `package.json`). No user profile data, no job results, no credentials.
- **Response used:** `updateAvailable`, `type` (`security`, `feature`, `rules`, `combined`), `url` (optional download link for `.exe` or rules JSON).
- **Rules download (`agent-rules.json`):** Fetched from Supabase Storage (service role). Contains the hardcoded checklist rules. No user-specific data in the rules file.

### 2.6 Live Agent Log (LiveLog Panel)
- **Content:** Step descriptions, checklist reiterations (`Source of truth = profile only`, `No fabricated metrics`, etc.), profile info, job titles, company names, application status.
- **Storage:** Held in memory during the agent run. Not written to disk unless you manually export. If the `.exe` crashes, the live log is lost (it is not a log file — it is a runtime stream).

---

## 3. How Data Is Protected (Security)

### 3.1 Local-First Design
- The agent is a **local `.exe`**. No hosting is required for the agent itself.
- All sensitive storage (`%APPDATA%/fmsg-agents/secure/`) is **local only**.
- The agent connects to Supabase only for:
  1. Profile reads (`search_profiles`) — service role, same database as the web app.
  2. Version checks (`api/agent-version`) — public endpoint.
  3. Rules download (`agent-rules.json`) — Supabase Storage.

### 3.2 Encryption Details
- **Algorithm:** AES (implemented via `node-keytar` / `crypto` module in Electron main process).
- **Key derivation:** Derived from the user's OS login credentials. If the OS user password changes, previously encrypted files may become inaccessible (the agent will prompt for re-entry if needed).
- **File naming:** Encrypted files use random filenames (UUID-based) mapped to a local index. The index does not contain plaintext values.

### 3.3 Browser Automation Security
- **Playwright visible mode:** The agent uses `chromium.launch({ headless: false, slowMo: 200 })`. You see every click, scroll, and navigation in a visible Chrome window.
- **No hidden automation:** There is no invisible/headless mode for application steps. If a site blocks the visible browser (CAPTCHA, bot detection), the agent pauses, shows the login/sensitive popup, and applies the 10-minute timer.
- **Anti-deviation guard:** The agent follows the hardcoded checklist (`agent-controller.ts`). It does not improvise actions. If a page requires unexpected interaction (e.g., a new form field not mentioned in the framework), the agent pauses and logs the deviation rather than proceeding blindly.

---

## 4. User Consent Requirements (Before Pressing Start)

The settings panel (`SettingsPanel.tsx`) requires the following acknowledgments before the `Start` button activates:

1. **Profile Access Acknowledged:** The App will read your `search_profiles` data.
2. **AI Provider Key Provided:** A valid provider key is required (OpenRouter, Gemini, or other supported provider).
3. **Local Encryption Acknowledged:** You understand that saved login/sensitive data is encrypted locally and that the agent process is the only access point.
4. **Update Policy Acknowledged:** You understand that security updates are automatic; feature updates are optional with reminders.
5. **AI Behavior Acknowledged:** You confirm that the agent uses your profile as the source of truth, does not fabricate achievements, and skips unexpected sensitive pages.

These consent items are displayed in the App settings and must be checked/enabled before the agent starts.

---

## 5. Third-Party Services

The agent uses the following third-party services (no user-specific data is transmitted to them except what is explicitly described above):

- **Supabase:** Profile reads, rules storage, job results (same `fmsg` database).
- **Playwright / Chrome:** Browser automation (local only — Chrome runs on your device).
- **SerpAPI / Search APIs:** Job search results (used by the FMSG web pipeline; the agent navigates to the job URLs directly).
- **AI Provider (OpenRouter / Gemini / etc.):** CV scoring, ATS optimization, search expansion (key transmitted securely to provider endpoint).
- **Vercel:** Update/version endpoint (`api/agent-version`).

---

## 6. Changes to This Policy

This Privacy Policy is versioned (`v1.0.0`, matching the `.exe` version). Updates to the policy will be delivered as part of feature updates (optional download) or included in the rules download (`agent-rules.json`). If the policy changes, you will see a notification in the App settings on the next launch.

---

## 7. Your Rights

- **Access:** You can view your profile data by clicking the profile picker (`ProfileBar`).
- **Correction:** If profile data is incorrect, edit it in the FMSG web app (`findmesomejobs.co.za`). The agent pulls fresh data on each start.
- **Deletion:** Uninstalling the `.exe` removes the App. Encrypted local files (`%APPDATA%/fmsg-agents/secure/`) remain on your device until you manually delete them. There is no remote deletion mechanism (the agent is local-only).
- **Export:** You can manually copy encrypted files from `%APPDATA%/fmsg-agents/secure/` for backup. They are encrypted and require the OS user password to decrypt.

---

## 8. Contact

- **App Plan:** `docs/fmsg-agents-plan.md`
- **Project:** FMSG — `production` branch (Vercel deployment: `fmsg`, `fmsg-2`)
- **Audit Log:** `PRODUCTION_AUDIT.md`
