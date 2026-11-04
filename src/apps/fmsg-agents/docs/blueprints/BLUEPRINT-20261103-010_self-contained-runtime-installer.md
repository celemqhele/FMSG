# BLUEPRINT-20261103-010 — Self-contained runtime installer

**Author:** Gemini Argon (acting — DeepSeek V4 Pro, temporary arrangement) · **Date:** 2026-11-04
**Status:** Architecture for implementation · **Founder directive:** the runtime ships inside our own native installer; users download only FMSG Agents; multi-GB is accepted and storage is not a limiter.
**Prerequisites:** `TASK-20261103-011` (noVNC baseline, approved), `TASK-20261103-013` (KasmVNC comparison, pending), `docs/ARCHITECTURE_AGENT_RUNTIME.md`, `docs/AGENT_RUNTIME_PHASE2_ANALYSIS.md`.

---

## 1. Goal

One download, one installer, zero user setup:

1. The user runs `FMSG Agents Setup x.y.z.exe`.
2. The installer carries the FMSG app, **QEMU**, and the **signed FMSG appliance image** (the validated Linux desktop + automation stack).
3. On first run the app detects virtualisation, asks consent for the one-time Windows feature enable, guides the restart, resumes by itself, creates the per-user VM, starts it, and streams the desktop into the Run workspace.
4. The user never installs WSL2, Docker, VirtualBox, Ubuntu, or a browser driver.

The CDP path remains the fallback until the runtime is validated on real runs.

## 2. Components

```
FMSG Agents (Electron)
├─ Runtime Manager (main process)
│  ├─ QEMU process lifecycle (spawn/stop/health)
│  ├─ First-run provisioner (WHPX detect/enable/restart-resume)
│  ├─ VM disk lifecycle (create/reset/upgrade)
│  └─ Runtime Bridge client (bounded API, token auth)
├─ Stream View (WebContentsView)
│  └─ KasmVNC web client → 127.0.0.1:<ephemeral>
└─ Run workspace (existing tabs/controls)

Installer payload
├─ app (electron-builder NSIS)
├─ qemu/ (qemu-system-x86_64.exe + DLLs + BIOS/keymaps)
├─ runtime/fmsg-appliance-<version>.qcow2.zst
└─ runtime/manifest.json (sha256, version, min-app-version, signature)
```

## 3. Appliance image

**Base:** Ubuntu 22.04 LTS minimal (jammy) — the KasmVNC jammy build is validated; do not chase noble for v1.

**Packages (documented, never hand-stripped):**
`linux-image-virtual`, `systemd-sysv`, `dbus`, `openbox`, `kasmvncserver 1.5.2`, Playwright's pinned Chromium (`chromium-1248`, ~170 MB), Node 22 (runtime for Playwright + the guest agent), `fonts-liberation`, `fonts-noto-color-emoji`, `curl`, `ca-certificates`, `qemu-guest-agent`, `ffmpeg` (optional capture), Chromium runtime libs (`libnss3`, `libatk*`, `libgbm1`, `libasound2`, …).

**Services:**
- `fmsg-display.service` — Xvnc/KasmVNC on `:1` at 1280×720, openbox, Chromium; health = a real frame (not just port 8443).
- `fmsg-bridge.service` — guest agent on `127.0.0.1:8765`; token from QEMU fw_cfg (`/sys/firmware/qemu_fw_cfg/by_name/opt/fmsg/token/raw`), random per VM.
- First boot: resize rootfs to the disk, generate the KasmVNC password, write `/var/lib/fmsg/runtime.json` (version, display, bridge port), signal health.

**Targets:** compressed qcow2 **1.5–2.5 GB**, installed VM disk **4–6 GB**, guest RAM **1.5–2 GB**, 2 vCPU.

## 4. Image build pipeline (reproducible)

