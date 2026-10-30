# FMSG Agents — Terms of Service (ToS)

**Effective Date:** 2026-10-30  
**App:** FMSG Agents (`.exe`, Electron desktop agent)  
**Provider:** FMSG  

---

## 1. Agreement to Terms

By installing or running FMSG Agents, you agree to these Terms of Service. If you do not agree, do not install or run the App. These Terms work together with the **EULA** (`EULA.md`) and **Privacy Policy** (`Privacy_Policy.md`) — together they form the complete agreement.

---

## 2. What the Agent Does (And Doesn't)

### 2.1 What It Does
- Searches for jobs using custom queries written by the agent (based on your `search_profiles` title ladder and industry ladder).
- If batch size > 4 (`batch > 4`), uses **Persistent Finder (PF)** — 4 rounds (industry ladder rounds 1-2, then same titles without industry keyword in rounds 3-4, per `docs/career-ladders-plan.txt` and `src/lib/career-ladders.ts`).
- Reads job specs via visible Playwright Chrome browser (`slowMo: 200` — you see every click).
- Tailors a CV using your profile as the single source of truth (`FMSG CLIENT ASSIST` `CV MAKER` pipeline): reads profile, probes gaps (max 2 priority gaps per round), derives role JSON, runs ATS scan (`ats-score.js` logic), iterates to honest ceiling, builds `.docx` + `.pdf`.
- Applies to the job (fills form fields, submits) — either automatically (`auto-accept` / `complete agent` mode) or with your confirmation (`ask` mode).

### 2.2 What It Does NOT Do
- It does not invent achievements, metrics, or qualifications.
- It does not apply to jobs unrelated to your profile's industry/title ladder.
- It does not access your email, bank accounts, medical records, or any non-job-related pages. If it encounters such a page, it navigates back and skips.
- It does not store unencrypted data locally.
- It does not share your profile data with third parties (except the AI provider endpoint for CV generation, using your encrypted key).

---

## 3. User Consent Requirements (Mandatory Before Start)

Before pressing **Start**, the settings panel (`SettingsPanel.tsx`) requires the following acknowledgments (checkboxes / selections):

1. **Profile Access:** You consent to the agent reading your `search_profiles` data from Supabase.
2. **AI Key:** You have provided a valid AI provider key (`provider` + `key`). Without this, the agent cannot generate CV content or run ATS scoring.
3. **Local Encryption:** You understand that saved login/sensitive data is stored encrypted in `%APPDATA%/fmsg-agents/secure/` and that only this agent process can access it.
4. **Auto-Accept Mode:** You confirm whether `auto-accept` is enabled. This does not bypass login requirements or unexpected sensitive info skips.
5. **Update Policy:** You understand security updates are automatic; feature updates are optional with reminders after 5 skips.

These consent items are part of the App UI. The agent will not start until they are satisfied.

---

## 4. AI Behavior (Rules and Constraints)

The agent follows a **hardcoded checklist** (`agent-controller.ts`) that is always visible in the Live Log (`LiveLog.tsx`) and reiterated aloud before every step:

- Source of truth = profile only (`miniinstructions/common/WHEN_writing_in_plain_language.md`, `CV MAKER/prompt.md`).
- No fabricated metrics (no invented salary, no made-up achievements, no placeholder names/phones/emails — `AGENTS.md` Global Rails).
- Sensitive data encrypted locally; unexpected access → navigate back, skip, log (`HIPAA-style guard`).
- CV pipeline: profile-first, ATS scan, honest ceiling (`CV MAKER/prompt.md`, `miniinstructions/cv/WHEN_scoring_a_cv.md`).
- PF logic: `batch > 4` activates 4 rounds (`career-ladders-plan.txt`, `src/lib/career-ladders.ts`).

The agent also loads rules from `agent-rules.json` (downloaded from Supabase Storage on launch/update). These rules supplement — but never override — the hardcoded checklist.

---

## 5. Data Collection and Processing (Summary)

See `Privacy_Policy.md` for the full table. Key points:

- **Profile data (`search_profiles`):** Read via service role. Not stored locally except in memory during the run.
- **Job searches:** Custom queries written by the agent; results logged in memory (not persisted by default).
- **Login/sensitive data:** Encrypted locally. Save option available. Skip option always available. 10-minute auto-skip timer applies.
- **AI provider key:** Stored in OS keyring. Transmitted only to the provider endpoint.
- **Version checks:** Only version number transmitted to Vercel endpoint.
- **Rules updates:** JSON file downloaded from Supabase Storage; no user data included.

---

## 6. Login and Sensitive Data Handling (Detailed)

