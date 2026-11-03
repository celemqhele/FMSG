# FMSG Agents Engineering Governance Bootstrap

Established the complete three-agent AI engineering governance system for the FMSG Agents sub-project: the authoritative SOP, shared and role-specific agent instruction files, reusable Markdown templates, the implementation-blueprint location, and the full `logs/EOT/` delegation/EOT/archive directory tree — so the three previously designed agent role prompts (Gemini Argon, DeepSeek V4 Pro, DeepSeek V4.1 Flash Free) can be activated without missing dependencies. Docs/governance only; no application code changed.

## What was established

- **Authoritative SOP:** `src/apps/fmsg-agents/docs/AI_ENGINEERING_SOP.md` — hierarchy, technical-authority matrix, escalation conditions, blueprint requirements (`docs/blueprints/`), mandatory task-assignment files, task lifecycle (`PENDING` → `IN_PROGRESS` → `COMPLETED` → `PENDING_REVIEW` → `APPROVED` / `NEEDS_CORRECTION`), mandatory EOT reports, review hierarchy with the human confirmation checkpoint for Flash reviews, corrective assignments, completed-task archiving, the `REFRESH` command, and audit-trail/integrity rules.
- **Instruction entry points:** sub-project `AGENTS.md` (shared entry, read-first rules), `CLAUDE.md` (`@AGENTS.md`, mirrors the repo-root pattern), `GEMINI.md` (Argon entry, Gemini CLI convention), and role files `docs/agent-instructions/{ARGON,PRO,FLASH}.md`.
- **Templates:** `docs/agent-templates/TASK_ASSIGNMENT_TEMPLATE.md`, `EOT_REPORT_TEMPLATE.md`, `CORRECTIVE_TASK_TEMPLATE.md` — all reflect the SOP's statuses, signatures, review fields, task-ID and traceability conventions; none pre-fills completion or approval.
- **Directory tree:** `logs/EOT/{deepseekprodelegation,deepseekflashdelegation,deepseekproeot,argoneot}` plus both `completed tasks` archive folders (exact names, including the space). The tree predated this session but was empty; it is now the documented, authoritative working state.
- **Root `AGENTS.md` extension:** a pointer section so sessions started at the repo root discover the governance docs (OpenCode loads root `AGENTS.md` regardless of working directory; nested `AGENTS.md` is only discovered when the session's cwd is inside the sub-project).

## Key decisions

- **`logs/EOT/` is gitignored** (`.gitignore` line `src/apps/fmsg-agents/logs/`), so all assignments, EOT reports, and archives are local-only working state coordinated through the human on this machine. Force-adding EOT history to git later is a human decision, documented in SOP §13.
- **Task-ID convention:** `TASK-YYYYMMDD-NNN` with per-day sequences checked against the delegation folder (active and archived); corrective tasks get new unique IDs with a `corrective-` slug and a `Corrective of:` traceability field. EOT filenames: `EOT-<TaskID>_<slug>.md` with `_R2`, `_R3` round suffixes for post-correction reports (append-only).
- **Blueprint location:** `docs/blueprints/` (tracked), filenames `BLUEPRINT-YYYYMMDD-NNN_<slug>.md`.
- **No fake records:** the bootstrap created no sample assignments, no fictional EOT reports, and no fabricated completions. Directories and templates only.

## Follow-up notes

- The three role prompts must still be activated by the human in their respective clients; the human must ensure each client loads its entry file (`AGENTS.md` + role file; `GEMINI.md` for a Gemini CLI; `CLAUDE.md` pointer for Claude Code). Whether a given client auto-loads a file depends on the client — see the bootstrap report for the mechanism notes.
- Existing repo rules remain in force and are cross-referenced from the SOP: changelog `UNRELEASED.md` same-commit logging, context-file naming, and the recycle-bin rule.

## SOP v1.1 reconciliation (Argon role establishment, same day)

The Gemini Argon role-establishment prompt was reconciled against the bootstrap SOP. The hierarchy, statuses, paths, and review chain already matched; six gaps were closed without conflicts:

- **Blueprint contents** (§5.2) now include Task ID, rollback considerations, and explicit instructions/restrictions, matching the role prompt's blueprint list.
- **Delegation-restrictions field** (§6.2 + task template): every assignment must state one of three modes, with the literal `DO NOT DELEGATE TO FLASH. IMPLEMENT THIS YOURSELF.` when prohibited.
- **Flash delegation governance** (§5.4): low-risk Flash-suitable task types, review-before-integrate, Argon's restrictions take precedence, and Argon's right to reclaim delegated tasks.
- **File modification safeguards** (§3.5): inspect-before-change, binding file lists, no fabricated change claims, recycle-bin, no unjustified dependencies.
- **Review report format** (§8.5) and **REFRESH operational summary** (§11.4): structured reporting formats for every review and every `REFRESH`.
- Role files updated to match (`ARGON.md` delegation modes + Flash governance, `PRO.md` delegation obedience + review-before-integrate).

No existing instruction conflicted with the governance system; nothing was removed.

## SOP v1.2 policy incorporation (founder policy directive, same day)

The founder's policy directive (need-to-know disclosure, information compartmentalisation, execution discipline) was incorporated into the governance documents:

- **SOP §2.3 (new)** — information compartmentalisation: Argon→Pro and Pro→Flash disclosure rules, context-window efficiency, confidentiality/discretion (no secrets in assignments or EOTs), and enforcement responsibilities.
- **SOP §3.6 (new)** — execution discipline: approved assignments are instructions to execute, not invitations to reopen decisions; preference disputes are not escalation.
- **SOP §3.4 (expanded)** — legitimate escalation exception list (security vulnerability, destructive/irreversible operation, technical contradiction, missing requirement, architectural/compatibility problem, performance/reliability/data-integrity risk, conflict with a higher-priority directive).
- **SOP §12 (extended)** — confidentiality bullet in the audit-trail section.
- Templates gained need-to-know/confidentiality notes; `AGENTS.md` gained a need-to-know bullet; `ARGON.md`, `PRO.md`, and `FLASH.md` gained their enforcement/obedience clauses.

The founder/MD reporting structure (founder → ChatGPT as Managing Director → Argon) remains a standalone organisational instruction and was deliberately **not** written into the SOP — that instruction explicitly said not to modify the SOP for it, and this policy says to preserve the existing organisational structure.

## SOP v1.3 senior-level access control (founder directive, same day)

The founder's senior-level information access-control directive was implemented:

- **`argon-restricted/` compartment** (sub-project root): local-only via a nested `.gitignore` (`*`) — invisible to git, never committed, recreated on first use. Contains a local README defining the access policy, the restricted information classes, the on-first-use layout (`security/`, `strategy/`, `secrets/`), and handling rules. No content was fabricated; the compartment is empty apart from the policy README.
- **SOP §2.4 (new):** restricted classes (architectural deliberations, security assessments/vulnerability details, strategic evaluations, sensitive operational configurations, management discussions, credentials), storage rule, Pro/Flash prohibition, what stays accessible, audit and founder-oversight guarantees, and the honest technical-reality statement (single user account → per-agent OS ACLs unavailable; controls = git-exclusion + policy + human enforcement).
- **Role files and `AGENTS.md`:** Argon owns and populates the compartment; Pro and Flash are prohibited from reading/seeking/reconstructing it and must report accidental exposure upward.
- **Existing files assessed, none moved or restricted:** `.opencode/supabase-access.env` stays local-only in place (moving it would break the documented Supabase direct-access workflow); `docs/fmsg-agents-findings.md` and context files stay accessible (they contain assessments and key *names*, no secret values, and are required auditing records). No secret values were found in any tracked file.

## Implementation-management access review (Pro, 2026-11-03)

Pro reviewed the Pro↔Flash implementation-management workflow against Argon's access-control directive (Pro access appropriate to its responsibilities, Flash receives only necessary information, Argon retains visibility, sensitive information protected, existing EOT/delegation/review/archive/REFRESH procedures intact). Outcome: the visibility chain satisfies seven of eight required controls. One gap was found and **escalated rather than patched unilaterally**, because SOP contents and templates are Argon's governance artifacts.

| Requirement | Where satisfied | Result |
|---|---|---|
| Traceable task ID | SOP §6.3; assignment template Identity table | Met |
| Accurate status | SOP §4 vocabulary; assignment Status field | Met |
| EOT documents work performed | SOP §7.3; EOT template | Met |
| Files modified identifiable | EOT template *Files created/modified/deleted* | Met |
| Tests and validation recorded | EOT template *Tests performed* / *Test results* (§7.4 forbids untested claims) | Met |
| Blockers and escalations visible | Assignment *Execution record*; EOT *Escalations and resolutions* + *Outstanding issues* | Met |
| Corrections and approvals traceable | Assignment *Reviewer assessment*; corrective template *Traceability* table; §10 archives preserved | Met |
| No work outside assigned scope | SOP §3.5 binding file lists; §8.2(5) permitted-file verification | Met |
| **Parent task → delegated Flash work** | **Gap** — Flash assignments carry `Parent task ID` (downward link only); SOP §7.3's 23 EOT contents and the EOT template have **no field** for a Pro EOT to name the Flash task IDs and Flash EOT paths it delegated and reviewed. | **Not met** |

**Consequence of the gap:** Argon can trace a Flash assignment up to its parent task, but cannot follow a *completed* parent task down to the Flash work it contained without opening every Flash EOT. This conflicts with Pro role-instruction §10 items 12–13 ("Flash delegation details", "Flash task IDs and EOT references"), for which the template provides no slot.

**Status:** escalated to Argon as a proposed amendment to SOP §7.3 and the EOT template — add a *Delegated Flash work* table (Flash task ID, objective, status, EOT path, review outcome). Until then, Pro records Flash task IDs and EOT paths inside the chronological-steps and decisions sections of its own EOTs.

**Interoperability note:** no information-classification convention exists anywhere in the repo — nothing is marked restricted. All governance material is plaintext and equally readable by all three agents, so access control is behavioural (SOP §2.3 compartmentalisation), not technically enforced. No sensitive tier exists in the active `deepseekprodelegation/`, `deepseekflashdelegation/`, `deepseekproeot/` or `argoneot/` trees (all four are empty), and `logs/` is gitignored, so EOT/assignment content cannot leak into version control. `.opencode/supabase-access.env` (Supabase service key) sits outside the EOT tree and must never be copied into an assignment or EOT.
