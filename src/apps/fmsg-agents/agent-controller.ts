/**
 * FMSG Agents — Agent Controller (live, tool-using)
 *
 * One run does real work on the user's own machine:
 *
 * 1. Builds a search query from the selected FMSG profile.
 * 2. Discovers live postings through the FMSG job source (server-side SerpAPI).
 * 3. Asks the FMSG agent model (OpenRouter: Inkling free tier) which postings
 *    actually match the profile, and why.
 * 4. Opens each chosen posting in a visible Chrome window, screenshots it, reads
 *    the real page, and asks the model to classify it (posting / application
 *    form / sign-in wall / captcha).
 * 5. Fills application forms from verified profile data only, pauses for the
 *    user on sign-in walls, captchas and sensitive fields, then submits when the
 *    user has allowed auto-submit.
 * 6. Streams every step and every screenshot to the dashboard.
 *
 * The model is a helper, never a requirement: if it is unreachable the runner
 * falls back to deterministic rules so a run still searches, reads, fills and
 * reports.
 */

import { Browser, Page } from 'playwright';
import { WEB_BASE_URL } from './config';
import {
  createAnonSupabaseClient,
  getActiveSessionAccessToken,
  getActiveSessionUser,
} from './session-manager';
import { launchVisibleAutomationBrowser } from './browser-resolver';
import { logBrowserAutomation, logEvent } from './logger';
import {
  findMatchingSecretForUrl,
  fillSecretOnVerifiedDomain,
  loadScreeningRules,
  normalizeSecretKeyName,
} from './secret-vault';

export interface BillingConfig {
  mode: 'bundle' | 'pay-as-you-go';
  tier?: 'Starter' | 'Lite' | 'Standard' | 'Power';
  costCap?: number;
}

export interface BillingState {
  currentRate: number;
  currentThreshold: number;
  consecutiveSuccess: number;
  spentThisMonth: number;
  costCap: number;
}

export const AGENT_BUNDLE_PLANS = [
  {
    tier: 'Starter' as const,
    name: 'Starter Pack',
    applications: 10,
    priceZar: 349,
    perAppZar: 35,
    discountPct: 12,
    graceApps: 1,
  },
  {
    tier: 'Lite' as const,
    name: 'Lite',
    applications: 25,
    priceZar: 749,
    perAppZar: 30,
    discountPct: 25,
    graceApps: 2,
  },
  {
    tier: 'Standard' as const,
    name: 'Standard',
    applications: 60,
    priceZar: 1499,
    perAppZar: 25,
    discountPct: 38,
    graceApps: 6,
    popular: true,
  },
  {
    tier: 'Power' as const,
    name: 'Power',
    applications: 150,
    priceZar: 3299,
    perAppZar: 22,
    discountPct: 45,
    graceApps: 15,
  },
];

export const BILLING_TIERS = [
  { rate: 4000, threshold: 4000, label: 'stage-1-first-charge' },
  { rate: 4000, threshold: 10000, label: 'stage-2-after-1-payment' },
  { rate: 4000, threshold: 25000, label: 'stage-3-after-3-payments' },
  { rate: 4000, threshold: 50000, label: 'stage-4-max-after-6-payments' },
];

export interface AgentConfig {
  profileId: string;
  batchSize: number;
  autoAccept: boolean;
  mode: 'ask' | 'complete';
  billingConfig?: BillingConfig;
}

export interface AgentState {
  running: boolean;
  currentJobIndex: number;
  appliedCount: number;
  skippedCount: number;
  lastStep: string;
  checklistVisible: boolean;
  billing?: BillingState;
}

export interface JobResult {
  title: string;
  company: string;
  url: string;
  applied: boolean;
  skipped: boolean;
  reason?: string;
}

export type AgentPhase =
  | 'searching'
  | 'found'
  | 'reading'
  | 'tailoring'
  | 'applying'
  | 'confirming'
  | 'completed'
  | 'paused'
  | 'error';

export interface DiscoveredJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  postedAt?: string;
  salary?: string;
  description: string;
  matchScore?: number;
  reason?: string;
}

export interface DetectedField {
  index: number;
  tag: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
}

export type AgentEvent =
  | {
      type: 'phase';
      phase: AgentPhase;
      label: string;
      sublabel?: string;
      job?: DiscoveredJob;
      jobIndex?: number;
      totalJobs?: number;
    }
  | { type: 'screenshot'; dataUrl: string; caption: string; job?: DiscoveredJob }
  | {
      type: 'attention';
      id: string;
      kind: 'login' | 'captcha' | 'sensitive' | 'submit' | 'info';
      title: string;
      message: string;
      job?: DiscoveredJob;
      secretKeyName?: string;
      allowedDomain?: string;
      countdownSeconds?: number;
    }
  | { type: 'run-done'; applied: number; skipped: number; total: number };

export interface AgentRuntime {
  emit: (event: AgentEvent) => void;
  requestAttention: (
    event: Omit<Extract<AgentEvent, { type: 'attention' }>, 'type' | 'id'>,
    signal: AbortSignal
  ) => Promise<'continue' | 'skip'>;
}

export const CHECKLIST = [
  'Source of truth = the FMSG profile only — never invent facts',
  'No fabricated metrics — every number comes from the profile',
  'Passwords, one-time codes, ID, bank and card details are never entered',
  'Sign-in walls, captchas and paywalls pause the run and ask the user',
  'CV wording must match the posting honestly',
  'The run stops immediately when the spend cap is reached',
];

const SENSITIVE_LABEL =
  /password|passcode|otp|one[- ]?time|verification code|2fa|captcha|id number|identity number|passport|social security|ssn|tax number|bank|account number|branch code|card number|cvv|expiry|pin\b/i;

const MAX_PAGE_TEXT = 7000;
const MAX_MODEL_TURNS_PER_JOB = 3;

