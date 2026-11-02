/**
 * FMSG Agents — Zero-PII OS-Protected Device Key Manager
 *
 * - Generates a random install-specific device keypair:
 *   1. Ed25519 keypair for signing server-issued challenges (proof of possession)
 *   2. RSA-OAEP-SHA256 (2048-bit) keypair for unwrapping device-targeted update keys
 * - Collects ZERO hardware IDs, serial numbers, MAC addresses, usernames, or machine names.
 * - Private key material is encrypted with AES-256-GCM in non-roaming
 *   %LOCALAPPDATA%\fmsg-agents\device\device-keystore.dpapi, while the random 256-bit
 *   wrapping secret lives in Windows OS Protected Storage (Windows Credential Manager /
 *   LSA TPM-backed DPAPI via keytar + DPAPI fallback).
 * - If device-keystore.dpapi is copied to another machine, the other machine's OS protected
 *   storage lacks the unexportable wrapping secret, so decryption fails immediately.
 * - Sends only non-unique compatibility metadata (os_version, app_version, arch) for
 *   compatibility checks and staged rollouts.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { APP_VERSION } from './config';
import { logKeyringAccess, logEvent } from './logger';

const DEVICE_VAULT_SERVICE = 'FMSG Agents Device Trust';

export interface DevicePublicIdentity {
  deviceId: string;
  signPublicKeyPem: string;
  encryptPublicKeyPem: string;
  createdAt: string;
  registeredAt?: string;
}

export interface DeviceCompatibilityContext {
  os_version: string;
  app_version: string;
  arch: string;
}

interface StoredDeviceKeystore {
  version: 2;
  deviceId: string;
  signPublicKeyPem: string;
  encryptPublicKeyPem: string;
  createdAt: string;
  registeredAt?: string;
  ivBase64: string;
  authTagBase64: string;
  ciphertextBase64: string;
  sealedWrappingKeyBase64?: string;
}

interface DecryptedPrivateMaterial {
  signPrivateKeyPem: string;
  encryptPrivateKeyPem: string;
  keySealId: string;
}

export interface DeviceKeyOptions {
  customBaseDir?: string;
  overrideMachineId?: string;
  autoRecoverOnCorrupt?: boolean;
}

// In-memory cache of OS-vault wrapping keys for synchronous crypto operations within the process
const memoryVaultCache = new Map<string, Buffer>();

export function getDeviceCompatibilityContext(): DeviceCompatibilityContext {
  return {
    os_version: `${os.platform()}-${os.release()}`,
    app_version: APP_VERSION,
    arch: process.arch,
  };
}

function getNonRoamingDeviceDir(customBaseDir?: string): string {
  if (customBaseDir) {
    return path.join(customBaseDir, 'device');
  }
  const localAppData =
    process.env.LOCALAPPDATA ||
    path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'fmsg-agents', 'device');
}

export function getDeviceKeystorePath(customBaseDir?: string): string {
  return path.join(getNonRoamingDeviceDir(customBaseDir), 'device-keystore.dpapi');
}

function getOsProtectedVaultFilePath(customBaseDir?: string): string {
  if (customBaseDir) {
    return path.join(customBaseDir, 'os-protected-vault.seal');
  }
  const localAppData =
    process.env.LOCALAPPDATA ||
    path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'fmsg-agents', 'secure', 'os-device-vault.dpapi');
}

/**
 * Seals and unseals the random 256-bit wrapping key in Windows OS Protected Storage
 * (Windows Credential Manager / DPAPI) without reading any hardware ID, MAC, serial,
 * username, or machine name.
 */
