/**
 * FMSG Agents — Bundled Public Configuration & Startup Validation
 *
 * Uses ONLY the public anonymous key + user session.
 * No server secrets or service_role keys exist anywhere in client code.
 */

export const APP_VERSION = '0.6.0';

export function semverToCode(version: string): number {
  const clean = version.replace(/^v/i, '').split('-')[0];
  const parts = clean.split('.').map((n) => parseInt(n, 10) || 0);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  return major * 10000 + minor * 100 + patch;
}

export const APP_VERSION_CODE = semverToCode(APP_VERSION);

// Bundled public configuration (matches FMSG web client)
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://nnebtygloqixibbjxsjr.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uZWJ0eWdsb3FpeGliYmp4c2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDAwNTUsImV4cCI6MjA5NzI3NjA1NX0.6pv9o3rdfBMZeyctFetwRTwbUoMOCL2pJkLoTs3WKjk';

export const WEB_BASE_URL =
  process.env.FMSG_WEB_URL || 'https://findmesomejobs.co.za';

export const UPDATE_BUCKET = 'agent-updates';

// Built-in Ed25519 Release Signing Public Keys (Primary + Backup for key rotation survival)
export const RELEASE_PUBLIC_KEYS_PEM: string[] = [
  `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAJUae6gP3h3jhjBtGh3z+aeFjc8xlfRogq+uvy091B4E=
-----END PUBLIC KEY-----`,
];

export interface ConfigValidationResult {
  valid: boolean;
  reason?: string;
  keyRole?: string;
}

export function validateStartupConfig(
  urlOverride?: string,
  keyOverride?: string
): ConfigValidationResult {
  const url = urlOverride !== undefined ? urlOverride : SUPABASE_URL;
  const key = keyOverride !== undefined ? keyOverride : SUPABASE_ANON_KEY;

  if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
    return { valid: false, reason: 'Missing or non-HTTPS backend URL' };
  }

  try {
    new URL(url);
  } catch {
    return { valid: false, reason: 'Malformed backend URL' };
  }

  if (!key || typeof key !== 'string' || key.trim().length < 32) {
    return { valid: false, reason: 'Missing or invalid public client key' };
  }

  // Verify the key is strictly a public 'anon' JWT and never a service_role or secret key
  if (key.startsWith('sb_secret_') || key.includes('service_role')) {
    return { valid: false, reason: 'Server secret key detected in client config; forbidden' };
  }

  const parts = key.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'Client key is not a valid 3-part token' };
  }

  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    if (payload.role !== 'anon') {
      return {
        valid: false,
        reason: `Client key has unexpected role '${String(payload.role)}' (must be 'anon')`,
        keyRole: String(payload.role),
      };
    }
    return { valid: true, keyRole: 'anon' };
  } catch {
    return { valid: false, reason: 'Failed to decode client token payload' };
  }
}
