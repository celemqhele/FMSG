# FMSG Agents — Executive UI/UX Audit

**Product:** FMSG Agents desktop app  
**Version:** 0.7.1  
**Platform:** Windows 11, Electron 34, renderer 1360×860 CSS px at DPR 1.25  
**Audit date:** 3 November 2026  
**Prepared for:** Executive / investor presentation readiness review  
**Scope:** Full UI/UX and presentation audit. No application files were modified.

---

## Contents

- [Method, coverage and limits](#method-coverage-and-limits)
- [A. Executive Summary](#a-executive-summary)
- [B. Screen-by-Screen Findings](#b-screen-by-screen-findings)
- [C. Cross-Application Consistency](#c-cross-application-consistency)
- [D. First-Impression Impact](#d-first-impression-impact)
- [E. Prioritised Remediation Roadmap](#e-prioritised-remediation-roadmap)
- [F. Proposed Design Standards](#f-proposed-design-standards)
- [Appendix: Evidence index](#appendix-evidence-index)

---

## Method, coverage and limits

Screens were captured from the **real installed app** via Playwright Electron (live account, 6 profiles, 6 saved jobs, 3 in review). Auth, populated-data, modal and error states that could not be reached without altering the live session were rendered from the **real compiled `bundle.js` + `design-system.css`** in a headless harness with a mocked `window.electronAPI`. Source was inspected to confirm behaviour.

One harness result was **disproved and excluded**: the mocked legal modal showed “Document unavailable.” because `getLegalDocument` was not mocked. Re-tested in the real app, the Terms of Service **do load**. The real legal defects are different (stale version, raw-markdown rendering) and are reported below. This is noted so no false “legal docs are missing” claim survives into a board pack.

**Verified:** shell/nav, login, signup, validation, login failure, forgot password, onboarding 1–4, home, run, run-setup modal, applications (empty + populated + no results), application detail, review (empty + populated), profiles, rules, billing, settings (top/mid/bottom + connect editor), account, notifications, delete-account modal, legal modal, hover states, keyboard focus order, 1360×860, 1280×720 and 960×640.

**Not verified (do not assume):** payment/checkout and Paystack redirect, real password-reset email delivery, screen-reader output (NVDA/Narrator), 200% OS scaling, ultrawide/1920+, multi-monitor, high-contrast mode, slow/offline network behaviour, 100+ row datasets, a real agent run against live job boards, installer/updater UI, OS notifications, tray, multi-account switching.

**Severity:** Critical = blocks a core task, breaks legal/trust, or unusable at a supported size · High = would derail an enterprise demo or due-diligence · Medium = noticed without prompting · Low = polish nit.  
**Type:** V = visual/presentation · F = functional · C = content/wording.

---

# A. Executive Summary

**Verdict:** FMSG Agents is a visually confident, locally-run job-automation app that looks like a funded product for the first 30 seconds and behaves like a v0.7 internal build for the next 30 minutes. The art direction is genuinely good. The product surface is not yet defensible in a $1B room, because the failures are not cosmetic — they are semantic (a primary CTA that does nothing), systemic (no enforced design system), evidentiary (stale legal version, internal identifiers on screen) and inclusive (focus and contrast fail).

**Overall UI/UX score: 5.0 / 10.**  
A 7.5/10 first impression, undermined by a 4.0/10 working session.

| Dimension | Score | One-line justification |
|---|---:|---|
| Visual craft & brand | 7.5 | Coherent dark palette, strong hero, distinctive identity |
| Layout & hierarchy | 5.5 | Good bones; dead space, 1040/full-width jumps, misplaced primary actions |
| Design-system consistency | 4.0 | 18 font sizes, 22+ radii, 62 paddings, 18 `!important` overrides |
| Accessibility | 3.0 | Near-black 1px focus ring, 3.96:1 body text, 10.5px metadata |
| Interaction & feedback | 4.5 | No undo on destructive actions, text-only loading, no progress |
| Content & terminology | 4.5 | Jargon, env-var names, three date/currency/location formats |
| Responsive behaviour | 3.5 | One breakpoint; Run Setup unusable at the app’s own minimum size |
| Trust & compliance presentation | 4.5 | “Approve” doesn’t approve; legal docs v0.6.0 inside a 0.7.1 app |

**The five deal-breakers**

1. **“Approve & Open ↗” does not approve anything.** `App.tsx:2317` calls `onOpenJob`, which only calls `openExternalUrl(job.job_url)` (`App.tsx:1154-1156`). Nothing is recorded, nothing leaves the queue. The core review loop cannot be completed by its primary action. This is a functional defect with a presentation consequence: the most prominent button in the product lies.
2. **Three irreversible actions have no confirmation and no undo.** Forget credential (`SettingsPanel.tsx:225-229`), Remove application (`App.tsx:1141-1146`), Skip review item (`App.tsx:1157-1161`) all delete immediately and show a toast afterwards. Only account deletion — the highest-stakes action — has a confirmation.
3. **Accessibility fails at the first keyboard press.** A full tab walk returns `outline: auto 1px rgb(16,16,16)` — near-black on a dark UI — on every control. Only `.password-toggle-btn:focus-visible` defines a visible indicator. `--text-muted #64748b` measures **3.96:1** on cards and **4.06:1** on the page, below WCAG AA 4.5:1.
4. **The app breaks at its own minimum window.** At 960×640 the Run Setup modal opens with its title and close control **above the viewport** (Playwright could not click it after 30s), and it is centred under the 172px sidebar, clipping 48px on the left and the right edge. Signup overflows at 1360×860 and 960×640.
5. **Internal engineering detail is user-facing.** `LINKEDIN_PASSWORD`, `fill_secret(name)`, `dev_fd813828a7f8…`, “Windows Credential Manager”, “Fallback PAYG rate”, “Grace protection”. This is the opposite of enterprise polish: it tells a buyer the product has no content layer between the code and the customer.

**What is genuinely strong**

- The **brand system** is distinctive and consistent: deep navy, indigo glow, gradient bars, the FM monogram. At a glance it reads as a funded product.
- The **home hero copy** is the best writing in the app: “Put your job search on autopilot” with a single, clear primary action and three benefit rows.
- **Run Setup cost preview** (“25 applications · R40/application · cap R160”) is a real trust feature and investor-friendly unit economics.
- **Status language** (Applied / Needs Review / Saved / Verified / Active) is scannable and uses colour plus text, not colour alone.
- **Reduced-motion support exists** (`prefers-reduced-motion`, CSS:4149), and the delete-account flow uses an emailed confirmation code — the right pattern, applied in only one place.

**Effort to premium:** 10–12 dev-days for P1, 4–6 weeks for P2, 8–12 weeks for P3.

---

# B. Screen-by-Screen Findings

### B0. Global shell, titlebar and navigation

*Evidence: `01-home.png`, `follow-15-focus-later.png`, `crop-titlebar-960.png`, `metrics.json`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| GS-01 | High | V | Interaction | **Focus is invisible app-wide.** Keyboard tab walk at 1360 and 960 returns `outline: auto 1px rgb(16,16,16)` on every control; on `#0a0d1c` this is effectively no indicator. Only one `:focus-visible` rule exists in ~4,200 lines of CSS. |
| GS-02 | High | V | Layout | **Two content widths.** Home/Applications/Profiles span ~1,090px; Billing/Settings/Account/Review cap at 1,040px. The cap is a patch: `.billing-panel { max-width: 760px }` overridden at CSS:3739 by `max-width: 1040px !important`. Navigating between screens makes the page jump width. |
| GS-03 | High | V | Interaction | **Secondary text fails contrast.** `--text-muted #64748b` = 3.96:1 on `#0e111a`, 4.06:1 on `#0a0d1c`; this token carries subtitles, helper text, table headers and the viewport footer. WCAG AA requires 4.5:1. |
| GS-04 | Medium | V | Typography | **18 font sizes in a 7-token system:** 8.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 18, 20, 22, 24, 26px. Metadata is routinely 10.5px (table headers, footer, plan chips) at DPR 1.25. |
| GS-05 | Medium | V | Component consistency | **22+ border radii:** 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 20, 27, 999px, 50%, plus tokens. Buttons alone use 5, 6, 7, 8, 9, 10, 12 and 999px. |
| GS-06 | Medium | V | Spacing and sizing | **No spacing grid:** 62 unique padding values and 17 gap values (1–32px). Cards use 12/14/16/18/20/22/24px paddings interchangeably. |
| GS-07 | Medium | V | Typography | **`.viewport-footer` is 10.5px at `rgba(148,163,184,0.7)`** — fails size, contrast and legibility; on the Run screen the sentence is also clipped mid-word at the right edge. |
| GS-08 | Medium | V | Layout | **36px titlebar carries seven controls plus brand and version.** Window buttons are text glyphs `─ □ ✕` at 24px high with 5px radius, not native Windows icons; close is neutral grey, not red. |
| GS-09 | Medium | V | Component consistency | **“Tour” is a text button sitting among icon-only controls**; the notification badge is an inline chip beside the bell, not an overlaid count on it. |
| GS-10 | Medium | V | Layout | **No max-width on the widest screens.** Home and Applications stretch to the full 1,100px+ content area; at 1920 this becomes ~1,700px line lengths (source-verified, not visually tested at 1920). |
| GS-11 | Medium | V | Layout | **Only one breakpoint** (`@media (max-width: 1100px)`, CSS:4129) plus a `max-height: 740px` auth rule. A 960–1920 range is served by one layout decision. |
| GS-12 | Low | V | Content | **Version appears in four places:** titlebar (`v0.7.1`), auth card footer (`v0.7.1`), Account header chip (`v0.7.1`), Settings header (`Version v0.7.1`). |
| GS-13 | Low | V | Component consistency | **18 `!important` declarations**, including a legacy override layer at CSS:3200–3220 and four on one modal. This is design-system debt made visible. |
| GS-14 | Low | V | Component consistency | **macOS traffic-light dots and a light `#f8fafc` browser chrome** inside a Windows-only app (`LiveLog.tsx:716`, CSS:1351). The preview bezel is the only light-themed surface in the product. |

---

### B1. Auth — Log In

*Evidence: `login-01.png`, `login-03-error.png`, `follow-01-login-960x640.png`, `follow-05-login-loading.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| AU-01 | Medium | F | Interaction | **“Keep me signed in” is checked by default.** On a shared or demo machine this silently persists the session; there is no device list, session expiry or “sign out other devices” anywhere. |
| AU-02 | Medium | V | Interaction | **The failure banner is unanchored.** “Incorrect email or password…” sits above the Email field with no icon and no field association; it grows the card and recentres it (~33px layout shift) rather than reserving space. |
| AU-03 | Medium | V | Interaction | **Loading is text-only.** The CTA becomes “Signing in…” at `opacity 0.6` with no spinner, progress or cancel (`follow-05-login-loading.png`). Disabled styling is the only feedback. |
| AU-04 | Low | C | Information architecture | **Two signup paths.** The in-app “Sign Up” tab creates an app account; the footer link “No account? Sign up on FMSG” sends users to the website. Same intent, different destinations, no explanation. |
| AU-05 | Low | V | Component consistency | **Selected-tab style is unique.** Active “Log In” uses an outlined border, while selection elsewhere is a filled indigo surface (batch size, plan cards, filters). |
| AU-06 | Low | C | Content | **No value proposition on the auth card.** Logo, tab, three fields, button. A first-run user is asked for credentials before being told what the app does or what happens to their data. |
| AU-07 | Low | V | Content | Version `v0.7.1` repeated inside the card footer and the titlebar in the same viewport. |

---

### B2. Auth — Sign Up

*Evidence: `login-04-signup.png`, `login-05-signup-validation.png`, `follow-02-signup-960x640.png`, `follow-04-signup-1280x720.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| AU-08 | High | V | Responsive design | **The signup card overflows the window at every tested size.** At 1360×860 the 420px card runs from y=78 to y≈878 and is cut off; at 960×640 it is 644px tall starting at y=52 (bottom 696), so the footer and version require internal scrolling. |
| AU-09 | High | V | Interaction | **Validation reveals one error at a time and shifts the layout.** “Please enter your name.” appears under Name, pushing Surname and every field below it down ~26px; submitting again reveals the next error. No summary, no error count. |
| AU-10 | Medium | V | Component consistency | **Three consent checkboxes are unstyled native white squares** (16px) — the only native form controls in the product, and visually the brightest elements on the card. |
| AU-11 | Medium | C | Content | **No visible password requirements or strength meter.** Users only discover rules after a failed submit; the field has no helper text or criteria list. |
| AU-12 | Low | C | Content | **Consent is split into three checkboxes**, two of which are inline legal links. This adds friction and makes “I am 18+” a separate legal attestation rather than part of a single agreement. |
| AU-13 | Low | V | Layout | **The card has no visible secondary action hierarchy:** tab, three fields, three checkboxes, CTA, external signup link and version all compete in one 800px column. |
| AU-14 | Low | V | Typography | Name/Surname two-column grid at 420px gives each field ~158px; long names will truncate inside the input with no expansion. |

> Legal links themselves work in the real app; the harness’s “Document unavailable” was a mock artifact and is excluded. The real legal defects are in B14/ST-11 and B17.

---

### B3. Auth — Forgot password

*Evidence: `login-06-forgot.png`, `login-07-forgot-error.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| AU-15 | Low | V | Layout | Tabs disappear in this mode, leaving 60px of empty space above the explanation; the 420×520 card holds one field and four separate exits. |
| AU-16 | Low | C | Information architecture | Four ways out of a two-field screen: “Send Reset Link”, “Back to Log In”, “No account? Sign up on FMSG”, and the titlebar close. The primary path is not visually dominant over the three escapes. |
| AU-17 | Low | V | Typography | The explanatory paragraph is 12.5px and wraps to two lines at 335px; the same message could be one 13px line with a wider measure. |

---

### B4. Onboarding (4 steps)

*Evidence: `16-onboarding-1.png`–`19-onboarding-4.png`, `follow-20-onboarding-960x640.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| ON-01 | High | V | Component consistency | **Emoji icons (🔍 📄 🚀) for the three core capabilities**, against a product that otherwise uses a consistent custom SVG line-icon set. Emoji render differently per OS and undercut the premium tone instantly. |
| ON-02 | High | C | Content | **Exposes `SITE_PASSWORD` and credential-manager mechanics** during first-run education. A new user is taught an implementation detail before they are taught the workflow. |
| ON-03 | Medium | V | Layout | At 960 the three feature cards are **105px wide** with 12px copy wrapping to 3–4 lines; the emoji tile dominates the card and the text nearly touches the bottom edge. |
| ON-04 | Medium | C | Information architecture | **The tour repeats the home hero** (“Let’s get your job search on autopilot”) and never explains the two concepts users actually stumble on: the application allowance/PAYG cap and what “Approve each” means. |
| ON-05 | Low | V | Interaction | Progress is four unlabelled dots with no “Skip tour” and no step titles; “STEP 1 OF 4” is the only orientation cue. |
| ON-06 | Low | V | Content | Behind the modal, the Account page shows a second `v0.7.1` chip while the titlebar already shows one — the duplicate-version problem is visible during onboarding. |

---

### B5. Home / Dashboard

*Evidence: `01-home.png`, `follow-15-focus-later.png`, `20-home-960.png`, `metrics.json`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| HM-01 | High | F | Content | **Usage renders “100% used” and “6 / 5” simultaneously.** `usedPct` is clamped to 100 (`App.tsx:1593-1595`) while the label prints raw `savedJobs.length / totalAllowance` (`:1950-1952`). There is no overage state, so the headline number contradicts the ratio. |
| HM-02 | Medium | F | Content | **“Active profile 1” is a boolean rendered as a number** (`{profile ? 1 : 0}`, `App.tsx:1848`). It reads as “one profile” or “one active run”, not “a profile is active”. |
| HM-03 | Medium | V | Information architecture | **The same metrics repeat four times:** “6 handled” pill, “Applications handled 6”, the sidebar Applications badge 6 and the applications quick card; “Awaiting review 3” and the Review badge 3. The dashboard adds no new information. |
| HM-04 | Medium | V | Content | **The 7-day chart is decorative, not analytical.** Day axis reads `W T F S S M T` (duplicate T and S, no dates), no y-scale, no values, no tooltip; bars have no legend and two days are empty with no explanation. |
| HM-05 | Medium | V | Layout | **The dashboard is top-heavy.** At 1360×860 the content ends around y=730, leaving ~130px dead space; the three columns are fixed-width regardless of content, so Recent applications and Usage have large empty interiors. |
| HM-06 | Medium | V | Layout | At narrower widths the hero’s three benefit rows stack **inside** the gradient hero, growing it to ~470px and pushing the actual operational data (“Last 7 days”) below the fold. The marketing block wins over the workspace. |
| HM-07 | Medium | V | Component consistency | **“Start Applying ★” uses a text star**, not an SVG icon; the same action also appears as the “Start a Run” quick card and the “Run” nav item — three entry points, three labels, one action. |
| HM-08 | Medium | C | Content | **Location strings are ungrammatical:** “Gauteng South Africa”, “Pretoria South Africa”, “Newcastle South Africa” — missing the comma between province/city and country. Applications uses “Johannesburg, Gauteng”. |
| HM-09 | Low | C | Information architecture | No “last run” result, failure count, next scheduled run or spend-this-month figure. The home screen answers “what is this product?” but not “what happened while I was away?” — the question an operator opens the app to answer. |
| HM-10 | Low | V | Content | Company avatars (DE, MI, ST, DI) use arbitrary colours with no legend and no relation to status. |

---

### B6. Run

*Evidence: `02-run.png`, `follow-17-run-960x640.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| RN-01 | High | V | Information architecture | **No page title.** Run starts with a status strip (“READY TO RUN · 0 applied”) and a profile dropdown; every other screen has an H1 + subtitle. There is no orientation and no documented purpose. |
| RN-02 | High | V | Layout | **The profile selector truncates at 1360:** “Nomkhosi Mpungose 1 · Service D…” — the single most important run parameter (which profile is being applied) is clipped even at default size. |
| RN-03 | High | V | Layout | **The empty-state instruction and its action are 400px apart.** “No active run right now / Click Start Applying…” floats mid-panel; the “Start Applying · 25 jobs” button is pinned to the bottom of the window with a 10.5px hint. |
| RN-04 | Medium | V | Layout | **The progress tracker is an empty 1px line** with “Idle” at the right; the six-step list (Finding jobs → Complete) shows all steps identically grey, so it reads as disabled rather than “not started”. |
| RN-05 | Medium | V | Content | **The preview footer sentence is clipped mid-word** at the right edge (“…job search & AI ranking use FMSG”) and is 10.5px at 70% opacity. |
| RN-06 | Medium | V | Component consistency | **A small status chip at the preview’s top-right renders as “DYE”** — a clipped label. Whatever it was meant to say, the user sees three letters. |
| RN-07 | Medium | V | Component consistency | **Light browser chrome + macOS dots** on the only dark screen, plus a lock icon and URL pill that imply a real browser when the pane is empty. |
| RN-08 | Low | C | Content | Three different labels for one action: “Start Applying ★” (home), “Start Applying · 25 jobs” (run), “Start (25)” (modal). |

---

### B7. Run Setup modal

*Evidence: `15-run-setup-modal.png`, `follow-06-run-setup-1360.png`, `follow-07-run-setup-960x640.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| RS-01 | **Critical** | V | Responsive design | **Unusable at the minimum window.** At 960×640 the modal is taller than the viewport and top-aligned off-screen: the title and close control are above y=0, and the right edge is clipped. Playwright could not click the close button after 30s (“element is outside of the viewport”). The modal cannot be dismissed with its own control. |
| RS-02 | High | V | Layout | **Centred on the window, not the content area.** At 960 the modal starts at x=124 while the sidebar is 172px wide, so 48px is hidden under the nav; it extends to x=960 and is clipped on the right. |
| RS-03 | High | V | Interaction | **No sticky footer.** “Start (25)” lives inside the cost card at the bottom of the third column, visually subordinate to the settings; at 960 it is below the fold. The modal’s primary action is the least prominent element in it. |
| RS-04 | Medium | V | Layout | **The profile list is an inner scroll area showing 4 of 6 profiles**, with the fourth row half-clipped and no count or search. Users cannot see that two more profiles exist. |
| RS-05 | Medium | V | Component consistency | **Three single-select patterns in one modal:** row selection (profile), segmented buttons (batch size), bordered cards (autonomy). No shared selection language. |
| RS-06 | Medium | V | Typography | Autonomy copy at 10.5–11px wraps to four lines (“Approve each / Pause for your review before submit”), making the three modes hard to compare at a glance. |
| RS-07 | Medium | C | Content | **The daily-cap slider shows “1–100” but no current maximum value.** The heading says “Daily cap: 25 applications”; the scale label is ambiguous (range? cap?). There is no numeric input. |
| RS-08 | Low | C | Content | “Rate: R40 / application (searches included)” — “searches included” is unexplained; “Billing mode: Pay-As-You-Go” and “Cost cap R160” mix account-level and run-level concepts in one card. |
| RS-09 | Low | V | Interaction | The close control is an unlabelled 24px glyph with no hit padding and no Esc hint. |

---

### B8. Applications (tracker)

*Evidence: `03-applications.png`, `app-02-applications-data.png`, `follow-08-applications-960x640.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| AP-01 | High | V | Interaction | **No sorting, pagination, bulk actions, export or column configuration.** Six rows fit; 600 will not. Headers are not interactive, so “DATE” cannot be sorted. |
| AP-02 | High | C | Content | **“MATCH” percentages (92%, 88%…73%) have no legend, no target profile and no explanation.** The user cannot tell what is being matched, against which profile, or why 73% is worth reviewing. |
| AP-03 | Medium | C | Content | **Dates are `2026/11/02`** — ISO-like slashes, no locale, no time. Review uses “22 Oct 2026”; Settings uses “11/3/2026, 4:33:08 AM”. Three formats, three meanings. |
| AP-04 | Medium | V | Layout | **The seventh column has no header.** “Remove” is a 14px text link in a ~60px column at the far right, with no confirmation and a target smaller than the WCAG 24px minimum. |
| AP-05 | High | F | Interaction | **“Remove” deletes the saved job immediately** (`App.tsx:1141-1146`) with only a toast (“Removed application record.”). No confirm, no undo, no trash. |
| AP-06 | Medium | V | Component consistency | Rows are 38px tall against a 42px `.btn` base and 54px plan CTAs; this is the densest surface in the app and the only one with 10.5px uppercase headers. |
| AP-07 | Medium | C | Content | “DATE” is ambiguous: saved date, opened date, applied date or last update? The table never says. |
| AP-08 | Medium | V | Layout | Search sits at the far left and the All/Applied/Needs Review filters at the far right, ~500px apart; one control group is split across the full width. The search has no clear (×) affordance. |
| AP-09 | Low | C | Content | Three names for the same thing: nav “Applications”, H1 “Applications Tracker”, quick card “Applications”. |
| AP-10 | Low | V | Content | Green “Applied” and amber “Needs Review” pills are legible, but there is no legend and no visual distinction between “submitted by the agent” and “opened for manual completion” — a meaningful product difference hidden in a summary string. |

---

### B9. Application detail

*Evidence: `app-04-application-detail.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| AD-01 | High | V | Information architecture | **A detail view with no detail.** The screen shows the job title, company/location, match score and a summary, but no salary, no dates, no status history, no submitted CV/cover letter, no notes and no actions. For a “tracker” this is a dead end. |
| AD-02 | Medium | V | Component consistency | The back control is **28px**, against a 42px `.btn` base — the smallest navigation target in the app. |
| AD-03 | Medium | V | Layout | No breadcrumb or parent context; the H1 becomes the job title, so the user loses the “Applications” frame and cannot tell whether they are in a list or a record. |
| AD-04 | Low | C | Content | No link back to the original posting, no copy-link, no “open in browser” action. |

---

### B10. Review queue

*Evidence: `04-review.png`, `app-05-review-data.png`, `follow-18-review-960x640.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| RV-01 | **Critical** | F | Interaction | **“Approve & Open ↗” does not approve.** Handler is `onOpenJob` → `openExternalUrl(job.job_url)` (`App.tsx:2317`, `:1154-1156`). It opens the employer site and records nothing; the item stays in the queue. The only way to clear the queue is “Skip”, which deletes the record. |
| RV-02 | High | V | Information architecture | **The page title mutates with the data:** `jobs.length === 0 ? 'Review Queue' : \`${n} application${s} need your review\`` (`App.tsx`). Every other screen has a stable noun title, so the Review screen has no identity and its H1 duplicates the count. |
| RV-03 | High | F | Interaction | **“Skip” deletes the saved job immediately** (`App.tsx:1157-1161`) with a toast (“Skipped and removed from review queue.”), no confirm and no undo. |
| RV-04 | Medium | C | Content | **“84% Match” is unexplained** (same defect as AP-02), yet it is the second-most prominent element on every card. |
| RV-05 | Medium | V | Interaction | **“Skip” uses the same neutral secondary style as “Details”**, so the destructive action does not read as destructive; it is a 60px button next to a 137px primary. |
| RV-06 | Medium | C | Content | **Transparency without an action:** “Not auto-submitted: employer asked for a covering letter” — but there is no way to supply the letter, see what was submitted, or mark it done. The copy explains a blocker and then abandons the user. |
| RV-07 | Medium | C | Content | “Roles prepared in Approve Each mode…” uses internal mode jargon that is defined nowhere on this screen. |
| RV-08 | Low | V | Content | Metadata separators are inconsistent: “Standard Bank · Gauteng” vs “Accenture · Johannesburg, Gauteng”, with different spacing around the dot. |

---

### B11. Profiles

*Evidence: `05-profiles.png`, `app-06-profiles-data.png`, `follow-09-profiles-960x640.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| PF-01 | High | C | Content | **Profile names expose array indices:** “Nomkhosi Mpungose 1”, “Khanyiswa Monakali 2”, “Sufyaan Blunden 2”, “Medard Yamba” (no suffix). This is test data visible in production and it makes the “active profile” label on Home ambiguous. |
| PF-02 | High | C | Content | **Shared H1 and subtitle across two different screens.** “Search Profiles & Answer Bank” + “Choose the active FMSG profile and configure reusable screening answers” appears on both tabs; on Rules there is no profile selector, so the subtitle describes something that is not on screen. |
| PF-03 | Medium | C | Content | **Location strings are ungrammatical** (“Gauteng South Africa”, “Pretoria South Africa”, “Newcastle South Africa”) and mix city, province and country levels across cards. |
| PF-04 | Medium | V | Layout | **The 7th “Create / Edit Profile on FMSG” card occupies a full profile slot** but contains only an icon and two lines; it reads as a broken profile card rather than a distinct utility action. |
| PF-05 | Medium | V | Component consistency | **“Select” is 68×28**, less than half the height of `.btn`; the active card is indicated by a purple border + “Active” pill, with no checkmark. |
| PF-06 | Medium | V | Content | **A profile card does not answer “which profile should I use?”** It shows 3–5 role titles and two taxonomy labels, but no salary expectation, no CV, no screening rules, no last-used date and no application count. |
| PF-07 | Medium | V | Layout | The top-right control row mixes two tabs with one action: “Profiles (6)” (42px), “Rules & Answer Bank” (42px), “Refresh” (80×45) — three different widths and two different heights in one row. |
| PF-08 | Low | V | Typography | Five role titles separated by “ · ” at 12px in a 352px card produce a dense four-line paragraph that cannot be scanned. |
| PF-09 | Low | V | Content | Counts are applied inconsistently: nav badges for Applications/Review, a “(6)” suffix for Profiles, nothing for Billing or Settings. |

---

### B12. Rules & Answer Bank

*Evidence: `06-rules.png`, `app-07-rules-data.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| RL-01 | High | C | Content | **The subtitle is wrong on this tab:** “Choose the active FMSG profile…” — there is no profile selector on the Rules screen. (Same root as PF-02; separate user-visible failure.) |
| RL-02 | Medium | V | Interaction | **“Save Rules” sits at the top-right of the card, 500px from the slider and keyword input it saves; the answers below save instantly with no button.** Two save models on one screen, with no indication which is which. |
| RL-03 | Medium | C | Component consistency | **Three verbs for similar operations:** “Add” (keywords), “Add Answer” (answers), “Save Rules” (rules). |
| RL-04 | Medium | V | Interaction | **The salary slider shows only “R0” at the far right.** No min, max, step or scale; no numeric input for precision; the track is a pure-white 2px line, the brightest element on the page. |
| RL-05 | Medium | V | Interaction | **“Remove” beside each saved answer is a 14px text link** with no confirm, matching the destructive pattern in Applications/Review. (Deletion behaviour for answers was not executed; presentation and pattern are verified.) |
| RL-06 | Medium | V | Information architecture | **Saved answers cannot be edited** — only removed and re-added. For a “bank” that is meant to grow, this is a maintenance trap. |
| RL-07 | Low | V | Layout | The rules card is ~260px tall inside a 1,040px column, leaving ~55% of the screen empty below the answer list. |

---

### B13. Billing, Bundles & Spend Cap

*Evidence: `07-billing-top.png`, `08-billing-mid.png`, `09-billing-bottom.png`, `app-08-billing-data.png`, `follow-12-hover-plan.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| BL-01 | High | C | Content | **Three contradictory statements in one card:** the title says “Pay-As-You-Go Cost Cap (Default R0)”, the badge says “R160 max”, the input says “R 160”. The user cannot tell whether their cap is R0 or R160. |
| BL-02 | High | F | Content | **Application Balance shows “100% used” with “6 / 5”.** `usedPct` is clamped to 100 while the numerator/denominator is not; there is no overage or “bonus exhausted” state. |
| BL-03 | High | C | Content | **Internal pricing mechanics are shipped as customer copy:** “Pay-As-You-Go Charge Thresholds”, “After 1 payment / Stage 2”, “Fallback PAYG rate”, “Grace protection”, “R40/app pure PAYG”, “Bundle buyers keep their R35–R22/app rate”, “Non-refundable”. This reads like a pricing memo, not a billing page. |
| BL-04 | High | V | Interaction | **Four equal blue primary CTAs** (“Choose Starter Pack”, “Choose Lite”, “Choose Standard”, “Choose Power”). “POPULAR” marks Standard, but there is no single recommended action; the eye has four competing primaries in one row. |
| BL-05 | High | C | Content | **Plan naming drifts:** “Starter Pack” on the card, “Starter Bundle” in the section title, “Starter” in copy; “Lite / Standard / Power” mix an adjective tier with noun tiers. |
| BL-06 | Medium | V | Interaction | **The most consequential control is the smallest:** “Save Cap” is 34px high with an 8px radius; preset chips are 26px/999px; `.btn` is 42px/12px. The save control is visually weaker than the plan CTAs it sits above. |
| BL-07 | Medium | C | Content | **No billing history, invoices, payment method, next charge date or cancellation path** appears anywhere on the screen (verified top, middle and bottom). Due diligence will ask for all five. |
| BL-08 | Medium | C | Content | **“Welcome bonus 5 apps”** is shown as a header chip and as the donut denominator, with no expiry, no explanation and no state for “already exceeded”. |
| BL-09 | Medium | V | Typography | Per-application chips (10.5px inside 21px pills) and “Save 12%” badges are below comfortable reading size at DPR 1.25. |
| BL-10 | Medium | V | Content | **Three currency formats:** `R160`, `R 160`, `R40/app`, `R35 per application`, `R1,499`. Same product, four spellings. |
| BL-11 | Low | C | Content | **Slang in a financial context:** “Stacks forever”, “Unused applications roll over & stack”, “Grace protection”. Precise language would reduce support load and increase trust. |
| BL-12 | Low | V | Layout | The “POPULAR” badge floats over the Standard card’s top border, half outside the card, colliding with the grid edge. |
| BL-13 | Low | V | Content | The spend cap is repeated four times: sidebar footer (“R160 cap”), home quick card (“Cap R160”), billing header chip (“Spend cap R160”) and the cap card (“R160 max”). |

---

### B14. Settings & Local Security Vault

*Evidence: `10-settings-top.png`, `11-settings-mid.png`, `12-settings-bottom.png`, `app-09-settings-data.png`, `app-10-settings-connect.png`, `follow-10-settings-960x640.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| ST-01 | **Critical** | C | Content | **Credential and implementation names are primary UI copy:** `LINKEDIN_PASSWORD`, `INDEED_PASSWORD`, `CAREERJUNCTION_PASSWORD`, `PNET_PASSWORD`, `fill_secret(name)`, “The AI only sees the key name”. A security-conscious buyer reads this as a leak of internal design, not a feature explanation. |
| ST-02 | High | C | Content | **The installation device key is displayed** as `dev_fd813828a7f8…` with a “Re-register device” button. This is an internal identifier surfaced in consumer settings with no explanation of risk. |
| ST-03 | High | F | Interaction | **“Forget” deletes a stored credential instantly** (`SettingsPanel.tsx:225-229`) with no confirmation; it is an equal-width red button directly beside “Update Key”. A mis-click on a security action is unrecoverable. |
| ST-04 | High | V | Responsive design | **The vault grid has ragged columns at 960:** measured 341px and 357px in the same row, alternating. The track definition is not equal-width, so the cards visibly fail to line up. |
| ST-05 | High | V | Information architecture | **Five unrelated domains on one 1,500px scroll:** credentials, run preferences, software updates, browser/device verification, agreements, account deletion. No sub-nav, no anchors, no section index. |
| ST-06 | Medium | C | Content | **Date is `11/3/2026, 4:33:08 AM`** — US order, seconds precision, no timezone, from a bare `toLocaleString()` (`SettingsPanel.tsx:471`). It reads as American middleware, not a South African product. |
| ST-07 | Medium | V | Layout | **“Launch Setup Wizard” and “Check for updates” wrap to two lines at 1360** inside fixed-width buttons; control width is not content-driven, so labels break mid-phrase. |
| ST-08 | Medium | V | Component consistency | **Native white checkbox** in Run preferences and a **native OS select** for “Stable channel” — the only unstyled controls outside auth. |
| ST-09 | Medium | V | Layout | **Unconnected vault cards leave 40–56px of dead space** above their “Connect” buttons because every card in the row sizes to the tallest (LinkedIn with account email). |
| ST-10 | Medium | C | Content | Status vocabulary drifts: “Saved / Not set” here, “Applied / Needs Review” in Applications, “Active / Verified” elsewhere. |
| ST-11 | Medium | V | Typography | **Legal documents render as raw markdown in a 530px scroll box:** all-caps title, literal 72-dash `-----` rules, no headings, no spacing hierarchy, no download/search. Verified live: ToS loads, but as a wall of plain text. |
| ST-12 | Medium | C | Content | **All three legal documents are `VERSION 0.6.0 - EFFECTIVE 2026-11-02`** inside a `0.7.1` app (`legal/Terms_of_Service.md`, `Privacy_Policy.md`, `EULA.md`). The privacy policy predates the current billing/agent features. |
| ST-13 | Low | V | Layout | **Account deletion is buried at the bottom of the scroll**, in a two-column row next to legal links, with no “Danger zone” heading. |
| ST-14 | Low | C | Content | Card headings are engineering checklists: “Connected Job Accounts (Local Windows Credential Manager)”, “Browser & installation verification”. |

---

### B15. Account

*Evidence: `13-account.png`, `follow-19-account-960x640.png`, `14-notifications.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| AC-01 | High | V | Information architecture | **Account is not in the sidebar.** It is reachable only by clicking the user row; when open, no nav item is active, so the user loses their location. Its content largely duplicates Settings. |
| AC-02 | High | V | Layout | **One 1,040×112 card on a 1,180px canvas** — three chips and two buttons, ~92% empty space. This is the thinnest screen in the product and the one an enterprise buyer will open to check identity/security. |
| AC-03 | Medium | V | Component consistency | **“Security Vault & Account Settings” is a button that navigates** — it duplicates the sidebar and gives no indication it is a route change rather than an action. |
| AC-04 | Medium | V | Content | **“Sign Out” is the visual primary** (red, 45px) next to a neutral settings button. Sign-out is not destructive and should not wear the danger colour; it also outranks account information. |
| AC-05 | Medium | C | Content | **No name, plan, renewal date, payment method, devices, sessions, password change or 2FA.** An “Account” page that shows only an email and two buttons cannot survive a security questionnaire. |
| AC-06 | Low | C | Content | Chip labels use inconsistent punctuation/casing: “Mode: Pay-As-You-Go”, “Cost Cap: R160”, “Email: Verified”. |

---

### B16. Notifications

*Evidence: `14-notifications.png`.*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| NT-01 | High | C | Content | **“Welcome to FMSG Agents v0.7.0” on a 0.7.1 build, stamped “Just now”.** A stale seeded notification presented as new; it is the first thing a user sees when checking the bell and it contradicts the version in the titlebar. |
| NT-02 | Medium | V | Layout | **The 280px panel overlays the page header**, covering the Account H1 area and the version chip; it is anchored to the bell but sits outside any identified layer, with no scrim. |
| NT-03 | Medium | V | Interaction | **The unread badge stays “1” while the panel is open**, and the only affordance is a “Close” text link. No “Mark all read”, no empty state, no timestamps beyond “Just now”. |
| NT-04 | Low | C | Content | The notification body is an internal feature announcement (“Local Credential Manager secret vault and live browser preview are active.”), not a user-relevant event. |

---

### B17. Dialogs, toasts and destructive flows

*Evidence: `app-11-delete-modal.png`, `legal-real-term.png`, `follow-16-legal-modal-960.png` (harness artifact).*

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| DL-01 | High | F | Interaction | **Inconsistent destructive safety.** Account deletion requires an emailed code; Forget credential, Remove application and Skip review delete immediately with a toast. The riskiest actions are the least protected. |
| DL-02 | Medium | V | Component consistency | **Four modal widths (440 / 560 / 778 / 836), three title sizes, three dismissal patterns** (X glyph, “Close” text link, primary “Close” button). There is no modal component, only four bespoke layouts. |
| DL-03 | Medium | V | Interaction | **Toasts are the only confirmation** for destructive actions and auto-dismiss in 4.2s with no undo action, no persistence and no log. |
| DL-04 | Medium | C | Content | **The delete-account modal explains the code but not the consequence of entering it**: “We will send a 6-digit confirmation code” — what happens next, and is deletion immediate after entry? The next step was not reachable without triggering a real email. |
| DL-05 | Low | V | Layout | The legal modal’s primary action is a blue **“Close”** button — a dismissal styled as the main call to action, inverting hierarchy. |

---

### B18. Loading, empty, error and disabled states

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| LS-01 | Medium | V | Interaction | **Loading is indistinguishable from empty.** A real-app capture shows the dashboard at “0 total tracked”, “0 awaiting review”, “0 handled” and “No applications yet” while the same account has 6 jobs and 3 reviews. There is no skeleton, shimmer, “syncing…” label or stale-data marker. |
| LS-02 | Medium | V | Interaction | **Disabled buttons only dim to `opacity 0.6`** with `cursor: not-allowed`; no tooltip explains why, and the loading label (“Creating account…”) has no spinner (`follow-05-login-loading.png`). |
| LS-03 | Medium | V | Interaction | **No success confirmation for saves.** Save Cap / Save Rules show no persistent saved state, timestamp or dirty indicator; users cannot tell whether the change stuck. |
| LS-04 | Low | V | Content | Error copy is functional but has no recovery path: “Incorrect email or password. Please try again.” offers no “forgot password” inline, despite the link being on the same screen. |

---

### B19. Responsive and window sizes

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| RP-01 | **Critical** | V | Responsive design | **Run Setup is unusable at 960×640** (RS-01): title/close above the viewport, right edge clipped, close control unclickable. This is the app’s advertised minimum window. |
| RP-02 | High | V | Responsive design | **Signup overflows at 1360×860 and 960×640** (AU-08); the card is taller than the viewport and the footer/version are cut. |
| RP-03 | High | V | Responsive design | **One breakpoint for a 960–1920 range** (GS-11). At 960 the vault grid is ragged, onboarding cards are 105px wide, and the Run/Applications layouts are compressed rather than reflowed. |
| RP-04 | Medium | V | Layout | **No layout strategy above 1360**: content either caps at 1,040px (Billing/Settings/Account) or stretches past 1,090px (Home/Applications/Profiles), leaving 20–30% of the window unused at the default size. |
| RP-05 | Medium | V | Responsive design | **The window minimum is 960×640 but the design assumes ≥1280.** No screen declares a supported minimum, and no layout degrades intentionally. |

---

### B20. Cross-app content and terminology

| ID | Sev | Type | Category | Finding |
|---|---|---|---|---|
| CT-01 | High | C | Content | **Three date formats:** `2026/11/02` (Applications), `22 Oct 2026` (Review, inside a sentence), `11/3/2026, 4:33:08 AM` (Settings), plus “Just now” (Notifications). |
| CT-02 | High | C | Content | **Location formats:** “Johannesburg, Gauteng” (Applications), “Gauteng South Africa” (profiles/home), “Sandton, Gauteng” (Review). One is ungrammatical; none states a country consistently. |
| CT-03 | Medium | C | Content | **Plan naming drift:** Starter Pack / Starter Bundle / Starter; Lite / Standard / Power. |
| CT-04 | Medium | C | Content | **Profile names carry numeric suffixes** (“Nomkhosi Mpungose 1”), making the active-profile label on Home ambiguous. |
| CT-05 | Medium | C | Content | **Currency drift:** `R160`, `R 160`, `R40/app`, `R35 per application`, `R1,499`. |
| CT-06 | Medium | C | Content | **One action, four labels:** “Start Applying ★”, “Start a Run”, “Start Applying · 25 jobs”, “Start (25)”. |
| CT-07 | Medium | C | Content | **Jargon without a glossary:** PAYG, cap, bundle, stack, grace protection, autonomy mode, batch, answer bank, credential manager, device key, `fill_secret`. |
| CT-08 | Low | C | Content | **Page-title grammar is inconsistent:** noun titles (Account, Billing, Settings) versus marketing sentences (“Search Profiles & Answer Bank”, “Billing, Bundles & Spend Cap”) versus a data-driven sentence on Review. |

---

# C. Cross-Application Consistency

The product has **tokens** but not a **system**. The CSS defines a 7-step type scale and semantic colours; the renderer bypasses them almost everywhere. This is the root cause of most Medium findings.

| Area | Measured reality | Consequence |
|---|---|---|
| **Typography** | 18 sizes, 7 tokens; 8.5–11.5px used for real content; 26px H1 on all screens | Reads “designed”, not “engineered”; fails at 125% scaling and for low-vision users |
| **Spacing** | 62 paddings, 17 gaps, no 4/8 grid | Cards don’t align across screens; vertical rhythm changes per page |
| **Radius** | 22+ values; buttons use 5/6/7/8/9/10/12/999 | Every surface feels slightly different; no signature shape |
| **Controls** | Heights 14/24/26/28/30/32/34/36/38/42/45/47/52/54 | No predictable hit target; destructive and primary controls are often the smallest |
| **Selected states** | Filled pill (filters), outlined border (auth tabs), bordered card (autonomy), row highlight (profiles), segmented (batch) | Users must relearn “what is selected” on every screen |
| **Focus** | One `:focus-visible` rule in the entire CSS; browser default is near-black | Keyboard users cannot see where they are; fails WCAG 2.4.7 |
| **Colour/contrast** | `#64748b` 3.96:1; footer 10.5px at 70% alpha; `#94a3b8` 7.35:1 passes | Half the secondary text is unreadable in bright rooms; accessibility claim is unsupportable |
| **Iconography** | Custom 16px SVG line icons + emoji (onboarding) + text glyphs (`─ □ ✕`, `★`, `↗`, `⊗`) | Three visual languages for “icon” |
| **Page headers** | Some H1 + subtitle + actions; Run has none; Profiles/Rules share one; Review’s title is a sentence | No consistent orientation; users cannot build a mental map |
| **Tables** | One table, 38px rows, 10.5px headers, no sort/pagination, unlabeled action column | Does not scale past a demo dataset |
| **Destructive actions** | 3 immediate deletes, 1 confirmed (account), 1 confirmed-with-code | Risk is inversely related to protection |
| **Dates/currency/places** | 3/4/3 formats respectively | Feels assembled from different products |
| **Layout widths** | 1,040 cap vs 1,090 full-bleed; 760px base overridden with `!important` | The page physically jumps when navigating |
| **Motion** | `prefers-reduced-motion` supported (good), but durations are 0.14/0.15/0.16/0.18/0.22/0.25s with 4 different easings | Animation feels inconsistent and occasionally sluggish |
| **Modals** | 440/560/778/836px; 3 dismissal patterns; no shared sticky header/footer | Each modal is a one-off, so each has different bugs (Run Setup has the critical one) |

**Consistency score by area (1–5):** Colour/brand 4 · Typography 2 · Spacing 2 · Controls 2 · States 1 · Content 2 · Layout 3 · Accessibility 1.

---

# D. First-Impression Impact

**0–5 seconds.** The app opens to a deep navy canvas, a crisp FM monogram, a restrained indigo CTA. It looks like a product with a design budget. The titlebar is custom and confident. Score: **8/10**.

**5–30 seconds.** The home hero lands. “Put your job search on autopilot” is a genuinely good line; the three benefits are concrete; the sidebar is clean and the badges suggest live data. An investor would lean in. Score: **7.5/10**.

**30–90 seconds.** The questions start. “Why does Usage say 100% and 6/5?” “Why does Active profile say 1?” “What does 92% match mean?” “Why is the chart empty for two days?” None of these have answers on screen. The dashboard is a marketing page with operational decoration. Score: **5.5/10**.

**2–5 minutes.** The demo moves to Review — the core loop. The presenter clicks “Approve & Open ↗”. A browser opens. The queue still says 3. They click again. Still 3. To clear it they must click “Skip”, which silently deletes the record. This is the moment the room stops believing the product. Score: **3/10**.

**5–10 minutes.** Billing. Four identical blue CTAs. “Default R0” above a R160 cap. “After 1 payment / Stage 2 / Grace protection / Stacks forever / Non-refundable.” The buyer asks, “So what will this cost my team per month?” and the screen cannot answer without a spreadsheet. Score: **3.5/10**.

**10–15 minutes.** Settings. The buyer sees `LINKEDIN_PASSWORD`, `fill_secret(name)` and `dev_fd813828a7f8…`. They ask who can read the credential store. The “Forget” button is one 56px mis-click away from deleting a credential, with no confirmation. Score: **3/10**.

**15–20 minutes.** Due diligence asks for the Terms of Service. The modal opens a 72-dash ASCII wall stamped **VERSION 0.6.0** inside a 0.7.1 app. The privacy policy predates the current billing model. Score: **3/10**.

**The first-impression paradox:** the better the visual design gets, the more the semantic defects stand out. A rougher-looking app would be judged more gently. Premium visual language raises the expectation of premium rigour, and the product does not yet meet it.

**What a buyer remembers:** the dark, confident hero; and then “the Approve button didn’t approve anything.”

---

# E. Prioritised Remediation Roadmap

Estimates assume one senior front-end engineer plus design review; they are directional, not commitments.

### P1 — Immediate corrections (week 1–2, ~10–12 dev-days)

| # | Action | Fixes | Effort | Exit criterion |
|---|---|---|---|---|
| 1 | **Make “Approve” mean approve.** Either implement an approved/submitted state transition and remove from queue, or relabel to “Open posting” and add a separate “Mark approved”. | RV-01 | M | Clicking the primary review action changes the record and the queue count |
| 2 | **Add confirmation + undo to the three destructive actions.** Typed/name confirm for credentials; 10s undo toast for saved jobs. | AP-05, RV-03, ST-03, DL-01, DL-03 | M | No irreversible delete without a second step; undo proven |
| 3 | **Fix the minimum window.** Modal `max-height: calc(100vh - 48px)`, internal scroll, sticky header/footer, centre within the content area, close always visible. Signup card scrolls cleanly. | RS-01, RS-02, AU-08, RP-01, RP-02 | M | Run Setup fully operable and dismissible at 960×640; signup fits or scrolls with visible footer |
| 4 | **Accessibility baseline.** Global `:focus-visible` ring; replace `--text-muted` with `#94a3b8` (or darker surfaces); minimum 12px for metadata; 24px minimum target. | GS-01, GS-03, GS-04, GS-07 | S | Tab walk shows a visible ring on every control; axe criticals = 0 |
| 5 | **Fix data truth.** Clamp the ratio label or add an overage state; replace “Active profile 1” with a label; add chart values/dates; distinguish loading from zero. | HM-01, HM-02, HM-04, LS-01 | S | No impossible ratio; no boolean-as-number; skeleton on load |
| 6 | **Billing clarity.** Remove the threshold/stage/grace memo; one recommended CTA; fix “Default R0”; explain the bonus and cap in one sentence. | BL-01…BL-05, BL-08 | M | A first-time user can state their monthly cost and cap after 30 seconds |
| 7 | **Remove internal identifiers.** No env-var names, `fill_secret`, device key or “Windows Credential Manager” in user copy or toasts. | ST-01, ST-02, ON-02, CT-07 | S | A grep of renderer strings finds no `_PASSWORD`, `dev_`, `fill_secret` |
| 8 | **Legal presentation.** Bump all three docs to the current version; render markdown as headings/paragraphs/lists in a 720px modal with scroll and print/download. | ST-11, ST-12 | S | ToS shows version 0.7.1 and readable typography |
| 9 | **One formatting layer.** `Intl.DateTimeFormat('en-ZA')`, `Intl.NumberFormat('en-ZA')`, a single location formatter, stripped profile indices. | AP-03, CT-01, CT-02, CT-04, CT-05, PF-01 | S | One date, one currency, one location format across all screens |
| 10 | **Page-title contract.** Every route has a stable noun H1 + 1-line subtitle; Review stops being a sentence; Run gets a title. | RV-02, RN-01, PF-02, RL-01 | S | All eight routes follow the same header anatomy |

### P2 — Design consistency (weeks 3–6, ~20–25 dev-days)

| # | Action | Fixes | Effort | Exit criterion |
|---|---|---|---|---|
| 11 | **Token enforcement.** Adopt an 8-step type scale, 4pt spacing, 4 radii, 3 control heights; delete the `!important` override layer; lint raw values in CSS. | GS-04…GS-06, GS-13, C | L | ≤8 font sizes, ≤4 radii, 0 `!important` for layout |
| 12 | **Component library.** Button, input, select, checkbox, card, modal, table, toast, page header, empty state — one implementation each, documented with states. | GS-05, AU-10, DL-02, ST-08, PF-05, RS-05 | L | Screens compose primitives; visual diff between screens ~0 |
| 13 | **IA reset.** Merge Account into Settings or give it a sidebar entry and real content; split Settings into sub-nav (Credentials, Run, Updates, Legal, Account); one save model per screen; one signup path. | AC-01…AC-05, ST-05, RL-02, AU-04, GS | L | Every screen reachable in one click with an active nav state; no duplicated destinations |
| 14 | **Responsive system.** Breakpoints 1280/1100/960; sidebar collapses to 64px; grids 3→2→1; tables get horizontal scroll + sticky first column; modals fit. | RP-03…RP-05, ST-04, HM-06 | L | Full pass at 960/1280/1920 with no clipping |
| 15 | **Table component.** 44px rows, sortable headers, pagination 25/50/100, labelled action column, overflow menu, bulk select. | AP-01…AP-08 | M | 100-row dataset usable without horizontal scroll at 1360 |
| 16 | **Content style guide + lint.** Banned terms (`PAYG`, `grace protection`, `bundle`, env vars), sentence case, verb+object labels, SA English, money/date formats. | CT-01…CT-08, BL-03, BL-05 | M | A content lint passes in CI; no banned term ships |
| 17 | **Notifications and toasts.** Real event model, read state, timestamps, mark-all-read, empty state; toasts with undo and ARIA live. | NT-01…NT-04, DL-03, DL-05 | M | Opening the panel clears the badge; every destructive toast has Undo |
| 18 | **Onboarding rebuild.** Product screenshots instead of emoji; teach the cap/allowance and “Approve each”; skippable. | ON-01…ON-06 | M | 4 steps, no implementation jargon, ≤60s |

### P3 — Premium product polish (weeks 7–12, ~30–40 dev-days)

| # | Action | Fixes | Effort | Exit criterion |
|---|---|---|---|---|
| 19 | **Billing as a product:** comparison table, recommended plan, invoices, payment method, next charge, cancellation, spend forecast. | BL-06, BL-07, BL-12 | L | A finance lead can reconcile a month without support |
| 20 | **Account & security centre:** name, plan, renewal, devices/sessions, password, 2FA, export, audit log. | AC-05, ST-02 | L | Passes a standard enterprise security questionnaire |
| 21 | **Empty/loading/error system:** illustrations, skeletons, retry, offline banner, stale-data marker. | LS-01…LS-04, HM-09 | M | Every async surface has 4 documented states |
| 22 | **Motion & density:** 120/200/320ms, two easings, compact/comfortable density, keyboard shortcuts, command palette. | C, RS-06 | M | Motion audit passes; no layout shift |
| 23 | **Accessibility certification:** WCAG 2.2 AA external audit, screen-reader pass, 200% zoom, high-contrast theme. | GS-01, GS-03 | L | Signed VPAT/AA statement |
| 24 | **Demo-grade narrative:** a 5-minute scripted flow that proves run → review → approve → invoice with no dead ends. | All | S | Demo completes without a single “ignore that” |

**Do not** add more gradients, glow or animation to compensate. The visual layer is already ahead of the product layer; more polish will widen the credibility gap.

---

# F. Proposed Design Standards

These are the standards I would ratify before any further feature work. They are deliberately narrow: a small system enforced is worth more than a large one documented.

### F1. Typography

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| Display | 32 / 40 | 600 | Onboarding/marketing only |
| H1 | 24 / 32 | 600 | One per screen |
| H2 | 18 / 26 | 600 | Card/section titles |
| H3 | 14 / 20 | 600 | Sub-sections, table group headers |
| Body | 14 / 22 | 400 | Default |
| Body S | 13 / 20 | 400 | Dense tables, helper text |
| Caption | 12 / 18 | 500 | Minimum size anywhere |
| Overline | 11 / 16 | 600, 0.08em | Eyebrows, uppercase labels only |

Rules: no 8.5–11.5px text; max two weights per screen; tabular numerals (`font-variant-numeric: tabular-nums`) for money, counts and dates; body measure ≤ 75 characters; no all-caps sentences.

### F2. Spacing, radius and elevation

- **Spacing:** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 only. Card padding 16/24; page gutter 24/32; section gap 32; form row gap 16.
- **Radius:** 6 (inputs, small controls), 10 (cards, panels), 14 (modals, large surfaces), 999 (pills/avatars). Nothing else.
- **Elevation:** one shadow token for raised cards, one for modals; no shadow on inline chips.
- **Borders:** 1px `#1c2238`; focus/hover uses colour + 1px, never size change.

### F3. Controls and hierarchy

| Height | Use |
|---|---|
| 32 | Compact/table actions, chips with text |
| 40 | Default button, input, select |
| 48 | Primary CTA in auth/onboarding/modals |

- One primary button per view. Secondary = outline; tertiary = text; danger only for destructive and always paired with confirmation.
- Button labels are **verb + object** (“Save cap”, “Open posting”, “Remove application”), never bare nouns or arrows alone.
- Icon buttons are ≥ 32×32 with a 16px icon and an accessible name; no text glyphs.
- Single-select pattern: one pattern app-wide (recommended: segmented control for ≤4 options, radio cards for rich options), with a check indicator, not colour alone.

### F4. Colour and contrast

- Body text ≥ **4.5:1**; large text ≥ 3:1; UI boundaries ≥ 3:1.
- Retire `#64748b` for body/metadata. Use `#94a3b8` (7.35:1) as the muted floor on `#0e111a`.
- Status is never colour-only: pill = dot/icon + label.
- Danger red (`#ef4444`) is reserved for destructive actions and errors, never for sign-out or neutral warnings.
- One light surface maximum (the browser preview). If the app is dark, the chrome is dark too.

### F5. Focus and keyboard

```css
:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
  border-radius: inherit;
}
```

- Never `outline: none` without a replacement.
- Logical tab order; modals trap focus, restore focus on close, close on Esc; toasts use `role="status"`, errors `role="alert"`.
- Minimum target 24×24 (44×44 recommended for primary/destructive).

### F6. Layout and page anatomy

- Content max-width **1200px**, centred, 24px gutters; sidebar 240px (collapsed 64px below 1100).
- Breakpoints: **1280 / 1100 / 960**. Test every screen at all three plus 1920.
- Page header: optional overline, H1 noun (24px), one-line subtitle ≤ 80 chars, actions right-aligned, 24px below.
- Modals: `max-width: 560px` (720 for legal), `max-height: calc(100vh - 48px)`, sticky header/footer, X + Esc + backdrop, centred in the **content area**.
- Tables: 44px rows, sticky header, sortable columns, pagination, labelled action column, actions in a menu.

### F7. Content standards

- **Never** show environment variable names, device keys, internal IDs, function names, OS credential-store names or pricing-engine terms. Say “stored securely on this device”.
- Dates: `2 Nov 2026` (and `2 Nov 2026, 14:33` when time matters), via `Intl.DateTimeFormat('en-ZA')`.
- Money: `R1 499` / `R40 per application`, via `Intl.NumberFormat('en-ZA')`; no space after R for small amounts (`R160`), one format per context.
- Locations: `Johannesburg, Gauteng` or `Johannesburg, Gauteng, South Africa` — pick one and apply everywhere.
- Profile names: human names only; never append indices.
- Plans: one noun per tier (`Starter`, `Lite`, `Standard`, `Power`); no alternate forms in copy.
- One label per action across the product.
- Every error says what happened, why, and the next step; every empty state says what will appear and offers the action that creates it.

### F8. State standards

- **Loading:** skeleton matching final layout; no zero-values that look like data.
- **Empty:** icon + one sentence + one action.
- **Error:** inline cause + recovery action; page-level errors get Retry.
- **Disabled:** visible reason (tooltip or helper), never opacity alone.
- **Async button:** spinner + “Verb-ing…” + min 400ms visible state; prevent double submit.
- **Destructive:** confirm with object name; soft delete + 10s Undo for records; typed confirmation for credentials/account.
- **Success:** persistent saved state or timestamp, not only a transient toast.

### F9. Quality gates

1. **Storybook** for every primitive with all states.
2. **Visual regression** at 960/1280/1360/1920 on every PR.
3. **axe-core in CI**; zero critical/serious violations.
4. **Content lint** for banned terms and required formats.
5. **Token lint** to reject raw hex/px outside the token file.
6. **Design review checklist:** one primary, one H1, visible focus, 4.5:1, 12px minimum, no clipped text at 960, no dead-end action.

---

## Appendix: Evidence index

All artefacts are outside the repository at `C:\Users\mqhel\AppData\Local\Temp\opencode\fmsg-audit\`:

- **Real app, 1360×860:** `shots/01-home.png` … `23-settings-960.png`
- **Mocked real bundle, populated states:** `shots/app-01…app-11`
- **Auth, validation, focus, hover:** `shots/login-01…08`, `follow-01…05`, `follow-11…15`
- **Minimum-window evidence:** `follow-07-run-setup-960x640.png`, `follow-02-signup-960x640.png`, `follow-08/09/10`
- **Legal (real app):** `shots/legal-real-term.png` — proves the documents load and are stamped v0.6.0
- **Measurements:** `metrics.json`, `follow-metrics.json`
- **Harnesses:** `capture.cjs`, `mock-capture.cjs`, `followup2.cjs`, `followup3.cjs`, `legal-check.cjs`

No application files were modified during the audit.

---

**Bottom line:** this is a **5/10 product with an 8/10 surface**. It can be shown as a vision demo today, but not as an enterprise-ready product. Fix the five deal-breakers in P1 and the app moves to ~7/10; enforce the system in P2 and it reaches a credible 8.5; only then is P3 polish worth buying.

**Implementation plan:** [2026-11-03_fmsg-agents-ui-ux-remediation-plan_v0.7.1.md](./2026-11-03_fmsg-agents-ui-ux-remediation-plan_v0.7.1.md)
