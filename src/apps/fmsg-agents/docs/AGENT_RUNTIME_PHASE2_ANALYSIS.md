# FMSG Agent Runtime — Phase 2 Analysis & Next-Stage Plan

**Author:** Argon-role (DeepSeek V4 Pro acting) · **Date:** 2026-11-03 (host clock)
**Basis:** `TASK-20261103-011` raw results (approved), same-session proof (009 Phase 2), protocol `docs/AGENT_RUNTIME_BENCHMARK_PROTOCOL.md`.

## 1. Verdict on the WSL2 prototype (measured, not estimated)

The lightweight appliance-class stack (Ubuntu 22.04 LTS rootfs, Xvfb + openbox + Chromium + Playwright + VNC/noVNC) **beats every founder target**:

| Metric | Measured | Founder target | Margin |
|---|---|---|---|
| Stream FPS | **30.0 sustained** @ 1280×720 | ≥15, prefer 20–30 | ✅ 2× |
| Glass-to-glass latency | **median 92 ms** (60–97) | ≤250 ms | ✅ ~2.7× |
| Installed footprint | **3.2 GB guest / 3.5 GB vhdx** | (reference: 25–35 GB desktop VM) | ✅ ~8× lighter |
| Idle RAM | 431 MB guest / ~1.1 GB host process | — | light |
| Active RAM / CPU | max 794 MB / 7.2 % | — | comfortable on 16 GB |
| Warm / cold start | 229 ms / distro 2.5 s, **display stack 21.5 s** to first frame | — | the stack boot is the cost, not the OS |
| Shutdown | ~120 ms | — | excellent |
| Disk growth (3 runs) | +624 KB | — | negligible |
| Stability | 3/3 runs, identical results | — | ✅ |
| Same-session | proven with 40 ms-paired guest/host frames | non-negotiable | ✅ |

**Conclusion:** the architecture the founder directed (VM-hosted Linux, streamed display, automation inside) is **validated cheaply**. The 21.5 s cold-stack start and the supervision gap (a healthy 6080 with a dead 5900) are the two engineering findings to carry forward — both solvable (start the stack in parallel with run setup; health-check real frames).

## 2. What the prototype does NOT answer (and what does)

- **WSL2 is a lab, not a product runtime.** The shipped app cannot require users to manage WSL2. The product path remains a **managed VM** (or managed container) with this exact stack inside — the WSL2 numbers are the appliance's expected ceiling/floor.
- **KasmVNC vs x11vnc/noVNC** — quality, auth, WebRTC modes. KasmVNC is the founder's serious candidate; it must be measured on the same matrix.
- **Containerisation** (per-run disposability) — Docker adds a licensing/distribution question we do not need for the product path, and the WSL2 guest is already snapshot-disposable. Recommendation: **defer Docker Desktop; revisit containers during appliance design only if per-run disposability cannot come from VM snapshots.**
- **The full VM** — stronger isolation, self-managed, shippable. This is the next major milestone.

## 3. Next-stage plan

1. **KasmVNC measurement in the existing guest** (guest-only additive install; no host change, no founder gate) — same matrix as the protocol, then a side-by-side stream-quality table (noVNC vs KasmVNC).
2. **Appliance + VM stage** — distribution DECIDED by the founder (2026-11-03): the runtime ships **inside our own native installer**; the user downloads only FMSG Agents and the app handles everything. Multi-GB installer accepted — storage is not a limiter. Product hypervisor therefore **QEMU+WHPX** (redistributable, driverless, embeds in the installer; one-time guided, consent-gated WHPX enable + restart). VirtualBox remains a prototype convenience only.
3. **Appliance build** (reproducible minimal image from the WSL2-validated stack), **Runtime Bridge** (bounded API, loopback/vsock), **stream integration into the Run canvas**, **Inkling action SOP** (delegable), **installer integration** (QEMU + signed appliance image + first-run auto-provisioning flow) — each staged as before.

## 4. Founder gates

- **G2 — Hypervisor: RESOLVED by the installer-embedding decision → QEMU+WHPX for the product.** For the prototype VM stage, VirtualBox remains available (install, admin; usually no restart) if a quick reference VM is wanted before the QEMU path is built.
- **G3 — Full Ubuntu 26.04.1 Desktop ISO (~6 GB): now OPTIONAL.** The appliance stack is validated; the desktop-VM comparison row can be skipped unless the founder wants the data point.
- The one-time **WHPX enable + restart** becomes a guided in-app step at product build time — surfaced with consent, never silent.
