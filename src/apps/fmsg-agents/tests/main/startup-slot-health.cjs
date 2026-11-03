#!/usr/bin/env node
/**
 * FMSG Agents — Main-process regression tests (P1B.7)
 *
 * Runs against the compiled `dist/*.js` so it tests exactly what ships in the
 * installer. Currently covers the version-chip bug deferred from v0.7.1:
 * after an installer upgrade, `verifyStartupSlotHealth` must sync
 * `active_slot_version` to `APP_VERSION` even when `Slot-Active` does not exist.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const APP_ROOT = path.resolve(__dirname, '../..');
const distPath = (file) => path.join(APP_ROOT, 'dist', file);

const { APP_VERSION } = require(distPath('config.js'));
const {
  verifyStartupSlotHealth,
  loadInstallState,
  getInstallStatePath,
  getUpdatesBaseDir,
} = require(distPath('update-manager.js'));

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.log(`FAIL  ${name} — ${err.message}`);
  }
}

function makeTempBase() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fmsg-slot-'));
  const updatesDir = path.join(base, 'updates');
  fs.mkdirSync(updatesDir, { recursive: true });
  return base;
}

function writeState(base, state) {
  fs.writeFileSync(
    getInstallStatePath(base),
    JSON.stringify(state, null, 2),
    'utf8'
  );
}

// ── Case 1: installer upgrade with no Slot-Active present ───────────────────
check(
  'installer upgrade with no Slot-Active syncs the chip to APP_VERSION',
  () => {
    const base = makeTempBase();
    writeState(base, {
      installed_version: '0.0.1',
      active_slot_version: '0.0.1',
      backup_slot_version: '0.0.0',
      launch_count_for_version: 5,
      total_launch_count: 9,
      channel: 'stable',
      last_check_at: null,
      last_check_status: 'Never checked',
      pending_health_check: false,
      boot_attempts: 0,
      blacklisted_versions: [],
      deferred_update_version: null,
    });

    const health = verifyStartupSlotHealth(base);
    const state = loadInstallState(base);

    assert.strictEqual(state.installed_version, APP_VERSION);
    assert.strictEqual(
      state.active_slot_version,
      APP_VERSION,
      `expected active_slot_version ${APP_VERSION}, got ${state.active_slot_version}`
    );
    assert.strictEqual(health.activeVersion, APP_VERSION);
    assert.strictEqual(state.backup_slot_version, null);
  }
);

// ── Case 2: stale Slot-Active from an older release is cleared ──────────────
check('installer upgrade clears a superseded Slot-Active directory', () => {
  const base = makeTempBase();
  writeState(base, {
    installed_version: '0.0.1',
    active_slot_version: '0.0.1',
    backup_slot_version: null,
    launch_count_for_version: 1,
    total_launch_count: 1,
    channel: 'stable',
    last_check_at: null,
    last_check_status: 'Never checked',
    pending_health_check: false,
    boot_attempts: 0,
    blacklisted_versions: [],
    deferred_update_version: null,
  });
  const activeDir = path.join(getUpdatesBaseDir(base), 'Slot-Active');
  fs.mkdirSync(path.join(activeDir, 'renderer'), { recursive: true });
  fs.writeFileSync(path.join(activeDir, 'renderer', 'bundle.js'), 'x'.repeat(80));

  verifyStartupSlotHealth(base);
  const state = loadInstallState(base);
  assert.strictEqual(state.active_slot_version, APP_VERSION);
  assert.strictEqual(fs.existsSync(activeDir), false, 'Slot-Active should be removed');
});

// ── Case 3: same-version launch keeps a healthy slot intact ─────────────────
check('same-version launch preserves a valid Slot-Active bundle', () => {
  const base = makeTempBase();
  writeState(base, {
    installed_version: APP_VERSION,
    active_slot_version: APP_VERSION,
    backup_slot_version: null,
    launch_count_for_version: 1,
    total_launch_count: 3,
    channel: 'stable',
    last_check_at: null,
    last_check_status: 'Never checked',
    pending_health_check: false,
    boot_attempts: 0,
    blacklisted_versions: [],
    deferred_update_version: null,
  });
  const activeDir = path.join(getUpdatesBaseDir(base), 'Slot-Active');
  fs.mkdirSync(path.join(activeDir, 'renderer'), { recursive: true });
  fs.writeFileSync(path.join(activeDir, 'renderer', 'bundle.js'), 'x'.repeat(80));
  fs.writeFileSync(
    path.join(activeDir, 'renderer', 'index.html'),
    '<!DOCTYPE html><html><body><div id="root"></div></body></html>'
  );

  const health = verifyStartupSlotHealth(base);
  assert.strictEqual(health.activeVersion, APP_VERSION);
  assert.ok(fs.existsSync(path.join(activeDir, 'renderer', 'bundle.js')));
});

const failed = results.filter((r) => !r.pass);
console.log(
  `\n[test:main] ${results.length - failed.length}/${results.length} checks passed`
);
if (failed.length > 0) process.exit(1);
