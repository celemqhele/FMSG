/**
 * FMSG Agents — Secure Device-Bound OTA & Installer Update Engine
 *
 * Security & Reliability Architecture:
 * 1. First launch after install skips update check; subsequent launches check BEFORE login.
 * 2. Device-bound authentication: requests are signed with the install's Ed25519 device key.
 * 3. Encrypted delivery: update bundles are encrypted with AES-256-GCM; the content key (CEK)
 *    is wrapped to the requesting device's RSA-OAEP-SHA256 public key.
 * 4. Offline Ed25519 Release Signature verification over canonical manifest + SHA-256 file hashes
 *    against built-in RELEASE_PUBLIC_KEYS_PEM (never skipped).
 * 5. HTTPS-only enforcement + strict downgrade protection (unless signed allow_downgrade=true).
 * 6. Kill switch: withdrawn releases are never offered; if current version is withdrawn, triggers rollback.
 * 7. Dual update path reconciliation:
 *    - Lightweight Signed Bundle Swap (requires_installer: false): atomic Slot-Active / Slot-Backup swap
 *      outside the immutable bootloader, with startup health check and automatic rollback on failure.
 *    - Full Signed Installer Handoff (requires_installer: true): for Electron shell, native modules, or
 *      updater changes; verifies signed .exe hash & signature, hands off to installer with /S /UPDATE.
 * 8. Active work protection: never interrupts an active agent run or submission.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import {
  APP_VERSION,
  APP_VERSION_CODE,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  WEB_BASE_URL,
  UPDATE_BUCKET,
  RELEASE_PUBLIC_KEYS_PEM,
  semverToCode,
} from './config';
import {
  DeviceKeyOptions,
  ensureValidDeviceIdentityOnLaunch,
  getDeviceCompatibilityContext,
  getOrCreateDeviceIdentity,
  markDeviceRegistered,
  signDeviceChallenge,
  verifyDeviceChallengeSignature,
  wrapContentKeyForDevice,
  unwrapContentKeyOnDevice,
} from './device-key';
import { logUpdateCheck } from './logger';

export interface SignedFileEntry {
  path: string;
  size_bytes: number;
  sha256: string;
  type: 'bundle' | 'css' | 'installer' | 'rules';
  download_url?: string;
}

export interface SignedReleaseManifest {
  version: string;
  version_code: number;
  channel: 'stable' | 'beta';
  min_supported_version: string;
  update_type?: 'required' | 'security' | 'feature';
  requires_installer: boolean;
  allow_downgrade: boolean;
  withdrawn: boolean;
  withdrawn_versions?: string[];
  rollout_percentage: number; // 1..100
  released_at: string;
  changelog: string[];
  files: SignedFileEntry[];
  signature_ed25519: string; // Base64 Ed25519 signature over canonicalizeManifest(manifest)
  key_id?: string;
}

export interface UpdateProgressEvent {
  phase: 'checking' | 'downloading' | 'installing' | 'optional-prompt' | 'done';
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  version?: string;
  currentVersion?: string;
  isRequired?: boolean;
  updateType?: 'required' | 'security' | 'feature';
  manifest?: SignedReleaseManifest;
  message?: string;
}

export interface EncryptedDeviceBundleEnvelope {
  device_id: string;
  manifest: SignedReleaseManifest;
  wrapped_cek_base64: string; // 32-byte AES-256 key wrapped with device RSA-OAEP-SHA256 public key
  iv_base64: string;          // 12-byte GCM IV
  auth_tag_base64: string;    // 16-byte GCM auth tag
  ciphertext_base64: string;  // AES-256-GCM encrypted JSON map of { [filePath]: base64FileBytes }
}

export interface InstallState {
  installed_version: string;
  active_slot_version: string;
  backup_slot_version: string | null;
  launch_count_for_version: number;
  total_launch_count: number;
  channel: 'stable' | 'beta';
  last_check_at: string | null;
  last_check_status: string;
  pending_health_check: boolean;
  boot_attempts: number;
  blacklisted_versions: string[];
  deferred_update_version: string | null;
}

export interface UpdateCheckResult {
  checked: boolean;
  available: boolean;
  applied?: boolean;
  isRequired?: boolean;
  updateType?: 'required' | 'security' | 'feature';
  deviceRegenerated?: boolean;
  deviceRejected?: boolean;
  rejectionReason?: string;
  deferred?: boolean;
  rolledBack?: boolean;
  requiresInstaller?: boolean;
  installerPath?: string;
  currentVersion: string;
  latestVersion?: string;
  channel: 'stable' | 'beta';
  status: string;
  message: string;
  lastCheckAt: string | null;
  manifest?: SignedReleaseManifest;
}

export function getUpdatesBaseDir(customBaseDir?: string): string {
  if (customBaseDir) return path.join(customBaseDir, 'updates');
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'fmsg-agents', 'updates');
}

export function getInstallStatePath(customBaseDir?: string): string {
  return path.join(getUpdatesBaseDir(customBaseDir), 'install-state.json');
}

export function loadInstallState(customBaseDir?: string): InstallState {
  const statePath = getInstallStatePath(customBaseDir);
  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return {
        installed_version: parsed.installed_version || APP_VERSION,
        active_slot_version: parsed.active_slot_version || APP_VERSION,
        backup_slot_version: parsed.backup_slot_version || null,
        launch_count_for_version:
          typeof parsed.launch_count_for_version === 'number'
            ? parsed.launch_count_for_version
            : 0,
        total_launch_count:
          typeof parsed.total_launch_count === 'number'
            ? parsed.total_launch_count
            : 0,
        channel: parsed.channel === 'beta' ? 'beta' : 'stable',
        last_check_at: parsed.last_check_at || null,
        last_check_status: parsed.last_check_status || 'Never checked',
        pending_health_check: !!parsed.pending_health_check,
        boot_attempts: parsed.boot_attempts || 0,
        blacklisted_versions: Array.isArray(parsed.blacklisted_versions)
          ? parsed.blacklisted_versions
          : [],
        deferred_update_version: parsed.deferred_update_version || null,
      };
    } catch {
      // Fall through to default state
    }
  }
  return {
    installed_version: APP_VERSION,
    active_slot_version: APP_VERSION,
    backup_slot_version: null,
    launch_count_for_version: 0,
    total_launch_count: 0,
    channel: 'stable',
    last_check_at: null,
    last_check_status: 'Never checked',
    pending_health_check: false,
    boot_attempts: 0,
    blacklisted_versions: [],
    deferred_update_version: null,
  };
}

export function saveInstallState(
  state: InstallState,
  customBaseDir?: string
): void {
  const baseDir = getUpdatesBaseDir(customBaseDir);
  fs.mkdirSync(baseDir, { recursive: true });
  const statePath = getInstallStatePath(customBaseDir);
  const tmpPath = `${statePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, statePath);
}

/**
 * Canonical JSON serialization of manifest fields covered by Ed25519 signature
 */
