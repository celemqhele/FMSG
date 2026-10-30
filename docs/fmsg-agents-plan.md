# FMSG Agents — Final Design Plan

**Status:** Plan locked — ready for build.  
**Date:** 2026-10-30  
**Repo:** Same `FMSG` repo (`src/apps/fmsg-agents/`). Build artifacts (`dist/`, `.exe`) are `.gitignored`; never committed (recycle-bin rules apply to temporary build outputs only).  
**Deployment:** `.exe` built locally / CI; updates delivered via Vercel endpoint. No hosting needed for the app itself, but it connects to Supabase + Vercel backend.

---

## 1. What this is

A desktop agent app (`.exe`, Electron) called **FMSG Agents**. It automates job applications on behalf of the user. It is specialised — nothing but job search → read spec → tailor CV (from `FMSG CLIENT ASSIST`) → apply. It uses FMSG's search pipeline (including Persistent Finder, PF) and borrows CV-making rules from `FMSG CLIENT ASSIST`.

**Not a generic agent.** Not a chat bot. It has a start button, does one job at a time, and shows everything live.

---

## 2. Stack decision

- **Electron** (looks like Claude / Opencode desktop apps — embedded UI + visible browser window).
- **Playwright** inside Electron for automation (visible Chrome windows, `slowMo` steps, anti-bot pacing).
- **React + TypeScript** (reuse FMSG UI patterns: progress bars, profile cards, dark theme).
- **Node.js** backend in Electron main process (Supabase service-role calls, encryption, browser control).

Why Electron: the user said "if you can make it look like a real app similar to Claude and Opencode exe yes, if not then use exe build from scratch." Electron achieves the exact UI pattern (profile bar at top, live log in middle, controls at bottom, embedded/side browser visible).

---

## 3. App structure (same repo)

```
FMSG/
  src/apps/fmsg-agents/
    package.json          # Electron + React + Playwright
    electron-main.ts      # Main process: browser launch, Supabase, encryption, updates
    renderer/             # React UI (borrow FMSG components/design)
      App.tsx
      components/
        ProfileBar.tsx
        LiveLog.tsx       # Middle panel — checklist + step stream
        SettingsPanel.tsx # Start, profile select, batch size, model select
        LoginPopup.tsx    # 10-min timer, encrypted entry, save/skip
        SensitiveEntryPopup.tsx  # ID, salary, payslip, qualifications
    rules/
      agent-rules.json    # Hardcoded + downloaded rules (Supabase)
    storage/              # Encrypted local files only (.gitignored)
  docs/fmsg-agents-plan.md  # This file
```

---

## 4. UI layout (borrowed from FMSG + Claude/Opencode)

| Section | Content |
|---------|---------|
| **Top bar** | Profile picker (loads from `search_profiles`). Shows profile name, title ladder, industry ladder (PF steps), location scope. Click = select working profile. |
| **Live Log / Checklist** (middle, large) | Hardcoded checklist always visible + step-by-step stream of agent actions. Repurposes FMSG's progress UI (search progress → agent progress). Each step reiterates rules aloud (e.g., "Step: Reading spec. Checklist: don't invent facts. Source: profile only."). Like Claude's activity stream. |
| **Browser view** (side or embedded) | Visible Playwright Chrome window (or Electron `BrowserWindow`). User sees the agent navigating like a human — one click at a time, slowMo. |
| **Controls** (bottom/right) | Start / Stop. Batch size toggle: 1, 2, 4, 8, 16, 32, 64, 128, unlimited. Auto-accept toggle (ask permission vs complete agent). AI model selector (provider + key, selectable later). Timer display. |

---

## 5. Agent flow (exact sequence)

1. **Launch** → checks Vercel endpoint for version. Auto-updates security patches; prompts for feature updates.
2. **Login** → FMSG login (shared login, same Supabase auth). Service-role used for profile pull after auth.
3. **Load profile** → pulls from `search_profiles` (show all; agent uses discretion). Includes title ladder, industry ladder (`industry_step_1/2` for PF), location scope.
4. **Select AI model** → dropdown of saved providers + key input (stored securely for reuse). Once added, easily selectable later (same how Opencode works).
5. **Select profile + batch size + mode** (ask permission / complete agent).
6. **Press Start**.
7. **Agent checklist** (hardcoded in UI, always shown, reiterates aloud before every action):
   - Source of truth = profile (not invented).
   - No fabricated metrics/numbers.
   - Every output must match the job spec honestly.
   - Sensitive data encrypted; only agent accesses.
   - If unexpected sensitive info detected → navigate back immediately, skip job, log violation.
