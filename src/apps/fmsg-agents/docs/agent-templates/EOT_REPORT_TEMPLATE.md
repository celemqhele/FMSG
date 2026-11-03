# EOT_REPORT_TEMPLATE.md — End of Task Report

> **How to use this template (delete this block after filling):**
> - EOT means **End of Task**, not End of Day. A task is not finished until its EOT exists.
> - Destinations: Flash → `logs/EOT/deepseekproeot/`; Pro → `logs/EOT/argoneot/`.
> - Filename: `EOT-<TaskID>_<kebab-slug>.md`. If a task later needs another report (e.g. after corrective work), each new report gets a round suffix: `_R2.md`, `_R3.md`, … Previous reports are never overwritten.
> - **Factual only.** Never claim a test passed if it was not run — write "not run". Untested claims without evidence are a governance violation.
> - Need-to-know: report what the reviewer needs to verify, no more. Never include credentials, secrets, or private configuration values (SOP §2.3).
> - This report is your completion claim. It is **not** an approval. Approval belongs exclusively to the reviewer (`APPROVED` / `NEEDS_CORRECTION` in the assignment file).
> - Never overwrite or delete this file once written.
> - Governed by `docs/AI_ENGINEERING_SOP.md` (§7 contents, §7.4 integrity).

---

# End of Task Report

| Field | Value |
|---|---|
| **Task ID** | `TASK-YYYYMMDD-NNN` |
| **Original assignment reference** | `logs/EOT/<delegation-folder>/<TaskID>_<slug>.md` (relative path) |
| **Agent identity** | *(agent name + role)* |
| **Round** | `1` (or `2`, `3`, … for reports following corrective work — link previous reports below) |
| **Previous EOT reports** | *(relative paths of earlier rounds, or `None`)* |

## Objective

*(Restate the task objective as assigned.)*

## Completion status

**`COMPLETED`** / **`INCOMPLETE`** *(delete as applicable)*

*(If `INCOMPLETE`: state exactly what is unfinished, what remains, and why.)*

## Chronological implementation steps

1. `YYYY-MM-DDTHH:MM:SS+02:00` — *(what was done)*

## Files inspected

- *(relative paths)*

## Files created

- *(relative paths)*

## Files modified

- *(relative paths)*

## Files deleted

- *(relative paths — remember the repository recycle-bin rule; nothing is hard-deleted)*

## Technical methods used

*(Approaches, patterns, algorithms, tools. What a reviewer needs to understand the "how".)*

## Decisions made within authority

*(Local implementation decisions you were authorised to make. Include anything a reviewer might question.)*

## Problems encountered

*(Each problem and how it was handled.)*

## Unexpected discoveries

*(Anything surprising found in the codebase or data — especially anything that changes the task's premise.)*

## Escalations and resolutions

*(Escalations raised per SOP §3.4, to whom (via the human), and the resolution. `None` if none.)*

## Tests performed

*(Command or harness, what it exercised. List each test actually run.)*

## Test results

*(Pass/fail per test, with actual output evidence. `Not run` for anything not executed.)*

## Acceptance criteria assessment

- [ ] *(criterion from the assignment)* — **met / not met** *(evidence)*

## Deviations from instructions

*(Any deviation from the assignment, with justification — or `None`.)*

## Outstanding issues

*(What remains open, and who owns it — or `None`.)*

## Completion declaration

I, **<agent identity, role>**, declare that the statements in this report are factual and accurately describe the work performed on this task. This declaration is my completion claim for review; it is not an approval.

## Signature

**Agent signature:** *(agent identity + role)*
**Actual completion timestamp:** `YYYY-MM-DDTHH:MM:SS+02:00`