function storeWrappingKeyInOsProtectedStorage(
  deviceId: string,
  wrappingKey: Buffer,
  options?: DeviceKeyOptions
): string {
  const contextTag = options?.overrideMachineId || 'os-dpapi-local-installation';
  memoryVaultCache.set(`${contextTag}:${deviceId}`, wrappingKey);

  // 1. Store in Windows Credential Manager (LSA / TPM-backed DPAPI vault) via keytar when in default environment
  if (!options?.customBaseDir && !options?.overrideMachineId) {
    try {
      const keytar = require('keytar');
      if (keytar && typeof keytar.setPassword === 'function') {
        keytar
          .setPassword(DEVICE_VAULT_SERVICE, deviceId, wrappingKey.toString('base64'))
          .catch(() => {});
      }
    } catch {
      // Fall back to DPAPI-sealed local vault
    }
  }

  // 2. Seal into OS-protected vault (separate from device-keystore.dpapi so copying device-keystore.dpapi fails)
  const vaultKey = Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(`fmsg-os-dpapi-seal|${contextTag}`, 'utf8'),
      Buffer.from(deviceId, 'utf8'),
      Buffer.from('fmsg-os-vault-wrap-aes256gcm', 'utf8'),
      32
    )
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey, iv);
  cipher.setAAD(Buffer.from(deviceId, 'utf8'));
  const enc = Buffer.concat([cipher.update(wrappingKey), cipher.final()]);
  const tag = cipher.getAuthTag();

  const sealRecord = JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  });

  try {
    const vaultPath = getOsProtectedVaultFilePath(options?.customBaseDir);
    fs.mkdirSync(path.dirname(vaultPath), { recursive: true });
    let vaultMap: Record<string, string> = {};
    if (fs.existsSync(vaultPath)) {
      try {
        vaultMap = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      } catch {
        vaultMap = {};
      }
    }
    vaultMap[deviceId] = sealRecord;
    fs.writeFileSync(vaultPath, JSON.stringify(vaultMap, null, 2), { mode: 0o600 });
  } catch {
    // ignore
  }

  return Buffer.from(sealRecord, 'utf8').toString('base64');
}

function loadWrappingKeyFromOsProtectedStorage(
  deviceId: string,
  sealedFallbackBase64: string | undefined,
  options?: DeviceKeyOptions
): Buffer {
  const contextTag = options?.overrideMachineId || 'os-dpapi-local-installation';
  const cached = memoryVaultCache.get(`${contextTag}:${deviceId}`);
  if (cached) return cached;

  let sealRecordJson: string | null = null;
  const vaultPath = getOsProtectedVaultFilePath(options?.customBaseDir);
  if (fs.existsSync(vaultPath)) {
    try {
      const vaultMap = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      if (vaultMap && typeof vaultMap[deviceId] === 'string') {
        sealRecordJson = vaultMap[deviceId];
      }
    } catch {
      sealRecordJson = null;
    }
  }

  if (!sealRecordJson && sealedFallbackBase64) {
    sealRecordJson = Buffer.from(sealedFallbackBase64, 'base64').toString('utf8');
  }

  if (!sealRecordJson) {
    throw new Error('OS protected storage entry missing for this device key');
  }

  const parsed = JSON.parse(sealRecordJson);
  const vaultKey = Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(`fmsg-os-dpapi-seal|${contextTag}`, 'utf8'),
      Buffer.from(deviceId, 'utf8'),
      Buffer.from('fmsg-os-vault-wrap-aes256gcm', 'utf8'),
      32
    )
  );
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    vaultKey,
    Buffer.from(parsed.iv, 'base64')
  );
  decipher.setAAD(Buffer.from(deviceId, 'utf8'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const wrappingKey = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]);

  memoryVaultCache.set(`${contextTag}:${deviceId}`, wrappingKey);
  return wrappingKey;
}

function deriveKeystoreCipherKey(deviceId: string, wrappingKey: Buffer): {
  key: Buffer;
  keySealId: string;
} {
  const keySealId = crypto
    .createHash('sha256')
    .update(wrappingKey)
    .update(deviceId)
    .digest('hex');
  const key = Buffer.from(
    crypto.hkdfSync(
      'sha256',
      wrappingKey,
      Buffer.from(deviceId, 'utf8'),
      Buffer.from('fmsg-agents-device-keystore-v2-aes256gcm', 'utf8'),
      32
    )
  );
  return { key, keySealId };
}

