# FMSG Agents — Temporary Operating Arrangement & Resource-Aware Delegation (2026-11-03)

Established the founder's temporary three-agent operating arrangement and the resource-cost delegation policy that now governs who implements what. This file exists so future sessions apply the arrangement from the first turn instead of re-deriving it.

## The temporary arrangement (until further notice)

| Role | Occupied by | Model context | Cost profile |
|---|---|---|---|
| **Argon** (Director of Technology) | DeepSeek V4 Pro (this model) | ~1M tokens | Highest cost (paid credits) |
| **Pro** (Senior Implementation Engineer) | DeepSeek Flash | 200k tokens | Lower cost |
| **Flash** (Delegated Implementation Engineer) | Big Pickle (free OpenCode Zen model) | 200k token limit | Free |

- Argon is unavailable; DeepSeek V4 Pro occupies the Argon role **until further notice**. This is temporary — **no permanent changes** to the SOP, role instruction files, or `AGENTS.md` were made for it. On-disk task records (assignments/EOTs/reviews) note the acting capacity inline.
- The file-driven delegation system is unchanged: `logs/EOT/deepseekprodelegation/` = Argon→Pro assignments (doer: DeepSeek Flash acting as Pro), `logs/EOT/deepseekflashdelegation/` = Pro→Flash assignments (doer: Big Pickle acting as Flash), EOT destinations and archiving rules unchanged. The human relays between the agents' sessions.

## Resource-aware delegation policy (founder directive, 2026-11-03)

- **The cost of using the Argon-role model is real and metered.** Every task the Argon-role model executes personally spends paid credits; the Pro-role model costs less; the Flash-role model is free.
- **Default posture: delegate when a task is simple enough to be executed from a step-by-step guide.** If the work is well-specified — exact files, exact edits, exact verification commands — hand it to the acting Pro (and let acting Pro further delegate genuinely isolated sub-tasks to acting Flash). A good delegation guide costs a fraction of the tokens the implementation itself would.
- **Keep with Argon (justified, not reflexive):** architecture and system design, security architecture, database schema/migrations/RLS, CDP session/browser lifecycle, hypervisor/VM architecture, main-process run pipeline, anything race-sensitive or irreversible, and anything where writing a foolproof guide would cost more than doing the work.
- **No delegation for its own sake** (standing rule) — but the calculus now includes cost: when in doubt between "delegate" and "do it myself", a well-bounded task with a writable step-by-step guide leans to delegation.
- Delegation guides must be **self-contained for a 200k-context doer**: file paths + line regions, exact patterns to reuse, the precise verification commands, the escalation conditions, and an explicit "do not touch" list. References by path, never by summarised memory.

## Current queue dispositions under this policy (2026-11-03)

- `TASK-20261103-005` (Run Setup modal redesign, renderer-only) → **delegated to acting Pro (DeepSeek Flash)** with a delegate-optimised step-by-step guide appended to the assignment. Acting Pro may delegate the isolated CSS phase to Big Pickle (SOP §5.4).
- `TASK-20261103-007` (live-preview active-page tracking) → **Argon-role implements directly**: CDP session/browser lifecycle is a senior boundary and race-sensitive.
- `TASK-20261103-009` Phase 1 (read-only host detection) → Argon-role does it directly: one command chain; a delegation guide would cost more than the work.
- `TASK-20261103-009` benchmark execution (Phase 2+) → remains delegable per the existing permission; timings decided when the prototype exists.
- Completed: `006` (run workspace), `010` (hotfix), `008` (profiles/CV) — approved + archived; `008`'s live-DB verification is founder-gated on migration 040 + `agent-cvs` bucket (`docs/SUPABASE_MIGRATION_040_APPLICATION_GUIDE.md`).

## Related records

- Governance SOP: `src/apps/fmsg-agents/docs/AI_ENGINEERING_SOP.md` (unchanged, authoritative).
- The founder's corrective directive and delegation review: recorded in `src/apps/fmsg-agents/docs/context/fmsg-agents-observability-profiles-runtime_2026-11-03.md` (Process notes).
