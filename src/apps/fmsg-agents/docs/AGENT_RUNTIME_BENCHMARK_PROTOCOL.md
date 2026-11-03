# FMSG Agent Runtime — Benchmark Protocol v1 (WSL2 prototype)

**Owner of the protocol:** Argon-role (DeepSeek V4 Pro acting). **Executor:** delegated — Pro seat (DeepSeek Flash) may run it directly or hand the mechanical runs to the Flash seat (Big Pickle), per the hierarchy. **Raw numbers only** — interpretation and the recommendation stay with Argon/founder. No estimates presented as measurements.

## 0. Preconditions (Argon-role provides before handoff)

- WSL2 distro `fmsg-runtime` imported and provisioned (Xvfb + openbox + x11vnc + noVNC + Node + Playwright Chromium).
- Display up: `wsl -d fmsg-runtime -u root -- bash /opt/fmsg-runtime/start-novnc.sh` (background). Stream visible at `http://localhost:6080/vnc.html`.
- Demo assets at `/opt/fmsg-runtime/{demo.js,demo-form.html}`.
- `ffmpeg` installed in the guest (`apt install -y ffmpeg` — additive, guest-only).

## 1. Measurement matrix (record RAW values with command + timestamp)

| # | Measurement | Command / method |
|---|---|---|
| 1 | WSL distro download size | The rootfs tarball size: `ls -l recycle_bin/ubuntu-jammy-wsl-rootfs.tar.gz` (325.3 MB, already known) |
| 2 | Installed footprint (guest) | `wsl -d fmsg-runtime -u root -- du -sh /` |
| 3 | Installed footprint (Windows vhdx) | `Get-ChildItem "$env:LOCALAPPDATA\fmsg-runtime-wsl\ext4.vhdx" | Select Length` |
| 4 | Idle RAM (guest) | display + stream running, no automation: `wsl ... -- free -m` |
| 5 | Idle RAM (host process) | `Get-Process vmmem | Select WorkingSet64` |
| 6 | Idle CPU | 60s sample: `wsl ... -- top -bn1 | head -5` (and host `Get-Process vmmem | Select CPU`) |
| 7 | Active RAM | during the demo script: sample `free -m` at 5s intervals, record max |
| 8 | Active CPU | during the demo: `top -bn1` at 5s intervals, record max |
| 9 | Startup time (cold) | `Measure-Command { wsl -d fmsg-runtime -u root -- bash -c "echo up" }` after `wsl --terminate fmsg-runtime`; then time from display start to first VNC frame (scrot timestamp) |
| 10 | Startup time (warm) | same as #9 without the terminate |
| 11 | Shutdown time | `Measure-Command { wsl --terminate fmsg-runtime }` |
| 12 | Stream FPS (display-level) | in guest, with the display live and the demo animating: `ffmpeg -f x11grab -video_size 1280x720 -framerate 30 -i :99 -t 30 -f null -` → read the reported `fps=` |
| 13 | Stream resolution | 1280×720 (display geometry; verify with `xrandr` or `xdpyinfo`) |
| 14 | Stream latency (glass-to-glass) | two methods, both reported: (a) stopwatch on a ticking-clock page viewed via noVNC vs guest scrot timestamp; (b) WebSocket RTT via `npx wscat -c ws://localhost:6080/websockify` ping sample (or equivalent) |
| 15 | Disk growth after activity | `du -s /` before and after 3 demo runs (delta) |
| 16 | Stability | 3 consecutive demo runs, note any stall/disconnect; stream must survive run 1 → 2 → 3 without restarting the display |

## 2. Same-session re-verification (non-negotiable)

Run `/opt/fmsg-runtime/demo.js` and capture as evidence:
- `scrot` screenshots at the script's four checkpoints (`/tmp/fmsg-0*.png` → copy out via `wsl ... -- cp`).
- The noVNC screenshot (host-side, from the browser view at localhost:6080) at the same moment as `fmsg-02-typed.png` — the two must show the SAME session (same typed content, same window state). A simulated page or second browser fails this requirement.
- CV transfer timing: `Measure-Command { Copy-Item test-cv.pdf "\\wsl.localhost\fmsg-runtime\opt\fmsg-runtime\" }` for a ~2 MB test PDF (generated locally), and confirm the demo attaches it (`Received: ... CV: name (bytes)`).

## 3. Output

Fill the founder's table verbatim (download / footprint / idle+active RAM / idle+active CPU / start / shutdown / FPS / resolution / latency / disk growth / stability) with RAW values + the exact commands and timestamps, in the EOT and in `recycle_bin/fmsg-runtime-benchmark-results-<date>.md`. No commentary on which option is better — that is Argon's/founder's call.

## 4. Boundaries

- Guest-only additive installs (ffmpeg) are allowed. **No Windows host changes of any kind.**
- Do not modify the demo script, the provisioning script, or application code. If a command in this protocol cannot run as written, stop and escalate through the hierarchy instead of improvising.
- Keep ports loopback-only; never expose the VNC/stream ports beyond localhost.
