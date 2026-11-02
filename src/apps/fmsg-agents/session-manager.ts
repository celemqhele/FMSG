/**
 * FMSG Agents — Website-Parity Auth & OS Keyring Session Manager
 *
 * Replicates the FMSG website authentication and post-login flow:
 * - Uses ONLY SUPABASE_URL + SUPABASE_ANON_KEY + user session (RLS enforced).
 * - Persists session in OS keyring (keytar + DPAPI fallback) when keepSignedIn=true.
 * - Silently refreshes tokens and updates keyring storage.
 * - Implements Log In, Sign Up (with /api/auth/check-signup, record-signup, send-verification),
 *   Forgot Password, Resend Confirmation, 6-Digit Email Verification, and Profile Fetch under RLS.
 * - Maps all errors to plain, human-friendly inline messages; logs technical details to logger.ts.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  WEB_BASE_URL,
  validateStartupConfig,
} from './config';
import {
  logAuthFlow,
  logKeyringAccess,
  logNetworkCall,
} from './logger';

const KEYTAR_SERVICE = 'FMSG Agents Auth';
const KEYTAR_ACCOUNT = 'user-session';

export interface PersistedSessionRecord {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  keep_signed_in: boolean;
  user: {
    id: string;
    email?: string;
    email_confirmed_at?: string | null;
    user_metadata?: Record<string, any>;
  };
}

export interface UserAccountSummary {
  id: string;
  email: string;
  emailConfirmed: boolean;
  emailVerified: boolean;
  accountStatus: string;
  onboardingCompleted: boolean;
  plan: string;
  balances: {
    search: number;
    cv: number;
    pf: number;
    has_searched: boolean;
  };
}

export interface AuthActionResult {
  ok: boolean;
  code?:
    | 'INVALID_CREDENTIALS'
    | 'EMAIL_NOT_CONFIRMED'
    | 'ALREADY_EXISTS'
    | 'RATE_LIMITED'
    | 'OFFLINE'
    | 'SERVICE_UNAVAILABLE'
    | 'SESSION_SAVE_FAILED'
    | 'PROFILE_LOAD_FAILED'
    | 'VALIDATION_ERROR'
    | 'SIGNUP_BLOCKED'
    | 'CONFIG_INVALID'
    | 'UNKNOWN';
  field?: 'email' | 'password' | 'name' | 'surname' | 'terms' | 'code' | 'general';
  error?: string;
  requiresEmailConfirmation?: boolean;
  unconfirmedEmail?: string;
  user?: UserAccountSummary;
  profiles?: any[];
}

class SessionSaveError extends Error {
  readonly kind = 'SESSION_SAVE_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'SessionSaveError';
  }
}

class ProfileLoadError extends Error {
  readonly kind = 'PROFILE_LOAD_FAILED';
  readonly dbCode?: string;
  constructor(message: string, dbCode?: string) {
    super(message);
    this.name = 'ProfileLoadError';
    this.dbCode = dbCode;
  }
}

/**
 * Electron 34 embeds Node.js 20.19.1 in the main process, where globalThis.WebSocket
 * is undefined by default. @supabase/supabase-js v2.118+ (@supabase/realtime-js)
 * checks WebSocketFactory.getWebSocketConstructor() eagerly inside new SupabaseClient()
 * even when Realtime is unused. Providing this spec-compliant WebSocket constructor
 * both on globalThis.WebSocket and via realtime.transport prevents createClient() from throwing.
 */
class DesktopRealtimeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readonly url: string;
  readonly protocol: string;
  readyState: number = DesktopRealtimeWebSocket.CLOSED;
  binaryType = 'blob';
  bufferedAmount = 0;
  extensions = '';

  onopen: ((this: any, ev: any) => any) | null = null;
  onmessage: ((this: any, ev: any) => any) | null = null;
  onclose: ((this: any, ev: any) => any) | null = null;
  onerror: ((this: any, ev: any) => any) | null = null;

  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = String(url);
    this.protocol = Array.isArray(protocols) ? protocols[0] || '' : protocols || '';
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = DesktopRealtimeWebSocket.CLOSED;
  }

  send(_data: any): void {}
  addEventListener(_type: string, _listener: any): void {}
  removeEventListener(_type: string, _listener: any): void {}
  dispatchEvent(_event: any): boolean {
    return true;
  }
}

if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = DesktopRealtimeWebSocket;
}

let inMemorySession: PersistedSessionRecord | null = null;
let activeSupabaseClient: SupabaseClient | null = null;
let refreshIntervalHandle: ReturnType<typeof setInterval> | null = null;

