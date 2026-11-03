/**
 * FMSG Agents — Local Domain-Locked Secret Vault
 *
 * Stores site sign-in secrets locally on the user's PC using Windows Credential
 * Manager (`keytar`) with a Windows DPAPI / AES-256-GCM fallback bound to the
 * local installation wrapping key.
 *
 * Security rules:
 * 1. The AI model and renderer only ever see the key name (e.g. `LINKEDIN_PASSWORD`).
 * 2. Secret values are NEVER returned over IPC to the renderer, NEVER sent to
 *    `/api/agent/ai` or Supabase, and NEVER written to diagnostic logs.
 * 3. `fillSecretOnVerifiedDomain()` checks the live Playwright `page.url()`
 *    hostname against the secret's `allowedDomain` before typing into
 *    `input[type="password"]`. A redirect or lookalike domain is rejected.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Page } from 'playwright';
import { logEvent } from './logger';

const KEYTAR_SERVICE = 'FMSG_Agents_SiteSecrets_v1';

export interface SiteSecretMeta {
  keyName: string; // e.g. LINKEDIN_PASSWORD
  siteLabel: string; // e.g. LinkedIn
  allowedDomain: string; // e.g. linkedin.com
  username: string; // login email or username for the site
  updatedAt: string;
}

interface StoredVaultFile {
  version: 1;
  items: Array<
    SiteSecretMeta & {
      fallbackCiphertextB64?: string;
      fallbackIvB64?: string;
      fallbackTagB64?: string;
    }
  >;
}

export const SUPPORTED_JOB_SITES: Array<{
  id: string;
  siteLabel: string;
  allowedDomain: string;
  defaultKeyName: string;
}> = [
  {
    id: 'linkedin',
    siteLabel: 'LinkedIn',
    allowedDomain: 'linkedin.com',
    defaultKeyName: 'LINKEDIN_PASSWORD',
  },
  {
    id: 'indeed',
    siteLabel: 'Indeed',
    allowedDomain: 'indeed.com',
    defaultKeyName: 'INDEED_PASSWORD',
  },
  {
    id: 'pnet',
    siteLabel: 'PNet',
    allowedDomain: 'pnet.co.za',
    defaultKeyName: 'PNET_PASSWORD',
  },
  {
    id: 'careerjunction',
    siteLabel: 'CareerJunction',
    allowedDomain: 'careerjunction.co.za',
    defaultKeyName: 'CAREERJUNCTION_PASSWORD',
  },
  {
    id: 'glassdoor',
    siteLabel: 'Glassdoor',
    allowedDomain: 'glassdoor.com',
    defaultKeyName: 'GLASSDOOR_PASSWORD',
  },
  {
    id: 'careers24',
    siteLabel: 'Careers24',
    allowedDomain: 'careers24.com',
    defaultKeyName: 'CAREERS24_PASSWORD',
  },
];

function getVaultFilePath(): string {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const dir = path.join(localAppData, 'fmsg-agents', 'security');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'site-secrets-meta.json');
}

function getLocalWrappingSecret(): Buffer {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const dir = path.join(localAppData, 'fmsg-agents', 'security');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const keyFile = path.join(dir, 'vault-wrap.key');
  if (fs.existsSync(keyFile)) {
    try {
      const raw = fs.readFileSync(keyFile, 'utf8').trim();
      const buf = Buffer.from(raw, 'base64');
      if (buf.length === 32) return buf;
    } catch {
      // regenerate below
    }
  }
  const fresh = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, fresh.toString('base64'), { mode: 0o600 });
  return fresh;
}

function loadKeytar(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('keytar');
  } catch {
    return null;
  }
}

function readVaultFile(): StoredVaultFile {
  const filePath = getVaultFilePath();
  if (!fs.existsSync(filePath)) {
    return { version: 1, items: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed && Array.isArray(parsed.items)) {
      return parsed as StoredVaultFile;
    }
  } catch {
    // ignore corrupted file
  }
  return { version: 1, items: [] };
}

function writeVaultFile(vault: StoredVaultFile): void {
  const filePath = getVaultFilePath();
  fs.writeFileSync(filePath, JSON.stringify(vault, null, 2), { mode: 0o600 });
}

export function normalizeSecretKeyName(siteOrName: string): string {
  const cleaned = siteOrName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return 'SITE_PASSWORD';
  return cleaned.endsWith('_PASSWORD') ? cleaned : `${cleaned}_PASSWORD`;
}

export function normalizeAllowedDomain(domainOrUrl: string): string {
  const raw = domainOrUrl.trim().toLowerCase();
  if (!raw) return '';
  try {
    const withProto = raw.includes('://') ? raw : `https://${raw}`;
    const u = new URL(withProto);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^www\./, '').split('/')[0];
  }
}

export function hostMatchesAllowedDomain(
  currentUrl: string,
  allowedDomain: string
): boolean {
  const cleanAllowed = normalizeAllowedDomain(allowedDomain);
  if (!cleanAllowed) return false;
  try {
    const u = new URL(currentUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host === cleanAllowed || host.endsWith(`.${cleanAllowed}`);
  } catch {
    return false;
  }
}

export async function listSiteSecretsMeta(): Promise<SiteSecretMeta[]> {
  const vault = readVaultFile();
  return vault.items.map((item) => ({
    keyName: item.keyName,
    siteLabel: item.siteLabel,
    allowedDomain: item.allowedDomain,
    username: item.username,
    updatedAt: item.updatedAt,
  }));
}

export async function saveSiteSecret(input: {
  siteLabel: string;
  allowedDomain: string;
  username: string;
  password: string;
  keyName?: string;
}): Promise<{ ok: boolean; meta?: SiteSecretMeta; error?: string }> {
  const allowedDomain = normalizeAllowedDomain(input.allowedDomain);
  const siteLabel = (input.siteLabel || allowedDomain).trim();
  const username = (input.username || '').trim();
  const password = input.password || '';

  if (!allowedDomain) {
    return { ok: false, error: 'Please provide a valid site domain.' };
  }
  if (!username) {
    return { ok: false, error: 'Please enter your login email or username.' };
  }
  if (!password) {
    return { ok: false, error: 'Please enter the password to store.' };
  }

  const keyName = normalizeSecretKeyName(
    input.keyName || siteLabel.split('.')[0] || allowedDomain.split('.')[0]
  );

  const keytar = loadKeytar();
  let storedInKeytar = false;
  if (keytar && typeof keytar.setPassword === 'function') {
    try {
      await keytar.setPassword(KEYTAR_SERVICE, keyName, password);
      storedInKeytar = true;
    } catch {
      storedInKeytar = false;
    }
  }

  const wrapKey = getLocalWrappingSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', wrapKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(password, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const meta: SiteSecretMeta = {
    keyName,
    siteLabel,
    allowedDomain,
    username,
    updatedAt: new Date().toISOString(),
  };

  const vault = readVaultFile();
  const nextItems = vault.items.filter((i) => i.keyName !== keyName);
  nextItems.push({
    ...meta,
    fallbackCiphertextB64: storedInKeytar
      ? undefined
      : encrypted.toString('base64'),
    fallbackIvB64: storedInKeytar ? undefined : iv.toString('base64'),
    fallbackTagB64: storedInKeytar ? undefined : tag.toString('base64'),
  });
  vault.items = nextItems;
  writeVaultFile(vault);

  logEvent('secret_vault', 'secret_saved', {
    key_name: keyName,
    allowed_domain: allowedDomain,
    storage: storedInKeytar ? 'os_credential_manager' : 'local_aes_gcm',
  });

  return { ok: true, meta };
}

export async function deleteSiteSecret(
  keyName: string
): Promise<{ ok: boolean }> {
  const cleanKey = normalizeSecretKeyName(keyName);
  const keytar = loadKeytar();
  if (keytar && typeof keytar.deletePassword === 'function') {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, cleanKey);
    } catch {
      // ignore
    }
  }
  const vault = readVaultFile();
  vault.items = vault.items.filter((i) => i.keyName !== cleanKey);
  writeVaultFile(vault);
  logEvent('secret_vault', 'secret_deleted', { key_name: cleanKey });
  return { ok: true };
}

async function resolveSecretValueInternal(keyName: string): Promise<{
  meta: SiteSecretMeta;
  secretValue: string;
} | null> {
  const cleanKey = normalizeSecretKeyName(keyName);
  const vault = readVaultFile();
  const entry = vault.items.find((i) => i.keyName === cleanKey);
  if (!entry) return null;

  const keytar = loadKeytar();
  if (keytar && typeof keytar.getPassword === 'function') {
    try {
      const fromKeytar = await keytar.getPassword(KEYTAR_SERVICE, cleanKey);
      if (fromKeytar) {
        return {
          meta: {
            keyName: entry.keyName,
            siteLabel: entry.siteLabel,
            allowedDomain: entry.allowedDomain,
            username: entry.username,
            updatedAt: entry.updatedAt,
          },
          secretValue: fromKeytar,
        };
      }
    } catch {
      // fall through to local encrypted fallback
    }
  }

  if (
    entry.fallbackCiphertextB64 &&
    entry.fallbackIvB64 &&
    entry.fallbackTagB64
  ) {
    try {
      const wrapKey = getLocalWrappingSecret();
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        wrapKey,
        Buffer.from(entry.fallbackIvB64, 'base64')
      );
      decipher.setAuthTag(Buffer.from(entry.fallbackTagB64, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(entry.fallbackCiphertextB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      return {
        meta: {
          keyName: entry.keyName,
          siteLabel: entry.siteLabel,
          allowedDomain: entry.allowedDomain,
          username: entry.username,
          updatedAt: entry.updatedAt,
        },
        secretValue: decrypted,
      };
    } catch {
      return null;
    }
  }

  return null;
}

export async function findMatchingSecretForUrl(
  url: string
): Promise<SiteSecretMeta | null> {
  const list = await listSiteSecretsMeta();
  for (const item of list) {
    if (hostMatchesAllowedDomain(url, item.allowedDomain)) {
      return item;
    }
  }
  return null;
}

/**
 * `fill_secret(keyName)` implementation:
 * Verifies the live Playwright page domain matches `allowedDomain`, fills
 * the username/email (if empty) and password input directly on the page,
 * and never exposes the password string to the caller or logs.
 */