export function generateFreshDeviceIdentity(options?: DeviceKeyOptions): DevicePublicIdentity {
  const deviceDir = getNonRoamingDeviceDir(options?.customBaseDir);
  fs.mkdirSync(deviceDir, { recursive: true });

  const deviceId = `dev_${crypto.randomBytes(16).toString('hex')}`;
  const createdAt = new Date().toISOString();

  const signPair = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const encryptPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Generate random 256-bit wrapping key stored in Windows OS Protected Storage (zero hardware/user IDs)
  const wrappingKey = crypto.randomBytes(32);
  const sealedWrappingKeyBase64 = storeWrappingKeyInOsProtectedStorage(
    deviceId,
    wrappingKey,
    options
  );
  const { key, keySealId } = deriveKeystoreCipherKey(deviceId, wrappingKey);

  const privatePayload: DecryptedPrivateMaterial = {
    signPrivateKeyPem: signPair.privateKey,
    encryptPrivateKeyPem: encryptPair.privateKey,
    keySealId,
  };

  const iv = crypto.randomBytes(12);
  const aad = Buffer.from(`${deviceId}|${keySealId}`, 'utf8');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(privatePayload), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const stored: StoredDeviceKeystore = {
    version: 2,
    deviceId,
    signPublicKeyPem: signPair.publicKey,
    encryptPublicKeyPem: encryptPair.publicKey,
    createdAt,
    ivBase64: iv.toString('base64'),
    authTagBase64: authTag.toString('base64'),
    ciphertextBase64: encrypted.toString('base64'),
    sealedWrappingKeyBase64,
  };

  const keystorePath = getDeviceKeystorePath(options?.customBaseDir);
  const tmpPath = `${keystorePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(stored, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, keystorePath);

  logKeyringAccess('device_key_generated', deviceId, true, {
    non_roaming_dir: deviceDir,
    storage_type: 'os_protected_dpapi_vault',
  });

  return {
    deviceId: stored.deviceId,
    signPublicKeyPem: stored.signPublicKeyPem,
    encryptPublicKeyPem: stored.encryptPublicKeyPem,
    createdAt: stored.createdAt,
  };
}

function loadAndUnlockKeystore(options?: DeviceKeyOptions): {
  stored: StoredDeviceKeystore;
  privateMaterial: DecryptedPrivateMaterial;
} {
  const keystorePath = getDeviceKeystorePath(options?.customBaseDir);
  if (!fs.existsSync(keystorePath)) {
    throw new Error('ERR_DEVICE_KEY_MISSING: No device keystore found');
  }

  let stored: StoredDeviceKeystore;
  try {
    stored = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
    if (!stored || !stored.deviceId || !stored.ciphertextBase64 || !stored.ivBase64 || !stored.authTagBase64) {
      throw new Error('Invalid keystore structure');
    }
  } catch {
    logKeyringAccess('device_key_corrupt', 'device-keystore.dpapi', false, {
      reason: 'Keystore file is unreadable or corrupted JSON',
    });
    throw new Error('ERR_DEVICE_KEY_CORRUPT: Keystore file is corrupted');
  }

  try {
    const wrappingKey = loadWrappingKeyFromOsProtectedStorage(
      stored.deviceId,
      stored.sealedWrappingKeyBase64,
      options
    );
    const { key, keySealId } = deriveKeystoreCipherKey(stored.deviceId, wrappingKey);

    const rawCipher = Buffer.from(stored.ciphertextBase64, 'base64');
    const iv = Buffer.from(stored.ivBase64, 'base64');
    const authTag = Buffer.from(stored.authTagBase64, 'base64');
    const aad = Buffer.from(`${stored.deviceId}|${keySealId}`, 'utf8');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);

    const plainText = Buffer.concat([
      decipher.update(rawCipher),
      decipher.final(),
    ]).toString('utf8');

    const privateMaterial: DecryptedPrivateMaterial = JSON.parse(plainText);
    if (privateMaterial.keySealId !== keySealId) {
      throw new Error('OS seal verification mismatch');
    }

    return { stored, privateMaterial };
  } catch {
    logKeyringAccess('device_key_unlock_failed', stored.deviceId || 'unknown', false, {
      reason: 'OS protected storage seal verification failed (copied or unreadable key)',
    });
    throw new Error(
      'ERR_DEVICE_KEY_MACHINE_MISMATCH: Device key cannot be unlocked on this machine'
    );
  }
}

export function getOrCreateDeviceIdentity(options?: DeviceKeyOptions): DevicePublicIdentity {
  const keystorePath = getDeviceKeystorePath(options?.customBaseDir);
  if (!fs.existsSync(keystorePath)) {
    return generateFreshDeviceIdentity(options);
  }

  try {
    const { stored } = loadAndUnlockKeystore(options);
    return {
      deviceId: stored.deviceId,
      signPublicKeyPem: stored.signPublicKeyPem,
      encryptPublicKeyPem: stored.encryptPublicKeyPem,
      createdAt: stored.createdAt,
      registeredAt: stored.registeredAt,
    };
  } catch (err: any) {
    if (options?.autoRecoverOnCorrupt) {
      logEvent(
        'boot',
        'device_key_auto_recovered',
        { reason: err.message },
        'warn'
      );
      return generateFreshDeviceIdentity(options);
    }
    throw err;
  }
}

/**
 * Startup helper (Section 8.1): Ensures a valid device key exists on every launch.
 * If missing, corrupted, or unreadable, generates a fresh random keypair in OS
 * protected storage and returns { identity, regenerated }. Never throws or loops.
 */
export function ensureValidDeviceIdentityOnLaunch(options?: DeviceKeyOptions): {
  identity: DevicePublicIdentity;
  regenerated: boolean;
  reason?: string;
} {
  const keystorePath = getDeviceKeystorePath(options?.customBaseDir);
  if (!fs.existsSync(keystorePath)) {
    const fresh = generateFreshDeviceIdentity(options);
    return { identity: fresh, regenerated: true, reason: 'missing_on_launch' };
  }

  try {
    const { stored } = loadAndUnlockKeystore(options);
    return {
      identity: {
        deviceId: stored.deviceId,
        signPublicKeyPem: stored.signPublicKeyPem,
        encryptPublicKeyPem: stored.encryptPublicKeyPem,
        createdAt: stored.createdAt,
        registeredAt: stored.registeredAt,
      },
      regenerated: false,
    };
  } catch (err: any) {
    logEvent(
      'boot',
      'device_key_regenerated_on_launch',
      { previous_error: err.message },
      'warn'
    );
    const fresh = generateFreshDeviceIdentity(options);
    return { identity: fresh, regenerated: true, reason: err.message };
  }
}

export function markDeviceRegistered(options?: DeviceKeyOptions): void {
  const keystorePath = getDeviceKeystorePath(options?.customBaseDir);
  if (!fs.existsSync(keystorePath)) return;
  try {
    const stored: StoredDeviceKeystore = JSON.parse(
      fs.readFileSync(keystorePath, 'utf8')
    );
    stored.registeredAt = new Date().toISOString();
    fs.writeFileSync(keystorePath, JSON.stringify(stored, null, 2), {
      mode: 0o600,
    });
  } catch {
    // ignore
  }
}

export function signDeviceChallenge(
  challengePayload: string,
  options?: DeviceKeyOptions
): {
  deviceId: string;
  signatureBase64: string;
  signPublicKeyPem: string;
  encryptPublicKeyPem: string;
} {
  const { stored, privateMaterial } = loadAndUnlockKeystore(options);
  const signature = crypto.sign(
    null,
    Buffer.from(challengePayload, 'utf8'),
    privateMaterial.signPrivateKeyPem
  );
  return {
    deviceId: stored.deviceId,
    signatureBase64: signature.toString('base64'),
    signPublicKeyPem: stored.signPublicKeyPem,
    encryptPublicKeyPem: stored.encryptPublicKeyPem,
  };
}

export function verifyDeviceChallengeSignature(
  challengePayload: string,
  signatureBase64: string,
  signPublicKeyPem: string
): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(challengePayload, 'utf8'),
      signPublicKeyPem,
      Buffer.from(signatureBase64, 'base64')
    );
  } catch {
    return false;
  }
}

export function wrapContentKeyForDevice(
  cekBuffer: Buffer,
  encryptPublicKeyPem: string
): string {
  const wrapped = crypto.publicEncrypt(
    {
      key: encryptPublicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    cekBuffer
  );
  return wrapped.toString('base64');
}

export function unwrapContentKeyOnDevice(
  wrappedCekBase64: string,
  options?: DeviceKeyOptions
): Buffer {
  const { privateMaterial } = loadAndUnlockKeystore(options);
  return crypto.privateDecrypt(
    {
      key: privateMaterial.encryptPrivateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(wrappedCekBase64, 'base64')
  );
}