`runtime/build-appliance.sh` (guest-side, no host changes):
1. `debootstrap --variant=minbase jammy <rootfs> http://archive.ubuntu.com/ubuntu`.
2. Bind-mount/chroot; install the package list; install the KasmVNC deb; install Playwright Chromium + Node; copy `runtime/guest/*` (services, bridge, health, session supervisor).
3. Enable services; clean apt lists/logs; zero free space; unmount.
4. `qemu-img convert -O qcow2` (or raw → qcow2), `qemu-img resize` to the target; `zstd -19` the qcow2.
5. Emit `manifest.json` (version, sha256, sizes, min-app-version) and a detached signature.
6. Boot-test the image under QEMU **TCG inside the guest** (no WHPX needed): `-nographic`/serial, wait for `fmsg-bridge` health, run one Playwright demo, capture the result. This proves the image boots before it ever reaches a user.

The build script and the exact package list are the source of truth; the image is never hand-edited.

## 5. Host Runtime Manager

- Bundle a **Windows QEMU** build (qemu-system-x86_64 + DLLs + BIOS/keymaps). QEMU is GPLv2 — redistribute with the licence text and a written source offer (see §10).
- Acceleration: `-accel whpx` when the feature is enabled, `-accel tcg` as the slow fallback. Never silently enable a host feature.
- Fixed, app-generated arguments only (no user input): `-machine q35`, `-smp 2`, `-m 2048`, `-drive file=<per-user qcow2>,if=virtio`, `-display none`, `-vga none`, `-netdev user,id=n0,hostfwd=tcp:127.0.0.1:<kasm>-:8443,hostfwd=tcp:127.0.0.1:<bridge>-:8765`, `-device virtio-net-pci,netdev=n0`, `-fw_cfg name=opt/fmsg/token,string=<random>`.
- Bind every host forward to **127.0.0.1** only. Pick ephemeral host ports; never reuse a fixed public port.
- Lifecycle: start on demand (first run / Run Setup), stop on app quit (graceful `system_powerdown`, then kill after timeout), reset = discard the overlay and recreate from the base image.
- Per-user VM directory under `app.getPath('userData')/runtime/`; never write into Program Files.

## 6. First-run provisioning

1. Detect: `HypervisorPlatform` feature state and whether a reboot is pending.
2. If absent: explain why, ask consent, run the elevated enable (`DISM /Online /Enable-Feature /FeatureName:HypervisorPlatform /All /NoRestart` via UAC), write a provisioning-state file, and offer **Restart now / Later**.
3. After restart the app resumes from the state file, verifies WHPX, and continues automatically.
4. If the user declines or WHPX is unavailable: keep the CDP path and say so plainly; never block the app.
5. Create the VM disk (copy/expand the image), generate the token, start QEMU, poll the bridge health endpoint until the display produces a real frame (the 011/013 lesson: a listening port is not health), then show the stream.

## 7. Runtime Bridge (bounded API)