const AGENT_SYSTEM_PROMPT = `You are FMSG Agent, the application assistant built into Find Me Some Jobs (findmesomejobs.co.za). You work for exactly one signed-in person, inside their own desktop app, driving their own Chrome window on their own computer.

You are a careful, honest career assistant. You are not a scraper and you are not a spam bot.

Non-negotiable rules:
1. The FMSG profile supplied in the request is the only source of truth. Never invent employers, job titles, dates, qualifications, certifications, skills or metrics.
2. If a form asks for something the profile does not contain, use null for that value. Never guess.
3. Never output values for passwords, one-time codes, identity/passport numbers, bank or card details, tax numbers or captcha answers. Mark those fields "sensitive".
4. Never claim an application was submitted unless the page confirmed it.
5. Match the posting honestly: if the profile is a weak fit, say so instead of overclaiming.
6. Reply with a single JSON object only. No markdown fences, no commentary.`;

// ─────────────────────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────────────────────

function parseJsonObject<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function trimText(value: string | undefined, max: number): string {
  if (!value) return '';
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

function looksSensitive(label: string): boolean {
  return SENSITIVE_LABEL.test(label);
}

export async function downloadRules(): Promise<string | null> {
  return JSON.stringify({ version: '0.6.0', rules: CHECKLIST });
}

export async function loadProfile(profileId: string, sessionToken?: string) {
  const token = sessionToken || getActiveSessionAccessToken();
  const user = getActiveSessionUser();
  if (!token || !user?.id) {
    throw new Error('Please sign in again before starting the agent.');
  }

  const supabase = createAnonSupabaseClient(token);
  const { data, error } = await supabase
    .from('search_profiles')
    .select(
      'id, user_id, name, job_titles, location, industry, industry_step_1, industry_step_2, location_scope, cv_variations, cv_file_path'
    )
    .eq('id', profileId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function loadAccountProfile(sessionToken?: string) {
  const token = sessionToken || getActiveSessionAccessToken();
  const user = getActiveSessionUser();
  if (!token || !user?.id) return null;

  const supabase = createAnonSupabaseClient(token);
  const { data } = await supabase
    .from('profiles')
    .select(
      'id, email, name, surname, phone, address, location, job_titles, desired_salary, cv_file_path, plan'
    )
    .eq('id', user.id)
    .maybeSingle();

  return data ?? null;
}

export function generateSearchQuery(
  profile: any,
  round: number,
  pfMode: boolean
): string {
  const titles = (profile?.job_titles || []).filter(Boolean);
  const industry = profile?.industry || '';
  const step1 = profile?.industry_step_1 || '';
  const step2 = profile?.industry_step_2 || '';

  const titleQuery = titles.length
    ? titles.map((t: string) => `"${t}"`).join(' OR ')
    : 'jobs';

  if (!pfMode) {
    return `${titleQuery} ${industry}`.trim();
  }

  if (round <= 2) {
    const ladder = round === 1 ? step1 || industry : industry || step2;
    return `${titleQuery} ${ladder}`.trim();
  }

  return titleQuery.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export class AgentRunner {
  private config: AgentConfig;
  private state: AgentState;
  private browser?: Browser;
  private page?: Page;
  private results: JobResult[] = [];
  private billing?: BillingState;
  private abort = new AbortController();
  private runtime?: AgentRuntime;
  private searchProfile: any = null;
  private accountProfile: any = null;
  private discovered: DiscoveredJob[] = [];
  private modelTurns = 0;
  private modelAvailable = true;
  private paused = false;
  private pauseWaiters: Array<() => void> = [];

  constructor(config: AgentConfig, runtime?: AgentRuntime) {
    this.config = config;
    this.runtime = runtime;
    this.state = {
      running: false,
      currentJobIndex: 0,
      appliedCount: 0,
      skippedCount: 0,
      lastStep: 'initialized',
      checklistVisible: true,
    };
  }

  isRunning(): boolean {
    return this.state.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    if (!this.state.running || this.paused) return;
    this.paused = true;
    this.phase('paused', 'Run paused', 'Click Resume whenever you are ready to continue.');
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    const waiters = this.pauseWaiters.splice(0, this.pauseWaiters.length);
    for (const w of waiters) {
      try {
        w();
      } catch {
        // ignore
      }
    }
    this.phase('applying', 'Resumed run', 'Continuing from the current posting.');
  }

  private async waitIfPaused(): Promise<void> {
    if (!this.paused || this.abort.signal.aborted) return;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      this.pauseWaiters.push(done);
      this.abort.signal.addEventListener('abort', done, { once: true });
    });
  }

  getState(): AgentState {
    return { ...this.state };
  }

  getDiscoveredJobs(): DiscoveredJob[] {
    return this.discovered;
  }

  // ── events ────────────────────────────────────────────────────────────────

  private emit(event: AgentEvent) {
    try {
      this.runtime?.emit(event);
    } catch {
      // never let rendering break a run
    }
  }

  private phase(
    phase: AgentPhase,
    label: string,
    sublabel?: string,
    job?: DiscoveredJob,
    jobIndex?: number,
    totalJobs?: number
  ) {
    this.state.lastStep = label;
    logEvent('agent_step', phase, { label });
    this.emit({ type: 'phase', phase, label, sublabel, job, jobIndex, totalJobs });
  }

  private async screenshot(caption: string, job?: DiscoveredJob, quality = 62) {
    if (!this.page) return;
    try {
      const buffer = await this.page.screenshot({
        type: 'jpeg',
        quality,
        animations: 'disabled',
      });
      this.emit({
        type: 'screenshot',
        dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        caption,
        job,
      });
    } catch (err: any) {
      logBrowserAutomation('screenshot_failed', { error: err?.message });
    }
  }

  private async attention(
    kind: 'login' | 'captcha' | 'sensitive' | 'submit' | 'info',
    title: string,
    message: string,
    job?: DiscoveredJob,
    extra?: { secretKeyName?: string; allowedDomain?: string }
  ): Promise<'continue' | 'skip'> {
    if (!this.runtime) return 'skip';
    logEvent('agent_attention', kind, { title });
    return this.runtime.requestAttention(
      {
        kind,
        title,
        message,
        job,
        secretKeyName: extra?.secretKeyName,
        allowedDomain: extra?.allowedDomain,
        countdownSeconds: 600,
      },
      this.abort.signal
    );
  }

  // ── model bridge (server-side key, user session) ──────────────────────────

  private async callModel(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    maxTokens = 1200
  ): Promise<string | null> {
    if (!this.modelAvailable) return null;

    const token = getActiveSessionAccessToken();
    if (!token) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 75_000);

    try {
      const res = await fetch(`${WEB_BASE_URL}/api/agent/ai`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages, temperature: 0.2, max_tokens: maxTokens }),
        signal: controller.signal,
      });

      this.modelTurns += 1;

      if (!res.ok) {
        if (res.status === 429) {
          logEvent('agent_model', 'rate_limited', { status: 429 }, 'warn');
          return null;
        }
        if (res.status >= 500) {
          logEvent('agent_model', 'unavailable', { status: res.status }, 'warn');
          return null;
        }
        logEvent('agent_model', 'rejected', { status: res.status }, 'warn');
        return null;
      }

      const data = await res.json();
      const content: string | undefined = data?.message?.content;
      return typeof content === 'string' ? content : null;
    } catch (err: any) {
      logEvent('agent_model', 'request_failed', { error: err?.message }, 'warn');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── discovery ─────────────────────────────────────────────────────────────

  private async searchJobs(query: string, location: string): Promise<DiscoveredJob[]> {
    const token = getActiveSessionAccessToken();
    if (!token) throw new Error('Please sign in again before starting the agent.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch(`${WEB_BASE_URL}/api/agent/tools/search-jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          location,
          limit: Math.min(Math.max(this.config.batchSize * 3, 12), 40),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          res.status === 401
            ? 'Your session expired. Please sign in again.'
            : `Job search failed (${res.status}). ${trimText(text, 140)}`
        );
      }

      const data = await res.json();
      return Array.isArray(data?.jobs) ? (data.jobs as DiscoveredJob[]) : [];
    } finally {
      clearTimeout(timer);
    }
  }

  private async rankJobs(jobs: DiscoveredJob[], wanted: number): Promise<DiscoveredJob[]> {
    if (jobs.length <= wanted) return jobs;

    const profileSummary = {
      titles: (this.searchProfile?.job_titles || []).filter(Boolean),
      industry: this.searchProfile?.industry || '',
      location: this.searchProfile?.location || this.searchProfile?.location_scope || '',
      seniority_hint: this.accountProfile?.job_titles?.[0] || '',
    };

    const content = await this.callModel(
      [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            'Task: choose which of these live postings this person should apply to.',
            '',
            `PROFILE: ${JSON.stringify(profileSummary)}`,
            `HOW MANY: at most ${wanted}`,
            '',
            'POSTINGS:',
            JSON.stringify(
              jobs.map((j) => ({
                id: j.id,
                title: j.title,
                company: j.company,
                location: j.location,
                source: j.source,
                snippet: trimText(j.description, 220),
              }))
            ),
            '',
            'Return JSON exactly like:',
            '{"selected":[{"id":"job_1","score":92,"reason":"one short sentence"}]}',
            'Only include postings that genuinely fit the profile. If fewer than the maximum fit, return fewer.',
          ].join('\n'),
        },
      ],
      900
    );

    const parsed = content
      ? parseJsonObject<{ selected?: Array<{ id: string; score?: number; reason?: string }> }>(content)
      : null;

    if (!parsed?.selected?.length) {
      // Deterministic fallback: keep source order, which is already relevance-ranked.
      return jobs.slice(0, wanted);
    }

    const byId = new Map(jobs.map((j) => [j.id, j]));
    const chosen: DiscoveredJob[] = [];
    for (const pick of parsed.selected) {
      const job = byId.get(pick.id);
      if (!job || chosen.includes(job)) continue;
      chosen.push({
        ...job,
        matchScore: typeof pick.score === 'number' ? Math.round(pick.score) : undefined,
        reason: trimText(pick.reason, 180) || undefined,
      });
      if (chosen.length >= wanted) break;
    }

    return chosen.length > 0 ? chosen : jobs.slice(0, wanted);
  }

  // ── page reading ──────────────────────────────────────────────────────────

  private async openJob(job: DiscoveredJob): Promise<{ text: string; title: string }> {
    if (!this.page) throw new Error('Browser is not available.');
    const page = this.page;

    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1200);
    await this.dismissCookieBanners();

    const title = await page.title().catch(() => job.title);
    let text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    text = trimText(text, MAX_PAGE_TEXT);

    logBrowserAutomation('job_opened', { host: hostOf(job.url), title: title.slice(0, 80) });
    return { text, title };
  }

  private async dismissCookieBanners() {
    if (!this.page) return;
    const labels = [
      'Accept all',
      'Accept All',
      'Accept cookies',
      'I agree',
      'Got it',
      'Allow all',
      'Agree',
    ];
    for (const label of labels) {
      try {
        const btn = this.page.getByRole('button', { name: label, exact: false }).first();
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          await btn.click({ timeout: 1500 });
          await this.page.waitForTimeout(400);
          return;
        }
      } catch {
        // keep trying the next label
      }
    }
  }

  private async detectFields(): Promise<DetectedField[]> {
    if (!this.page) return [];
    try {
      return await this.page.evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>('input, textarea, select')
        );
        const visible = (el: HTMLElement) => {
          if (el.hasAttribute('hidden')) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 1 && rect.height > 1;
        };

        const labelFor = (el: HTMLElement): string => {
          const direct =
            el.getAttribute('aria-label') ||
            (el as HTMLInputElement).placeholder ||
            '';
          if (direct.trim()) return direct.trim();
          const id = el.getAttribute('id');
          if (id) {
            const linked = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (linked?.textContent) return linked.textContent.trim();
          }
          const wrapping = el.closest('label');
          if (wrapping?.textContent) return wrapping.textContent.trim();
          const labelledBy = el.getAttribute('aria-labelledby');
          if (labelledBy) {
            const target = document.getElementById(labelledBy);
            if (target?.textContent) return target.textContent.trim();
          }
          return (el as HTMLInputElement).name || '';
        };

        return nodes
          .map((el, index) => ({ el, index }))
          .filter(({ el }) => visible(el))
          .filter(({ el }) => {
            const type = (el as HTMLInputElement).type?.toLowerCase();
            return !['hidden', 'submit', 'button', 'reset', 'image'].includes(type);
          })
          .map(({ el, index }) => {
            const input = el as HTMLInputElement;
            return {
              index,
              tag: el.tagName.toLowerCase(),
              type: (input.type || el.tagName).toLowerCase(),
              label: labelFor(el).slice(0, 120),
              required: input.required || el.getAttribute('aria-required') === 'true',
              options:
                el.tagName.toLowerCase() === 'select'
                  ? Array.from((el as HTMLSelectElement).options)
                      .map((o) => o.text.trim())
                      .filter(Boolean)
                      .slice(0, 40)
                  : undefined,
            };
          });
      });
    } catch {
      return [];
    }
  }

  private fieldLocator(index: number) {
    return this.page!.locator('input, textarea, select').nth(index);
  }

  private guessValue(field: DetectedField): string | null {
    const label = `${field.label} ${field.type}`.toLowerCase();
    const p = this.accountProfile || {};
    const fullName = [p.name, p.surname].filter(Boolean).join(' ').trim();

    if (looksSensitive(label)) return null;
    if (/first name|given name|forename/.test(label)) return p.name || null;
    if (/last name|surname|family name/.test(label)) return p.surname || null;
    if (/full name|your name|^name$/.test(label)) return fullName || null;
    if (/e-?mail/.test(label)) return p.email || null;
    if (/phone|mobile|contact number|cell/.test(label))
      return p.phone ? String(p.phone) : null;
    if (/city|town|suburb|location|address/.test(label))
      return p.location || p.address || null;
    if (/salary|remuneration|package|ctc/.test(label))
      return p.desired_salary ? String(p.desired_salary) : null;
    if (/cover letter|motivation|why do you want|message/.test(label)) return null;

    // Match user's saved Answer Bank entries
    try {
      const bank = loadScreeningRules();
      for (const entry of bank.answers || []) {
        if (entry.askEachTime) continue;
        const qWords = entry.question
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3);
        if (qWords.length > 0 && qWords.some((w) => label.includes(w))) {
          return entry.answer;
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  // ── model analysis ────────────────────────────────────────────────────────

  private async analysePage(
    job: DiscoveredJob,
    text: string,
    fields: DetectedField[]
  ): Promise<{
    pageType:
      | 'application_form'
      | 'job_posting'
      | 'login_required'
      | 'captcha'
      | 'external_redirect'
      | 'unknown';
    jobTitle: string;
    company: string;
    summary: string;
    tailoredHighlights: string[];
    coverNote: string;
    formValues: Record<string, string | null>;
    applyButtonText: string;
    canSubmit: boolean;
    notes: string;
  }> {
    const fallback = this.heuristicAnalysis(job, text, fields);

    const profile = {
      name: this.accountProfile?.name || '',
      surname: this.accountProfile?.surname || '',
      email: this.accountProfile?.email || '',
      phone: this.accountProfile?.phone || '',
      location: this.accountProfile?.location || '',
      desired_salary: this.accountProfile?.desired_salary ?? null,
      titles: this.searchProfile?.job_titles || [],
      industry: this.searchProfile?.industry || '',
      industry_step_1: this.searchProfile?.industry_step_1 || '',
      industry_step_2: this.searchProfile?.industry_step_2 || '',
      cv_variations: Array.isArray(this.searchProfile?.cv_variations)
        ? this.searchProfile.cv_variations.slice(0, 6)
        : [],
    };

    const content = await this.callModel(
      [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            'Task: read the page the agent just opened and prepare this application.',
            '',
            `PROFILE: ${JSON.stringify(profile)}`,
            `TARGET ROLE: ${job.title} at ${job.company} (${job.location})`,
            '',
            'DETECTED FORM FIELDS (index | type | required | label | options):',
            fields.length
              ? fields
                  .map(
                    (f) =>
                      `${f.index} | ${f.type} | ${f.required ? 'required' : 'optional'} | ${f.label}${
                        f.options?.length ? ` | options: ${f.options.join(' / ')}` : ''
                      }`
                  )
                  .join('\n')
              : '(none detected)',
            '',
            `PAGE TEXT:\n${trimText(text, 6000)}`,
            '',
            'Return JSON exactly like:',
            '{"pageType":"application_form","jobTitle":"","company":"","summary":"one sentence on the fit",',
            '"tailoredHighlights":["up to 4 short, truthful CV highlights drawn only from the profile"],',
            '"coverNote":"2-3 sentence motivation note using only profile facts (no invented claims)",',
            '"formValues":{"0":"value or null for field index 0","1":null},',
            '"applyButtonText":"","canSubmit":true,"notes":""}',
            '',
            'pageType must be one of: application_form, job_posting, login_required, captcha, external_redirect, unknown.',
            'Set canSubmit=false if a required field has no truthful value, if a sensitive field is required, or if the page is not an application form.',
            'For sensitive fields use null.',
          ].join('\n'),
        },
      ],
      1600
    );

    if (!content) return fallback;

    const parsed = parseJsonObject<typeof fallback>(content);
    if (!parsed) return fallback;

    const allowed = new Set([
      'application_form',
      'job_posting',
      'login_required',
      'captcha',
      'external_redirect',
      'unknown',
    ]);

    return {
      ...fallback,
      ...parsed,
      pageType: allowed.has(parsed.pageType) ? parsed.pageType : fallback.pageType,
      tailoredHighlights: Array.isArray(parsed.tailoredHighlights)
        ? parsed.tailoredHighlights.slice(0, 4).map((h) => String(h).slice(0, 220))
        : fallback.tailoredHighlights,
      coverNote: typeof parsed.coverNote === 'string' ? parsed.coverNote.slice(0, 900) : fallback.coverNote,
      formValues:
        parsed.formValues && typeof parsed.formValues === 'object'
          ? parsed.formValues
          : fallback.formValues,
    };
  }

  private heuristicAnalysis(
    job: DiscoveredJob,
    text: string,
    fields: DetectedField[]
  ): {
    pageType:
      | 'application_form'
      | 'job_posting'
      | 'login_required'
      | 'captcha'
      | 'external_redirect'
      | 'unknown';
    jobTitle: string;
    company: string;
    summary: string;
    tailoredHighlights: string[];
    coverNote: string;
    formValues: Record<string, string | null>;
    applyButtonText: string;
    canSubmit: boolean;
    notes: string;
  } {
    const lower = text.toLowerCase();
    const hasPassword = fields.some((f) => f.type === 'password');
    const hasFile = fields.some((f) => f.type === 'file');
    const captcha = /captcha|i'm not a robot|verify you are human|cloudflare/i.test(lower);
    const signIn =
      hasPassword ||
      /sign in to (apply|continue)|log ?in to (apply|continue)|create an account to apply/i.test(lower);

    let pageType: 'application_form' | 'job_posting' | 'login_required' | 'captcha' | 'unknown' =
      'unknown';
    if (captcha) pageType = 'captcha';
    else if (signIn) pageType = 'login_required';
    else if (fields.length >= 3 || hasFile) pageType = 'application_form';
    else pageType = 'job_posting';

    const formValues: Record<string, string | null> = {};
    let blockedRequired = false;
    for (const field of fields) {
      if (looksSensitive(field.label)) {
        if (field.required) blockedRequired = true;
        formValues[String(field.index)] = null;
        continue;
      }
      const guess = this.guessValue(field);
      formValues[String(field.index)] = guess;
      if (field.required && !guess && field.type !== 'file') blockedRequired = true;
    }

    const titles: string[] = (this.searchProfile?.job_titles || []).filter(Boolean);

    return {
      pageType,
      jobTitle: job.title,
      company: job.company,
      summary: titles.length
        ? `Opening as ${titles[0]} — checking the posting against the saved profile.`
        : 'Checking the posting against the saved profile.',
      tailoredHighlights: titles.slice(0, 3).map((t) => `Target role: ${t}`),
      coverNote: '',
      formValues,
      applyButtonText: pageType === 'application_form' ? 'Submit application' : '',
      canSubmit: pageType === 'application_form' && !blockedRequired,
      notes: blockedRequired
        ? 'A required field has no truthful value in the profile.'
        : '',
    };
  }

  // ── form filling ──────────────────────────────────────────────────────────

  private async fillForm(
    fields: DetectedField[],
    values: Record<string, string | null>
  ): Promise<{ filled: number; skipped: number }> {
    let filled = 0;
    let skipped = 0;

    for (const field of fields) {
      const raw = values[String(field.index)];
      if (raw === null || raw === undefined || String(raw).trim() === '') {
        skipped += 1;
        continue;
      }
      const value = String(raw);

      if (looksSensitive(field.label)) {
        skipped += 1;
        continue;
      }
      if (field.type === 'file') {
        skipped += 1;
        continue;
      }

      try {
        const locator = this.fieldLocator(field.index);
        if ((await locator.count()) === 0) {
          skipped += 1;
          continue;
        }

        if (field.tag === 'select') {
          const optionText = field.options?.find(
            (o) => o.toLowerCase() === value.toLowerCase()
          );
          await locator.selectOption(optionText ? { label: optionText } : value, {
            timeout: 4000,
          });
        } else if (field.type === 'checkbox' || field.type === 'radio') {
          const truthy = /^(yes|true|1|on|agree)$/i.test(value);
          if (truthy) await locator.check({ timeout: 4000 });
        } else {
          await locator.fill(value, { timeout: 5000 });
        }
        filled += 1;
        await this.page!.waitForTimeout(120);
      } catch {
        skipped += 1;
      }
    }

    return { filled, skipped };
  }

  private async attachCv(fields: DetectedField[]): Promise<boolean> {
    const fileField = fields.find((f) => f.type === 'file');
    if (!fileField || !this.page) return false;

    const token = getActiveSessionAccessToken();
    const userId = getActiveSessionUser()?.id;
    const path: string =
      this.searchProfile?.cv_file_path || this.accountProfile?.cv_file_path || '';
    if (!token || !userId || !path) return false;

    try {
      const supabase = createAnonSupabaseClient(token);
      const { data, error } = await supabase.storage.from('cv-files').download(path);
      if (error || !data) return false;

      const buffer = Buffer.from(await data.arrayBuffer());
      const fileName = path.split('/').pop() || 'CV.pdf';
      const mime = fileName.toLowerCase().endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf';

      await this.fieldLocator(fileField.index).setInputFiles(
        { name: fileName, mimeType: mime, buffer },
        { timeout: 12_000 }
      );
      return true;
    } catch (err: any) {
      logBrowserAutomation('cv_attach_failed', { error: err?.message });
      return false;
    }
  }

  private async clickApply(): Promise<boolean> {
    if (!this.page) return false;
    const patterns = [
      /^apply (for this job|now|online)$/i,
      /apply now/i,
      /apply for this (job|role|position)/i,
      /start application|begin application/i,
      /easy apply/i,
      /submit application|submit application form/i,
      /^submit$/i,
      /send application/i,
      /apply$/i,
    ];

    for (const pattern of patterns) {
      try {
        const button = this.page
          .getByRole('button', { name: pattern })
          .or(this.page.getByRole('link', { name: pattern }))
          .first();
        if ((await button.count()) > 0 && (await button.isVisible())) {
          await button.click({ timeout: 6000 });
          await this.page.waitForTimeout(1500);
          return true;
        }
      } catch {
        // next pattern
      }
    }
    return false;
  }

  private async detectConfirmation(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const text = (await this.page.evaluate(() => document.body?.innerText ?? '')).toLowerCase();
      return /application (received|submitted|sent)|thank you for (applying|your application)|we('| ha)ve received your application|successfully applied|your application has been submitted/.test(
        text
      );
    } catch {
      return false;
    }
  }

  // ── profiles & billing ────────────────────────────────────────────────────

  private initBilling(config?: AgentConfig): BillingState {
    const defaultCapRands =
      config?.billingConfig?.costCap ??
      (config?.billingConfig?.mode === 'bundle' ? 10000 : 0);

    const billing: BillingState = {
      currentRate: 4000, // R40 pure pay-as-you-go
      currentThreshold: 4000, // First charge at R40
      consecutiveSuccess: 0,
      spentThisMonth: 0,
      costCap: Math.round(defaultCapRands * 100),
    };

    if (config?.billingConfig?.mode === 'bundle' || config?.billingConfig?.tier) {
      const tierRates: Record<string, number> = {
        Starter: 3500, // R35/app
        Lite: 3000, // R30/app
        Standard: 2500, // R25/app
        Power: 2200, // R22/app
      };
      if (config?.billingConfig?.mode === 'bundle') {
        billing.currentRate = tierRates[config.billingConfig.tier || 'Starter'] ?? 3500;
        billing.currentThreshold = 50000;
      }
    }

    this.billing = billing;
    this.state.billing = billing;
    return billing;
  }

  private checkProgressiveTier(): BillingState {
    if (!this.billing) return this.initBilling(this.config);
    if (this.billing.consecutiveSuccess >= 6) {
      this.billing.currentThreshold = 50000; // R500 max threshold after 6 payments
    } else if (this.billing.consecutiveSuccess >= 3) {
      this.billing.currentThreshold = 25000; // R250 after 3 payments
    } else if (this.billing.consecutiveSuccess >= 1) {
      this.billing.currentThreshold = 10000; // R100 after 1 payment
    } else {
      this.billing.currentThreshold = 4000; // R40 first charge
    }
    return this.billing;
  }

  private reserveCredits(amountCents: number): boolean {
    if (!this.billing) this.initBilling(this.config);
    if (!this.billing) return false;
    if (this.billing.costCap <= 0) {
      this.phase(
        'paused',
        'Spend cap not set',
        'Set a monthly cap on the Spend Cap screen before the agent can apply.'
      );
      return false;
    }
    const projected = this.billing.spentThisMonth + amountCents;
    if (projected > this.billing.costCap) {
      this.phase(
        'paused',
        'Spend cap reached',
        `R${(this.billing.costCap / 100).toLocaleString('en-ZA')} limit — the agent stopped safely.`
      );
      return false;
    }
    return true;
  }

  private deductCredits(amountCents: number) {
    if (!this.billing) return;
    this.billing.spentThisMonth += amountCents;
    this.state.billing = { ...this.billing };
  }

  private refundCredits(amountCents: number) {
    if (!this.billing) return;
    this.billing.spentThisMonth = Math.max(0, this.billing.spentThisMonth - amountCents);
    this.state.billing = { ...this.billing };
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  async init() {
    const rulesStr = await downloadRules();
    if (!rulesStr) logEvent('agent_rules', 'default_rules_used');

    this.browser = await launchVisibleAutomationBrowser({ slowMo: 120 });
    const context = await this.browser.newContext({
      viewport: { width: 1360, height: 820 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-ZA',
    });
    this.page = await context.newPage();
    this.page.setDefaultTimeout(20_000);
    this.state.checklistVisible = true;
    logBrowserAutomation('browser_launched', { viewport: '1360x820', slowMo: 120 });
  }

  async runBatch(profileId: string) {
    if (this.state.running) return;
    this.state.running = true;
    this.results = [];
    this.abort = new AbortController();

    try {
      this.searchProfile = await loadProfile(profileId);
      this.accountProfile = await loadAccountProfile();
      if (!this.searchProfile) throw new Error('That search profile could not be loaded.');

      this.phase(
        'searching',
        `Searching: ${(this.searchProfile.job_titles || [])[0] || this.searchProfile.name || 'your roles'}`,
        `Scanning live postings for ${this.searchProfile.location || 'South Africa'}`
      );

      const query = generateSearchQuery(this.searchProfile, 1, false);
      const jobs = await this.searchJobs(
        query,
        this.searchProfile.location || ''
      );

      this.discovered = jobs;
      logEvent('agent_search', 'jobs_found', { count: jobs.length });

      if (jobs.length === 0) {
        this.phase(
          'paused',
          'No postings found',
          'Nothing matched this profile today. Try widening the location or job titles.'
        );
        return;
      }

      const wanted = Math.min(Math.max(this.config.batchSize, 1), 128);
      this.phase(
        'found',
        `Found ${jobs.length} jobs`,
        `Choosing the best ${Math.min(wanted, jobs.length)} for this profile`
      );

      const selected = await this.rankJobs(jobs, wanted);
      this.initBilling(this.config);
      this.checkProgressiveTier();

      for (let i = 0; i < selected.length; i += 1) {
        if (!this.state.running || this.abort.signal.aborted) break;
        this.state.currentJobIndex = i;
        await this.processJob(selected[i], i, selected.length);
      }

      this.phase(
        'completed',
        `${this.state.appliedCount} of ${selected.length} jobs completed`,
        this.state.skippedCount > 0
          ? `${this.state.skippedCount} paused or skipped — open the live feed for details`
          : 'Every selected posting was handled'
      );
    } catch (err: any) {
      const message = err?.message || 'The agent stopped unexpectedly.';
      logEvent('agent_error', 'run_failed', { error: message }, 'error');
      this.phase('error', 'Run stopped', message);
    } finally {
      this.state.running = false;
      this.emit({
        type: 'run-done',
        applied: this.state.appliedCount,
        skipped: this.state.skippedCount,
        total: this.discovered.length,
      });
    }
  }

  // ── one job ───────────────────────────────────────────────────────────────

  private async processJob(job: DiscoveredJob, index: number, total: number) {
    await this.waitIfPaused();
    if (this.abort.signal.aborted) return;

    const rateCents = this.billing?.currentRate ?? 4000;
    if (!this.reserveCredits(rateCents)) return;

    this.phase(
      'reading',
      `Reading: ${trimText(job.title, 60)} — ${trimText(job.company, 40)}`,
      `Job ${index + 1} of ${total} • ${job.location || 'Location not listed'}`,
      job,
      index + 1,
      total
    );

    let text = '';
    try {
      const opened = await this.openJob(job);
      text = opened.text;
      await this.screenshot(`Opened ${hostOf(job.url)} — ${trimText(opened.title, 60)}`, job);
    } catch (err: any) {
      this.results.push({
        title: job.title,
        company: job.company,
        url: job.url,
        applied: false,
        skipped: true,
        reason: `Could not open the posting (${err?.message || 'page error'})`,
      });
      this.state.skippedCount += 1;
      this.refundCredits(rateCents);
      return;
    }

    const fields = await this.detectFields();
    const analysis = await this.analysePage(job, text, fields);

    // ── sign-in wall (try local domain-locked fill_secret(KEY_NAME) first) ──
    if (analysis.pageType === 'login_required') {
      const pageUrl = this.page?.url() || job.url;
      const host = hostOf(pageUrl);
      const suggestedKey = normalizeSecretKeyName(host.split('.')[0] || 'SITE');
      const matchedSecret = await findMatchingSecretForUrl(pageUrl);

      if (matchedSecret && this.page) {
        this.phase(
          'applying',
          `Filling saved login (${matchedSecret.keyName})`,
          `Domain verified: ${matchedSecret.allowedDomain} — password stays in local Credential Manager`,
          job,
          index + 1,
          total
        );
        const fillRes = await fillSecretOnVerifiedDomain(
          this.page,
          matchedSecret.keyName
        );
        if (fillRes.ok && fillRes.filledPassword) {
          await this.screenshot(
            `Signed in on ${matchedSecret.allowedDomain} via ${matchedSecret.keyName}`,
            job
          );
          const refreshedAfterSecret = await this.detectFields();
          const afterText = await this.page
            .evaluate(() => document.body?.innerText ?? '')
            .catch(() => text);
          const reanalysisAfterSecret = await this.analysePage(
            job,
            trimText(afterText, MAX_PAGE_TEXT),
            refreshedAfterSecret
          );
          if (reanalysisAfterSecret.pageType !== 'login_required') {
            await this.tailor(job, reanalysisAfterSecret, index, total);
            await this.applyAndConfirm(
              job,
              refreshedAfterSecret,
              reanalysisAfterSecret,
              index,
              total,
              rateCents
            );
            return;
          }
        }
      }

      this.phase(
        'paused',
        'Sign-in needed',
        `The application on ${host} needs an account (${suggestedKey})`,
        job,
        index + 1,
        total
      );
      const answer = await this.attention(
        'login',
        `Sign in on ${host}`,
        `Sign in directly in the open Chrome window, or save ${suggestedKey} in your local Windows Credential Manager vault so future runs autofill this domain automatically.`,
        job,
        { secretKeyName: suggestedKey, allowedDomain: host }
      );
      if (answer === 'skip') {
        this.results.push({
          title: job.title,
          company: job.company,
          url: job.url,
          applied: false,
          skipped: true,
          reason: 'Sign-in required',
        });
        this.state.skippedCount += 1;
        this.refundCredits(rateCents);
        return;
      }
      // User signed in — re-read the page and continue.
      await this.page?.waitForTimeout(1200);
      await this.screenshot('Signed in — continuing application', job);
      const refreshed = await this.detectFields();
      const reanalysis = await this.analysePage(job, text, refreshed);
      await this.tailor(job, reanalysis, index, total);
      await this.applyAndConfirm(job, refreshed, reanalysis, index, total, rateCents);
      return;
    }

    // ── captcha / human check ─────────────────────────────────────────────
    if (analysis.pageType === 'captcha') {
      this.phase(
        'paused',
        'Human check detected',
        'The site asked for a human verification',
        job,
        index + 1,
        total
      );
      const answer = await this.attention(
        'captcha',
        'Human check on this site',
        'Chrome is open on the verification challenge. Complete it yourself, then choose Continue. The agent never solves captchas for you.',
        job
      );
      if (answer === 'skip') {
        this.results.push({
          title: job.title,
          company: job.company,
          url: job.url,
          applied: false,
          skipped: true,
          reason: 'Human verification required',
        });
        this.state.skippedCount += 1;
        this.refundCredits(rateCents);
        return;
      }
      const refreshed = await this.detectFields();
      const reanalysis = await this.analysePage(job, text, refreshed);
      await this.tailor(job, reanalysis, index, total);
      await this.applyAndConfirm(job, refreshed, reanalysis, index, total, rateCents);
      return;
    }

    await this.tailor(job, analysis, index, total);

    if (analysis.pageType === 'job_posting') {
      this.phase(
        'applying',
        'Looking for the application route',
        `${trimText(job.title, 50)} on ${hostOf(job.url)}`,
        job,
        index + 1,
        total
      );
      const clicked = await this.clickApply();
      if (clicked) {
        await this.page?.waitForTimeout(1800);
        await this.screenshot('Application route opened', job);
        const nextFields = await this.detectFields();
        const nextAnalysis = await this.analysePage(job, text, nextFields);
        if (nextAnalysis.pageType === 'application_form') {
          await this.applyAndConfirm(
            job,
            nextFields,
            nextAnalysis,
            index,
            total,
            rateCents
          );
          return;
        }
      }
      // No route into a form from here — record it honestly.
      this.results.push({
        title: job.title,
        company: job.company,
        url: job.url,
        applied: false,
        skipped: true,
        reason: 'Read the posting; no application form was reachable',
      });
      this.state.skippedCount += 1;
      this.refundCredits(rateCents);
      return;
    }

    await this.applyAndConfirm(job, fields, analysis, index, total, rateCents);
  }

  private async tailor(
    job: DiscoveredJob,
    analysis: { tailoredHighlights: string[]; summary: string; coverNote: string },
    index: number,
    total: number
  ) {
    this.phase(
      'tailoring',
      'Tailoring CV',
      `Aligning verified profile wording to ${trimText(job.company, 40)}`,
      job,
      index + 1,
      total
    );
    const highlights = analysis.tailoredHighlights.length
      ? analysis.tailoredHighlights
      : ['Using the verified FMSG profile as the source of truth'];
    this.emit({
      type: 'phase',
      phase: 'tailoring',
      label: 'Tailoring CV',
      sublabel: highlights[0],
      job,
      jobIndex: index + 1,
      totalJobs: total,
    });
    await this.page?.waitForTimeout(400);
  }

  private async applyAndConfirm(
    job: DiscoveredJob,
    fields: DetectedField[],
    analysis: {
      formValues: Record<string, string | null>;
      canSubmit: boolean;
      applyButtonText: string;
      coverNote: string;
      notes: string;
    },
    index: number,
    total: number,
    rateCents: number
  ) {
    this.phase(
      'applying',
      'Applying',
      `Filling ${trimText(job.company, 40)} application from your profile`,
      job,
      index + 1,
      total
    );

    const sensitiveFields = fields.filter(
      (f) => looksSensitive(f.label) && f.required
    );

    const { filled } = await this.fillForm(fields, analysis.formValues);
    const cvAttached = await this.attachCv(fields);
    await this.screenshot(
      `Filled ${filled} field${filled === 1 ? '' : 's'}${cvAttached ? ' + CV attached' : ''}`,
      job
    );

    if (sensitiveFields.length > 0) {
      this.phase(
        'paused',
        'Sensitive field needs you',
        `This form asks for ${sensitiveFields[0].label}`,
        job,
        index + 1,
        total
      );
      const answer = await this.attention(
        'sensitive',
        'Protected information requested',
        `The form asks for "${sensitiveFields[0].label}". The agent never enters protected information. Fill it in Chrome yourself, then choose Continue or Skip.`,
        job
      );
      if (answer === 'skip') {
        this.results.push({
          title: job.title,
          company: job.company,
          url: job.url,
          applied: false,
          skipped: true,
          reason: 'Protected field requested',
        });
        this.state.skippedCount += 1;
        this.refundCredits(rateCents);
        return;
      }
    }

    const needsApproval = !this.config.autoAccept || !analysis.canSubmit;
    if (needsApproval) {
      this.phase(
        'paused',
        'Ready for your approval',
        analysis.canSubmit
          ? 'Auto-submit is off — review the form and approve'
          : analysis.notes || 'Some answers are missing',
        job,
        index + 1,
        total
      );
      const answer = await this.attention(
        'submit',
        'Review before submitting',
        analysis.canSubmit
          ? 'The application is filled in. Check it in Chrome, then choose Continue to submit.'
          : analysis.notes ||
            'Some answers could not be filled truthfully. Complete them in Chrome, then choose Continue.',
        job
      );
      if (answer === 'skip') {
        this.results.push({
          title: job.title,
          company: job.company,
          url: job.url,
          applied: false,
          skipped: true,
          reason: 'Not approved by the user',
        });
        this.state.skippedCount += 1;
        this.refundCredits(rateCents);
        return;
      }
    }

    const submitted = await this.clickApply();
    await this.page?.waitForTimeout(2200);
    const confirmed = await this.detectConfirmation();
    await this.screenshot(
      confirmed ? 'Submission confirmed' : 'After submission attempt',
      job
    );

    this.phase(
      'confirming',
      'Confirming',
      confirmed
        ? `Submission receipt confirmed for ${trimText(job.company, 40)}`
        : 'Checking the confirmation page',
      job,
      index + 1,
      total
    );

    const applied = submitted && confirmed;
    const summaryText = applied
      ? `Applied via FMSG Agents${analysis.coverNote ? ` — ${analysis.coverNote}` : ''}`
      : `Opened via FMSG Agents (not auto-submitted)${analysis.notes ? ` — ${analysis.notes}` : ''}`;

    this.results.push({
      title: job.title,
      company: job.company,
      url: job.url,
      applied,
      skipped: !applied,
      reason: applied ? undefined : 'No confirmation was shown on the site',
    });

    await this.persistJobOutcome(job, summaryText);

    if (applied) {
      this.state.appliedCount += 1;
      if (this.billing) this.billing.consecutiveSuccess += 1;
      this.checkProgressiveTier();
      this.deductCredits(rateCents);
    } else {
      this.state.skippedCount += 1;
      this.refundCredits(rateCents);
      if (this.billing) this.billing.consecutiveSuccess = 0;
      this.checkProgressiveTier();
    }

    this.phase(
      'completed',
      `${this.state.appliedCount} of ${total} jobs completed`,
      applied
        ? `Submitted to ${trimText(job.company, 40)}`
        : 'Stopped short of a confirmed submission',
      job,
      index + 1,
      total
    );
    void MAX_MODEL_TURNS_PER_JOB;
  }

  private async persistJobOutcome(job: DiscoveredJob, summary: string) {
    const token = getActiveSessionAccessToken();
    const userId = getActiveSessionUser()?.id;
    if (!token || !userId || !job.url) return;

    try {
      const supabase = createAnonSupabaseClient(token);
      const { data: existing } = await supabase
        .from('saved_jobs')
        .select('id')
        .eq('user_id', userId)
        .eq('job_url', job.url)
        .maybeSingle();

      if (existing?.id) return;

      await supabase.from('saved_jobs').insert({
        user_id: userId,
        profile_id: this.searchProfile?.id ?? null,
        job_title: job.title || 'Untitled role',
        company: job.company || 'Unknown employer',
        location: job.location || '',
        estimated_salary: job.salary || '',
        match_score: job.matchScore ?? 0,
        match_summary: trimText(summary || job.reason || '', 500),
        job_url: job.url,
        full_spec: trimText(job.description, 4000),
        // Explicit status: a confirmed submission enters the tracker as
        // `applied`; anything prepared but not submitted needs review (RV-01).
        review_status: /^applied via fmsg agents/i.test(summary || '')
          ? 'applied'
          : 'needs_review',
      });
    } catch (err: any) {
      logEvent('agent_persist', 'saved_job_failed', { error: err?.message }, 'warn');
    }
  }

  async stop() {
    this.state.running = false;
    try {
      this.abort.abort();
    } catch {
      // ignore
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = undefined;
    }
  }
}
