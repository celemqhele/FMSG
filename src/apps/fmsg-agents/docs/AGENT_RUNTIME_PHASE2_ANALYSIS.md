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
2. **Full Ubuntu Desktop VM (reference implementation)** — requires founder decisions G2/G3 below.
3. **Appliance build** (reproducible minimal image from the WSL2-validated stack), **Runtime Bridge** (bounded API, loopback/vsock), **stream integration into the Run canvas**, **Inkling action SOP** (delegable), **distribution design** — each staged as before.

## 4. Founder gates for the VM stage (when you're ready)

- **G2 — Hypervisor choice:** **VirtualBox** (install, admin; usually no restart — fastest prototype path) **vs QEMU+WHPX** (enable `HypervisorPlatform`, admin + **restart**; cleaner to embed in the shipped product later — no drivers, GPL-redistributable). Recommendation: **VirtualBox now for the prototype**, revisit QEMU at product-embedding time.
- **G3 — Ubuntu 26.04.1 LTS Desktop ISO download (~6 GB)** for the reference VM.

No host feature, driver or download happens until G2/G3 are ticked.