function getSecureSessionFilePath(customBaseDir?: string): string {
  const base =
    customBaseDir ||
    path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'fmsg-agents'
    );
  return path.join(base, 'secure', 'session.dpapi');
}

function deriveSessionEncryptionKey(customBaseDir?: string): Buffer {
  const base =
    customBaseDir ||
    path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'fmsg-agents'
    );
  const sealPath = path.join(base, 'secure', 'session-vault-key.dpapi');
  let randomMaster: Buffer;
  if (fs.existsSync(sealPath)) {
    try {
      randomMaster = Buffer.from(fs.readFileSync(sealPath, 'utf8').trim(), 'base64');
      if (randomMaster.length !== 32) throw new Error('Invalid length');
    } catch {
      randomMaster = crypto.randomBytes(32);
      fs.mkdirSync(path.dirname(sealPath), { recursive: true });
      fs.writeFileSync(sealPath, randomMaster.toString('base64'), { mode: 0o600 });
    }
  } else {
    randomMaster = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(sealPath), { recursive: true });
    fs.writeFileSync(sealPath, randomMaster.toString('base64'), { mode: 0o600 });
  }
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      randomMaster,
      Buffer.from('fmsg-agents-auth-salt', 'utf8'),
      Buffer.from('fmsg-agents-auth-session-aes256gcm', 'utf8'),
      32
    )
  );
}

async function saveSessionToKeyring(
  record: PersistedSessionRecord,
  customBaseDir?: string
): Promise<void> {
  inMemorySession = record;
  if (!record.keep_signed_in) {
    await deleteSessionFromKeyring(customBaseDir, true);
    return;
  }

  const jsonPayload = JSON.stringify(record);
  let savedToKeytar = false;
  let savedToDpapi = false;
  let lastSaveError = '';

  // 1. Try keytar (OS Credential Manager) when not using an isolated test directory
  if (!customBaseDir) {
    try {
      const keytar = require('keytar');
      if (keytar && typeof keytar.setPassword === 'function') {
        await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, jsonPayload);
        savedToKeytar = true;
        logKeyringAccess('save_session_keytar', KEYTAR_ACCOUNT, true);
      }
    } catch (err: any) {
      lastSaveError = err?.message || String(err);
      logKeyringAccess('save_session_keytar', KEYTAR_ACCOUNT, false, {
        error: lastSaveError,
      });
    }
  }

  // 2. Always maintain DPAPI / machine-bound encrypted file store
  try {
    const filePath = getSecureSessionFilePath(customBaseDir);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const key = deriveSessionEncryptionKey(customBaseDir);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(jsonPayload, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const payloadToWrite = JSON.stringify({
      v: 1,
      iv: iv.toString('base64'),
      tag: authTag.toString('base64'),
      data: encrypted.toString('base64'),
    });

    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, payloadToWrite, { mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
    savedToDpapi = true;
    logKeyringAccess('save_session_dpapi', 'session.dpapi', true);
  } catch (err: any) {
    lastSaveError = err?.message || String(err);
    logKeyringAccess('save_session_dpapi', 'session.dpapi', false, {
      error: lastSaveError,
    });
  }

  if (!savedToKeytar && !savedToDpapi) {
    throw new SessionSaveError(
      lastSaveError || 'Both OS keyring and local encrypted store failed to write session'
    );
  }
}

async function readSessionFromKeyring(
  customBaseDir?: string
): Promise<PersistedSessionRecord | null> {
  if (inMemorySession) return inMemorySession;

  // 1. Try keytar first when in default location
  if (!customBaseDir) {
    try {
      const keytar = require('keytar');
      if (keytar && typeof keytar.getPassword === 'function') {
        const raw = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedSessionRecord;
          if (parsed?.access_token && parsed?.refresh_token) {
            inMemorySession = parsed;
            logKeyringAccess('read_session_keytar', KEYTAR_ACCOUNT, true);
            return parsed;
          }
        }
      }
    } catch {
      // Fall back to DPAPI store
    }
  }

  // 2. Read DPAPI / machine-bound encrypted file store
  const filePath = getSecureSessionFilePath(customBaseDir);
  if (!fs.existsSync(filePath)) return null;

  try {
    let rawContent = fs.readFileSync(filePath, 'utf8');
    const outer = JSON.parse(rawContent);

    if (outer.v === 2 && outer.dpapi) {
      const electron = require('electron');
      rawContent = electron.safeStorage.decryptString(
        Buffer.from(outer.dpapi, 'base64')
      );
    }

    const envelope = JSON.parse(rawContent);
    const key = deriveSessionEncryptionKey(customBaseDir);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    const record = JSON.parse(decrypted) as PersistedSessionRecord;
    if (record?.access_token && record?.refresh_token) {
      inMemorySession = record;
      logKeyringAccess('read_session_dpapi', 'session.dpapi', true);
      return record;
    }
  } catch (err: any) {
    logKeyringAccess('read_session_dpapi', 'session.dpapi', false, {
      error: err.message,
    });
  }
  return null;
}

