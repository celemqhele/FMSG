# CORRECTIVE_TASK_TEMPLATE.md — Corrective Assignment

> **How to use this template (delete this block after filling):**
> - Created **only by a reviewer/delegator** when previously submitted work is incomplete or incorrect (SOP §9).
> - Place in the **same delegation folder** as the original assignment: `logs/EOT/deepseekprodelegation/` (Argon correcting Pro) or `logs/EOT/deepseekflashdelegation/` (Pro correcting Flash).
> - The corrective task gets its own new, unique task ID (same convention) and a `corrective-` slug — e.g. `TASK-20261103-002_corrective-dashboard-refactor.md`. Never reuse the original ID.
> - Before filing: mark the **original** assignment `NEEDS_CORRECTION` and record the outcome in its Reviewer assessment. Do not edit or delete the original assignment or any EOT report.
> - Corrective work must not silently expand the original task. Scope expansion goes through the normal delegation path.
> - Archive the original assignment **together with** this file after final approval.
> - Governed by `docs/AI_ENGINEERING_SOP.md` (§9 corrections, §10 archiving).

---

# Corrective Task Assignment

## Identity

| Field | Value |
|---|---|
| **Task ID** | `TASK-YYYYMMDD-NNN` (new, unique) |
| **Task title** | *(short corrective title — slug prefix `corrective-`)* |
| **Created** | `YYYY-MM-DDTHH:MM:SS+02:00` |
| **Assigning agent (reviewer)** | Gemini Argon / DeepSeek V4 Pro *(delete as applicable)* |
| **Assigned agent** | DeepSeek V4 Pro / DeepSeek V4.1 Flash Free *(delete as applicable)* |
| **Status** | `PENDING` |

## Traceability

| Field | Value |
|---|---|
| **Corrective of (original task ID)** | `TASK-YYYYMMDD-NNN` |
| **Original assignment file** | `logs/EOT/<delegation-folder>/<TaskID>_<slug>.md` (relative path — preserved, unedited) |
| **Original EOT report** | `logs/EOT/<eot-folder>/EOT-<TaskID>_<slug>.md` (relative path — preserved, never overwritten) |
| **Prior corrective rounds** | *(task IDs and files of earlier corrections, or `None`)* |

## Issue identified

*(The exact defect the reviewer found — cite the EOT claim and the code/location inspected. Be specific: file, behaviour, criterion failed.)*

## Required correction

*(Precisely what must change. No scope expansion — restate the original scope boundary if needed.)*

## Permitted files

*(Allow-list for this corrective work.)*

## Prohibited files

*(Still prohibited — including everything the original assignment prohibited.)*

## Acceptance criteria

- [ ] *(Observable, testable conditions the correction must satisfy — including any original criteria that were previously unmet.)*

## Tests and validation

*(What must be run and pass; what evidence goes in the new EOT.)*

## Escalation conditions

*(As per the original assignment, plus: if the required correction turns out to need an architecture or scope change, stop and escalate per SOP §3.4.)*

---

## Execution record *(task doer only — append dated entries)*

| Timestamp | Entry |
|---|---|
| *(doer fills)* | *(doer fills)* |

## Completion declaration *(task doer only — a claim, not an approval)*

- **Declaration:** *(I, <agent>, declare the corrective execution complete/incomplete as recorded above and in my new EOT report.)*
- **EOT report:** `logs/EOT/<eot-folder>/EOT-<TaskID>_<slug>.md` *(new file, never overwriting the original EOT)*
- **Signed:** *(agent identity + role)*
- **Completed at:** `YYYY-MM-DDTHH:MM:SS+02:00`

## Reviewer assessment *(reviewer/delegator only — leave blank until review)*

- **Reviewed by:** *(agent identity + role)*
- **Reviewed at:** `YYYY-MM-DDTHH:MM:SS+02:00`
- **Outcome:** `APPROVED` / `NEEDS_CORRECTION`
- **Assessment notes:** *(did the correction resolve the issue without expanding scope?)*
- **Archived at:** `YYYY-MM-DDTHH:MM:SS+02:00` — original assignment **and** this corrective file archived together to `logs/EOT/<delegation-folder>/completed tasks/` *(only if APPROVED, only by the delegator)*
