# FMSG Agents — End User License Agreement (EULA)

**Effective Date:** 2026-10-30  
**App:** FMSG Agents (Desktop `.exe`, Electron-based)  
**Version:** 1.0.0  
**Developer / Provider:** FMSG (Find Me Some Jobs) — South African job matching SaaS  

---

## 1. Acceptance

By installing, running, or using the FMSG Agents `.exe` (the "App"), you agree to this EULA. If you do not agree, do not install or run the App. This EULA applies to the binary compiled by `electron-builder` (NSIS installer, `FMSG Agents Setup 1.0.0.exe`) and all updates delivered via the Vercel endpoint (`/api/agent-version`).

---

## 2. What the App Is

FMSG Agents is a **specialised local desktop agent** — not a generic AI assistant, not a chat bot, not a web browser replacement. Its sole purpose is:

1. Read your FMSG profile (`search_profiles`, pulled via Supabase service-role key — same login as the web app).
2. Find job openings (custom search queries written by the agent; if batch > 4 applications, the agent uses **Persistent Finder / PF** — 4 rounds: industry ladder steps 1-2, then same titles without industry).
3. Read job specifications (visible Playwright Chrome browser, `slowMo: 200` ms — one step at a time).
4. Tailor a CV using your profile as the **single source of truth** (borrowed pipeline from `FMSG CLIENT ASSIST` `CV MAKER`: profile-first, no fabricated metrics, ATS scan, `.docx` + `.pdf` output).
5. Apply on your behalf.

Nothing else. The agent will not access your email inbox, bank accounts, medical records, or any page unrelated to a job application. If it encounters unexpected sensitive information, it **immediately navigates back and skips that job** (logged in the live stream).

---

## 3. What You Must Consent To Before Using

Before pressing **Start**, you must agree to all of the following. These are displayed in the App settings and must be acknowledged:

- **Profile Access:** The App reads your `search_profiles` data from Supabase (`https://nnebtygloqixibbjxsjr.supabase.co`) using the service-role key. This is the same database used by the FMSG website (`findmesomejobs.co.za`).
- **AI Provider Key:** You must provide an AI provider key (e.g., OpenRouter, Gemini). The key is stored securely in your OS keyring (`keytar`) and selectable later; it is never transmitted except to the AI provider endpoint.
- **Local Encryption:** Any saved login credentials, ID numbers, salary expectations, payslips, or qualification files are stored in `%APPDATA%/fmsg-agents/secure/` (Windows) or the equivalent OS application data folder. They are encrypted with a key derived from your OS user credentials. Only this agent process can access them.
- **Login Handling:** When the agent hits a site requiring login (LinkedIn, etc.), a popup appears stating: "Everything will not leave the device." You can choose:
  - **Log In:** Provide username/email + password. You are then asked **Save securely?** If yes, the credential is encrypted locally. If no, it is used once and not saved.
  - **Sign Up:** The agent can either create the account using your email (confirming via Gmail if you are logged in) or you can provide login details manually.
  - **Skip:** Skip the job and move to the next.
  - **Do Not Save Toggle:** For one-time entries (e.g., a salary figure or payslip upload), you can select "Do not save" — the agent enters it once and never stores it. It will ask again for the next job.
- **10-Minute Timeout:** Every login / sensitive entry popup has a countdown timer at the bottom (`MM:SS`). If you do not respond within **10 minutes (600 seconds)**, the popup closes automatically, the job is skipped, and the agent continues to the next job.
- **Auto-Accept / Complete Agent Mode:** If you enable the toggle, the agent applies without asking per step. **This does NOT bypass login requirements or unexpected sensitive info detection.** Login popups and skip logic are always required regardless of this toggle.
- **Updates:**
  - **Security updates / Combined updates (security + rules):** Auto-downloaded from the Vercel endpoint (`https://findmesomejobs.co.za/api/agent-version`). The App restarts automatically.
  - **Feature updates:** Optional popup: "Update now" / "Update later". If you skip, a reminder appears after the **5th launch**.
  - **Rules updates (`agent-rules.json`):** Downloaded from Supabase Storage on launch/update. Applied without restart (loaded on next agent start).

---

## 4. Data Collection and Processing (Privacy Summary)

| Data Type | Where It Goes | How It's Protected | User Consent Required |
|-----------|---------------|-------------------|----------------------|
| FMSG profile (`search_profiles`) | Supabase (`service_role` read) | Read-only; same auth as web app | Implicit (user already logged in) |
| Job search queries | Agent writes custom query locally | Not transmitted separately; used in visible browser navigation | No extra consent |
| Job specs (scraped from URLs) | Visible Playwright browser reads pages directly | No storage of full specs locally (only match results logged) | No extra consent |
| Login credentials (LinkedIn, etc.) | Encrypted in `%APPDATA%/fmsg-agents/secure/` (local only) | AES encryption with OS-derived key (`keytar` / Windows Credential Manager) | Explicit (Save? checkbox) |
| ID numbers, salary expectations, payslips, qualifications | Same encrypted local folder | Same encryption; "Do not save" option available | Explicit (entry + save toggle) |
| AI provider key (OpenRouter, Gemini) | Stored in OS keyring; transmitted only to AI endpoint | `keytar` encryption; never logged | Explicit (entered in settings) |
| Agent run log (live stream, checklist, steps) | Stored temporarily in memory; not persisted by default | Not saved to disk unless user explicitly exports | No extra consent |
| Update/version check | `GET` to Vercel endpoint (`api/agent-version`) | Standard HTTPS; no user data transmitted | No extra consent |