export async function deleteSessionFromKeyring(
  customBaseDir?: string,
  keepMemory = false
): Promise<void> {
  if (!keepMemory) {
    inMemorySession = null;
  }

  if (!customBaseDir) {
    try {
      const keytar = require('keytar');
      if (keytar && typeof keytar.deletePassword === 'function') {
        await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
        logKeyringAccess('delete_session_keytar', KEYTAR_ACCOUNT, true);
      }
    } catch {
      // ignore
    }
  }

  const filePath = getSecureSessionFilePath(customBaseDir);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logKeyringAccess('delete_session_dpapi', 'session.dpapi', true);
    }
  } catch {
    // ignore
  }
}

const instrumentedSupabaseFetch: typeof fetch = async (input, init) => {
  const t0 = Date.now();
  const method = (init?.method || 'GET').toUpperCase();
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any)?.url || '';
  const safeUrl = rawUrl.split('?')[0];
  try {
    const res = await fetch(input, init);
    const duration = Date.now() - t0;
    if (res.status >= 400) {
      let errDetails: Record<string, any> = {};
      try {
        const clone = res.clone();
        const bodyJson = await clone.json();
        errDetails = {
          http_status: res.status,
          error_code: bodyJson?.error_code || bodyJson?.code,
          error_msg: bodyJson?.msg || bodyJson?.message || bodyJson?.error_description || bodyJson?.error,
        };
      } catch {
        errDetails = { http_status: res.status };
      }
      logNetworkCall(method, safeUrl, res.status, duration, errDetails);
    } else {
      logNetworkCall(method, safeUrl, res.status, duration);
    }
    return res;
  } catch (netErr: any) {
    logNetworkCall(method, safeUrl, 0, Date.now() - t0, {
      network_exception: netErr?.message || String(netErr),
      error_code: netErr?.code || netErr?.cause?.code,
    });
    throw netErr;
  }
};

export function createAnonSupabaseClient(accessToken?: string): SupabaseClient {
  const check = validateStartupConfig();
  if (!check.valid) {
    throw new Error(`Startup config invalid: ${check.reason}`);
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      transport: DesktopRealtimeWebSocket as any,
    },
    global: {
      fetch: instrumentedSupabaseFetch,
      ...(accessToken
        ? {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        : {}),
    },
  });
}