export function canonicalizeManifestForSigning(
  manifest: Omit<SignedReleaseManifest, 'signature_ed25519'>
): Buffer {
  const canonicalObj = {
    version: manifest.version,
    version_code: manifest.version_code,
    channel: manifest.channel,
    min_supported_version: manifest.min_supported_version,
    requires_installer: !!manifest.requires_installer,
    allow_downgrade: !!manifest.allow_downgrade,
    withdrawn: !!manifest.withdrawn,
    withdrawn_versions: (manifest.withdrawn_versions || []).slice().sort(),
    rollout_percentage: manifest.rollout_percentage,
    released_at: manifest.released_at,
    changelog: manifest.changelog || [],
    files: (manifest.files || []).map((f) => ({
      path: f.path,
      size_bytes: f.size_bytes,
      sha256: f.sha256.toLowerCase(),
      type: f.type,
      ...(f.download_url ? { download_url: f.download_url } : {}),
    })),
  };
  return Buffer.from(JSON.stringify(canonicalObj), 'utf8');
}

export function signReleaseManifest(
  manifestWithoutSig: Omit<SignedReleaseManifest, 'signature_ed25519'>,
  releasePrivateKeyPem: string
): SignedReleaseManifest {
  const payload = canonicalizeManifestForSigning(manifestWithoutSig);
  const sig = crypto.sign(null, payload, releasePrivateKeyPem);
  return {
    ...manifestWithoutSig,
    signature_ed25519: sig.toString('base64'),
  };
}

export function verifyReleaseManifestSignature(
  manifest: SignedReleaseManifest,
  trustedPublicKeysPem: string[] = RELEASE_PUBLIC_KEYS_PEM
): { valid: boolean; reason?: string } {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, reason: 'Manifest is empty or malformed' };
  }
  if (!manifest.signature_ed25519 || typeof manifest.signature_ed25519 !== 'string') {
    return { valid: false, reason: 'Missing release signature' };
  }

  // Enforce HTTPS on any file download_url
  for (const file of manifest.files || []) {
    if (file.download_url && !file.download_url.startsWith('https://')) {
      return {
        valid: false,
        reason: `Non-HTTPS download URL rejected: ${file.download_url}`,
      };
    }
  }

  const payload = canonicalizeManifestForSigning(manifest);
  const sigBuffer = Buffer.from(manifest.signature_ed25519, 'base64');

  for (const pubKeyPem of trustedPublicKeysPem) {
    try {
      const ok = crypto.verify(null, payload, pubKeyPem, sigBuffer);
      if (ok) return { valid: true };
    } catch {
      // try next key in rotation list
    }
  }

  return {
    valid: false,
    reason: 'Ed25519 signature verification failed against built-in release public keys',
  };
}

export function isDeviceInRolloutBucket(
  deviceId: string,
  version: string,
  rolloutPercentage: number
): boolean {
  if (rolloutPercentage >= 100) return true;
  if (rolloutPercentage <= 0) return false;
  const hash = crypto
    .createHash('sha256')
    .update(`${deviceId}:${version}`)
    .digest();
  const bucket = hash.readUInt16BE(0) % 100; // 0..99
  return bucket < rolloutPercentage;
}

/**
 * Encrypts a map of { [relativePath]: Buffer } for a specific device's RSA-OAEP-SHA256 public key
 */
