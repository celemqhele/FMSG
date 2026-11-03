# FMSG Agent Runtime — Architecture Proposal v0.1 (feasibility memo)

**Author:** Argon-role (DeepSeek V4 Pro acting, temporary arrangement) · **Date:** 2026-11-04
**Input:** Founder directive — "find a way to render and make the FMSG Agents app work as a virtual machine… install a cheap OS within the FMSG Agents app… run that OS for browsing… display live stream… hand the keys to the model Inkling via the OS's cmd… complete SOP for commands, nuance situations, and prompts to the user outside the OS for passwords/IDs."
**Status:** Proposal. Extends `TASK-20261103-009` (Ubuntu runtime investigation); implementation remains gated on the Phase-2 founder approvals in `docs/HOST_PREREQUISITES_REPORT_2026-11-03.md`.

---

## 1. Feasibility verdict

**HIGH.** Every building block is mature: embedding a VM hypervisor in a desktop app (QEMU+WHPX / VirtualBox), streaming a virtual display (KasmVNC/SPICE/WebRTC), driving Chromium deterministically (Playwright), and a host-side human-in-the-loop prompt system (the existing `attention`/"Needs You" mechanism). The architecture below is a **VM-manager desktop app** — exactly how VirtualBox/UTM work, with FMSG-specific automation inside the guest.

The three things that determine success are NOT the VM:

1. **The action contract given to Inkling** (a weak model must never be handed raw shell — see §5).
2. **Where secrets live** (host-side; injected only at form-field level inside the guest — see §6).
3. **Distribution weight** (a multi-GB runtime replaces the 92 MB installer — accepted by the founder, priced in §8).

---

## 2. Component architecture