export function mapSupabaseAuthError(err: any): {
  code: NonNullable<AuthActionResult['code']>;
  field: NonNullable<AuthActionResult['field']>;
  message: string;
} {
  if (err instanceof SessionSaveError || err?.kind === 'SESSION_SAVE_FAILED') {
    return {
      code: 'SESSION_SAVE_FAILED',
      field: 'general',
      message:
        'Your session could not be saved on this computer. Please check your local storage permissions and try again.',
    };
  }

  if (err instanceof ProfileLoadError || err?.kind === 'PROFILE_LOAD_FAILED') {
    return {
      code: 'PROFILE_LOAD_FAILED',
      field: 'general',
      message:
        'Signed in, but your profile could not be loaded. Please try again in a moment.',
    };
  }

  const raw = String(err?.message || err?.msg || err || '').toLowerCase();
  const errCode = String(err?.code || err?.error_code || err?.cause?.code || '').toLowerCase();
  const status = Number(err?.status || err?.statusCode || 0);

  if (raw.includes('startup config invalid')) {
    return {
      code: 'CONFIG_INVALID',
      field: 'general',
      error_detail: raw,
      message: "The app couldn't start properly. Please reinstall or contact support.",
    } as any;
  }

  if (
    raw.includes('fetch failed') ||
    raw.includes('network') ||
    raw.includes('enotfound') ||
    raw.includes('econnrefused') ||
    raw.includes('etimedout') ||
    raw.includes('enetunreach') ||
    raw.includes('eai_again') ||
    raw.includes('socket hang up') ||
    raw.includes('offline') ||
    errCode === 'enotfound' ||
    errCode === 'econnrefused' ||
    errCode === 'etimedout' ||
    errCode === 'enetunreach'
  ) {
    return {
      code: 'OFFLINE',
      field: 'general',
      message: 'No internet connection. Please check your network and try again.',
    };
  }

  if (
    status === 429 ||
    errCode.includes('rate_limit') ||
    errCode === 'over_request_rate_limit' ||
    errCode === 'over_email_send_rate_limit' ||
    raw.includes('too many') ||
    raw.includes('rate limit') ||
    raw.includes('over_email_send_rate_limit') ||
    raw.includes('security purposes, you can only request this')
  ) {
    return {
      code: 'RATE_LIMITED',
      field: 'general',
      message: 'Too many attempts. Please wait a moment and try again.',
    };
  }

  if (
    errCode === 'email_not_confirmed' ||
    raw.includes('email not confirmed')
  ) {
    return {
      code: 'EMAIL_NOT_CONFIRMED',
      field: 'email',
      message:
        'Please confirm your email before logging in. Check your inbox for the confirmation link.',
    };
  }

  if (
    errCode === 'invalid_credentials' ||
    errCode === 'invalid_grant' ||
    raw.includes('invalid login credentials') ||
    raw.includes('invalid email or password') ||
    raw.includes('invalid_grant')
  ) {
    return {
      code: 'INVALID_CREDENTIALS',
      field: 'password',
      message: 'Wrong email or password.',
    };
  }

  if (
    errCode === 'user_already_exists' ||
    errCode === 'email_exists' ||
    raw.includes('already registered') ||
    raw.includes('already exists')
  ) {
    return {
      code: 'ALREADY_EXISTS',
      field: 'email',
      message: 'An account with this email already exists.',
    };
  }

  if (
    errCode === 'weak_password' ||
    raw.includes('password should be at least')
  ) {
    return {
      code: 'VALIDATION_ERROR',
      field: 'password',
      message: 'Password must be at least 8 characters long.',
    };
  }

  if (
    errCode === 'validation_failed' ||
    raw.includes('unable to validate email address') ||
    raw.includes('invalid email')
  ) {
    return {
      code: 'VALIDATION_ERROR',
      field: 'email',
      message: 'Please enter a valid email address.',
    };
  }

  if (
    status >= 500 ||
    errCode === 'unexpected_failure' ||
    raw.includes('service unavailable') ||
    raw.includes('bad gateway') ||
    raw.includes('gateway timeout') ||
    raw.includes('database error') ||
    raw.includes('websocket')
  ) {
    return {
      code: 'SERVICE_UNAVAILABLE',
      field: 'general',
      message:
        'The sign-in service is temporarily unavailable. Please try again in a few minutes.',
    };
  }

  return {
    code: 'SERVICE_UNAVAILABLE',
    field: 'general',
    message:
      'The sign-in service is temporarily unavailable. Please try again in a few minutes.',
  };
}

export async function fetchUserAndProfilesUnderRLS(
  accessToken: string,
  userObj: { id: string; email?: string; email_confirmed_at?: string | null }
): Promise<{ user: UserAccountSummary; profiles: any[] }> {
  const supabase = createAnonSupabaseClient(accessToken);

  let accountRes;
  let searchProfilesRes;
  try {
    [accountRes, searchProfilesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'onboarding_completed, account_status, email_verified, search_balance, cv_generation_balance, persistent_finder_balance, plan, has_searched'
        )
        .eq('id', userObj.id)
        .maybeSingle(),
      supabase
        .from('search_profiles')
        .select(
          'id, user_id, name, job_titles, location, industry, industry_step_1, industry_step_2, location_scope, cv_variations'
        )
        .eq('user_id', userObj.id)
        .order('created_at'),
    ]);
  } catch (err: any) {
    logAuthFlow('profile_load_network_exception', 'error', {
      raw_error: err?.message || String(err),
    });
    throw new ProfileLoadError(
      err?.message || 'Failed to load profile from database'
    );
  }

  if (accountRes.error) {
    logAuthFlow('account_profile_query_error', 'error', {
      db_code: accountRes.error.code,
      raw_error: accountRes.error.message,
      details: accountRes.error.details,
    });
    throw new ProfileLoadError(
      accountRes.error.message,
      accountRes.error.code
    );
  }

  if (searchProfilesRes.error) {
    logAuthFlow('search_profiles_query_error', 'error', {
      db_code: searchProfilesRes.error.code,
      raw_error: searchProfilesRes.error.message,
      details: searchProfilesRes.error.details,
    });
    throw new ProfileLoadError(
      searchProfilesRes.error.message,
      searchProfilesRes.error.code
    );
  }

  const acc = accountRes.data;
  const userSummary: UserAccountSummary = {
    id: userObj.id,
    email: userObj.email || '',
    emailConfirmed: !!userObj.email_confirmed_at,
    emailVerified: acc?.email_verified ?? true,
    accountStatus: acc?.account_status || 'active',
    onboardingCompleted: acc?.onboarding_completed ?? true,
    plan: acc?.plan || 'free',
    balances: {
      search: acc?.search_balance ?? 0,
      cv: acc?.cv_generation_balance ?? 0,
      pf: acc?.persistent_finder_balance ?? 0,
      has_searched: acc?.has_searched ?? false,
    },
  };

  // Extra safety filter: ensure every returned profile belongs strictly to userObj.id
  const safeProfiles = (searchProfilesRes.data ?? []).filter(
    (p: any) => p.user_id === userObj.id
  );

  return {
    user: userSummary,
    profiles: safeProfiles,
  };
}