8. **Search** → agent writes custom search query (better than manual). If batch > 4 applications, uses **PF** (1 PF = 4 rounds: industry ladder steps 1-2, then same with industry removed — rounds 3-4, per `career-ladders-plan.txt`). If < 4 applications → regular search.
9. **Open job** → visible browser navigates to job URL. Reads spec.
10. **Tailor CV** → borrows `FMSG CLIENT ASSIST` `CV MAKER` rules:
    - Read client's profile (`search_profiles` or `.prof` derived).
    - Derive role JSON from profile.
    - Probe gaps (automatic: 2 priority gaps per round).
    - ATS scan (`ats-score.js` equivalent) → iterate to ceiling.
    - Build `.docx` + `.pdf` (pipeline scripts borrowed).
11. **Fill application** → navigates form. If login required → popup (see §8).
12. **Apply** → submit.
13. **Next job** → continue until batch done or user stops.

---

## 6. Profile sync (Supabase + Vercel)

- Reads `public.search_profiles` (service role, because user already logged in via FMSG login).
- Shows all profiles; agent selects/discretes which to use.
- Profile data is read-only for the agent run. Changes are made in the web app; agent pulls fresh on each launch/start.
- No new table needed for agent profiles — reuse `search_profiles`. If we later need `agent_runs` tracking, add it then; not required for v1.

---

## 7. Browser automation (visible, anti-detection)

- **Playwright** controlling Chrome (`headless: false`, `channel: 'chrome'`).
- `slowMo: 200` ms between actions → looks like a person.
- One step at a time: navigate → scroll → click "Apply" → fill one field → submit. No bulk DOM injection.
- The Electron app shows the live browser window on screen (or embedded `BrowserWindow`). The user sees it working.
- If CAPTCHA or unexpected block detected → popup asks permission; 10-minute timer applies; after timeout skip to next job.

---

## 8. Login popup (required, always)

When the agent hits a site requiring login/signup (LinkedIn, etc.):

