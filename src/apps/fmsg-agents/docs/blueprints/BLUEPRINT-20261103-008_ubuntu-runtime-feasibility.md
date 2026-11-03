# BLUEPRINT-20261103-008 — Ubuntu Runtime Feasibility Investigation & PoC

## 1. Task ID

`BLUEPRINT-20261103-008` → assignment `TASK-20261103-009`.

## 2. Objective

Investigate whether FMSG Agents should own a managed Ubuntu execution environment (the "FMSG Agent Runtime"), and prove it with a local prototype: a real Ubuntu desktop in a VM, Chromium + Playwright inside the guest, the same graphical session streamed into an FMSG-compatible viewer, and measured resource/performance data to support a founder decision. **This is an investigation and proof of concept — not authorisation to replace the production browser runtime.**

## 3. Background and problem statement

Founder request (Workstream 3 / Workstream C of the 2026-11-03 documents): the product vision is users watching their AI agent operate a real computer, in real time, inside FMSG Agents. The founder explicitly authorises downloading the full Ubuntu 26.04.1 LTS installation image, building a working prototype, and investigating a customised Ubuntu-based appliance. The founder also explicitly states resource efficiency must not override a working, observable environment.

Constraints (founder, verbatim intent): do not silently change Windows system features, install privileged drivers, or require restarts without first presenting the requirement; do not make the Ubuntu runtime an unconditional product dependency until compatibility/resource requirements are established; keep the current browser fallback working; the streamed and automated sessions must be the same.

## 4. Existing implementation findings (verified by inspection)

- Current runtime: Windows Chrome launched by Playwright (`launchVisibleAutomationBrowser`), CDP `Page.startScreencast` streamed to the Electron renderer (`agent-controller.ts`, BLUEPRINT-20261103-007 owns its active-page-tracking repair).
- No virtualisation components are known to be configured on this machine — **host capability detection has not been run yet** and is the first execution step (§11).
- The renderer preview tab (BLUEPRINT-20261103-005) will be frame-driven and runtime-agnostic, which is the integration point a VM stream would reuse.
- Reference starting points supplied by the founder: Ubuntu 26.04 release info, Subiquity autoinstall, QEMU WHPX docs, KasmVNC docs, Playwright Docker guidance.

## 5. Root cause

Not a defect — a strategic gap. The current architecture controls an external Windows Chrome window; a product whose differentiator is watching the agent operate a computer needs a self-contained, isolatable execution environment, and only measured evidence can justify adopting one.

## 6. Approved technical approach

Three-phase investigation, staged with founder gates:

### Phase 1 — Host capability detection (no changes made)

Detect and report (read-only commands): Windows version/edition, CPU virtualisation (firmware + OS), WHPX/Hyper-V/WSL2/VirtualBox/Docker presence and state, RAM, free disk, GPU. Produce the **Host Prerequisites Report** with: which of Options A–D are possible on this machine today, what each option needs (admin rights? restart? drivers?), and exact installation commands/actions that would be required. **Stop before changing anything** and deliver the report with the request for founder approval (SOP §3.4: host-level changes need approval).

### Phase 2 — Options comparison and prototype (after founder approval)

Compare, with actual measurements (never estimates presented as measurements):

- **Option A:** repaired Windows Chrome + CDP (the BLUEPRINT-20261103-007 fix) — baseline.
- **Option B:** WSL2 + Docker container, Ubuntu base, Chromium + Playwright, Xvfb virtual display, minimal WM (no full GNOME).
- **Option C:** containerised remote desktop — KasmVNC (or noVNC-compatible) streaming the same container's display.
- **Option D:** full Ubuntu 26.04.1 LTS Desktop VM (founder-authorised download), QEMU+WHPX / Hyper-V / VirtualBox per the Phase-1 report, Chromium + Playwright in the guest, KasmVNC (or equivalent) streaming the guest display.

Prototype must demonstrate, with evidence: environment starts; Chromium runs inside it; Playwright controls **that same** Chromium; the same graphical session streams to a browser-compatible viewer; the viewer can be rendered inside a basic FMSG-compatible test surface; new tabs appear in the stream; a local CV file transfers into the environment and uploads through a test form; visible typing/clicking/navigation/scrolling; pause/stop; safe shutdown; restart without rebuilding.

Measurement matrix (founder table §6.1): download size, installed disk footprint, idle/active RAM, idle/active CPU, cold/warm startup time, shutdown time, stream FPS, stream resolution, glass-to-glass latency, disk growth, stability duration. Same conditions across options.

### Phase 3 — Custom appliance assessment + recommendation

Based on Phase 2: define the minimal Ubuntu-based FMSG appliance (OS foundation, virtual display, WM, browser, automation tools, streaming infra, host/guest bridge, security policy per founder §4.8), assess it against the full-Desktop baseline, compare distribution models (installer-embedded vs first-run signed download with checksum/resumable/versioned), and deliver the recommendation. The founder makes the final architectural choice.

## 7. Architecture and design decisions