export async function loginUser(
  params: { email: string; password: string; keepSignedIn?: boolean },
  customBaseDir?: string
): Promise<AuthActionResult> {
  const email = (params.email || '').trim();
  const password = params.password || '';
  const keepSignedIn = params.keepSignedIn !== false;

  if (!email) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'email',
      error: 'Please enter your email address.',
    };
  }
  if (!password) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'password',
      error: 'Please enter your password.',
    };
  }

  const configCheck = validateStartupConfig();
  if (!configCheck.valid) {
    logAuthFlow('login_config_invalid', 'error', { reason: configCheck.reason });
    return {
      ok: false,
      code: 'CONFIG_INVALID',
      field: 'general',
      error: "The app couldn't start properly. Please reinstall or contact support.",
    };
  }

  const t0 = Date.now();
  logAuthFlow('login_start', 'pending', {
    email_len: email.length,
    password_len: password.length,
    keep_signed_in: keepSignedIn,
  });

  try {
    const supabase = createAnonSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    logNetworkCall(
      'POST',
      `${SUPABASE_URL}/auth/v1/token`,
      error ? error.status || 400 : 200,
      Date.now() - t0,
      { action: 'signInWithPassword' }
    );

    if (error) {
      const mapped = mapSupabaseAuthError(error);
      logAuthFlow('login_failed', 'error', {
        code: mapped.code,
        http_status: (error as any).status || 400,
        auth_error_code: (error as any).code || 'unknown',
        raw_error: error.message,
      });
      return {
        ok: false,
        code: mapped.code,
        field: mapped.field,
        error: mapped.message,
        ...(mapped.code === 'EMAIL_NOT_CONFIRMED'
          ? { requiresEmailConfirmation: true, unconfirmedEmail: email }
          : {}),
      };
    }

    if (data?.user && !data?.session) {
      logAuthFlow('login_unconfirmed_email', 'warn');
      return {
        ok: false,
        code: 'EMAIL_NOT_CONFIRMED',
        field: 'email',
        requiresEmailConfirmation: true,
        unconfirmedEmail: email,
        error:
          'Please confirm your email before logging in. Check your inbox for the confirmation link.',
      };
    }

    if (!data?.session || !data?.user) {
      logAuthFlow('login_no_session', 'error');
      return {
        ok: false,
        code: 'SERVICE_UNAVAILABLE',
        field: 'general',
        error: 'Sign in succeeded but no session was returned. Please try again.',
      };
    }

    const record: PersistedSessionRecord = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      keep_signed_in: keepSignedIn,
      user: {
        id: data.user.id,
        email: data.user.email,
        email_confirmed_at: data.user.email_confirmed_at,
        user_metadata: data.user.user_metadata,
      },
    };

    logAuthFlow('login_saving_session', 'pending', {
      user_id: data.user.id,
      keep_signed_in: keepSignedIn,
    });
    await saveSessionToKeyring(record, customBaseDir);
    startSilentRefreshLoop(customBaseDir);

    logAuthFlow('login_loading_profiles', 'pending', {
      user_id: data.user.id,
    });
    const { user, profiles } = await fetchUserAndProfilesUnderRLS(
      record.access_token,
      record.user
    );

    logAuthFlow('login_success', 'ok', {
      user_id: user.id,
      profiles_count: profiles.length,
    });

    return {
      ok: true,
      user,
      profiles,
    };
  } catch (err: any) {
    const mapped = mapSupabaseAuthError(err);
    logAuthFlow('login_exception', 'error', {
      code: mapped.code,
      http_status: err?.status || 0,
      auth_error_code: err?.code || err?.kind || 'exception',
      raw_error: err?.message || String(err),
    });
    return {
      ok: false,
      code: mapped.code,
      field: mapped.field,
      error: mapped.message,
    };
  }
}