export function createEncryptedDeviceEnvelope(
  deviceId: string,
  encryptPublicKeyPem: string,
  manifest: SignedReleaseManifest,
  filesMap: Record<string, Buffer>
): EncryptedDeviceBundleEnvelope {
  const cek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  const serializableMap: Record<string, string> = {};
  for (const [relPath, buf] of Object.entries(filesMap)) {
    serializableMap[relPath] = buf.toString('base64');
  }

  const aad = Buffer.from(
    `${deviceId}|${manifest.version}|${manifest.signature_ed25519}`,
    'utf8'
  );
  const cipher = crypto.createCipheriv('aes-256-gcm', cek, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(serializableMap), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const wrappedCekBase64 = wrapContentKeyForDevice(cek, encryptPublicKeyPem);

  return {
    device_id: deviceId,
    manifest,
    wrapped_cek_base64: wrappedCekBase64,
    iv_base64: iv.toString('base64'),
    auth_tag_base64: authTag.toString('base64'),
    ciphertext_base64: ciphertext.toString('base64'),
  };
}

/**
 * Decrypts a device-bound bundle envelope AND verifies the offline Ed25519 release signature
 * and every file's SHA-256 content hash and byte size.
 */
export function decryptAndVerifyDeviceEnvelope(
  envelope: EncryptedDeviceBundleEnvelope,
  currentVersion: string,
  options?: DeviceKeyOptions & {
    trustedPublicKeysPem?: string[];
    blacklistedVersions?: string[];
  }
): {
  ok: boolean;
  reason?: string;
  withdrawnRollbackRequired?: boolean;
  files?: Record<string, Buffer>;
  manifest?: SignedReleaseManifest;
} {
  const identity = getOrCreateDeviceIdentity(options);
  if (envelope.device_id !== identity.deviceId) {
    logUpdateCheck(
      'envelope_rejected',
      { reason: 'Device ID mismatch on encrypted envelope', expected: identity.deviceId, got: envelope.device_id },
      'warn'
    );
    return { ok: false, reason: 'Envelope is bound to a different device ID' };
  }

  const manifest = envelope.manifest;

  // Step 1: Verify offline Ed25519 release signature FIRST (and again after decrypting)
  const sigCheck = verifyReleaseManifestSignature(
    manifest,
    options?.trustedPublicKeysPem
  );
  if (!sigCheck.valid) {
    logUpdateCheck(
      'manifest_signature_rejected',
      { reason: sigCheck.reason, version: manifest?.version },
      'error'
    );
    return { ok: false, reason: sigCheck.reason };
  }

  // Step 2: Check kill-switch / withdrawn status
  if (
    manifest.withdrawn_versions &&
    manifest.withdrawn_versions.includes(currentVersion)
  ) {
    logUpdateCheck(
      'current_version_withdrawn',
      { currentVersion, withdrawn_versions: manifest.withdrawn_versions },
      'warn'
    );
    return {
      ok: false,
      withdrawnRollbackRequired: true,
      reason: `Current version ${currentVersion} has been withdrawn by release kill-switch`,
    };
  }

  if (manifest.withdrawn) {
    logUpdateCheck(
      'withdrawn_release_rejected',
      { version: manifest.version },
      'warn'
    );
    return {
      ok: false,
      reason: `Release ${manifest.version} has been withdrawn and will not be installed`,
    };
  }

  // Step 3: Check local blacklist (previously failed health check)
  if (options?.blacklistedVersions?.includes(manifest.version)) {
    logUpdateCheck(
      'blacklisted_release_rejected',
      { version: manifest.version },
      'warn'
    );
    return {
      ok: false,
      reason: `Release ${manifest.version} previously failed startup health check on this device`,
    };
  }

  // Step 4: Downgrade / replay protection
  const currentCode = semverToCode(currentVersion);
  const targetCode = manifest.version_code || semverToCode(manifest.version);
  if (targetCode <= currentCode && !manifest.allow_downgrade) {
    logUpdateCheck(
      'downgrade_rejected',
      { currentVersion, targetVersion: manifest.version, currentCode, targetCode },
      'warn'
    );
    return {
      ok: false,
      reason: `Downgrade or replay rejected: target ${manifest.version} (${targetCode}) <= current ${currentVersion} (${currentCode})`,
    };
  }

  // Step 5: Unwrap CEK using device private key in OS-protected storage
  let cek: Buffer;
  try {
    cek = unwrapContentKeyOnDevice(envelope.wrapped_cek_base64, options);
  } catch (err: any) {
    logUpdateCheck(
      'cek_unwrap_failed',
      { reason: err.message, version: manifest.version },
      'error'
    );
    return {
      ok: false,
      reason: `Failed to unwrap device-bound content key: ${err.message}`,
    };
  }

  // Step 6: Decrypt AES-256-GCM bundle payload
  let decryptedMap: Record<string, string>;
  try {
    const iv = Buffer.from(envelope.iv_base64, 'base64');
    const authTag = Buffer.from(envelope.auth_tag_base64, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext_base64, 'base64');
    const aad = Buffer.from(
      `${identity.deviceId}|${manifest.version}|${manifest.signature_ed25519}`,
      'utf8'
    );

    const decipher = crypto.createDecipheriv('aes-256-gcm', cek, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);

    const plainJson = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
    decryptedMap = JSON.parse(plainJson);
  } catch (err: any) {
    logUpdateCheck(
      'bundle_decrypt_failed',
      { reason: err.message, version: manifest.version },
      'error'
    );
    return {
      ok: false,
      reason: 'Encrypted bundle payload failed AES-256-GCM authentication check',
    };
  }

  // Step 7: Verify every file in manifest exists, matches size_bytes, and matches SHA-256 hash
  const verifiedFiles: Record<string, Buffer> = {};
  for (const entry of manifest.files) {
    const b64 = decryptedMap[entry.path];
    if (!b64) {
      logUpdateCheck(
        'file_missing_in_bundle',
        { file: entry.path, version: manifest.version },
        'error'
      );
      return {
        ok: false,
        reason: `Missing required file '${entry.path}' in update bundle`,
      };
    }

    const buf = Buffer.from(b64, 'base64');
    if (buf.length !== entry.size_bytes) {
      logUpdateCheck(
        'file_size_mismatch',
        { file: entry.path, expected: entry.size_bytes, actual: buf.length },
        'error'
      );
      return {
        ok: false,
        reason: `Size mismatch on '${entry.path}': expected ${entry.size_bytes}, got ${buf.length}`,
      };
    }

    const actualSha256 = crypto
      .createHash('sha256')
      .update(buf)
      .digest('hex')
      .toLowerCase();
    if (actualSha256 !== entry.sha256.toLowerCase()) {
      logUpdateCheck(
        'file_hash_mismatch',
        { file: entry.path, expected: entry.sha256, actual: actualSha256 },
        'error'
      );
      return {
        ok: false,
        reason: `SHA-256 hash mismatch on '${entry.path}' (tampered or corrupt file)`,
      };
    }

    verifiedFiles[entry.path] = buf;
  }

  logUpdateCheck('bundle_verified_ok', {
    version: manifest.version,
    files_count: manifest.files.length,
    requires_installer: manifest.requires_installer,
  });

  return {
    ok: true,
    files: verifiedFiles,
    manifest,
  };
}

/**
 * Atomic application of a verified update bundle + startup health check & automatic rollback
 */
export function applyVerifiedBundleAtomically(
  manifest: SignedReleaseManifest,
  verifiedFiles: Record<string, Buffer>,
  options?: { customBaseDir?: string; simulateCorruptEntry?: boolean }
): {
  applied: boolean;
  mode: 'bundle_swap' | 'installer_handoff';
  installerPath?: string;
  activeSlotDir?: string;
  error?: string;
} {
  const updatesDir = getUpdatesBaseDir(options?.customBaseDir);
  const stagingDir = path.join(updatesDir, 'Staging');
  const activeDir = path.join(updatesDir, 'Slot-Active');
  const backupDir = path.join(updatesDir, 'Slot-Backup');

  try {
    // Clean staging
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    fs.mkdirSync(stagingDir, { recursive: true });

    // Write verified files into Staging
    for (const [relPath, content] of Object.entries(verifiedFiles)) {
      const normalizedRel = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const destPath = path.join(stagingDir, normalizedRel);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, content);
    }

    fs.writeFileSync(
      path.join(stagingDir, 'manifest.sig.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    // Ensure renderer/index.html is present in Staging so Slot-Active can boot immediately
    const stagedHtmlPath = path.join(stagingDir, 'renderer', 'index.html');
    if (!fs.existsSync(stagedHtmlPath)) {
      fs.mkdirSync(path.dirname(stagedHtmlPath), { recursive: true });
      const defaultHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>FMSG Agents</title><link rel="stylesheet" href="design-system.css" /></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`;
      fs.writeFileSync(stagedHtmlPath, defaultHtml, 'utf8');
    }

    if (manifest.requires_installer) {
      const installerEntry = manifest.files.find((f) => f.type === 'installer');
      if (!installerEntry) {
        throw new Error('Manifest requires installer, but no installer file entry is present');
      }
      const installerPath = path.join(stagingDir, installerEntry.path);
      logUpdateCheck('installer_staged_for_handoff', {
        version: manifest.version,
        installerPath,
      });
      return {
        applied: true,
        mode: 'installer_handoff',
        installerPath,
      };
    }

    // Lightweight signed bundle swap:
    // 1. Preserve current Slot-Active into Slot-Backup
    if (fs.existsSync(activeDir)) {
      if (fs.existsSync(backupDir)) {
        fs.rmSync(backupDir, { recursive: true, force: true });
      }
      fs.renameSync(activeDir, backupDir);
    }

    // 2. Atomically move Staging -> Slot-Active
    fs.renameSync(stagingDir, activeDir);

    const state = loadInstallState(options?.customBaseDir);
    state.backup_slot_version = state.active_slot_version;
    state.active_slot_version = manifest.version;
    state.pending_health_check = true;
    state.boot_attempts = 0;
    state.deferred_update_version = null;
    saveInstallState(state, options?.customBaseDir);

    logUpdateCheck('atomic_bundle_swap_completed', {
      new_active_version: manifest.version,
      backup_version: state.backup_slot_version,
    });

    return {
      applied: true,
      mode: 'bundle_swap',
      activeSlotDir: activeDir,
    };
  } catch (err: any) {
    // Clean up partial staging on failure (disk full, AV lock, etc.)
    try {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
    logUpdateCheck('atomic_apply_failed', { error: err.message }, 'error');
    return {
      applied: false,
      mode: manifest.requires_installer ? 'installer_handoff' : 'bundle_swap',
      error: err.message,
    };
  }
}

/**
 * Rolls back Slot-Active to Slot-Backup if the new version fails to start or fails health check,
 * or if a release is withdrawn by the kill switch.
 */
export function rollbackToLastKnownGood(
  reason: string,
  customBaseDir?: string
): { rolledBack: boolean; restoredVersion: string; blacklistedVersion?: string } {
  const updatesDir = getUpdatesBaseDir(customBaseDir);
  const activeDir = path.join(updatesDir, 'Slot-Active');
  const backupDir = path.join(updatesDir, 'Slot-Backup');
  const state = loadInstallState(customBaseDir);

  const failedVersion = state.active_slot_version;
  const restoredVersion = state.backup_slot_version || state.installed_version || APP_VERSION;

  try {
    if (fs.existsSync(activeDir)) {
      fs.rmSync(activeDir, { recursive: true, force: true });
    }
    if (fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, activeDir);
    }
  } catch (err: any) {
    logUpdateCheck('rollback_fs_warning', { error: err.message }, 'warn');
  }

  if (
    failedVersion &&
    failedVersion !== restoredVersion &&
    !state.blacklisted_versions.includes(failedVersion)
  ) {
    state.blacklisted_versions.push(failedVersion);
  }

  state.active_slot_version = restoredVersion;
  state.pending_health_check = false;
  state.boot_attempts = 0;
  state.last_check_status = `Rolled back from ${failedVersion} to ${restoredVersion}`;
  saveInstallState(state, customBaseDir);

  logUpdateCheck(
    'automatic_rollback_executed',
    {
      reason,
      failed_version: failedVersion,
      restored_version: restoredVersion,
    },
    'warn'
  );

  return {
    rolledBack: true,
    restoredVersion,
    blacklistedVersion: failedVersion,
  };
}

/**
 * Verifies the active slot health on startup. If a newly swapped bundle crashes or fails
 * validation on boot, automatically rolls back to the last known good slot.
 */
export function verifyStartupSlotHealth(customBaseDir?: string): {
  healthy: boolean;
  rolledBack: boolean;
  activeVersion: string;
  activeRendererBundlePath?: string;
  activeHtmlPath?: string;
} {
  const updatesDir = getUpdatesBaseDir(customBaseDir);
  const activeDir = path.join(updatesDir, 'Slot-Active');
  const state = loadInstallState(customBaseDir);

  // Increment launch counters; if the underlying .exe binary version was upgraded by an installer,
  // clear any superseded Slot-Active from an older binary version.
  if (state.installed_version !== APP_VERSION) {
    state.installed_version = APP_VERSION;
    state.launch_count_for_version = 1;
    if (!state.pending_health_check && fs.existsSync(activeDir)) {
      try {
        fs.rmSync(activeDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    // The packaged main process now IS APP_VERSION. A slot left over from an
    // earlier renderer must never keep the version chip behind the installed
    // build (v0.7.1 deferred bug: the chip lagged one release after an
    // installer upgrade because this assignment was gated on activeDir).
    state.active_slot_version = APP_VERSION;
    state.backup_slot_version = null;
  } else {
    state.launch_count_for_version += 1;
  }
  state.total_launch_count += 1;

  if (
    !state.pending_health_check &&
    fs.existsSync(activeDir) &&
    semverToCode(APP_VERSION) > semverToCode(state.active_slot_version || '0.0.0')
  ) {
    try {
      fs.rmSync(activeDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    state.active_slot_version = APP_VERSION;
  }

  if (!fs.existsSync(activeDir)) {
    state.pending_health_check = false;
    saveInstallState(state, customBaseDir);
    return {
      healthy: true,
      rolledBack: false,
      activeVersion: state.active_slot_version || APP_VERSION,
    };
  }

  if (state.pending_health_check) {
    state.boot_attempts += 1;
    saveInstallState(state, customBaseDir);

    // Validate the bundle in Slot-Active can be loaded and parsed cleanly
    const bundlePath = path.join(activeDir, 'renderer', 'bundle.js');
    if (!fs.existsSync(bundlePath)) {
      const rb = rollbackToLastKnownGood(
        'Missing renderer/bundle.js in Slot-Active',
        customBaseDir
      );
      return {
        healthy: false,
        rolledBack: true,
        activeVersion: rb.restoredVersion,
      };
    }

    const content = fs.readFileSync(bundlePath, 'utf8');
    if (
      content.length < 64 ||
      content.includes('__SIMULATE_BOOT_CRASH__') ||
      state.boot_attempts > 2
    ) {
      const rb = rollbackToLastKnownGood(
        'Bundle failed startup health check or exceeded max boot attempts',
        customBaseDir
      );
      return {
        healthy: false,
        rolledBack: true,
        activeVersion: rb.restoredVersion,
      };
    }

    // Ensure index.html is present in Slot-Active/renderer/
    const slotHtml = path.join(activeDir, 'renderer', 'index.html');
    if (!fs.existsSync(slotHtml)) {
      const defaultHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>FMSG Agents</title><link rel="stylesheet" href="design-system.css" /></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`;
      fs.writeFileSync(slotHtml, defaultHtml, 'utf8');
    }

    // Mark health check passed
    state.pending_health_check = false;
    state.boot_attempts = 0;
    saveInstallState(state, customBaseDir);
    logUpdateCheck('slot_health_check_passed', {
      active_version: state.active_slot_version,
    });
  }

  const candidateBundle = path.join(activeDir, 'renderer', 'bundle.js');
  const candidateHtml = path.join(activeDir, 'renderer', 'index.html');
  return {
    healthy: true,
    rolledBack: false,
    activeVersion: state.active_slot_version,
    activeRendererBundlePath: fs.existsSync(candidateBundle)
      ? candidateBundle
      : undefined,
    activeHtmlPath: fs.existsSync(candidateHtml) ? candidateHtml : undefined,
  };
}

/**
 * Launches the verified NSIS installer in silent update mode (/S /UPDATE) and exits the app
 */
export function handoffToSilentInstaller(
  installerPath: string,
  onQuitApp: () => void
): boolean {
  if (!fs.existsSync(installerPath)) {
    logUpdateCheck(
      'installer_handoff_failed',
      { reason: 'Installer file not found', installerPath },
      'error'
    );
    return false;
  }

  logUpdateCheck('installer_handoff_launching', { installerPath });
  try {
    const child = spawn(installerPath, ['/S', '/UPDATE'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    setTimeout(() => {
      onQuitApp();
    }, 350);
    return true;
  } catch (err: any) {
    logUpdateCheck(
      'installer_handoff_spawn_error',
      { error: err.message },
      'error'
    );
    return false;
  }
}

/**
 * Downloads all files for a signature-verified release manifest from Supabase Storage (or custom URL),
 * streams real-time byte progress, verifies exact size and SHA-256 hash on every file,
 * and applies the update atomically.
 */
export async function downloadAndApplyVerifiedRelease(
  manifest: SignedReleaseManifest,
  options?: {
    customBaseDir?: string;
    trustedPublicKeysPem?: string[];
    overrideBaseStorageUrl?: string;
    simulateInterruptAfterBytes?: number;
    onProgress?: (progress: UpdateProgressEvent) => void;
  }
): Promise<{
  ok: boolean;
  applied: boolean;
  mode?: 'bundle_swap' | 'installer_handoff';
  installerPath?: string;
  reason?: string;
}> {
  // Always re-verify the offline Ed25519 release signature first (never skipped)
  const sigCheck = verifyReleaseManifestSignature(
    manifest,
    options?.trustedPublicKeysPem
  );
  if (!sigCheck.valid) {
    logUpdateCheck(
      'download_rejected_invalid_signature',
      { reason: sigCheck.reason, version: manifest?.version },
      'error'
    );
    return { ok: false, applied: false, reason: sigCheck.reason };
  }

  const totalBytes = (manifest.files || []).reduce(
    (sum, f) => sum + (f.size_bytes || 0),
    0
  );
  let transferredBytes = 0;

  options?.onProgress?.({
    phase: 'downloading',
    percent: 2,
    transferredBytes: 0,
    totalBytes,
    version: manifest.version,
    message: `Downloading update v${manifest.version}...`,
  });

  logUpdateCheck('release_download_started', {
    version: manifest.version,
    files_count: manifest.files.length,
    total_bytes: totalBytes,
  });

  const verifiedFiles: Record<string, Buffer> = {};
  const baseStorageUrl =
    options?.overrideBaseStorageUrl ||
    `${SUPABASE_URL}/storage/v1/object/${UPDATE_BUCKET}`;

  try {
    for (const entry of manifest.files) {
      const fileUrl =
        entry.download_url ||
        `${baseStorageUrl}/v${manifest.version}/${entry.path}`;

      if (!fileUrl.startsWith('https://')) {
        throw new Error(`Non-HTTPS download URL rejected: ${fileUrl}`);
      }

      // External manifests (e.g. GitHub Releases) must NOT receive Supabase
      // credentials: presigned object-store URLs reject a conflicting
      // Authorization header, and the bucket key has no business leaving the
      // project. Only bucket-relative URLs carry the anon key.
      const isExternalUrl = Boolean(entry.download_url);
      const requestHeaders: Record<string, string> = {
        Accept: 'application/octet-stream',
      };
      if (!isExternalUrl) {
        requestHeaders.apikey = SUPABASE_ANON_KEY;
        requestHeaders.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
      }

      const controller = new AbortController();
      // Large installers (~92 MB) need far more than 30s on consumer links.
      const timeoutMs = isExternalUrl ? 15 * 60 * 1000 : 2 * 60 * 1000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let fileBuf: Buffer;

      try {
        const res = await fetch(fileUrl, {
          method: 'GET',
          headers: requestHeaders,
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(
            `Download failed for ${entry.path} (HTTP ${res.status})`
          );
        }

        if (res.body && typeof (res.body as any).getReader === 'function') {
          const reader = (res.body as any).getReader();
          const chunks: Buffer[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkBuf = Buffer.from(value);
            chunks.push(chunkBuf);
            transferredBytes += chunkBuf.length;

            if (
              options?.simulateInterruptAfterBytes &&
              transferredBytes >= options.simulateInterruptAfterBytes
            ) {
              reader.cancel();
              throw new Error('Download connection interrupted mid-stream');
            }

            const pct =
              totalBytes > 0
                ? Math.min(99, Math.round((transferredBytes / totalBytes) * 100))
                : 50;
            options?.onProgress?.({
              phase: 'downloading',
              percent: pct,
              transferredBytes,
              totalBytes,
              version: manifest.version,
            });
          }
          fileBuf = Buffer.concat(chunks);
        } else {
          const arrBuf = await res.arrayBuffer();
          fileBuf = Buffer.from(arrBuf);
          transferredBytes += fileBuf.length;
          if (
            options?.simulateInterruptAfterBytes &&
            transferredBytes >= options.simulateInterruptAfterBytes
          ) {
            throw new Error('Download connection interrupted mid-stream');
          }
          const pct =
            totalBytes > 0
              ? Math.min(99, Math.round((transferredBytes / totalBytes) * 100))
              : 90;
          options?.onProgress?.({
            phase: 'downloading',
            percent: pct,
            transferredBytes,
            totalBytes,
            version: manifest.version,
          });
        }
      } finally {
        clearTimeout(timeout);
      }

      if (fileBuf.length !== entry.size_bytes) {
        logUpdateCheck(
          'download_size_mismatch',
          {
            file: entry.path,
            expected_bytes: entry.size_bytes,
            actual_bytes: fileBuf.length,
          },
          'error'
        );
        return {
          ok: false,
          applied: false,
          reason: `Download incomplete or size mismatch on ${entry.path}: expected ${entry.size_bytes}, got ${fileBuf.length}`,
        };
      }

      const actualSha256 = crypto
        .createHash('sha256')
        .update(fileBuf)
        .digest('hex')
        .toLowerCase();

      if (actualSha256 !== entry.sha256.toLowerCase()) {
        logUpdateCheck(
          'download_hash_mismatch',
          {
            file: entry.path,
            expected_sha256: entry.sha256,
            actual_sha256: actualSha256,
          },
          'error'
        );
        return {
          ok: false,
          applied: false,
          reason: `SHA-256 hash mismatch on ${entry.path} (tampered or corrupt file)`,
        };
      }

      verifiedFiles[entry.path] = fileBuf;
    }
  } catch (err: any) {
    logUpdateCheck(
      'release_download_interrupted',
      { version: manifest.version, error: err?.message || String(err) },
      'warn'
    );
    return {
      ok: false,
      applied: false,
      reason: err?.message || 'Download interrupted',
    };
  }

  options?.onProgress?.({
    phase: 'installing',
    percent: 100,
    transferredBytes: totalBytes,
    totalBytes,
    version: manifest.version,
    message: 'Installing new updates...',
  });

  const applied = applyVerifiedBundleAtomically(manifest, verifiedFiles, {
    customBaseDir: options?.customBaseDir,
  });

  if (!applied.applied) {
    return {
      ok: false,
      applied: false,
      reason: applied.error || 'Failed to apply verified update',
    };
  }

  logUpdateCheck('release_installed_successfully', {
    version: manifest.version,
    mode: applied.mode,
  });

  return {
    ok: true,
    applied: true,
    mode: applied.mode,
    installerPath: applied.installerPath,
  };
}

/**
 * Performs a full pre-login (every launch) or manual update check using the OS-protected device key.
 * - Ensures a valid device key exists first (auto-generates & registers if missing or corrupted).
 * - Requests a random server challenge, signs it with the device Ed25519 private key, and verifies
 *   device registration & non-revocation via Supabase RPC.
 * - Queries release metadata, verifies offline Ed25519 release signature, checks downgrade & rollout rules,
 *   and downloads/applies required & security updates automatically (or prompts on optional feature updates).
 */
export async function performSecureUpdateCheck(options?: {
  manual?: boolean;
  isAgentBusy?: boolean;
  customBaseDir?: string;
  overrideMachineId?: string;
  channelOverride?: 'stable' | 'beta';
  autoRegisterDevice?: boolean;
  autoApplyUpdates?: boolean;
  timeoutMs?: number;
  simulateOffline?: boolean;
  simulateServerError?: boolean;
  simulateSlowServerMs?: number;
  simulateInterruptAfterBytes?: number;
  mockManifest?: SignedReleaseManifest;
  trustedPublicKeysPem?: string[];
  onProgress?: (progress: UpdateProgressEvent) => void;
}): Promise<UpdateCheckResult> {
  const state = loadInstallState(options?.customBaseDir);
  if (options?.channelOverride) {
    state.channel = options.channelOverride;
  }
  const currentVersion = state.active_slot_version || APP_VERSION;
  const nowIso = new Date().toISOString();
  state.last_check_at = nowIso;
  const timeoutMs = options?.timeoutMs ?? 6000;

  options?.onProgress?.({
    phase: 'checking',
    percent: 10,
    transferredBytes: 0,
    totalBytes: 0,
    currentVersion,
    message: 'Checking for updates...',
  });

  // Step 1: Ensure valid device key exists on every launch (auto-create if missing or corrupted)
  const devEnsure = ensureValidDeviceIdentityOnLaunch({
    customBaseDir: options?.customBaseDir,
    overrideMachineId: options?.overrideMachineId,
  });
  const identity = devEnsure.identity;
  const compat = getDeviceCompatibilityContext();

  logUpdateCheck('update_check_started', {
    device_id: identity.deviceId,
    device_regenerated: devEnsure.regenerated,
    current_version: currentVersion,
    channel: state.channel,
    manual: !!options?.manual,
    os_version: compat.os_version,
    arch: compat.arch,
  });

  try {
    if (options?.simulateOffline) {
      throw new Error('fetch failed: network offline');
    }
    if (options?.simulateServerError) {
      throw new Error('HTTP 503 Service Unavailable');
    }
    if (options?.simulateSlowServerMs && options.simulateSlowServerMs > timeoutMs) {
      await new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out (AbortError)')), timeoutMs)
      );
    }

    // Step 2: Obtain server-issued random challenge & verify/register device via Supabase RPC
    let serverChallenge = `ch_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
    const challengeCtrl = new AbortController();
    const challengeTimer = setTimeout(() => challengeCtrl.abort(), timeoutMs);
    try {
      const chRes = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/issue_agent_device_challenge`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ p_device_id: identity.deviceId }),
          signal: challengeCtrl.signal,
        }
      );
      if (chRes.ok) {
        const chData = await chRes.json();
        if (chData?.challenge) {
          serverChallenge = chData.challenge;
        }
      }
    } finally {
      clearTimeout(challengeTimer);
    }

    const signedChallenge = signDeviceChallenge(serverChallenge, {
      customBaseDir: options?.customBaseDir,
      overrideMachineId: options?.overrideMachineId,
    });

    const verifyCtrl = new AbortController();
    const verifyTimer = setTimeout(() => verifyCtrl.abort(), timeoutMs);
    let deviceVerifyResult: {
      allowed?: boolean;
      reason?: string;
      registered?: boolean;
    } | null = null;

    try {
      const verifyRes = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/verify_or_register_agent_device`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            p_device_id: identity.deviceId,
            p_sign_public_key: identity.signPublicKeyPem,
            p_encrypt_public_key: identity.encryptPublicKeyPem,
            p_challenge: serverChallenge,
            p_signature: signedChallenge.signatureBase64,
            p_os_version: compat.os_version,
            p_app_version: currentVersion,
            p_arch: compat.arch,
            p_auto_register: options?.autoRegisterDevice !== false,
          }),
          signal: verifyCtrl.signal,
        }
      );

      if (!verifyRes.ok && verifyRes.status >= 500) {
        throw new Error(`Server error HTTP ${verifyRes.status}`);
      }

      if (verifyRes.ok) {
        deviceVerifyResult = await verifyRes.json();
      }
    } finally {
      clearTimeout(verifyTimer);
    }

    if (deviceVerifyResult && deviceVerifyResult.allowed === false) {
      state.last_check_status = 'Up to date';
      saveInstallState(state, options?.customBaseDir);
      logUpdateCheck(
        'device_rejected_by_server',
        {
          device_id: identity.deviceId,
          reason: deviceVerifyResult.reason || 'unauthorized',
        },
        'warn'
      );
      return {
        checked: true,
        available: false,
        deviceRegenerated: devEnsure.regenerated,
        deviceRejected: true,
        rejectionReason: deviceVerifyResult.reason || 'unauthorized',
        currentVersion,
        channel: state.channel,
        status: 'Up to date',
        message: 'No updates available for this installation.',
        lastCheckAt: nowIso,
      };
    }

    if (deviceVerifyResult?.allowed && !identity.registeredAt) {
      markDeviceRegistered({
        customBaseDir: options?.customBaseDir,
        overrideMachineId: options?.overrideMachineId,
      });
    }

    // Step 3: Fetch release manifest from Supabase Storage (or mockManifest in fault-injection tests)
    let manifest: SignedReleaseManifest;
    if (options?.mockManifest) {
      manifest = options.mockManifest;
    } else {
      const storageUrl = `${SUPABASE_URL}/storage/v1/object/${UPDATE_BUCKET}/manifest.${state.channel}.sig.json`;
      const manifestCtrl = new AbortController();
      const manifestTimer = setTimeout(() => manifestCtrl.abort(), timeoutMs);
      let storageRes: Response;
      try {
        storageRes = await fetch(storageUrl, {
          method: 'GET',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'X-Device-Id': identity.deviceId,
            'X-Device-Signature': signedChallenge.signatureBase64,
          },
          signal: manifestCtrl.signal,
        });
      } finally {
        clearTimeout(manifestTimer);
      }

      if (storageRes.status >= 500) {
        throw new Error(`Storage server error HTTP ${storageRes.status}`);
      }

      if (!storageRes.ok) {
        state.last_check_status = 'Up to date';
        saveInstallState(state, options?.customBaseDir);
        logUpdateCheck('update_check_up_to_date', {
          current_version: currentVersion,
          source: 'storage_manifest_not_found',
        });
        return {
          checked: true,
          available: false,
          deviceRegenerated: devEnsure.regenerated,
          currentVersion,
          channel: state.channel,
          status: 'Up to date',
          message: `You are running the latest version (v${currentVersion}).`,
          lastCheckAt: nowIso,
        };
      }

      manifest = await storageRes.json();
    }

    // Step 4: Verify offline Ed25519 release signature (trust anchor — never skipped)
    const sigVerify = verifyReleaseManifestSignature(
      manifest,
      options?.trustedPublicKeysPem
    );
    if (!sigVerify.valid) {
      state.last_check_status = 'Update rejected (invalid signature)';
      saveInstallState(state, options?.customBaseDir);
      logUpdateCheck(
        'update_rejected_signature',
        { reason: sigVerify.reason, version: manifest?.version },
        'error'
      );
      return {
        checked: true,
        available: false,
        rejectionReason: sigVerify.reason,
        deviceRegenerated: devEnsure.regenerated,
        currentVersion,
        channel: state.channel,
        status: 'Up to date',
        message: `You are running the latest verified version (v${currentVersion}).`,
        lastCheckAt: nowIso,
      };
    }

    // Step 5: Check kill-switch on current version
    if (
      manifest.withdrawn_versions &&
      manifest.withdrawn_versions.includes(currentVersion)
    ) {
      const rb = rollbackToLastKnownGood(
        'Current version withdrawn via manifest kill-switch',
        options?.customBaseDir
      );
      return {
        checked: true,
        available: false,
        rolledBack: true,
        currentVersion: rb.restoredVersion,
        channel: state.channel,
        status: `Rolled back to v${rb.restoredVersion}`,
        message: `A withdrawn update was rolled back to v${rb.restoredVersion}.`,
        lastCheckAt: nowIso,
      };
    }

    if (
      manifest.withdrawn ||
      state.blacklisted_versions.includes(manifest.version) ||
      !isDeviceInRolloutBucket(
        identity.deviceId,
        manifest.version,
        manifest.rollout_percentage ?? 100
      )
    ) {
      state.last_check_status = 'Up to date';
      saveInstallState(state, options?.customBaseDir);
      logUpdateCheck('update_check_up_to_date', {
        current_version: currentVersion,
        manifest_version: manifest.version,
        reason: manifest.withdrawn ? 'withdrawn' : 'rollout_or_blacklist',
      });
      return {
        checked: true,
        available: false,
        deviceRegenerated: devEnsure.regenerated,
        currentVersion,
        channel: state.channel,
        status: 'Up to date',
        message: `You are running the latest version (v${currentVersion}).`,
        lastCheckAt: nowIso,
      };
    }

    // Step 6: Version & downgrade comparison
    const currentCode = semverToCode(currentVersion);
    const targetCode =
      manifest.version_code || semverToCode(manifest.version);
    if (targetCode <= currentCode && !manifest.allow_downgrade) {
      state.last_check_status = 'Up to date';
      saveInstallState(state, options?.customBaseDir);
      logUpdateCheck('update_check_up_to_date', {
        current_version: currentVersion,
        manifest_version: manifest.version,
        current_code: currentCode,
        target_code: targetCode,
      });
      return {
        checked: true,
        available: false,
        rejectionReason:
          targetCode < currentCode ? 'downgrade_rejected' : 'already_up_to_date',
        deviceRegenerated: devEnsure.regenerated,
        currentVersion,
        channel: state.channel,
        status: 'Up to date',
        message: `You are running the latest version (v${currentVersion}).`,
        lastCheckAt: nowIso,
      };
    }

    // Determine update classification (Required vs Security vs Optional Feature)
    const minSupportedCode = semverToCode(
      manifest.min_supported_version || '0.0.0'
    );
    const isRequired =
      currentCode < minSupportedCode || manifest.update_type === 'required';
    const updateType: 'required' | 'security' | 'feature' = isRequired
      ? 'required'
      : manifest.update_type || 'security';

    // Step 7: Active batch protection — never interrupt a running batch
    if (options?.isAgentBusy) {
      state.deferred_update_version = manifest.version;
      state.last_check_status = `Update v${manifest.version} waiting for current run to finish`;
      saveInstallState(state, options?.customBaseDir);
      logUpdateCheck('update_deferred_busy', {
        target_version: manifest.version,
        is_required: isRequired,
        update_type: updateType,
      });
      return {
        checked: true,
        available: true,
        deferred: true,
        isRequired,
        updateType,
        requiresInstaller: manifest.requires_installer,
        currentVersion,
        latestVersion: manifest.version,
        channel: state.channel,
        status: `Update v${manifest.version} waiting (will apply after run)`,
        message: `Version ${manifest.version} is ready and will be applied once your active run finishes.`,
        lastCheckAt: nowIso,
        manifest,
      };
    }

    // Step 8: If optional feature update (and autoApplyUpdates is not forced), prompt user
    const shouldAutoApply =
      options?.autoApplyUpdates !== false &&
      (isRequired || updateType === 'security');

    if (!shouldAutoApply) {
      state.last_check_status = `Update available: v${manifest.version}`;
      saveInstallState(state, options?.customBaseDir);
      logUpdateCheck('optional_update_available', {
        current_version: currentVersion,
        latest_version: manifest.version,
        update_type: updateType,
      });
      options?.onProgress?.({
        phase: 'optional-prompt',
        percent: 0,
        transferredBytes: 0,
        totalBytes: (manifest.files || []).reduce(
          (s, f) => s + (f.size_bytes || 0),
          0
        ),
        version: manifest.version,
        currentVersion,
        isRequired: false,
        updateType: 'feature',
        manifest,
      });
      return {
        checked: true,
        available: true,
        applied: false,
        isRequired: false,
        updateType: 'feature',
        requiresInstaller: manifest.requires_installer,
        currentVersion,
        latestVersion: manifest.version,
        channel: state.channel,
        status: `Update available: v${manifest.version}`,
        message: `Version ${manifest.version} is available.`,
        lastCheckAt: nowIso,
        manifest,
      };
    }

    // Step 9: Required or security update — automatically download, verify SHA-256, and install
    const dlResult = await downloadAndApplyVerifiedRelease(manifest, {
      customBaseDir: options?.customBaseDir,
      trustedPublicKeysPem: options?.trustedPublicKeysPem,
      simulateInterruptAfterBytes: options?.simulateInterruptAfterBytes,
      onProgress: options?.onProgress,
    });

    if (!dlResult.ok || !dlResult.applied) {
      state.last_check_status = 'Update download incomplete or rejected';
      saveInstallState(state, options?.customBaseDir);
      return {
        checked: true,
        available: false,
        applied: false,
        rejectionReason: dlResult.reason,
        currentVersion,
        channel: state.channel,
        status: 'Up to date',
        message: `You are running v${currentVersion}.`,
        lastCheckAt: nowIso,
      };
    }

    const updatedState = loadInstallState(options?.customBaseDir);
    updatedState.last_check_at = nowIso;
    updatedState.last_check_status = `Installed v${manifest.version}`;
    saveInstallState(updatedState, options?.customBaseDir);

    return {
      checked: true,
      available: true,
      applied: true,
      isRequired,
      updateType,
      deviceRegenerated: devEnsure.regenerated,
      requiresInstaller: manifest.requires_installer,
      installerPath: dlResult.installerPath,
      currentVersion,
      latestVersion: manifest.version,
      channel: state.channel,
      status: `Installed v${manifest.version}`,
      message: `Updated to v${manifest.version}.`,
      lastCheckAt: nowIso,
      manifest,
    };
  } catch (err: any) {
    // Offline, timeout, or server error: never block app, continue to login and log reason
    const errMsg = err?.message || String(err);
    const isTimeout =
      err?.name === 'AbortError' ||
      errMsg.toLowerCase().includes('abort') ||
      errMsg.toLowerCase().includes('timed out');
    state.last_check_status = isTimeout
      ? 'Check timed out (skipped)'
      : 'Offline or server unavailable (skipped)';
    saveInstallState(state, options?.customBaseDir);
    logUpdateCheck(
      isTimeout ? 'update_check_timeout' : 'update_check_offline_or_error',
      { error: errMsg },
      'info'
    );
    return {
      checked: true,
      available: false,
      rejectionReason: isTimeout ? 'timeout' : 'offline_or_server_error',
      deviceRegenerated: devEnsure.regenerated,
      currentVersion,
      channel: state.channel,
      status: state.last_check_status,
      message: options?.manual
        ? 'No internet connection or update server is temporarily unavailable.'
        : 'Offline',
      lastCheckAt: nowIso,
    };
  }
}