- **Popup appears** (custom Electron `BrowserWindow` or overlay).
- States reason plainly: "LinkedIn requires login to submit applications."
- States clearly: "Everything will not leave the device."
- **Login option**: asks username/email → password. After entry: asks "Save?" If yes → saved securely in `.exe` folder (`%APPDATA%/fmsg-agents/credentials/`), encrypted using OS keyring / AES with derived key (`node-keytar` or Windows Credential Manager). If no → not saved; agent asks again next time.
- **Sign Up option**: asks whether agent creates logins itself (uses user's email, confirms via Gmail if logged in) or asks user for logins to create. Then confirms email.
- **Skip button** → skips this job, moves to next.
- **"Do not save" toggle** → for one-time entry (enters once, doesn't persist; asks again next time).
- **10-minute countdown timer** at bottom of popup. After 10 minutes → skip job automatically, continue batch.
- **Auto-accept does NOT bypass this.** Login is always required when detected.

---

## 9. Sensitive data entry (ID, salary, payslip, qualifications)

- When the form requires sensitive info (national ID number, salary expectation, payslip upload, qualification file):
  - Popup displays encrypted entry fields (letters/numbers/file picker).
  - **Two toggles**: "Save securely" vs "Do not save". If "Do not save" selected → data entered once, not persisted; agent asks again for next job.
  - **Skip button** available; skips that field/job.
- All saved sensitive files/data stored locally (`%APPDATA%/fmsg-agents/secure/`), encrypted. Only agent process has access.
- If agent detects unexpected sensitive info (email inbox, medical record, bank page not required for application):
  - **Immediately navigate back** (browser `history.back()` or close tab).
  - Skip that job.
  - Log: "Unexpected sensitive info detected — skipped."
  - If it keeps happening (multiple sensitive pages in sequence): keep skipping, don't abort the entire run — the agent keeps going to the next job.

---

## 10. Rules / checklist system (hardcoded + downloadable)

- **Hardcoded checklist** (always visible in Live Log, reiterates before every step):
  - Source of truth = profile only.
  - No fabricated metrics.
  - Sensitive data encrypted / skip if unexpected.
  - Check job applies to profile correctly.
  - Confirm CV matches spec honestly.
- **Rules file** (`agent-rules.json`) uploaded to Supabase Storage (`storage/agent-rules/`). Downloaded on launch/update.
- Update mechanism:
  - Check Vercel endpoint (`/api/agent-version` or similar) on launch.
  - Response: `{ version, url?, rulesUrl?, type: "security" | "feature" | "rules" | "combined" }`.
  - **Security / combined updates** → auto-download, restart app.
  - **Feature updates** → optional popup: "Update now" / "Update later". If user skips, reminder appears after 5th launch again.
  - **Rules updates** → download new JSON, apply without restart (reload on next agent start).
- The checklist is not optional; it's part of the UI. It prevents deviation.

---

## 11. PF (Persistent Finder) integration

Per `career-ladders-plan.txt` and `src/lib/career-ladders.ts`:

- **Regular search**: single round (`search_profiles` title ladder + industry).
- **PF mode**: 4 rounds (step 1: niche industry + niche title; step 2: broad industry + niche title; step 3: niche industry + broad title — industry removed; step 4: broad industry + broad title — industry removed). Actually per plan: rounds 1-2 use both title + industry ladder steps; rounds 3-4 drop the industry keyword and repeat.
- The agent writes the custom search query per round (same as the pipeline's `buildOrQuery` / `search_query`).
- **Batch size rule**: if user selects > 4 applications → use PF (1 PF per 4-5 applications). If less than 4 → regular search.
- Agent uses discretion: if many good matches found early, it may apply to more; if few, it stops early or switches to regular search.

---

## 12. CV creation (borrowed from FMSG CLIENT ASSIST)

The agent uses the pipeline from `CV MAKER`:

1. Read profile (`.prof` or `search_profiles` derived).
2. Read job spec.
3. Probe gaps (automatic: compare spec requirements to profile facts; max 2 priority gaps per round).
4. Derive role JSON from profile.
5. Scan ATS (`ats-score.js` logic embedded or called via `node` in Electron).
6. Iterate text until score can't be raised honestly.
7. Build `.docx` + `.pdf` using `generate-cv.js` + `build-cv.ps1` (borrowed, called from Electron main process).
8. Apply with tailored CV (+ optional cover letter from `generate-cover-letter.js`).

No fabricated achievements, no invented salary metrics, no placeholder text. Source of truth = profile only.

---

## 13. Security / HIPAA-style guard

- All data stays local except profile reads (Supabase service role) and version checks (Vercel).
- Sensitive entry encrypted locally.
- Agent detects unexpected access: if page content includes email inbox, bank info, medical records, or anything not required for job application → immediate back-navigation + skip + log.
- If repeated unexpected access occurs (3+ skips in a row for same reason) → log warning, continue batch, don't abort.

---

## 14. Settings / toggles

- **Batch size**: 1, 2, 4, 8, 16, 32, 64, 128, unlimited.
- **Auto-accept / Complete agent**: if enabled, agent applies without asking per step (except login and unexpected sensitive info — those are always required). If disabled, agent asks permission before each application.
- **AI provider**: dropdown + key input. Once added, saved securely (keyring/encrypted), easily selectable.
- **Profile picker**: load from `search_profiles`, show all.
- **Update preference**: auto-update (security) vs optional (features).

---

## 15. Build / deploy notes

- `.exe` built via Electron builder (`electron-builder`) in `src/apps/fmsg-agents/`.
- Build outputs go to `dist/` (`.gitignored`). If temporary build artifacts need deletion, move to `/recycle_bin/` per project rules (never `rm`).
- Updates: `.exe` checks Vercel endpoint; downloads new binary or rules JSON to `%APPDATA%/fmsg-agents/updates/`.
- Profile sync uses existing `search_profiles` table; no new DDL required for v1.

---

## 16. What was researched and confirmed

- `AGENTS.md` (`FMSG CLIENT ASSIST`) defines agent rules (`miniinstructions` protocol, fresh rules, intent mapping, CV pipeline).
- `CV MAKER\prompt.md` defines CV pipeline (profile-first, pipeline-only, no fabrication, ATS score, `.docx` + `.pdf`).
- `src/app/api/search/route.ts` defines PF/search flow (title triage, spec fetch, location scope, rejection categories).
- `docs/career-ladders-plan.txt` defines PF ladder structure (2-step industry ladder, 4 rounds, title ladder).
- `src/lib/career-ladders.ts` defines ladder generation logic (taxonomy branch, AI prompt).
- User refined all key decisions: Electron UI, visible browser, hardcoded checklist, Supabase rules download, Vercel updates, sensitive data encryption, 10-minute timer, skip/back behavior, profile picker showing all, batch >4 = PF.

---

## 17. Next step (post-plan)

Create the Electron app skeleton in `src/apps/fmsg-agents/`:
- `package.json` (Electron, React, Playwright, `node-keytar` or `keytar`).
- Basic renderer UI: ProfileBar, LiveLog, SettingsPanel.
- Main process: launch visible Playwright, read `search_profiles` via Supabase service role.
- Implement the checklist stream (hardcoded) and login popup framework.

Plan locked. Ready to build.