export async function signUpUser(
  params: {
    name: string;
    surname: string;
    email: string;
    password: string;
    agreeTos: boolean;
    agreePrivacy: boolean;
    agreeAge: boolean;
  },
  customBaseDir?: string
): Promise<AuthActionResult> {
  const name = (params.name || '').trim();
  const surname = (params.surname || '').trim();
  const email = (params.email || '').trim();
  const password = params.password || '';

  if (!name) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'name',
      error: 'Please enter your name.',
    };
  }
  if (!surname) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'surname',
      error: 'Please enter your surname.',
    };
  }
  if (!email) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'email',
      error: 'Please enter your email address.',
    };
  }
  if (!password || password.length < 8) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'password',
      error: 'Password must be at least 8 characters long.',
    };
  }
  if (!params.agreeTos) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'terms',
      error: 'You must agree to the Terms of Service.',
    };
  }
  if (!params.agreePrivacy) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'terms',
      error: 'You must agree to the Privacy Policy.',
    };
  }
  if (!params.agreeAge) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'terms',
      error: 'You must confirm you are 18 or older.',
    };
  }

  logAuthFlow('signup_start', 'pending', {
    name_len: name.length,
    surname_len: surname.length,
    email_len: email.length,
    password_len: password.length,
  });

  // 1. Pre-signup check on FMSG website (/api/auth/check-signup)
  try {
    const tCheck = Date.now();
    const checkRes = await fetch(`${WEB_BASE_URL}/api/auth/check-signup`, {
      method: 'POST',
    });
    logNetworkCall(
      'POST',
      `${WEB_BASE_URL}/api/auth/check-signup`,
      checkRes.status,
      Date.now() - tCheck
    );
    const checkData = await checkRes.json();
    if (checkData && checkData.allowed === false) {
      return {
        ok: false,
        code: 'SIGNUP_BLOCKED',
        field: 'general',
        error:
          checkData.reason || 'Sign up is currently unavailable. Please try again later.',
      };
    }
  } catch (err: any) {
    const mapped = mapSupabaseAuthError(err);
    if (mapped.code === 'OFFLINE') {
      return {
        ok: false,
        code: 'OFFLINE',
        field: 'general',
        error: mapped.message,
      };
    }
  }

  try {
    const supabase = createAnonSupabaseClient();
    const fullName = [name, surname].filter(Boolean).join(' ');
    const tSignUp = Date.now();

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: fullName ? { full_name: fullName } : undefined,
      },
    });

    logNetworkCall(
      'POST',
      `${SUPABASE_URL}/auth/v1/signup`,
      signUpErr ? signUpErr.status || 400 : 200,
      Date.now() - tSignUp
    );

    if (signUpErr) {
      const mapped = mapSupabaseAuthError(signUpErr);
      logAuthFlow('signup_failed', 'error', {
        code: mapped.code,
        http_status: (signUpErr as any).status || 400,
        auth_error_code: (signUpErr as any).code || 'unknown',
        raw_error: signUpErr.message,
      });
      return {
        ok: false,
        code: mapped.code,
        field: mapped.field,
        error: mapped.message,
      };
    }

    if (
      data?.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      logAuthFlow('signup_duplicate_email', 'warn', {
        code: 'ALREADY_EXISTS',
      });
      return {
        ok: false,
        code: 'ALREADY_EXISTS',
        field: 'email',
        error: 'An account with this email already exists.',
      };
    }

    let activeSession: Session | null = data.session;
    let activeUser = data.user;

    if (!activeSession && data.user) {
      const { data: signInData, error: signInErr } =
        await supabase.auth.signInWithPassword({ email, password });
      if (!signInErr && signInData?.session) {
        activeSession = signInData.session;
        activeUser = signInData.user;
      }
    }

    if (activeSession && activeUser) {
      // Mirror website post-signup hooks
      fetch(`${WEB_BASE_URL}/api/auth/record-signup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      }).catch(() => {});

      fetch(`${WEB_BASE_URL}/api/auth/send-verification`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      }).catch(() => {});

      const record: PersistedSessionRecord = {
        access_token: activeSession.access_token,
        refresh_token: activeSession.refresh_token,
        expires_at: activeSession.expires_at,
        keep_signed_in: true,
        user: {
          id: activeUser.id,
          email: activeUser.email,
          email_confirmed_at: activeUser.email_confirmed_at,
          user_metadata: activeUser.user_metadata,
        },
      };

      await saveSessionToKeyring(record, customBaseDir);
      startSilentRefreshLoop(customBaseDir);

      const { user, profiles } = await fetchUserAndProfilesUnderRLS(
        record.access_token,
        record.user
      );

      logAuthFlow('signup_success_session', 'ok', { user_id: user.id });
      return {
        ok: true,
        user,
        profiles,
      };
    }

    // Email confirmation required before session is issued
    logAuthFlow('signup_requires_confirmation', 'ok');
    return {
      ok: true,
      requiresEmailConfirmation: true,
      unconfirmedEmail: email,
    };
  } catch (err: any) {
    const mapped = mapSupabaseAuthError(err);
    logAuthFlow('signup_exception', 'error', { raw_error: err.message });
    return {
      ok: false,
      code: mapped.code,
      field: mapped.field,
      error: mapped.message,
    };
  }
}

export async function sendPasswordResetEmail(
  emailInput: string
): Promise<AuthActionResult> {
  const email = (emailInput || '').trim();
  if (!email) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'email',
      error: 'Please enter your email address.',
    };
  }

  try {
    const t0 = Date.now();
    const supabase = createAnonSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${WEB_BASE_URL}/auth/update-password`,
    });
    logNetworkCall(
      'POST',
      `${SUPABASE_URL}/auth/v1/recover`,
      error ? error.status || 400 : 200,
      Date.now() - t0
    );

    if (error) {
      const mapped = mapSupabaseAuthError(error);
      return {
        ok: false,
        code: mapped.code,
        field: mapped.field,
        error: mapped.message,
      };
    }

    logAuthFlow('password_reset_sent', 'ok', { email_len: email.length });
    return { ok: true };
  } catch (err: any) {
    const mapped = mapSupabaseAuthError(err);
    return {
      ok: false,
      code: mapped.code,
      field: mapped.field,
      error: mapped.message,
    };
  }
}

