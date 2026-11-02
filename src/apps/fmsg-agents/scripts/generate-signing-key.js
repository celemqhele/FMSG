#!/usr/bin/env node
/**
 * FMSG Agents — Offline Release Signing Key Generator
 *
 * Generates an Ed25519 release signing keypair in the offline, gitignored
 * directory C:\Users\mqhel\FMSG\.opencode\keys\ (never inside the app or repo).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OFFLINE_KEY_DIR = path.resolve(__dirname, '../../../../.opencode/keys');
const PRIVATE_KEY_PATH = path.join(OFFLINE_KEY_DIR, 'release-private.pem');
const PUBLIC_KEY_PATH = path.join(OFFLINE_KEY_DIR, 'release-public.pem');

function generateOfflineReleaseKeys(forceNew = false) {
  fs.mkdirSync(OFFLINE_KEY_DIR, { recursive: true });

  if (!forceNew && fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    const pub = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
    console.log('[ReleaseKeys] Existing offline Ed25519 keypair found at:', OFFLINE_KEY_DIR);
    console.log(pub);
    return { privateKeyPath: PRIVATE_KEY_PATH, publicKeyPath: PUBLIC_KEY_PATH, publicKeyPem: pub };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);

  console.log('[ReleaseKeys] Generated new offline Ed25519 release keypair:');
  console.log('  Offline Private Key (NEVER commit or upload):', PRIVATE_KEY_PATH);
  console.log('  Public Key (embed in src/apps/fmsg-agents/config.ts):', PUBLIC_KEY_PATH);
  console.log(publicKey);
  return { privateKeyPath: PRIVATE_KEY_PATH, publicKeyPath: PUBLIC_KEY_PATH, publicKeyPem: publicKey };
}

if (require.main === module) {
  const rotate = process.argv.includes('--rotate');
  generateOfflineReleaseKeys(rotate);
}

module.exports = { generateOfflineReleaseKeys, PRIVATE_KEY_PATH, PUBLIC_KEY_PATH };