```
┌────────────────────────── WINDOWS HOST ──────────────────────────┐
│  FMSG Agents (Electron)                                          │
│  ├─ main process                                                │
│  │   ├─ VM Manager (QEMU+WHPX or VirtualBox as a child process) │
│  │   │     - start/stop/health/snapshot/persistence policy      │
│  │   ├─ Runtime Bridge (host ⇄ guest, loopback-only or vsock)   │
│  │   │     - automation commands / events / CV transfer / logs  │
│  │   │     - NO arbitrary shell from the model. Never.          │
│  │   └─ Secret Vault (existing DPAPI + keytar, host-side)       │
│  ├─ renderer                                                     │
│  │   ├─ Run workspace (existing tabs; preview becomes the       │
│  │   │   streaming canvas - runtime-agnostic by design)         │
│  │   └─ "Needs You" prompts (existing attention mechanism)      │
│  └─ stream viewer (KasmVNC web client or equivalent)            │
│                                                                  │
│  ┌──────────────── GUEST VM (Linux appliance) ────────────────┐ │
│  │  Ubuntu Server minimal or Debian slim (~1.5-3 GB)           │ │
│  │  ├─ Xvfb + openbox  (virtual display, cursor visible)       │ │
│  │  ├─ Chromium        (the browser being watched)             │ │
│  │  ├─ KasmVNC         (streams THE SAME display)              │ │
│  │  ├─ Agent Runner    (Node + Playwright - deterministic)     │ │
│  │  │     - executes ONLY the validated action contract        │ │
│  │  │     - receives Inkling's decisions as parameters         │ │
│  │  │     - falls back to deterministic heuristics when the    │ │
│  │  │       model is weak/wrong/offline (existing pattern)     │ │
│  │  └─ Runtime Bridge agent (bounded API, loopback/vsock only) │ │
│  └─────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

**Data flows**
- **Watch:** guest display → KasmVNC → Electron stream viewer. Same session the automation controls — never a second simulated browser.
- **Act:** Inkling decision (host or guest side, model calls proxied through the existing OpenRouter path) → **action contract** → guest Agent Runner → Playwright against the real Chromium. Visible typing/clicking (sequential `type`, real cursor).
- **Ask the user:** guest detects login/CAPTCHA/sensitive fields → bridge event → host shows the "Needs You" modal (countdown → skip-safe). The user's answer/secrets are typed by the automation layer at field level; they never enter Inkling's context.
- **Files:** CV download → host → bridge (controlled channel) → guest temp location → attached via `setInputFiles`; cleaned per run.

---

## 3. What changes vs today (honest scope)

| Today (v0.10.x) | Runtime (target) | Effort |
|---|---|---|
| Playwright controls Windows Chrome | Playwright controls guest Chromium (same code, new target) | Small |
| CDP screencast → `browser-frame` IPC events | KasmVNC/SPICE video stream → stream viewer | Medium |
| `agent-controller.ts` runs in main process | Guest-side Agent Runner (port of the same logic) | Medium |
| `attention`/Needs You (exists) | Same mechanism, unchanged UX, secrets never sent to the model | Small |
| — | VM Manager (QEMU/VirtualBox child process, lifecycle, snapshots) | Large |
| — | Runtime Bridge (loopback/vsock, bounded API, no arbitrary shell) | Large |
| 92 MB installer | + runtime image (multi-GB, signed, checksummed, versioned, resumable or installer-embedded) | Large |
| — | Inkling **action SOP** (command grammar, validation, fallbacks, nuance playbook) | Large (docs + prompts) |

**This is a `v1.x`-scale program**, not a patch. The current CDP path stays the working fallback throughout (founder's standing rule).

---

## 4. "Cheap OS" choice (from the lightweight-Linux assessment)

**Ubuntu Server (minimized) + Xvfb + openbox + Chromium + Node/Playwright + KasmVNC** ≈ 1.5–3 GB installed, ~2 GB RAM. Full Ubuntu Desktop VM remains the reference implementation for measurement; Debian slim is the compatibility-safe alternative; Alpine rejected (musl). All sizes measured in Phase 2, never assumed.

---

## 5. The Inkling action contract — NOT raw shell

**Core rule: the model never gets the OS shell.** A weak model + free-form commands = fragile, unpausable, and a security hole. Instead:

- The OS exposes a **fixed, validated action library** (navigate, read-page-text, find-field, type-field, select-option, check-box, click, upload-file, screenshot, extract-form, wait-for-element, go-back, mark-suspicious, request-user-input).
- Inkling receives page context + candidate actions and returns **structured decisions** (JSON): which action, which parameters, which field values (from the CV text + form labels), when to escalate to the user.
- Every action is **validated and sanitised** by the deterministic runner before execution (field exists, type matches, values pass format checks, domains whitelisted where applicable).
- **Fallback ladder (already in the codebase's philosophy):** model unavailable/weak/wrong → deterministic heuristics (label-matching, known-field mapping, CV-derived values) → safe skip + user prompt. The SOP formalises exactly which fallback fires for which failure.
- **Nuance playbook (the "complete SOP"):** the deterministic layer owns the nuance — login walls, CAPTCHA, sensitive-field detection, redirects, popups, file uploads, confirmation pages, duplicate applications, rate limits, pagination, "already applied" detection. The model only chooses among offered options; the playbook covers every branch with a safe default (usually: prompt the user or skip).

This is the ONLY sane way to run a free-tier model on real job applications — and it is also what makes the system secure and auditable.

---

## 6. Security model (the founder's "locked away from Windows" goal)

- **VM isolation:** no shared clipboard, no shared folders, no host filesystem mounts, non-root browser user, per-run disposable overlays; persistent profile-specific browser state kept separately and per-profile only.
- **Host ⇄ guest channel:** loopback-only TCP (127.0.0.1) or virtio-vsock — never exposed to the LAN/internet; authenticated; single bounded API; no arbitrary command endpoint. KasmVNC binding: loopback-only, authenticated, TLS-wrapped where practical.
- **Secrets:** stay host-side (existing DPAPI vault). Passed to the automation layer only when a whitelisted site field demands them; typed at field level; never in model context, never in logs, never in the guest's persistent state.
- **CVs:** transferred over the controlled channel only; cleaned after each run; never in logs (existing redaction).
- **Residual risks (stated honestly):** VM escape is low-probability but nonzero — mitigated by minimal guest tooling, non-root execution, and no host reachability from the guest beyond the bridge. Browser compromise (malicious site) is contained inside the VM.

---

## 7. Prompts to the user outside the OS

Exactly the existing `attention` mechanism, now with the guest as the source of triggers: login needed, CAPTCHA, ID number, sensitive question, final-submit approval. Host-side modal, 10-minute countdown → **skip-safe**, optional local vault save. The user interacts with FMSG Agents, never with the guest OS directly. This satisfies "how to trigger prompts for the user outside of the OS for them to enter passwords id numbers etc."

---

## 8. Staged plan (folds into TASK-20261103-009 Phases 2–3)

1. **Phase 2 (needs today's founder approvals):** prototype per the host report — WSL2/Docker path first, then full VM — prove same-session streaming, CV transfer, visible typing, measurements. *(Phase 2 measured: 30 fps / 92 ms / 3.2 GB — validated.)*
2. **Inkling action SOP** — separate deliverable (grammar, validation, fallback ladder, nuance playbook) — blueprint-worthy; built against the guest runner.
3. **Runtime Bridge + VM Manager** — bounded API spec first, then implementation.
4. **Distribution — DECIDED (founder, 2026-11-03): the runtime is embedded in our own native installer.** The user downloads only FMSG Agents; the app handles everything else. A multi-GB installer is accepted and expected for agent software — **storage is not a limiter of options**. Concretely: the installer carries the FMSG app + the embedded hypervisor (QEMU) + the signed appliance image (compressed qcow2, ~2–4 GB class). The app's first-run flow auto-provisions: detects virtualisation → (with user consent, UAC-elevated) enables WHPX if absent and explains the one-time restart → resumes provisioning after reboot → starts the VM. Users never touch WSL2/Docker/manual downloads. Runtime-image updates ride installer-handoff releases (or a later signed runtime-update channel).
5. **Appliance build** — reproducible scripts (documented package list; never hand-stripped desktops).
6. **Migration path:** CDP fallback stays until the runtime is validated on real runs.

## 9. Open decisions (founder)

- **Hypervisor (product):** per the installer-embedding decision, the product default is **QEMU+WHPX** — redistributable (GPL), no driver installs, embeds cleanly inside our installer; the one-time WHPX enable + restart is a guided, consent-gated app step. VirtualBox remains a prototype convenience only. (G2 of the Phase-2 analysis resolves this way; founder confirmation recorded here.)
- **Full Ubuntu Desktop VM reference (G3):** now **optional** — the appliance stack is already validated by the WSL2 measurements and is the product path; the full-desktop row in the comparison table can be skipped unless the founder wants the data point.
- **App-only updates:** the v0.10.0 OTA-channel blocker (Supabase 413 / GitHub Releases) remains relevant only for app-code releases; the runtime no longer depends on it.