export async function resendSignupConfirmationEmail(
  emailInput: string
): Promise<AuthActionResult> {
  const email = (emailInput || '').trim();
  if (!email) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'email',
      error: 'Please enter your email address.',
    };
  }

  try {
    const supabase = createAnonSupabaseClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    if (error) {
      const mapped = mapSupabaseAuthError(error);
      return {
        ok: false,
        code: mapped.code,
        field: mapped.field,
        error: mapped.message,
      };
    }
    logAuthFlow('resend_confirmation_sent', 'ok');
    return { ok: true };
  } catch (err: any) {
    const mapped = mapSupabaseAuthError(err);
    return {
      ok: false,
      code: mapped.code,
      field: mapped.field,
      error: mapped.message,
    };
  }
}

export async function sendEmailVerificationCode(
  customBaseDir?: string
): Promise<AuthActionResult> {
  const session = await readSessionFromKeyring(customBaseDir);
  if (!session?.access_token) {
    return {
      ok: false,
      field: 'general',
      error: 'Your session has expired. Please sign in again.',
    };
  }

  try {
    const t0 = Date.now();
    const res = await fetch(`${WEB_BASE_URL}/api/auth/send-verification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    logNetworkCall(
      'POST',
      `${WEB_BASE_URL}/api/auth/send-verification`,
      res.status,
      Date.now() - t0
    );
    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        field: 'code',
        error: data.error || 'Could not send verification code. Please try again.',
      };
    }
    return { ok: true };
  } catch (err: any) {
    const mapped = mapSupabaseAuthError(err);
    return { ok: false, field: 'code', error: mapped.message };
  }
}

export async function verifySixDigitEmailCode(
  code: string,
  customBaseDir?: string
): Promise<AuthActionResult> {
  const cleanCode = (code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      field: 'code',
      error: 'Please enter the 6-digit code sent to your email.',
    };
  }

  const session = await readSessionFromKeyring(customBaseDir);
  if (!session?.access_token) {
    return {
      ok: false,
      field: 'code',
      error: 'Your session has expired. Please sign in again.',
    };
  }

  try {
    const t0 = Date.now();
    const res = await fetch(`${WEB_BASE_URL}/api/auth/verify-code`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: cleanCode }),
    });
    logNetworkCall(
      'POST',
      `${WEB_BASE_URL}/api/auth/verify-code`,
      res.status,
      Date.now() - t0
    );
    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        field: 'code',
        error: data.error || 'Invalid verification code. Please try again.',
      };
    }
    return { ok: true };
  } catch (err: any) {
    const mapped = mapSupabaseAuthError(err);
    return { ok: false, field: 'code', error: mapped.message };
  }
}

export async function restoreAndRefreshSession(
  customBaseDir?: string
): Promise<AuthActionResult> {
  const configCheck = validateStartupConfig();
  if (!configCheck.valid) {
    logAuthFlow('startup_config_invalid', 'error', { reason: configCheck.reason });
    return {
      ok: false,
      code: 'CONFIG_INVALID',
      error: "The app couldn't start properly. Please reinstall or contact support.",
    };
  }

  const stored = await readSessionFromKeyring(customBaseDir);
  if (!stored || !stored.access_token || !stored.refresh_token) {
    logAuthFlow('restore_session_none', 'ok');
    return { ok: false };
  }

  try {
    const t0 = Date.now();
    const supabase = createAnonSupabaseClient();
    const { data, error } = await supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });

    logNetworkCall(
      'POST',
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      error ? 401 : 200,
      Date.now() - t0,
      { action: 'setSession_refresh' }
    );

    if (error || !data?.session || !data?.user) {
      logAuthFlow('restore_session_expired_or_invalid', 'info');
      await deleteSessionFromKeyring(customBaseDir);
      return { ok: false };
    }

    const updated: PersistedSessionRecord = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      keep_signed_in: stored.keep_signed_in,
      user: {
        id: data.user.id,
        email: data.user.email,
        email_confirmed_at: data.user.email_confirmed_at,
        user_metadata: data.user.user_metadata,
      },
    };

    await saveSessionToKeyring(updated, customBaseDir);
    startSilentRefreshLoop(customBaseDir);

    const { user, profiles } = await fetchUserAndProfilesUnderRLS(
      updated.access_token,
      updated.user
    );

    logAuthFlow('restore_session_success', 'ok', {
      user_id: user.id,
      profiles_count: profiles.length,
    });

    return {
      ok: true,
      user,
      profiles,
    };
  } catch (err: any) {
    logAuthFlow('restore_session_offline_fallback', 'info', {
      error: err.message,
    });
    return { ok: false };
  }
}

export async function refreshActiveSessionNow(
  customBaseDir?: string
): Promise<{ refreshed: boolean; expiresAt?: number }> {
  const stored = await readSessionFromKeyring(customBaseDir);
  if (!stored?.refresh_token) return { refreshed: false };

  try {
    const supabase = createAnonSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: stored.refresh_token,
    });
    if (error || !data?.session || !data?.user) {
      return { refreshed: false };
    }

    const updated: PersistedSessionRecord = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      keep_signed_in: stored.keep_signed_in,
      user: {
        id: data.user.id,
        email: data.user.email,
        email_confirmed_at: data.user.email_confirmed_at,
        user_metadata: data.user.user_metadata,
      },
    };
    await saveSessionToKeyring(updated, customBaseDir);
    logAuthFlow('silent_token_refresh_ok', 'ok', {
      expires_at: updated.expires_at,
    });
    return { refreshed: true, expiresAt: updated.expires_at };
  } catch {
    return { refreshed: false };
  }
}

function startSilentRefreshLoop(customBaseDir?: string): void {
  if (refreshIntervalHandle) clearInterval(refreshIntervalHandle);
  refreshIntervalHandle = setInterval(() => {
    refreshActiveSessionNow(customBaseDir).catch(() => {});
  }, 10 * 60 * 1000); // Every 10 minutes
  if (typeof refreshIntervalHandle.unref === 'function') {
    refreshIntervalHandle.unref();
  }
}

export async function logoutUser(customBaseDir?: string): Promise<{ ok: boolean }> {
  if (refreshIntervalHandle) {
    clearInterval(refreshIntervalHandle);
    refreshIntervalHandle = null;
  }

  try {
    if (inMemorySession?.access_token) {
      const supabase = createAnonSupabaseClient(inMemorySession.access_token);
      await supabase.auth.signOut();
    }
  } catch {
    // ignore network error on signout
  }

  await deleteSessionFromKeyring(customBaseDir);
  logAuthFlow('logout_completed', 'ok');
  return { ok: true };
}

export function getActiveSessionAccessToken(): string | null {
  return inMemorySession?.access_token || null;
}

export function getActiveSessionUser(): PersistedSessionRecord['user'] | null {
  return inMemorySession?.user || null;
}