### 6.1 Login Popup (`LoginPopup.tsx`)
When the agent hits a site requiring login:

- Popup displays: site name, reason (`LinkedIn requires login to submit applications`), and the statement: "Everything will not leave the device."
- **Log In mode:** Email/username + password input. After entry: "Save securely?" checkbox. If checked, encrypted locally (`keytar`). If unchecked, not saved.
- **Sign Up mode:** Agent creates account using your email (confirms via Gmail if you are logged in) or you provide preferred login details. Same save option applies.
- **Skip button:** Skips this job; agent moves to next. 10-minute countdown timer (`formatTime(600)`) at bottom of popup. After 600 seconds, popup closes, job skipped automatically.
- **Auto-accept:** Does NOT bypass this popup. Login is always required when detected.

### 6.2 Sensitive Entry Popup (`SensitiveEntryPopup.tsx`)
When the form asks for sensitive fields (national ID, salary, payslip, qualifications):

- Popup displays: field name, description (`This data is encrypted locally. Only this agent process can access it.`).
- Entry field (text or file placeholder).
- Two toggles:
  - **Save securely for future applications:** Data encrypted and reused.
  - **Do not save (ask again each time):** Data entered once, not persisted.
- **Skip button:** Skips the field / skips the job (agent continues to next job).
- **Close button:** Returns to previous screen without saving or skipping.

---

## 7. Updates and Patches (User Control)

- **Security updates (`type: 'security'` or `'combined'`):** Auto-downloaded from Vercel endpoint. App restarts automatically. You will see a brief notification before restart.
- **Feature updates (`type: 'feature'`):** Optional popup: "Update now" / "Update later". If you skip, reminder appears after the **5th launch**.
- **Rules updates (`agent-rules.json`):** Downloaded from Supabase Storage. Applied on next agent start (no restart needed for the App window; the new rules load when you press Start again).

---

## 8. Termination and Data Deletion

- **Stop agent:** Use the **Stop** button (`btn-stop`) in settings. The Playwright browser is closed. Any active popups are dismissed (they have their own 10-minute timer that continues independently).
- **Uninstall `.exe`:** Use Windows "Add or Remove Programs" (NSIS uninstaller included in `dist/electron/`). The uninstaller removes the App but **does not delete** the encrypted local folder (`%APPDATA%/fmsg-agents/secure/`). You must manually delete this folder if you want complete removal of saved credentials/sensitive data.
- **No remote deletion:** Because the agent is local-only (no server-side user account for the agent), there is no remote wipe mechanism. If you lose your device, the encrypted files could only be accessed by someone with your OS user password.

---

## 9. User Responsibilities and Limitations

- **Profile accuracy:** The agent's output depends on your `search_profiles`. If your profile is incomplete or stale, the agent will work with what is present. It may ask you to fill gaps (automatic probe mechanism — max 2 priority gaps per round, per `miniinstructions/cv/WHEN_probing_for_cv_gaps.md`).
- **No guarantees:** The agent does not guarantee job offers, interview invitations, or application responses. It is a framework for automating applications based on your existing profile.
- **Job board restrictions:** Some job boards (LinkedIn, etc.) may restrict automated applications. The agent uses visible browser automation (`slowMo: 200`) to reduce detection risk, but no automation method is undetectable. If a site blocks the agent, the login popup appears (with the 10-minute timer) or the job is skipped.
- **Third-party dependencies:** The agent relies on your AI provider, Playwright/Chrome, and the FMSG web pipeline (`/api/search`). Any downtime or rate limit from these services may affect performance.
- **Legal use:** You agree not to use the agent to submit false information, apply to jobs you are not qualified for intentionally, or bypass job board terms of service. The agent is designed to apply honestly based on your profile — if your profile does not match a job spec, the agent will either skip it (after reading the spec) or apply with an honest CV that reflects the mismatch.

---

## 10. Updates to These Terms

These Terms (`v1.0.0`) are versioned with the `.exe`. Changes will be delivered as part of feature updates (`agent-rules.json` may include a reference to updated legal terms). You will see a notification in the App settings on the next launch if the Terms have changed.

---

## 11. Contact

- **Plan reference:** `docs/fmsg-agents-plan.md`
- **Project:** FMSG (Find Me Some Jobs) — `production` branch (`fmsg`, `fmsg-2` Vercel projects)
- **Deployment note:** Pushes to `production` land as Preview (`Preview – fmsg`). The live domain (`findmesomejobs.co.za`) serves the previous build until the new deployment is promoted to Production (`Production – fmsg`) in the Vercel dashboard.