Transport: guest agent HTTP on `127.0.0.1:8765`, host-forwarded to `127.0.0.1:<ephemeral>`; `Authorization: Bearer <per-VM token>`. No raw shell, ever.

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{status, display, kasmvnc, chromium, version, frame_age_ms}` |
| `POST /runs` | start a run: profile, job, autonomy, CV token, limits; returns `run_id` |
| `POST /runs/{id}/stop` | graceful stop |
| `GET /runs/{id}/events` | SSE/WebSocket: phase, action, log, screenshot metadata |
| `POST /uploads/cv` | multipart CV → guest temp path + token; deleted after the run |
| `POST /actions` | validated action-library call (Inkling contract), never a command string |
| `POST /shutdown` | guest poweroff |

The bridge is the only host↔guest data path. No shared folders, no host filesystem mounts, no inbound network beyond the two loopback forwards.

## 8. Stream integration

- Use KasmVNC's web client in a **WebContentsView** (not an `<iframe>`): it is a full page with its own control bar, and a view avoids frame/CSP surprises. Supply the per-VM credentials through Electron's `app.on('login')` for the loopback origin.
- The Run workspace keeps its existing tabs and controls; the stream view occupies the Live Browser Preview canvas. The app's toolbar (pause, open externally, status) stays outside the view.
- Hide KasmVNC's own control bar with `webContents.insertCSS` after load (or a KasmVNC URL option if one is stable); do not fork the client.
- Fallback: if the view fails to connect within the health budget, show the CDP preview and a truthful "runtime unavailable" state.

## 9. Installer packaging

- electron-builder **NSIS**, per-user install, `extraResources`: `qemu/`, `runtime/*.qcow2.zst`, `runtime/manifest.json`.
- Compression: NSIS solid LZMA on an already-zstd-compressed image is wasteful; ship the `.zst` and decompress on first run (or use NSIS `SetCompressor /SOLID lzma` only for the app/QEMU).
- Disk-space check before extraction (image + VM disk + headroom); clear message if short.
- Verify the image sha256/signature before first boot; refuse a mismatch.
- Updates: app-code updates ride the existing OTA/installer channel; runtime-image updates ride installer-handoff releases for v1. A later signed delta channel can shrink the download, but it is not a v1 dependency.
- Expected sizes: app ~95 MB + QEMU ~200 MB + image ~1.5–2.5 GB → installer **~2–3 GB**, installed **~5–7 GB**. Accepted by the founder; do not optimise storage at the cost of capability.

## 10. Security, licensing, privacy

- The image is signed; the installer verifies it. QEMU args are fixed; the model never gets a shell (Inkling action contract).
- Secrets stay host-side; the bridge token is per-VM and rotated on reset; CVs are uploaded per run and deleted after.
- Guest network is QEMU user-mode NAT; no inbound ports except the two host-loopback forwards.
- **Licences:** QEMU (GPLv2) and KasmVNC (GPLv2) are redistributed inside the installer/image — include licence texts, copyright notices, and a written offer for the corresponding source (or ship the source alongside). Chromium (BSD), Playwright (Apache-2.0), Node (MIT). Legal review is a release gate, not an afterthought.
- No telemetry from the guest beyond the app's existing logging; no host data mounted into the guest.

## 11. Delivery stages

| Stage | Deliverable | Owner |
|---|---|---|
| 1 | `TASK-20261103-013` KasmVNC vs noVNC raw comparison → streamer choice | acting Pro (delegated) |
| 2 | Appliance image v0 + reproducible build + TCG boot test (`TASK-20261104-001`) | acting Pro (delegated) |
| 3 | Runtime Bridge guest agent + host client, bounded API, token, CV upload | acting Pro (delegated after spec freeze) |
| 4 | Host Runtime Manager: QEMU lifecycle, first-run WHPX flow, per-user VM | Argon (coupled) |
| 5 | Installer packaging (QEMU + image + manifest + signature) | Argon + founder gate |
| 6 | Run-canvas stream view + CDP fallback switch | Argon (coupled) |
| 7 | Inkling action SOP + validated action library | guide-writable for Pro |

## 12. Acceptance criteria (programme)

- [ ] Clean Windows 11 Home machine: one installer → first run → WHPX consent/restart → streamed Linux desktop in the Run workspace, with no manual WSL/Docker/VM/browser setup.
- [ ] Same-session proof on the packaged runtime (visible typing + real CV upload, guest and client frames paired).
- [ ] Health check proves a real frame, not a listening port; a dead backend surfaces a truthful state.
- [ ] Reset discards the overlay; CVs and tokens do not survive a reset.
- [ ] Image signature verified; GPL source offer/notices present.
- [ ] CDP fallback still works when the runtime is unavailable.
- [ ] No host change without explicit consent; no admin prompt on every launch.

## 13. Open risks / decisions

- **WHPX on Windows 11 Home:** the feature is present but disabled on this machine (host report). The enable + restart flow must be proven on a clean Home machine; TCG is the fallback but is too slow for production.
- **QEMU Windows build choice:** pick a maintained build with WHPX support, pin the version, and record its source URL/hash.
- **KasmVNC embedding:** confirm `WebContentsView` + HTTP credentials + control-bar hiding on Electron; if the control bar cannot be hidden cleanly, accept it for v1 rather than forking.
- **Image update size:** a 2–3 GB installer per runtime update is expensive; v1 accepts it (founder directive), v2 can add a signed delta channel.
- **Licence review:** GPLv2 obligations for QEMU/KasmVNC must be signed off before any public release.

---

**Next action:** `TASK-20261103-013` results → streamer choice → `TASK-20261104-001` appliance image v0. No host feature is enabled and no installer is rebuilt until the founder gates are ticked.