- The stream must originate from the same virtual display the automation controls; no separate "display browser".
- Streaming tech selection is data-driven: measure KasmVNC vs alternatives; target ≥15 fps at 1280×720 during activity, 20–30 fps preferred, ≤250 ms glass-to-glass latency as a goal; do not sacrifice automation reliability for fps.
- Security invariants for any prototype: non-root browser user; no unauthenticated streaming/debug ports exposed beyond localhost; CV transfer via a controlled channel; clipboard/shared folders disabled by default; no unrestricted host-shell access through the bridge.
- No host-level installation without founder approval. No new product dependency until compatibility is established.

## 8. Files to inspect

- `src/apps/fmsg-agents/agent-controller.ts` (streaming integration point)
- `src/apps/fmsg-agents/docs/context/fmsg-agents-feature-update-three-workstreams_2026-11-03.md` (screencast lessons)
- Founder-supplied reference links (release/install/streaming docs) for current, version-correct guidance.

## 9. Files permitted to modify

- New prototype/experiment scripts under `src/apps/fmsg-agents/scripts/prototypes/` (or `recycle_bin/`-style scratch if throwaway — prefer a clearly named scratch dir)
- `src/apps/fmsg-agents/docs/changelog/UNRELEASED.md`
- A report document in `src/apps/fmsg-agents/docs/blueprints/` output area or `docs/` (report deliverable)

## 10. Files prohibited from modifying

- All application code (`agent-controller.ts`, `electron-main.ts`, `preload.ts`, `renderer/**`) — nothing ships from this task
- `package.json`, `config.ts`, legal docs, migrations, website code
- Host system configuration (Windows features, drivers, services, firewall rules) — none, under any circumstances, without separate founder approval

## 11. Required implementation steps

1. Read this blueprint and the founder documents' §4/§6; record start state.
2. Run host capability detection (read-only); produce the Host Prerequisites Report.
3. **Gate:** deliver the report and wait for founder approval before any installation/download.
4. After approval: download the Ubuntu 26.04.1 LTS image (authorised); build the prototype per the approved option(s); instrument every measurement.
5. Run the demonstration scenarios with captured evidence (screenshots/clips of the real session).
6. Produce the comparison table with actual measurements.
7. Assess the custom appliance; write the recommendation report.
8. Log in `UNRELEASED.md`; file EOT with evidence paths.

## 12. Dependencies

- **Founder gate after Phase 1** (approval for downloads/host changes).
- BLUEPRINT-20261103-007 may run in parallel and provides the Option A baseline measurements.

## 13. Acceptance criteria

- [ ] Host prerequisites detected and reported without modifying the host.
- [ ] At least one realistic prototype assessed with actual (not estimated) measurements across the full matrix.
- [ ] The automated browser and the streamed browser are provably the same session (evidence: visible typing/clicking/navigation/tab changes in the stream).
- [ ] CV transfer into the isolated environment demonstrated; upload visible in the stream.
- [ ] Stream rendered inside a basic FMSG-compatible test surface (not just a separate browser tab).
- [ ] Security boundaries documented and tested (ports bound to localhost, authenticated stream, non-root browser user, no host file access beyond the controlled transfer).
- [ ] Clean shutdown and restart demonstrated.
- [ ] Direct comparison delivered: Options A–D with trade-offs, measured resource consumption, installation-experience impact.
- [ ] A clear recommendation submitted for founder approval, with the specific decisions that need the founder's sign-off.
- [ ] No production code shipped; no version bump; no release; no installer rebuild.

## 14. Required tests

- The measurement matrix itself is the test suite; record raw numbers with timestamps and commands.
- Stability: sustained session (duration per founder table) without crash/stall, with stream-fps logs.
- Failure-path tests: what happens when Docker/WSL2/hardware virtualisation is unavailable; stream disconnect/reconnect.

## 15. Regression risks

- Prototype work is isolated from the app — the only risk is accidental modification of application files (prohibited) or leftover background processes/services. Record any background task in the EOT and clean it up (root AGENTS.md background-task rule).

## 16. Rollback considerations

Prototype artifacts are deletable (recycle-bin rule); host changes (if any are approved later) each have their own documented revert step in the Phase-1 report.

## 17. Explicit instructions and restrictions

- Delegation (per Argon's 2026-11-03 corrective-directive review): hypervisor/VM architecture, streaming/security design, host detection and prototype construction remain with Pro. Mechanical benchmark execution + measurement-table production against Pro's protocol **may be delegated to Flash** within the boundaries recorded in the assignment file. Delegation is optional.
- **No host-level changes without founder approval.** No silent Windows feature installs, drivers, or restarts.
- Do not claim measurements that were not taken. Do not present a simulated browser as the prototype.
- Do not replace or degrade the current production streaming path.
- No release, no version bump, no installer rebuild.

## 18. Escalation conditions

- Any installation step needs administrator rights or a restart (stop and report before acting).
- Insufficient disk/RAM/hypervisor support blocks an option (report; do not improvise).
- Any streaming technology requires a commercial licence with implications (report licensing terms before adopting).