**What is NOT collected:**
- Your email inbox contents (agent skips email pages).
- Your bank account details (agent skips banking pages unrelated to applications).
- Your medical records (agent skips health/medical pages).
- Any page that is not a job application form or a direct link to a job spec.

If the agent detects unexpected sensitive content (email inbox, bank info, medical data, etc.), it **immediately navigates back** (`browser.history.back()` or tab close), skips that job, logs the violation in the live stream, and continues to the next job. Repeated unexpected access (3+ skips for the same reason) logs a warning but does not abort the batch.

---

## 5. AI Behavior (How the Agent Acts)

The agent follows a **hardcoded checklist** that is always visible in the Live Log panel and reiterated aloud before every action. The checklist includes:

- Source of truth = profile only (borrowed from `FMSG CLIENT ASSIST` `AGENTS.md`).
- No fabricated metrics (no invented salary, no made-up achievements, no placeholder names/phones).
- Sensitive data encrypted; unexpected access → back + skip.
- CV pipeline: profile-first (`CV MAKER` rules), ATS scan (`ats-score.js` logic embedded), honest ceiling only (no keyword stuffing, no fabricated achievements).
- PF logic: if batch > 4, agent uses Persistent Finder (4 rounds: industry ladder + title ladder, then without industry keyword).

The agent does **not** improvise. It reads rules from `agent-rules.json` (downloaded from Supabase Storage) and combines them with the hardcoded checklist. Any deviation is prevented by the checklist reiteration mechanism.

---

## 6. User Responsibilities

- You must provide accurate profile data in FMSG (`search_profiles`). The agent uses your profile as the single source of truth. If your profile is incomplete or out of date, the agent will work with what is present (it may ask you to fill gaps via the automatic probe mechanism — max 2 priority gaps per round).
- You must provide a valid AI provider key. Without it, the agent cannot generate CV variations or score applications.
- You are responsible for any login credentials you choose to save. If your device is compromised, the encrypted files could theoretically be accessed by a determined attacker with your OS user password. For maximum security, use the **"Do not save"** toggle.
- You acknowledge that job applications submitted by the agent are made in your name and with your profile information. You are responsible for the content of those applications.

---

## 7. Updates and Patches

- **Security updates:** Auto-installed. The App checks the Vercel endpoint on launch. If a security patch is available (`update.type === 'security'` or `'combined'`), the App downloads and applies it, then restarts.
- **Feature updates:** Optional. You will see a popup: "Update now" / "Update later". If you skip, the reminder reappears after the **5th launch**.
- **Rules updates (`agent-rules.json`):** Applied on download; loaded on next agent start (no restart required).

---

## 8. Termination

You can stop the agent at any time using the **Stop** button in the settings panel or by closing the `.exe` window. When the agent stops:
- The visible Playwright browser is closed.
- Any active login/sensitive popups are dismissed (they have a 10-minute auto-skip timer that continues independently).
- No data is lost (encrypted local files remain; live log is in memory only and is not persisted).

---

## 9. Limitation of Liability

FMSG Agents is provided **"as is"** without warranty of any kind. The App is a framework for automated job applications based on your existing FMSG profile. It does not guarantee job offers, interview invitations, or application responses. The accuracy of CV tailoring depends entirely on the accuracy and completeness of your FMSG profile. The App uses third-party APIs (SerpAPI for job results, Playwright for browser automation, your chosen AI provider for scoring) — any downtime or rate limits from those services may affect the agent's performance.

FMSG is not responsible for:
- Any job application submitted incorrectly due to outdated profile data.
- Any job application rejected due to missing qualifications or gaps in your profile.
- Any action taken by a job board (LinkedIn, etc.) in response to automated applications (e.g., account restrictions, CAPTCHA challenges).
- Any loss of saved encrypted credentials if your OS user account is compromised.

---

## 10. Contact and Updates

- **Project:** FMSG (Find Me Some Jobs) — AI-powered South African job matching SaaS
- **Repo:** `fmsg` (`production` branch, `beta` branch rules apply)
- **Plan reference:** `docs/fmsg-agents-plan.md`
- **Audit log:** See `PRODUCTION_AUDIT.md` for full list of issues found and fixed
- **Deployment note:** Pushes to `production` land as Preview (`Preview – fmsg`) on Vercel; promotion to Production (`Production – fmsg`) is required in the Vercel dashboard before the live domain (`findmesomejobs.co.za`) serves the new build.
