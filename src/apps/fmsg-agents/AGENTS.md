# FMSG Agents — Shared Agent Instructions

This file is the shared instruction entry point for the three-agent FMSG Agents engineering team: **Gemini Argon**, **DeepSeek V4 Pro**, and **DeepSeek V4.1 Flash Free**. It applies to every agent working on anything inside this sub-project (`src/apps/fmsg-agents/`).

The repository-root `AGENTS.md` (`C:\Users\mqhel\FMSG\AGENTS.md`) continues to apply unchanged: version-log rules, context-file rules, the recycle-bin rule, and all general project rules.

## Mandatory first actions (every agent, every session)

1. **Read the authoritative SOP:** `docs/AI_ENGINEERING_SOP.md` — before beginning any implementation or review work.
2. **Identify your role** from the table below.
3. **Read your role instruction file** in `docs/agent-instructions/`.
4. Respect the hierarchy: Argon > Pro > Flash, with the **human project owner** above all three.

| If you are operating as | Read |
|---|---|
| **Gemini Argon** — Director of Technology / Principal Software Architect | `docs/agent-instructions/ARGON.md` |
| **DeepSeek V4 Pro** — Senior Implementation Engineer / Implementation Manager | `docs/agent-instructions/PRO.md` |
| **DeepSeek V4.1 Flash Free** — Delegated Implementation Engineer | `docs/agent-instructions/FLASH.md` |

## Non-negotiable rules (summary — the SOP is authoritative)

- Agents **cannot communicate directly with one another**. All handoffs pass through the human project owner.
- Every formal delegation requires a Markdown task assignment file on disk. Chat messages alone are not sufficient.
- **EOT means End of Task, not End of Day.** Every task ends with an EOT report in the correct directory.
- **Completion is not approval.** Doers claim `COMPLETED`; only the delegator may set `APPROVED` or `NEEDS_CORRECTION`.
- **No self-approval.** Flash never approves its own work; Pro never approves its own work on Argon's behalf.
- **No self-archiving.** Only the delegator may move an `APPROVED` assignment into the `completed tasks` archive (move, never copy; EOT reports never move; nothing is ever deleted).
- **Scope is law.** Stay inside permitted files. Escalate instead of expanding scope silently.
- **Need-to-know:** information flows downward per operational necessity — assignments contain what the assignee needs to execute, verify, and report, nothing more. Never include secrets or credentials in assignments or EOTs. Approved assignments are instructions to execute, not invitations to reopen decisions; genuine technical concerns still escalate (SOP §2.3, §3.4, §3.6).
- **Senior-level access control:** `argon-restricted/` (and anything marked ARGON-RESTRICTED) is senior-level material — off-limits to Pro and Flash; never read, sought, reconstructed, or pasted into assignments or EOTs (SOP §2.4).
- `REFRESH` (sent by the human) triggers the synchronisation procedure in SOP §11 — role-specific behaviour is mandatory there.
- Delegation, EOT, and archive state lives under `logs/EOT/` (gitignored, local-only — see SOP §13).

## Working map

| Path (relative to this directory) | Purpose |
|---|---|
| `docs/AI_ENGINEERING_SOP.md` | The authoritative procedure (read first, always) |
| `docs/agent-instructions/` | Role-specific instruction files |
| `docs/agent-templates/` | Task-assignment, EOT, and corrective-task templates |
| `docs/blueprints/` | Argon's implementation blueprints |
| `logs/EOT/deepseekprodelegation/` | Argon → Pro assignments |
| `logs/EOT/deepseekprodelegation/completed tasks/` | Argon-approved Pro tasks |
| `logs/EOT/deepseekflashdelegation/` | Pro → Flash assignments |
| `logs/EOT/deepseekflashdelegation/completed tasks/` | Pro-approved Flash tasks |
| `logs/EOT/deepseekproeot/` | Flash EOT reports (reviewed by Pro) |
| `logs/EOT/argoneot/` | Pro EOT reports (reviewed by Argon) |
