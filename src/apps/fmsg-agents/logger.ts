/**
 * FMSG Agents — Real-Time Diagnostic Logger
 *
 * Captures UI interactions, auth flow, network calls, main & renderer errors,
 * IPC messages, browser automation steps, file & keyring access, update checks,
 * uncaught exceptions, unhandled rejections, and console output.
 *
 * Strictly redacts secrets, tokens, keys, credentials, and personal/CV data
 * (logging field names and lengths only, never values).
 * Flushes synchronously on every write so crashes leave a complete log.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { APP_VERSION } from './config';

const LOCAL_DEV_FLAG_PATHS = [
  path.resolve(__dirname, '../.dev-diag-flag.json'),
  'C:\\Users\\mqhel\\FMSG\\src\\apps\\fmsg-agents\\.dev-diag-flag.json',
];

interface DevDiagConfig {
  enabled: boolean;
  projectLogsDir: string;
}

function detectDiagnosticMode(): DevDiagConfig {
  if (process.env.AGENT_DIAG_LOG === '0') {
    return {
      enabled: false,
      projectLogsDir: path.join(
        process.env.LOCALAPPDATA || os.tmpdir(),
        'fmsg-agents',
        'logs'
      ),
    };
  }

  for (const flagPath of LOCAL_DEV_FLAG_PATHS) {
    try {
      if (fs.existsSync(flagPath)) {
        const raw = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
        if (raw && raw.enabled) {
          return {
            enabled: true,
            projectLogsDir:
              raw.projectLogsDir ||
              path.join(path.dirname(flagPath), 'logs'),
          };
        }
      }
    } catch {
      // ignore
    }
  }

  if (
    process.env.AGENT_DIAG_LOG === '1' ||
    process.env.NODE_ENV === 'development'
  ) {
    return {
      enabled: true,
      projectLogsDir: path.resolve(__dirname, '../logs'),
    };
  }

  return {
    enabled: false,
    projectLogsDir: path.join(
      process.env.LOCALAPPDATA || os.tmpdir(),
      'fmsg-agents',
      'logs'
    ),
  };
}

const diagConfig = detectDiagnosticMode();
const LOG_DIR = diagConfig.projectLogsDir;
const FULL_DIAG_ENABLED = diagConfig.enabled;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB size cap per log file
const MAX_LOG_FILES = 15; // Keep last 15 session logs

function formatTimestampForFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

const sessionStartDate = new Date();
const sessionStartMs = Date.now();
let currentSessionFileName = `session_${formatTimestampForFilename(sessionStartDate)}.log`;
let currentSessionFilePath = path.join(LOG_DIR, currentSessionFileName);
const latestLogFilePath = path.join(LOG_DIR, 'latest.log');
let eventCount = 0;
let finalized = false;

const SECRET_KEY_REGEX =
  /password|passwd|pwd|token|access_token|refresh_token|api_key|apikey|secret|authorization|auth_header|cookie|credential|keyring|private_key|privatekey|cek|wrapped_key|session_raw|anon_key|service_role/i;

const PII_KEY_REGEX =
  /^(email|name|surname|full_name|first_name|last_name|phone|mobile|address|cv|cv_text|cv_content|cv_variations|resume|personal|salary|pay|payslip|national_id|id_number|ssn|tax|bio|work_experience|education|field_value|input_value)$/i;

export function scrubString(input: string): string {
  if (!input) return input;
  let out = input;
  // Redact PEM private keys
  out = out.replace(
    /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
    '<REDACTED_PRIVATE_KEY>'
  );
  // Redact JWTs
  out = out.replace(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    '<REDACTED_JWT>'
  );
  // Redact Bearer tokens
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer <REDACTED_TOKEN>');
  // Redact API keys (sk-..., sb_secret_..., sbp_...)
  out = out.replace(/\b(sk-[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]+|sbp_[A-Za-z0-9_-]+)\b/g, '<REDACTED_API_KEY>');
  // Redact email addresses in free text
  out = out.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    (match) => `<REDACTED_EMAIL:len=${match.length}>`
  );
  // Redact inline image payloads — live screencast frames are view-only and
  // must never be persisted to the log file.
  out = out.replace(
    /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi,
    '<REDACTED_IMAGE_DATA>'
  );
  return out;
}

export function sanitizeMetadata(obj: any, depth = 0): any {
  if (depth > 6) return '<MAX_DEPTH>';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return scrubString(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: scrubString(obj.message),
      stack: obj.stack ? scrubString(obj.stack.split('\n').slice(0, 6).join(' | ')) : undefined,
    };
  }
  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
  }
  if (typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const isLengthOrCountField = /(_len|_length|_count)$/i.test(k) && typeof v === 'number';
      const isImagePayloadKey = /^(dataUrl|data_url|frame|frameData|screencastFrame)$/i.test(k);
      if (!isLengthOrCountField && isImagePayloadKey && typeof v === 'string') {
        out[k] = `<REDACTED_IMAGE_DATA:len=${v.length}>`;
      } else if (!isLengthOrCountField && SECRET_KEY_REGEX.test(k)) {
        const len = v === null || v === undefined ? 0 : String(v).length;
        out[k] = `<REDACTED_SECRET:len=${len}>`;
      } else if (!isLengthOrCountField && PII_KEY_REGEX.test(k)) {
        const len =
          v === null || v === undefined
            ? 0
            : typeof v === 'string'
              ? v.length
              : JSON.stringify(v).length;
        out[`${k}_redacted`] = `<REDACTED_PII:len=${len}>`;
      } else {
        out[k] = sanitizeMetadata(v, depth + 1);
      }
    }
    return out;
  }
  return String(obj);
}

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function rotateLogsIfNeeded(): void {
  try {
    ensureLogDir();
    // Rotate current file if it exceeds size cap
    if (fs.existsSync(currentSessionFilePath)) {
      const st = fs.statSync(currentSessionFilePath);
      if (st.size >= MAX_FILE_BYTES) {
        currentSessionFileName = `session_${formatTimestampForFilename(new Date())}_part.log`;
        currentSessionFilePath = path.join(LOG_DIR, currentSessionFileName);
      }
    }

    // Prune oldest session_*.log files beyond MAX_LOG_FILES
    const files = fs
      .readdirSync(LOG_DIR)
      .filter((f) => f.startsWith('session_') && f.endsWith('.log'))
      .map((f) => {
        const p = path.join(LOG_DIR, f);
        return { name: f, path: p, mtime: fs.statSync(p).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > MAX_LOG_FILES) {
      for (const old of files.slice(MAX_LOG_FILES)) {
        try {
          fs.unlinkSync(old.path);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore rotation errors
  }
}

function writeRawEntry(entry: Record<string, any>): void {
  try {
    ensureLogDir();
    rotateLogsIfNeeded();
    const line = JSON.stringify(entry) + '\n';

    const fd = fs.openSync(currentSessionFilePath, 'a');
    try {
      fs.writeSync(fd, line, null, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // Also mirror to latest.log for immediate inspection
    const latestFd = fs.openSync(latestLogFilePath, eventCount === 1 ? 'w' : 'a');
    try {
      fs.writeSync(latestFd, line, null, 'utf8');
      fs.fsyncSync(latestFd);
    } finally {
      fs.closeSync(latestFd);
    }
  } catch {
    // Never crash the app due to logging
  }
}

export function logEvent(
  category: string,
  event: string,
  metadata?: Record<string, any>,
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  // On shipped customer machines without dev flag, only write error-level events
  if (!FULL_DIAG_ENABLED && level !== 'error') {
    return;
  }
  eventCount += 1;
  const entry = {
    seq: eventCount,
    timestamp: new Date().toISOString(),
    uptime_ms: Date.now() - sessionStartMs,
    pid: process.pid,
    version: APP_VERSION,
    level,
    category,
    event,
    data: sanitizeMetadata(metadata || {}),
  };
  writeRawEntry(entry);
}

export function logUIInteraction(action: string, target: string, meta?: Record<string, any>): void {
  logEvent('ui', action, { target, ...meta });
}

export function logAuthFlow(step: string, status: string, meta?: Record<string, any>): void {
  logEvent('auth', step, { status, ...meta }, status === 'error' ? 'error' : 'info');
}

export function logNetworkCall(
  method: string,
  url: string,
  status: number | string,
  durationMs: number,
  meta?: Record<string, any>
): void {
  let cleanUrl = url;
  try {
    const parsed = new URL(url);
    cleanUrl = `${parsed.origin}${parsed.pathname}`;
  } catch {
    cleanUrl = scrubString(url);
  }
  logEvent(
    'network',
    `${method.toUpperCase()} ${cleanUrl}`,
    {
      method: method.toUpperCase(),
      url: cleanUrl,
      status,
      duration_ms: durationMs,
      ...meta,
    },
    typeof status === 'number' && status >= 400 ? 'warn' : 'info'
  );
}

export function logIPC(channel: string, direction: 'invoke' | 'handle' | 'result' | 'error', meta?: Record<string, any>): void {
  logEvent('ipc', `${direction}:${channel}`, meta, direction === 'error' ? 'error' : 'info');
}

export function logBrowserAutomation(step: string, meta?: Record<string, any>): void {
  logEvent('browser', step, meta);
}

export function logKeyringAccess(operation: string, keyName: string, success: boolean, meta?: Record<string, any>): void {
  logEvent('keyring', operation, { key_name: keyName, success, ...meta }, success ? 'info' : 'warn');
}

export function logUpdateCheck(step: string, meta?: Record<string, any>, level: 'info' | 'warn' | 'error' = 'info'): void {
  logEvent('update', step, meta, level);
}

export function logException(type: 'uncaughtException' | 'unhandledRejection' | 'rendererError' | 'mainError', err: any, meta?: Record<string, any>): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logEvent('exception', type, { message, stack, ...meta }, 'error');
}

export function finalizeLog(reason = 'app_quit'): string {
  if (finalized) return currentSessionFilePath;
  finalized = true;
  const closeDate = new Date();
  const finalFileName = `session_${formatTimestampForFilename(sessionStartDate)}_to_${formatTimestampForFilename(closeDate)}.log`;
  const finalFilePath = path.join(LOG_DIR, finalFileName);

  logEvent('lifecycle', 'session_finalized', {
    reason,
    total_events: eventCount,
    total_uptime_ms: Date.now() - sessionStartMs,
    final_file: finalFileName,
  });

  try {
    if (fs.existsSync(currentSessionFilePath)) {
      fs.renameSync(currentSessionFilePath, finalFilePath);
      currentSessionFilePath = finalFilePath;
      currentSessionFileName = finalFileName;
    }
  } catch {
    // keep currentSessionFilePath if rename fails
  }
  return currentSessionFilePath;
}

export function getLogPaths(): { sessionLogPath: string; latestLogPath: string; logDir: string; enabled: boolean } {
  return {
    sessionLogPath: currentSessionFilePath,
    latestLogPath: latestLogFilePath,
    logDir: LOG_DIR,
    enabled: FULL_DIAG_ENABLED,
  };
}

export function installProcessDiagnosticHooks(): void {
  logEvent('lifecycle', 'logger_initialized', {
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
    electron_version: process.versions.electron || 'none',
    diag_enabled: FULL_DIAG_ENABLED,
    log_dir: LOG_DIR,
    session_file: currentSessionFileName,
  });

  process.on('uncaughtException', (err) => {
    logException('uncaughtException', err);
  });

  process.on('unhandledRejection', (reason) => {
    logException('unhandledRejection', reason);
  });
}
