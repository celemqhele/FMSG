#!/usr/bin/env node
/**
 * FMSG Agents — Signed Release Builder & Uploader
 *
 * Local release script that:
 * 1. Loads the offline Ed25519 private key from .opencode/keys/release-private.pem
 * 2. Computes SHA-256 hashes and sizes of the built release artifacts
 * 3. Constructs and signs the canonical release manifest (Ed25519)
 * 4. Verifies the signature against the built-in public key in dist/config.js before uploading
 * 5. Uploads the signed manifest and artifacts to the private 'agent-updates' bucket via curl.exe
 *
 * Usage:
 *   node scripts/upload-update.js --version 0.7.0 --min-supported 0.6.0 --type required \
 *     [--changelog-file <path>] [--beta]
 *
 *   Add --requires-installer (and optionally --installer <path>) for any release that
 *   changes the Electron main process, the preload IPC contract, or ships a native
 *   module. Without it the manifest is a renderer-only bundle swap and the installed
 *   app would keep running its old main process against the new renderer.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '../../..');
const OFFLINE_PRIV_KEY_PATH = path.join(REPO_ROOT, '.opencode', 'keys', 'release-private.pem');
const ENV_ACCESS_PATH = path.join(REPO_ROOT, '.opencode', 'supabase-access.env');

const {
  signReleaseManifest,
  verifyReleaseManifestSignature,
} = require('../dist/update-manager');
const { APP_VERSION, semverToCode, SUPABASE_URL, UPDATE_BUCKET } = require('../dist/config');

function readServiceKeyFromLocalEnv() {
  if (process.env.SUPABASE_SERVICE_KEY) return process.env.SUPABASE_SERVICE_KEY;
  if (!fs.existsSync(ENV_ACCESS_PATH)) {
    throw new Error(`Missing local access env at ${ENV_ACCESS_PATH}`);
  }
  const lines = fs.readFileSync(ENV_ACCESS_PATH, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('SUPABASE_SERVICE_KEY=')) {
      return line.split('=')[1].trim();
    }
  }
  throw new Error('SUPABASE_SERVICE_KEY not found in .opencode/supabase-access.env');
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return {
    sha256: crypto.createHash('sha256').update(buf).digest('hex').toLowerCase(),
    size_bytes: buf.length,
  };
}

function uploadViaCurl(serviceKey, bucketPath, localFilePath, contentType) {
  const url = `${SUPABASE_URL}/storage/v1/object/${UPDATE_BUCKET}/${bucketPath}`;
  const outPath = path.join(REPO_ROOT, 'recycle_bin', 'upload_out.json');
  execFileSync(
    'curl.exe',
    [
      '-s',
      '-X',
      'POST',
      url,
      '-H',
      `apikey: ${serviceKey}`,
      '-H',
      `Authorization: Bearer ${serviceKey}`,
      '-H',
      `Content-Type: ${contentType}`,
      '-H',
      'x-upsert: true',
      '--data-binary',
      `@${localFilePath}`,
      '-o',
      outPath,
    ],
    { stdio: 'inherit' }
  );
  const resp = fs.readFileSync(outPath, 'utf8');
  if (resp.includes('"error"') || resp.includes('"statusCode"')) {
    throw new Error(`Upload failed for ${bucketPath}: ${resp}`);
  }
}

function main() {
  if (!fs.existsSync(OFFLINE_PRIV_KEY_PATH)) {
    throw new Error(`Offline release private key not found at ${OFFLINE_PRIV_KEY_PATH}`);
  }

  const releasePrivateKeyPem = fs.readFileSync(OFFLINE_PRIV_KEY_PATH, 'utf8');
  const verFlagIdx = process.argv.indexOf('--version');
  const minFlagIdx = process.argv.indexOf('--min-supported');
  const typeFlagIdx = process.argv.indexOf('--type');
  const version = verFlagIdx !== -1 && process.argv[verFlagIdx + 1] ? process.argv[verFlagIdx + 1] : APP_VERSION;
  const minSupported = minFlagIdx !== -1 && process.argv[minFlagIdx + 1] ? process.argv[minFlagIdx + 1] : '0.2.0';
  const updateType = typeFlagIdx !== -1 && process.argv[typeFlagIdx + 1] ? process.argv[typeFlagIdx + 1] : 'security';
  const channel = process.argv.includes('--beta') ? 'beta' : 'stable';
  const requiresInstaller = process.argv.includes('--requires-installer');
  const dryRun = process.argv.includes('--dry-run');
  const changelogFlagIdx = process.argv.indexOf('--changelog-file');
  const installerFlagIdx = process.argv.indexOf('--installer');
  const installerUrlFlagIdx = process.argv.indexOf('--installer-url');
  const installerDownloadUrl =
    installerUrlFlagIdx !== -1 && process.argv[installerUrlFlagIdx + 1]
      ? process.argv[installerUrlFlagIdx + 1].trim()
      : undefined;

  if (installerDownloadUrl && !installerDownloadUrl.startsWith('https://')) {
    throw new Error(`--installer-url must be an https:// URL (got ${installerDownloadUrl})`);
  }

  // A release that changes the Electron main process, the preload IPC contract or
  // bundles a native module cannot be delivered as a renderer-only bundle swap:
  // the running (old) main process would not know the new channels. Those releases
  // must set requires_installer and ship the NSIS installer, which the updater runs
  // silently as `<installer> /S /UPDATE` (handled by installer/installer.nsh).
  const artifacts = [
    {
      local: path.join(APP_ROOT, 'renderer', 'bundle.js'),
      rel: 'renderer/bundle.js',
      type: 'bundle',
      mime: 'application/javascript',
    },
    {
      local: path.join(APP_ROOT, 'renderer', 'design-system.css'),
      rel: 'renderer/design-system.css',
      type: 'css',
      mime: 'text/css',
    },
  ];

  if (requiresInstaller) {
    const installerPath =
      installerFlagIdx !== -1 && process.argv[installerFlagIdx + 1]
        ? path.resolve(process.argv[installerFlagIdx + 1])
        : path.join(
            APP_ROOT,
            'dist',
            'electron',
            `FMSG Agents Setup ${version}.exe`
          );
    artifacts.push({
      local: installerPath,
      rel: `installer/FMSG-Agents-Setup-${version}.exe`,
      type: 'installer',
      mime: 'application/octet-stream',
      downloadUrl: installerDownloadUrl,
    });
  }

  let changelog = [];
  if (changelogFlagIdx !== -1 && process.argv[changelogFlagIdx + 1]) {
    const changelogPath = path.resolve(process.argv[changelogFlagIdx + 1]);
    if (!fs.existsSync(changelogPath)) {
      throw new Error(`Changelog file not found: ${changelogPath}`);
    }
    changelog = fs
      .readFileSync(changelogPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  const fileEntries = [];
  for (const art of artifacts) {
    if (!fs.existsSync(art.local)) {
      throw new Error(`Required artifact missing: ${art.local}`);
    }
    const { sha256, size_bytes } = sha256File(art.local);
    fileEntries.push({
      path: art.rel,
      size_bytes,
      sha256,
      type: art.type,
      ...(art.downloadUrl ? { download_url: art.downloadUrl } : {}),
    });
  }

  const unsignedManifest = {
    version,
    version_code: semverToCode(version),
    channel,
    min_supported_version: minSupported,
    update_type: updateType,
    requires_installer: requiresInstaller,
    allow_downgrade: false,
    withdrawn: false,
    withdrawn_versions: [],
    rollout_percentage: 100,
    released_at: new Date().toISOString(),
    changelog,
    files: fileEntries,
  };

  const signedManifest = signReleaseManifest(unsignedManifest, releasePrivateKeyPem);

  // Verify signature before uploading
  const verify = verifyReleaseManifestSignature(signedManifest);
  if (!verify.valid) {
    throw new Error(`Self-verification of signed manifest failed: ${verify.reason}`);
  }

  const manifestTempPath = path.join(REPO_ROOT, 'recycle_bin', `manifest.${channel}.sig.json`);
  fs.mkdirSync(path.dirname(manifestTempPath), { recursive: true });
  fs.writeFileSync(manifestTempPath, JSON.stringify(signedManifest, null, 2), 'utf8');

  if (dryRun) {
    console.log(
      `[Release Dry-Run] Signed & verified manifest.${channel}.sig.json for v${version} (${fileEntries.length} files, requires_installer=${requiresInstaller})`
    );
    return;
  }

  const serviceKey = readServiceKeyFromLocalEnv();

  for (const art of artifacts) {
    if (art.downloadUrl) {
      console.log(
        `[Release] External download_url configured for ${art.rel} -> ${art.downloadUrl} (skipping bucket upload)`
      );
      continue;
    }
    const remotePath = `v${version}/${art.rel}`;
    uploadViaCurl(serviceKey, remotePath, art.local, art.mime);
    console.log(`[Release] Uploaded ${remotePath}`);
  }

  uploadViaCurl(
    serviceKey,
    `manifest.${channel}.sig.json`,
    manifestTempPath,
    'application/json'
  );
  console.log(`[Release] Uploaded signed manifest.${channel}.sig.json for v${version}`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