export async function fillSecretOnVerifiedDomain(
  page: Page,
  keyName: string
): Promise<{
  ok: boolean;
  filledUsername: boolean;
  filledPassword: boolean;
  submitted: boolean;
  reason?: string;
}> {
  const resolved = await resolveSecretValueInternal(keyName);
  if (!resolved) {
    return {
      ok: false,
      filledUsername: false,
      filledPassword: false,
      submitted: false,
      reason: `No saved login found for ${keyName}.`,
    };
  }

  const currentUrl = page.url();
  if (!hostMatchesAllowedDomain(currentUrl, resolved.meta.allowedDomain)) {
    logEvent(
      'secret_vault',
      'domain_mismatch_blocked',
      {
        key_name: resolved.meta.keyName,
        allowed_domain: resolved.meta.allowedDomain,
      },
      'warn'
    );
    return {
      ok: false,
      filledUsername: false,
      filledPassword: false,
      submitted: false,
      reason: `Refused to fill ${resolved.meta.keyName}: current page is not on ${resolved.meta.allowedDomain}.`,
    };
  }

  let filledUsername = false;
  let filledPassword = false;
  let submitted = false;

  try {
    const pwLocator = page.locator('input[type="password"]:visible').first();
    if ((await pwLocator.count()) === 0) {
      return {
        ok: false,
        filledUsername: false,
        filledPassword: false,
        submitted: false,
        reason: 'No visible password field on this page.',
      };
    }

    // Fill username/email if there is a visible email/username input
    const userLocator = page
      .locator(
        'input[type="email"]:visible, input[name*="user" i]:visible, input[name*="email" i]:visible, input[name*="login" i]:visible, input[autocomplete="username"]:visible'
      )
      .first();
    if ((await userLocator.count()) > 0 && resolved.meta.username) {
      try {
        await userLocator.fill(resolved.meta.username, { timeout: 3000 });
        filledUsername = true;
      } catch {
        // ignore if already pre-filled
      }
    }

    await pwLocator.fill(resolved.secretValue, { timeout: 3500 });
    filledPassword = true;

    // Mask password field visually before any screenshot is taken
    await page
      .evaluate(() => {
        const inputs = document.querySelectorAll('input[type="password"]');
        inputs.forEach((el) => {
          (el as HTMLElement).style.filter = 'blur(6px)';
        });
      })
      .catch(() => {});

    // Attempt to click the sign-in submit button if present
    const submitBtn = page
      .locator(
        'button[type="submit"]:visible, input[type="submit"]:visible, button:has-text("Sign in"):visible, button:has-text("Log in"):visible'
      )
      .first();
    if ((await submitBtn.count()) > 0) {
      await submitBtn.click({ timeout: 3500 }).catch(() => {});
      submitted = true;
      await page.waitForTimeout(1800).catch(() => {});
    }

    logEvent('secret_vault', 'fill_secret_succeeded', {
      key_name: resolved.meta.keyName,
      allowed_domain: resolved.meta.allowedDomain,
      filled_username: filledUsername,
      filled_password: filledPassword,
      submitted,
    });

    return {
      ok: true,
      filledUsername,
      filledPassword,
      submitted,
    };
  } catch (err: any) {
    return {
      ok: false,
      filledUsername,
      filledPassword,
      submitted,
      reason: err?.message || 'Could not autofill sign-in form.',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Answer Bank & Screening Rules + Persistent Agent Preferences (Cost Cap = R0)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnswerBankEntry {
  id: string;
  question: string;
  answer: string;
  category: 'Personal' | 'Experience' | 'Preferences';
  askEachTime: boolean;
}

export interface ScreeningRulesConfig {
  minSalaryZar: number;
  locations: string[];
  mustHaveKeywords: string[];
  excludedCompanies: string[];
  answers: AnswerBankEntry[];
}

export interface AgentUserPrefs {
  costCap: number; // Strictly defaults to R0 until user consents
  billingMode: 'bundle' | 'pay-as-you-go';
  bundleTier: 'Starter' | 'Lite' | 'Standard' | 'Power';
  autonomyMode: 'full-auto' | 'approve-each' | 'aggressive';
  onboardingCompleted: boolean;
  successfulPaymentsCount: number;
}

const DEFAULT_RULES: ScreeningRulesConfig = {
  minSalaryZar: 0,
  locations: ['Johannesburg', 'Cape Town', 'Remote'],
  mustHaveKeywords: [],
  excludedCompanies: [],
  answers: [
    {
      id: 'ans_notice',
      question: 'What is your notice period?',
      answer: '30 days / 1 calendar month',
      category: 'Preferences',
      askEachTime: false,
    },
    {
      id: 'ans_work_auth',
      question: 'Are you legally authorized to work in South Africa?',
      answer: 'Yes',
      category: 'Personal',
      askEachTime: false,
    },
    {
      id: 'ans_relocate',
      question: 'Are you willing to relocate or work hybrid?',
      answer: 'Yes',
      category: 'Preferences',
      askEachTime: false,
    },
  ],
};

const DEFAULT_PREFS: AgentUserPrefs = {
  costCap: 0,
  billingMode: 'pay-as-you-go',
  bundleTier: 'Starter',
  autonomyMode: 'approve-each',
  onboardingCompleted: false,
  successfulPaymentsCount: 0,
};

function getRulesFilePath(): string {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const dir = path.join(localAppData, 'fmsg-agents', 'user-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'rules-answer-bank.json');
}

function getPrefsFilePath(): string {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const dir = path.join(localAppData, 'fmsg-agents', 'user-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'agent-billing-prefs.json');
}

export function loadScreeningRules(): ScreeningRulesConfig {
  const p = getRulesFilePath();
  if (!fs.existsSync(p)) return DEFAULT_RULES;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      minSalaryZar: Number(raw.minSalaryZar) || 0,
      locations: Array.isArray(raw.locations)
        ? raw.locations
        : DEFAULT_RULES.locations,
      mustHaveKeywords: Array.isArray(raw.mustHaveKeywords)
        ? raw.mustHaveKeywords
        : [],
      excludedCompanies: Array.isArray(raw.excludedCompanies)
        ? raw.excludedCompanies
        : [],
      answers: Array.isArray(raw.answers) ? raw.answers : DEFAULT_RULES.answers,
    };
  } catch {
    return DEFAULT_RULES;
  }
}

export function saveScreeningRules(
  next: Partial<ScreeningRulesConfig>
): ScreeningRulesConfig {
  const current = loadScreeningRules();
  const merged: ScreeningRulesConfig = {
    ...current,
    ...next,
  };
  fs.writeFileSync(getRulesFilePath(), JSON.stringify(merged, null, 2), {
    mode: 0o600,
  });
  return merged;
}

export function loadAgentPrefs(): AgentUserPrefs {
  const p = getPrefsFilePath();
  if (!fs.existsSync(p)) return DEFAULT_PREFS;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      costCap: typeof raw.costCap === 'number' ? Math.max(0, raw.costCap) : 0,
      billingMode:
        raw.billingMode === 'bundle' ? 'bundle' : 'pay-as-you-go',
      bundleTier: ['Starter', 'Lite', 'Standard', 'Power'].includes(
        raw.bundleTier
      )
        ? raw.bundleTier
        : 'Starter',
      autonomyMode: ['full-auto', 'approve-each', 'aggressive'].includes(
        raw.autonomyMode
      )
        ? raw.autonomyMode
        : 'approve-each',
      onboardingCompleted: Boolean(raw.onboardingCompleted),
      successfulPaymentsCount: Number(raw.successfulPaymentsCount) || 0,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveAgentPrefs(
  patch: Partial<AgentUserPrefs>
): AgentUserPrefs {
  const current = loadAgentPrefs();
  const merged: AgentUserPrefs = {
    ...current,
    ...patch,
  };
  fs.writeFileSync(getPrefsFilePath(), JSON.stringify(merged, null, 2), {
    mode: 0o600,
  });
  return merged;
}

