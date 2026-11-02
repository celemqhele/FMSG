# FMSG Agents — Version Log & Regression Guide

This directory (`src/apps/fmsg-agents/docs/changelog/`) is the canonical, structured version log for **FMSG Agents**.

Every change made to FMSG Agents — whether in an interactive session or an automated run — must be recorded here so that when a problem is reported ("it worked in version A, broke in version B"), any engineer or AI session can immediately isolate the exact version, files, and infrastructure changes responsible.

---

## Directory Layout

- `INDEX.md` — **Read this first.** Contains the regression-hunting playbook and a one-line-per-version table (newest first).
- `UNRELEASED.md` — Collects every in-progress change as it is made. At release time, its contents are moved into a new dated version file (`YYYY-MM-DD_vX.Y.Z_short-title.md`).
- `YYYY-MM-DD_vX.Y.Z_short-title.md` — Immutable record for each released version using fixed headings.

---

## Reusable Prompt: Compare Two Versions & Fill In the Log

To ask any AI session to compare two versions and generate or verify a changelog entry, paste:

> **"Compare version `<VERSION_A>` to version `<VERSION_B>` and fill in the log in `src/apps/fmsg-agents/docs/changelog/`."**

### Exact Git Commands the AI Must Run

1. **Verify both tags exist (or locate their commits):**
   ```powershell
   git tag -l "v*"
   git rev-list -n 1 <VERSION_A>
   git rev-list -n 1 <VERSION_B>
   ```
2. **List all commits between the two versions touching FMSG Agents and its shared API routes:**
   ```powershell
   git log --oneline --date=short --format="%h %ad %s" <VERSION_A>..<VERSION_B> -- src/apps/fmsg-agents src/app/api/agent supabase/migrations
   ```
3. **Inspect the file-level summary (`Added`, `Modified`, `Deleted`, `Renamed`):**
   ```powershell
   git diff --name-status <VERSION_A>..<VERSION_B> -- src/apps/fmsg-agents src/app/api/agent supabase/migrations
   ```
4. **Inspect the line-level diff to identify behavioral, schema, and config changes:**
   ```powershell
   git diff --stat <VERSION_A>..<VERSION_B> -- src/apps/fmsg-agents src/app/api/agent supabase/migrations
   git diff <VERSION_A>..<VERSION_B> -- src/apps/fmsg-agents src/app/api/agent supabase/migrations
   ```
5. **Cross-check with the actual version in the repository:**
   - Read `src/apps/fmsg-agents/package.json` (`"version"`) and `src/apps/fmsg-agents/config.ts` (`APP_VERSION`).
   - If the code and the log disagree, report the discrepancy immediately and update the log so it matches reality.

---

## Semantic Versioning Rule (Relative to Repo Version)

Never guess or remember a version number from an earlier conversation. Always read `src/apps/fmsg-agents/package.json` and `src/apps/fmsg-agents/config.ts` first, then bump relative to that number:

- **Patch (`x.y.Z`)** — Small bug fix, styling tweak, or copy correction with no new feature or schema change.
- **Minor (`x.Y.0`)** — Modest or substantial feature update, UI redesign, or new endpoint/workflow (may jump more than one step when specified). Resets patch to `0`.
- **Major (`X.0.0`)** — Breaking architectural or protocol change. Resets minor and patch to `0`.
