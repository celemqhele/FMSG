# FMSG Agent Runtime — Host Prerequisites Report (Phase 1, read-only)

**Prepared by:** Argon-role (DeepSeek V4 Pro acting) · **Date:** 2026-11-03 · **Task:** `TASK-20261103-009` (Ubuntu runtime feasibility)
**Status:** Phase 1 of the staged gates — detection only. **Nothing was downloaded, installed, enabled or changed.** Phase 2 requires the founder's approval below.

---

## 1. Raw measurements (read-only commands, all actual)

| Item | Reading |
|---|---|
| OS | Windows 11 **Home** Single Language, build 26300, 64-bit |
| Machine | HUAWEI MCLF-XX |
| CPU | 12th Gen Intel Core i5-12450H — 8 cores / 12 threads |
| RAM | 15.7 GB total |
| Disk C: | 119.6 GB free (337.2 GB used) |
| GPU | Intel UHD Graphics (integrated; no discrete GPU), driver 31.0.101.4502 |
| Hypervisor | **Present and running** (`HypervisorPresent = True`, `vmcompute` service Running, `systeminfo`: "A hypervisor has been detected") |
| WSL | **Working — WSL2** with an **Ubuntu** distribution installed (state: stopped, version 2). Note: "WSL1 is not supported with your current machine configuration" |
| Windows features | `VirtualMachinePlatform` = **Enabled** · `HypervisorPlatform` (WHPX API) = **Disabled** · `Microsoft-Windows-Subsystem-Linux` (legacy flag) = Disabled (WSL is store-based on this build) · **Hyper-V full platform: not available on Windows 11 Home** |
| Docker | **Not installed** |
| VirtualBox | **Not installed** |
| QEMU | **Not installed** |
| Firmware VT flags (CIM) | `VirtualizationFirmwareEnabled`/`VMMonitorModeExtensions`/`SLAT` all report **False** — **masked by the running hypervisor** (a known Windows behaviour). The decisive evidence that hardware virtualisation works is WSL2 itself, which cannot run without it |

**Bottom line:** hardware virtualisation is available and already in use (WSL2). The machine has enough RAM (16 GB) and disk (119.6 GB free) for every option, but no discrete GPU — guest rendering/encoding will be CPU-bound.

---

## 2. Option feasibility on THIS machine

| Option | Feasible? | What it needs (beyond downloads) | Admin? | Reboot? |
|---|---|---|---|---|
| **A — Repaired Windows Chrome + CDP** | ✅ **Already shipped** (`TASK-20261103-007`, active-page tracking). Runs today, zero install cost | None | — | — |
| **B — WSL2 + Docker container (Xvfb + Chromium + Playwright)** | ✅ **High** — WSL2 already works; Ubuntu distro already present | Install Docker Desktop (WSL2 backend), ~500 MB download | Yes (one install) | Usually **no** |
| **C — KasmVNC containerised remote desktop** | ✅ **High** — same WSL2/Docker foundation as B | Same as B + container images (~1–2 GB pull) | Yes | No |
| **D — Full Ubuntu 26.04.1 Desktop VM** | ⚠️ **Possible, heaviest** — Hyper-V is unavailable on Home edition, so the hypervisor must be VirtualBox or QEMU | VirtualBox install (drivers) **or** enable `HypervisorPlatform` for QEMU+WHPX; Ubuntu ISO ~6 GB; 25–35 GB guest disk; ~4 GB guest RAM | Yes | VirtualBox: sometimes · WHPX enable: **yes, restart required** |

Notes:
- **WSL1** is reported unsupported on this configuration — irrelevant for our use (WSL2 works).
- The CPU-virtualisation flags reading `False` is a hypervisor-masking artefact, **not** a disabled-VT problem — WSL2 running is the proof.
- 16 GB RAM makes a full Desktop VM viable but tight alongside the app; B/C are far lighter. The founder's directive stands: resource efficiency must not override a working, observable environment — measured evidence will settle it.

---

## 3. Recommended Phase 2 sequence (awaiting your approval)

1. **Option B prototype first** (WSL2 + Docker, Xvfb, Chromium + Playwright): cheapest to stand up, proves the same-session streaming mechanics (KasmVNC or a VNC bridge) and CV transfer.
2. **Option C on the same foundation** (KasmVNC full desktop stream) — measures the "real desktop" experience the product vision wants.
3. **Option D (full Ubuntu 26.04.1 Desktop VM)** as the reference implementation — per your authorisation to download the full ISO — once B/C numbers exist, choosing VirtualBox vs QEMU+WHPX based on whether you accept the WHPX restart.
4. Every option measured with the same matrix (download size, installed footprint, idle/active RAM + CPU, cold/warm start, shutdown, stream FPS/resolution/latency, disk growth, stability) — raw numbers, never estimates.

## 4. Founder approvals required to proceed (Phase 2 gate)

- [ ] **Docker Desktop installation** (administrator, WSL2 backend) — enables Options B and C.
- [ ] **Ubuntu 26.04.1 LTS ISO download** (~6 GB) and either **VirtualBox installation** (administrator, drivers) **or** enabling **`HypervisorPlatform`** (administrator + a restart) — enables Option D.
- [ ] Confirm the Phase 2 sequence above (or reorder).

No Windows feature is enabled, no driver installed, no download started, until you tick these.
