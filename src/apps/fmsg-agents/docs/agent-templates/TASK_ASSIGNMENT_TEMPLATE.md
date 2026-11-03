# TASK_ASSIGNMENT_TEMPLATE.md — Task Assignment

> **How to use this template (delete this block after filling):**
> - Copy this file into the correct delegation folder: `logs/EOT/deepseekprodelegation/` (Argon → Pro) or `logs/EOT/deepseekflashdelegation/` (Pro → Flash).
> - Filename: `<TaskID>_<kebab-slug>.md`. Task IDs: `TASK-YYYYMMDD-NNN` — check the delegation folder (active and `completed tasks`) for collisions first; never reuse an ID.
> - New assignments start with `Status: PENDING`. Do not pre-fill the Execution Record, Completion Declaration, or Reviewer Assessment.
> - Only the task doer updates the Execution Record and Completion Declaration. Only the reviewer/delegator fills the Reviewer Assessment and may set `APPROVED` or `NEEDS_CORRECTION`.
> - Need-to-know: include only information the assignee needs to execute, verify, and report. Never paste credentials, secrets, or private configuration values; do not reproduce conversation histories; reference documents by path (SOP §2.3).
> - A task marked `COMPLETED` is not approved. Only `APPROVED` tasks may be archived, and only by the delegator.
> - Governed by `docs/AI_ENGINEERING_SOP.md` (§4 statuses, §6 assignments).

---

# Task Assignment

## Identity

| Field | Value |
|---|---|
| **Task ID** | `TASK-YYYYMMDD-NNN` |
| **Task title** | *(short kebab-slug-compatible title)* |
| **Created** | `YYYY-MM-DDTHH:MM:SS+02:00` (ISO 8601, local offset) |
| **Assigning agent** | Gemini Argon / DeepSeek V4 Pro *(delete as applicable)* |
| **Assigned agent** | DeepSeek V4 Pro / DeepSeek V4.1 Flash Free *(delete as applicable)* |
| **Parent task ID** | `TASK-YYYYMMDD-NNN` or `None (top-level)` |
| **Status** | `PENDING` |

## Objective

*(What the finished work achieves — one to three sentences.)*

## Background

*(Why this work exists. Context, history, links to related tasks or context files by path.)*

## Blueprint / specification reference

*(Relative path to the blueprint in `docs/blueprints/`, or: `None — trivial task, no blueprint required` with a one-line justification.)*

## Scope

*(Precise boundaries of the work: what is in, and explicitly what is out.)*

## Delegation restrictions

*(Choose exactly one mode — this field is mandatory:)*

- `IMPLEMENT ENTIRELY YOURSELF` — execute the whole task; no Flash involvement.
- `MAY DELEGATE TO FLASH` — you may delegate the following named sub-tasks to Flash: *(list them, or "any isolated low-risk sub-task consistent with SOP §5.4")*
- `DO NOT DELEGATE TO FLASH. IMPLEMENT THIS YOURSELF.` — use this literal sentence when delegation is prohibited.

*(Delegation permissions may be changed at any time by the assigning agent via a dated entry in the Execution Record.)*

## Permitted files

*(Exclusive allow-list. The doer may inspect other files for context, but may modify only these.)*

- `src/apps/fmsg-agents/...`

## Prohibited files

*(Must not be modified. Touching any of these without the assigner's written approval is a scope violation.)*

- *(none)*

## Sequential instructions

1. *(Read the referenced blueprint and files first.)*
2. *(Ordered, verifiable steps.)*

## Dependencies

- *(Tasks, migrations, credentials, or approvals that must land first.)*
- *(none)*

## Acceptance criteria

- [ ] *(Observable, testable condition.)*

## Tests and validation

*(Which tests must exist, be run, and pass. What evidence goes in the EOT.)*

## Escalation conditions

*(Situations where the doer must stop and escalate per SOP §3.4 — e.g. ambiguity, scope expansion, architecture or dependency decisions.)*

---

## Execution record *(task doer only — append dated entries)*

| Timestamp | Entry |
|---|---|
| *(doer fills)* | *(doer fills)* |

## Completion declaration *(task doer only — fill at the end; a claim, not an approval)*

- **Declaration:** *(I, <agent>, declare the execution of this task complete/incomplete as recorded above and in my EOT report.)*
- **EOT report:** `logs/EOT/argoneot/EOT-<TaskID>_<slug>.md` (Pro) / `logs/EOT/deepseekproeot/EOT-<TaskID>_<slug>.md` (Flash)
- **Signed:** *(agent identity + role)*
- **Completed at:** `YYYY-MM-DDTHH:MM:SS+02:00`

## Reviewer assessment *(reviewer/delegator only — leave blank until review)*

- **Reviewed by:** *(agent identity + role)*
- **Reviewed at:** `YYYY-MM-DDTHH:MM:SS+02:00`
- **Outcome:** `APPROVED` / `NEEDS_CORRECTION`
- **Assessment notes:** *(inspection findings: implementation vs. blueprint, acceptance criteria, file scope, test evidence)*
- **Corrections (if any):** *(link corrective assignment file by path)*
- **Archived at:** `YYYY-MM-DDTHH:MM:SS+02:00` → `logs/EOT/<folder>/completed tasks/` *(only if APPROVED, only by the delegator)*
