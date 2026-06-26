import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs } from "@/lib/serpapi";
import { extractTextFromPDF } from "@/lib/pdf";
import { callAIWithFallback, lastAITier } from "@/lib/gemini";
import { StreamWriter, type SearchEvent } from "@/lib/search-stream";
import { debugLog } from "@/lib/debug";
import { checkRateLimit } from "@/lib/rate-limit";
import { broadenIndustry } from "@/data/industries";
import { broadenTitle, broadenTitleMax } from "@/data/titles";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const JINA_API_KEY = process.env.JINA_API_KEY;


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TIME_LIMIT_MS = 270_000; // 270s — stop pass 2 with 30s buffer before 300s Vercel timeout

// --- Domain trust tiers ---

const HIGH_TRUST_DOMAINS = [
  'linkedin.com',
  'indeed.co.za',
  'indeed.com',
  'careers24.com',
  'pnet.co.za',
];

const STANDARD_TRUST_DOMAINS: string[] = [];

const SHORT_SPEC_THRESHOLD = 500;

const RECRUITMENT_KEYWORDS = [
  'recruitment', 'recruiter', 'staffing', 'talent ', 'talent-',
  'placement', 'personnel', 'employment agency', 'manpower',
  'recruit', 'staffing solutions',
];

const BLOCKED_ATS_TRACKERS = [
  '#J-18808-Ljbffr',
];

const RECRUITMENT_SPEC_PATTERNS = [
  /is seeking\s+(a|an)\s+/i,
  /are looking for\s+(a|an)\s+/i,
  /on behalf of\s+(a|an\s+)?(client|company|organisation|organization)/i,
];

const BLACKLISTED_DOMAINS = [
  'bebee.com',
  'jobleads.com',
  'jobleads.co.za',
  'jobleads.co.uk',
  'jobleads.sg',
  'jobleads.ae',
  'jobleads.fr',
  'jobleads.it',
  'talent.com',
  'talent.co.za',
  'talent.co.uk',
  'talent.ca',
  'talent.au',
];

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function decodeGoogleRedirect(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('google')) {
      for (const param of ['q', 'url', 'adurl', 'dest', 'continue', 'redirect']) {
        const val = u.searchParams.get(param);
        if (val && (val.startsWith('http://') || val.startsWith('https://'))) return val;
      }
    }
  } catch {}
  return url;
}

function isBlacklistedByVia(via: string | undefined): boolean {
  if (!via) return false;
  const lower = via.toLowerCase();
  return BLACKLISTED_DOMAINS.some(d => {
    const name = d.replace(/\..+$/, "");
    return lower.includes(name);
  });
}

function parsePostedAt(posted?: string): number | null {
  if (!posted) return null;
  const val = posted.toLowerCase().replace(/^a[n]?\s+/, "1 ").replace(/^just posted$/, "0 days ago").replace(/\+/, "");
  const num = parseInt(val.match(/\d+/)?.[0] ?? "", 10);
  if (isNaN(num)) return null;
  const ms = val.includes("month") ? num * 30 : val.includes("week") ? num * 7 : val.includes("year") ? num * 365 : num;
  return Date.now() - ms * 24 * 60 * 60 * 1000;
}

const EXPIRED_PATTERNS = [
  "no longer accepting applications",
  "no longer accepting",
  "this position has been filled",
  "position has been filled",
  "job has been closed",
  "this job has been closed",
  "this job posting has been closed",
  "is no longer available",
  "position is no longer available",
  "this position is no longer",
  "we are no longer accepting",
  "application deadline has passed",
  "deadline has passed",
  "this posting is expired",
  "job expired",
  "this job is expired",
  "position is closed",
  "this position is closed",
  "this job posting is expired",
  "job posting is no longer active",
  "position has been cancelled",
  "has been cancelled",
  "no longer hiring for this",
  "not currently accepting applications",
  "is no longer accepting new applications",
];

function isExpired(text: string): boolean {
  const lower = text.toLowerCase();
  return EXPIRED_PATTERNS.some((p) => lower.includes(p));
}

function isDomainVerified(url: string, postedAt?: string): { verified: boolean; reason?: string } {
  const domain = extractDomain(url);
  if (!domain) return { verified: false, reason: "no_domain" };

  if (BLACKLISTED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { verified: false, reason: "blacklisted_domain" };
  }

  if (HIGH_TRUST_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    if (postedAt) {
      const posted = new Date(postedAt).getTime();
      const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
      if (isNaN(posted) || posted < cutoff) {
        return { verified: false, reason: "stale_high_trust" };
      }
    }
    return { verified: true };
  }

  if (STANDARD_TRUST_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    if (postedAt) {
      const posted = new Date(postedAt).getTime();
      const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
      if (isNaN(posted) || posted < cutoff) {
        return { verified: false, reason: "stale_standard_trust" };
      }
    }
    return { verified: true };
  }

  return { verified: false, reason: "untrusted_domain" };
}

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

interface JobRow {
  user_id: string;
  search_id: string;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  match_summary: string;
  verdict_bullets: { industry: string; function: string; competition: string } | null;
  job_url: string;
  full_spec: string;
  search_query: string;
  domain_verified: boolean;
  domain_unverified_reason: string;
  posted_at: string;
  posted_at_ms: number;
  suggested_cv: string;
  knockout_fail: boolean | null;
  pillar_scores: { industry: number; function: number; scale: number; tools: number; location: number } | null;
  taxes_applied: string[] | null;
  total_questions_asked: number | null;
  yes_answers: number | null;
  recruiter_verdict: string | null;
}

function normalize(r: any) {
  return { id: r.id ?? crypto.randomUUID(), ...r, full_description: r.full_spec ?? "" };
}

function buildJobUrl(job: {
  apply_options?: { link: string; title: string }[];
  job_highlights?: { link?: string };
  link?: string;
  via?: string;
  title: string;
  company_name: string;
}): string {
  const tryDecode = (u: string) => decodeGoogleRedirect(u);
  if (job.apply_options?.[0]?.link) return tryDecode(job.apply_options[0].link);
  if (job.job_highlights?.link) return tryDecode(job.job_highlights.link);
  if (job.link) return tryDecode(job.link);
  return `https://www.google.com/search?q=${encodeURIComponent(`${job.title} ${job.company_name} apply`)}`;
}

/** JSON response_format wraps arrays in objects. Unwrap by finding the first array value. */
function unwrapArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") {
    const found = Object.values(val as Record<string, unknown>).find(v => Array.isArray(v));
    if (found) return found as unknown[];
  }
  return [];
}

const sanitiseForJson = (s: string | undefined | null): string =>
  (s ?? "").replace(/["\n\r\t]/g, " ").replace(/\s+/g, " ").trim();

function buildOrQuery(titles: string[]): string {
  const clean = titles.map(t => t.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  return clean
    .map(t => t.includes(" ") ? `"${t}"*` : `${t}*`)
    .join(" OR ");
}

async function deduplicateTitles(titles: string[]): Promise<string[]> {
  if (titles.length <= 1) return titles;
  try {
    const result = await callAIWithFallback(
      `You are a job title analyst. Remove redundant/duplicate job titles.
For example: ["Project Manager","Senior Project Manager","Project Manager II"]
→ ["Project Manager"]. Keep the broadest, most inclusive title per group.
Return ONLY a JSON array of strings with no duplicates. No explanation.`,
      `Job titles: ${JSON.stringify(titles)}`,
      "title dedup",
      { responseMimeType: "application/json", temperature: 0.3 }
    );
    const parsed = JSON.parse(result);
    const cleaned = unwrapArray(parsed) as string[];
    return cleaned.length > 0 ? cleaned : titles;
  } catch {
    return titles;
  }
}

async function fetchAndFilterJobs(
  query: string,
  profileLocation: string,
  user: any,
  searchId: string,
  bannedJobs: string[],
  bannedCompanies: string[],
  dataClient: any,
  onStatus?: (event: SearchEvent) => void,
  pfRound?: number,
  hiddenJobKeys?: Set<string>,
): Promise<{ rawJobs: any[]; jobSpecs: [number, string][]; jobUrls: [number, string][]; queryUsed: string }> {
  function sanitiseLocation(raw: string): string | undefined {
    if (!raw) return undefined;
    const stripped = raw.replace(/\b(Remote|Hybrid|On-site|Online|Work from home|WFH|Flexible|Anywhere)\b/gi, "").trim();
    const cleaned = stripped.replace(/^[\s,;/-]+|[\s,;/-]+$/g, "").replace(/[\s,;/-]+/g, " ");
    if (!cleaned || cleaned.length < 2) return undefined;
    return cleaned;
  }

  const sanitisedLocation = sanitiseLocation(profileLocation);
  const buildSerpParams = (location?: string) => ({
    q: query,
    location: location,
    hl: "en" as const,
    gl: "za" as const,
  });

  const serpParams = buildSerpParams(sanitisedLocation);

  let rawJobs: Awaited<ReturnType<typeof searchGoogleJobs>>;
  try {
    rawJobs = await searchGoogleJobs(serpParams);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("(400)")) {
      try {
        rawJobs = await searchGoogleJobs(buildSerpParams(undefined));
      } catch {
        return { rawJobs: [], jobSpecs: [], jobUrls: [], queryUsed: query };
      }
    } else {
      return { rawJobs: [], jobSpecs: [], jobUrls: [], queryUsed: query };
    }
  }
  if (!rawJobs || rawJobs.length === 0) {
    return { rawJobs: [], jobSpecs: [], jobUrls: [], queryUsed: query };
  }

  onStatus?.({ type: "found_results", count: rawJobs.length, progress: 20 });

  for (const j of rawJobs) {
    const destUrl = j.apply_options?.[0]?.link
      ? decodeGoogleRedirect(j.apply_options[0].link)
      : buildJobUrl(j);
    const postedStr = (j as any).detected_extensions?.posted_at ?? (j as any).posted_at ?? "";
    const result = isDomainVerified(destUrl, postedStr);
    (j as any)._domainVerified = result.verified;
    (j as any)._domainReason = result.verified
      ? ""
      : result.reason === "untrusted_domain"
        ? `untrusted_domain: ${extractDomain(destUrl)}`
        : result.reason;
    (j as any)._postedAt = postedStr;
    (j as any)._postedAtMs = parsePostedAt(postedStr) ?? 0;
  }

  const blacklistRejected: { job: any; reason: string }[] = [];
  rawJobs = rawJobs.filter((j) => {
    const url = buildJobUrl(j);
    const domain = extractDomain(url);
    const viaBlocked = isBlacklistedByVia(j.via);
    const domainBlocked = domain && BLACKLISTED_DOMAINS.some((d) => domain === d || domain?.endsWith(`.${d}`) || domain?.includes(d));
    if (domainBlocked || viaBlocked) {
      blacklistRejected.push({ job: j, reason: viaBlocked ? `blacklisted_via: ${j.via}` : `blacklisted_domain: ${domain}` });
      return false;
    }
    return true;
  });
  if (blacklistRejected.length > 0) {
    const rows = blacklistRejected.map(({ job: j, reason }) => ({
      user_id: user.id, search_id: searchId, search_query: query,
      job_title: j.title, company: j.company_name, location: j.location ?? '',
      snippet: (j.description ?? '').slice(0, 500), job_url: buildJobUrl(j), reason,
      rejection_category: 'domain', rejection_reason: reason,
      passed_domain_filter: false, passed_banned_filter: false,
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && debugLog('[SEARCH] Failed to log blacklist rejected:', r.error));
  }

  const bannedRejected: any[] = [];
  rawJobs = rawJobs.filter((j) => {
    const url = buildJobUrl(j);
    if (url && bannedJobs.includes(url)) { bannedRejected.push(j); return false; }
    const companyLower = (j.company_name ?? "").toLowerCase();
    if (bannedCompanies.some((bc) => companyLower.includes(bc.toLowerCase()))) { bannedRejected.push(j); return false; }
    const jobKey = `${j.title ?? ''}|${j.company_name ?? ''}`.toLowerCase().trim();
    if (jobKey && hiddenJobKeys?.has(jobKey)) { bannedRejected.push(j); return false; }
    return true;
  });
  if (bannedRejected.length > 0) {
    const rows = bannedRejected.map(j => ({
      user_id: user.id, search_id: searchId, search_query: query,
      job_title: j.title, company: j.company_name, location: j.location ?? '',
      snippet: (j.description ?? '').slice(0, 500), job_url: buildJobUrl(j),
      reason: `banned_${bannedJobs.includes(buildJobUrl(j)) ? 'job' : 'company'}`,
      rejection_category: 'banned', rejection_reason: bannedJobs.includes(buildJobUrl(j)) ? 'banned_job' : 'banned_company',
      passed_domain_filter: true, passed_banned_filter: false,
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && debugLog('[SEARCH] Failed to log banned rejected:', r.error));
  }

  rawJobs = rawJobs.filter((j) => !(j.description && isExpired(j.description)));
  if (rawJobs.length === 0) return { rawJobs: [], jobSpecs: [], jobUrls: [], queryUsed: query };

  rawJobs = rawJobs.filter((j) => !(j.description && BLOCKED_ATS_TRACKERS.some(t => j.description!.includes(t))));
  if (rawJobs.length === 0) return { rawJobs: [], jobSpecs: [], jobUrls: [], queryUsed: query };

  const tempJobUrls = new Map<number, string>();
  const tempJobSpecs = new Map<number, string>();
  for (let i = 0; i < rawJobs.length; i++) {
    const job = rawJobs[i];
    const jobUrl = buildJobUrl(job);
    tempJobUrls.set(i, jobUrl);
    let specText = job.description ?? "";
    if (jobUrl) {
      try {
        const headers: Record<string, string> = {};
        if (JINA_API_KEY) headers["Authorization"] = `Bearer ${JINA_API_KEY}`;
        const jinaRes = await fetch(`https://r.jina.ai/${encodeURIComponent(jobUrl)}`, { headers });
        if (jinaRes.ok) specText = await jinaRes.text();
      } catch {}
    }
    tempJobSpecs.set(i, specText || job.description || "");
    if (specText && isExpired(specText)) (job as any)._expired = true;
  }

  const preFilterUrls = new Map(tempJobUrls);
  const preFilterSpecs = new Map(tempJobSpecs);
  rawJobs = rawJobs.filter((j) => !(j as any)._expired);
  const rebuiltUrls = new Map(rawJobs.map((j, i) => [i, buildJobUrl(j)] as const));
  const rebuiltSpecs = new Map<number, string>();
  for (let i = 0; i < rawJobs.length; i++) {
    const url = rebuiltUrls.get(i) ?? "";
    const origEntry = [...preFilterSpecs.entries()].find(([origIdx]) => preFilterUrls.get(origIdx) === url);
    rebuiltSpecs.set(i, origEntry?.[1] ?? rawJobs[i].description ?? "");
  }

  {
    const filtered: typeof rawJobs = [];
    const filteredSpecs = new Map<number, string>();
    const filteredUrls = new Map<number, string>();
    rawJobs.forEach((j, i) => {
      const spec = rebuiltSpecs.get(i) ?? "";
      if (BLOCKED_ATS_TRACKERS.some(t => spec.includes(t))) return;
      if (spec.length >= SHORT_SPEC_THRESHOLD) {
        const newIdx = filtered.length;
        filtered.push(j); filteredSpecs.set(newIdx, spec); filteredUrls.set(newIdx, buildJobUrl(j));
        return;
      }
      const companyLower = (j.company_name ?? "").toLowerCase();
      const isRecruitmentAgency = RECRUITMENT_KEYWORDS.some(kw => companyLower.includes(kw))
        || RECRUITMENT_SPEC_PATTERNS.some(p => p.test(spec.slice(0, 500)));
      if (!isRecruitmentAgency) {
        const newIdx = filtered.length;
        filtered.push(j); filteredSpecs.set(newIdx, spec); filteredUrls.set(newIdx, buildJobUrl(j));
      }
    });
    rawJobs = filtered;
    return { rawJobs, jobSpecs: [...filteredSpecs.entries()], jobUrls: [...filteredUrls.entries()], queryUsed: query };
  }
}

async function screenAndAnalyze(
  rawJobs: any[],
  jobSpecsEntries: [number, string][],
  jobUrlsEntries: [number, string][],
  query: string,
  profileLocation: string,
  profileIndustry: string,
  titles: string[],
  cvTexts: { name: string; text: string }[],
  user: any,
  searchId: string,
  dataClient: any,
  bannedJobs: string[],
  bannedCompanies: string[],
  onStatus?: (event: SearchEvent) => void,
  pfRound?: number,
  dedupSets?: { history: Set<string>; saved: Set<string>; blocked: Set<string>; rejected?: Set<string> },
  startTime?: number,
): Promise<{ results: JobRow[]; queryUsed: string; filteredCounts: { history: number; saved: number; rejected: number; blocked: number }; timedOut?: boolean }> {
  const filteredCounts = { history: 0, saved: 0, rejected: 0, blocked: 0 };
  const aiRejectedJobs: { job: any; reason: string; stage: string }[] = [];
  const jobSpecs = new Map(jobSpecsEntries);
  const jobUrls = new Map(jobUrlsEntries);

  const profileContext = JSON.stringify({
    job_titles: titles,
    location: profileLocation || null,
    industry: profileIndustry || null,
    cv_texts: cvTexts.length > 0
      ? cvTexts.map(cv => ({ name: cv.name, text: cv.text }))
      : [{ name: "No CV", text: "No CV provided" }],
  });

  const batchInput = rawJobs.map((j, i) => ({
    index: i,
    job_title: sanitiseForJson(j.title),
    company: sanitiseForJson(j.company_name),
    location: sanitiseForJson(j.location),
    description_snippet: sanitiseForJson(j.description ?? ""),
    url: jobUrls.get(i) || "",
  }));

  const blacklistInfo = `BLACKLISTED_DOMAINS: ${BLACKLISTED_DOMAINS.join(", ")}`;
  const bannedInfo = bannedCompanies.length > 0 ? `\nUSER-BANNED COMPANIES: ${bannedCompanies.join(", ")}` : "";

  const batchSystemPrompt = `You are a Recruitment Auditor AI screening job matches. Score each job against the candidate's profile and CV.

CANDIDATE INDUSTRY: ${profileIndustry || "Unknown"}

SCORING:
- 0–30: Total mismatch in industry, sector, or core capabilities.
- 31–59: Some transferable skills but significant gaps in industry nuance or scale.
- 60–74: Good foundation but lacks a critical requirement direct competitors will have.
- 75–100: Exceptional match — direct industry alignment, matching functional scale.

INDUSTRY MATCH RULES:
- If the job's industry is clearly different from the candidate's industry (e.g. Healthcare vs Construction, Education vs Fintech), the score MUST NOT exceed 30.
- Understand that functions like HR, IT, Admin, Finance, or Project Management can span multiple industries — in those cases, assess normally.

RULES:
- Judge transferable skills and career trajectory, not keywords.
- Reference specifics from the CV and job description.

Return ONLY a JSON array of objects. No markdown, no explanation, no code fences.
Each object: { "index": number, "score": number (0-100), "reason": string, "estimated_salary": string }

${blacklistInfo}${bannedInfo}`;

  let batchResults: { index: number; score: number; reason: string; estimated_salary: string }[] = [];

  let rawPass1 = "";
  try {
    debugLog(`[SEARCH] Starting Pass 1 batch (${rawJobs.length} jobs)`);
    rawPass1 = await callAIWithFallback(
      batchSystemPrompt,
      `Candidate Profile:\n${profileContext}\n\nJobs:\n${JSON.stringify(batchInput, null, 2)}`,
      `search pass 1${pfRound ? ` (PF round ${pfRound})` : ""}`,
      { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 8192 }
    );
    const parsedPass1 = JSON.parse(rawPass1);
    const unwrappedPass1 = unwrapArray(parsedPass1);
    if (!Array.isArray(unwrappedPass1) || unwrappedPass1.length === 0) {
      debugLog(`[SEARCH] Pass 1 batch returned empty/unexpected format, falling back to individual`);
      throw new Error("batch empty");
    }
    batchResults = unwrappedPass1 as { index: number; score: number; reason: string; estimated_salary: string }[];
    debugLog(`[SEARCH] Pass 1 batch succeeded via ${lastAITier} (${batchResults.length} results)`);
  } catch {
    debugLog(`[SEARCH] Pass 1 batch failed, falling back to individual (${rawJobs.length} jobs)`);
    for (let i = 0; i < rawJobs.length; i++) {
      const job = rawJobs[i];
      const progress = Math.min(20 + ((i + 1) / rawJobs.length) * 35, 55);
      onStatus?.({ type: "screening_job", current: i + 1, total: rawJobs.length, progress });
    if (i > 0) await sleep(lastAITier === "gemini" ? 20000 : 2000);
      const singlePrompt = `You are a Recruitment Auditor AI scoring a single job match.

CANDIDATE INDUSTRY: ${profileIndustry || "Unknown"}

SCORING:
- 0–30: Total mismatch in industry, sector, or core capabilities.
- 31–59: Some transferable skills but significant gaps.
- 60–74: Good foundation but lacks a critical requirement.
- 75–100: Exceptional match — direct alignment.

INDUSTRY MATCH RULES:
- If the job's industry is clearly different from the candidate's industry (e.g. Healthcare vs Construction), the score MUST NOT exceed 30.
- Understand that functions like HR, IT, Admin, Finance, or Project Management can span multiple industries — in those cases, assess normally.

RULES:
- Judge transferable skills, not keywords.

Return ONLY valid JSON (no markdown, no code fences):
{ "score": number (0-100), "reason": string, "estimated_salary": string }`;
      try {
        const rawSingle = await callAIWithFallback(
          singlePrompt,
          `Candidate Profile:\n${profileContext}\n\nJob:\n${JSON.stringify(batchInput[i], null, 2)}`,
          `search pass 1 individual${pfRound ? ` (PF round ${pfRound})` : ""}`,
          { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1024 }
        );
        const parsed = JSON.parse(rawSingle);
        batchResults.push({ index: i, score: Math.round(parsed.score), reason: parsed.reason, estimated_salary: parsed.estimated_salary });
      } catch {
        batchResults.push({ index: i, score: 30, reason: "Screening unavailable", estimated_salary: "" });
      }
    }
  }

  debugLog(`[SEARCH] Starting Pass 2 deep analysis (${rawJobs.length} jobs)`);
  let outputs: JobRow[] = [];
  let timedOut = false;
  for (let i = 0; i < rawJobs.length; i++) {
    // Time check before each AI call — leave 30s buffer
    if (startTime && Date.now() - startTime > TIME_LIMIT_MS) {
      debugLog(`[SEARCH] Time limit reached after ${i}/${rawJobs.length} jobs — sending partial results`);
      timedOut = true;
      debugLog(`[SEARCH] Time limit hit — ${outputs.length}/${rawJobs.length} jobs analyzed, saving partial results`);
      break;
    }

    const job = rawJobs[i];
    const batchResult = batchResults.find((r) => r.index === i);
    const jobUrl = jobUrls.get(i) || buildJobUrl(job);
    const fullSpec = jobSpecs.get(i) || job.description || "";

    const progress = Math.min(55 + ((i + 1) / rawJobs.length) * 30, 85);
    onStatus?.({ type: "analyzing_job", title: job.title, company: job.company_name, current: i + 1, total: rawJobs.length, progress });

    if (i > 0) await sleep(lastAITier === "gemini" ? 6000 : 1000);

    const deepSystemPrompt = `You are a strict, budget-conscious Recruitment Auditor acting as a hiring manager.
You have reviewed 100+ CVs for this role. 30% of applicants are perfect direct matches.
Your goal is to protect the company from a bad hire.
You are looking for reasons to say NO, not reasons to say YES.

You MUST follow this exact thinking process step-by-step. Perform all calculations internally, then output ONLY the final JSON object. Do not output your reasoning, markdown, or code fences.

---
INTERNAL THINKING CHECKLIST (Execute these steps strictly):

STEP 0: SUB-VERTICAL IDENTIFICATION & CV SELECTION
Before any scoring, execute all three of these:

A) Identify the candidate's specific professional sub-vertical, NOT their macro industry.
Examples:
- NOT "Healthcare" -> "Pharmaceutical Sales Representative"
- NOT "Financial Services" -> "FinTech Payments Account Management"
- NOT "Digital Marketing" -> "Paid Media Performance Specialist"
- NOT "Technology" -> "SaaS B2B Enterprise Sales"

B) Identify the job's specific sub-vertical using the same logic.

C) Select the CV variation whose day-to-day responsibilities and functional content most closely match the role's core duties. Do NOT select based on title keyword similarity.
A CV titled "Clinical Research" should NOT be selected for a sales role simply because the job description contains the word "clinical." A CV titled "Paid Media" should NOT be selected for a listings management or coordinator role simply because the job title says "Marketing Specialist."
You MUST select suggested_cv_name from the exact CV filenames provided in the input.
Do not generate, infer, or construct a filename. If only one CV is provided, return that filename.

STEP 1: EXPLODE THE JOB DESCRIPTION INTO ATOMIC YES/NO QUESTIONS
Read the job description line-by-line. For EVERY requirement, preference, or nice-to-have, break it down into the smallest possible Yes/No questions.

CRITICAL RULE: Split compound requirements into multiple questions.
Example: "7 years of experience required in sales in the Gas industry"
-> Does the user have 7+ years in the Gas industry? [Yes/No]
-> Does the user have 7+ years in sales? [Yes/No]
-> Does the user have 7+ years of total experience? [Yes/No]

List ALL questions and answer each with Yes or No based strictly on the CV.

STEP 2: CHECK MANDATORY KNOCKOUTS (Binary Kill-Switch)
Explicitly check these 4 knockout questions. If ANY answer is "NO", immediately trigger KNOCKOUT.
- Does the user meet the mandatory degree requirement? [Yes/No]
- Does the user meet the mandatory license/cert requirement (e.g., Driver's, Passport)? [Yes/No]
- Does the user meet the mandatory language requirement? [Yes/No]
- Does the user meet the mandatory vertical tenure requirement (8+ years in that specific sub-vertical)? [Yes/No]

CRITICAL — SUB-VERTICAL KNOCKOUT RULE:
Apply the sub-verticals identified in Step 0 when evaluating the tenure knockout. Do NOT use macro industry labels. Examples:
- A Pharmaceutical Sales Representative is NOT a match for a practicing clinician or Gastroenterologist role, even though both sit under "Healthcare."
- A FinTech Payments Account Manager is NOT a match for a DG/Fuel/Logistics Commercial Manager role, even though both sit under "Commercial."
- A Digital Marketing Generalist is NOT a match for an App Marketing / ASO Specialist role, even though both sit under "Digital Marketing."
Sub-vertical mismatch at this level triggers the tenure knockout.

IMPORTANT: Related or equivalent degrees count as meeting the requirement (e.g., BA Economics meets BCom requirement, BEng meets BSc requirement).

IF KNOCKOUT TRIGGERED -> STOP. Set final_score = 25. SKIP to Step 6.

STEP 3: CATEGORIZE QUESTIONS INTO 5 PILLARS & CALCULATE SCORES
Group all questions from Step 1 into these 5 categories. For each pillar, calculate:
Pillar_Score = (Number of "Yes" answers / Total questions in that pillar) * 100

Pillar 1 - Industry Vertical (Weight 25%)
Group: Questions about macro-sector, sub-vertical, target market, regulatory environment.
Score = [0-100]

Pillar 2 - Functional Discipline (Weight 30%)
Group: Questions about daily tasks, sales motion (Hunter/Farmer/Channel), role archetype.
Score = [0-100]

Pillar 3 - Experience Depth & Scale (Weight 20%)
Group: Questions about years of experience, deal size, team size, stakeholder level.
Score = [0-100]

Pillar 4 - Technical & Tool Competencies (Weight 15%)
Group: Questions about specific tools, methodologies, platforms.
Score = [0-100]

Pillar 5 - Location & Mobility (Weight 10%)
Group: Questions about geography, travel, work setup (Remote/Hybrid/On-site).
Score = [0-100]

LOCATION SCORING GUIDE (apply strictly):
- Same city OR role is remote/hybrid with no location restriction = 100
- Different city, same province = 70
- Different province, no relocation stated on CV = 30
- Different country, no relocation stated on CV = 0
- If CV explicitly states willingness to relocate, apply the next tier up.

STEP 4: APPLY RECRUITER TAXES (Strict Deductions)
Check these taxes and deduct points if triggered. Be ruthless.

Hopper Tax (-15):
Triggered IF 3+ jobs in last 5 years AND avg tenure < 18 months.
EXCEPTION: Self-employed, freelance, and Founder tenures are treated as a single continuous period regardless of named clients or individual engagements within that block. Do not count short stints or contract clients inside a declared self-employed or Founder period as separate jobs when calculating Hopper Tax. Only count formal employment roles as separate jobs.

Overqualified Tax (-10):
Triggered IF current title is significantly more senior than JD title.

Vague Achievement Tax (-10):
Triggered IF CV has fewer than 3 specific dollar or percentage figures.

No Degree Tax (-10):
Triggered IF JD mentions a degree AND CV has none.

Salary Mismatch Tax (-10):
Triggered IF JD max salary is below 70% of CV's implied market rate.
SUB-STEP (mandatory): Before checking this tax, explicitly state the candidate's implied monthly market rate based on their most recent role title, seniority level, and years of experience. Then compare that rate against the JD's stated maximum salary. If JD max is below 70% of the implied rate, apply the tax.

STEP 5: CALCULATE FINAL SCORE (Do the Math)
Core_Raw = (Industry_Score * 0.25) + (Function_Score * 0.30) + (Scale_Score * 0.20) + (Tools_Score * 0.15) + (Location_Score * 0.10)
Core_Score = Core_Raw * 0.95  (Apply 5% Competition Penalty)
Total_Taxes = Sum of all tax deductions applied.
Final_Score = Core_Score - Total_Taxes
Final_Score = Max(0, Min(95, Final_Score))  (Cap between 0 and 95)

STEP 6: RECRUITER VERDICT
- IF Final_Score >= 75: "HIRE"
- IF Final_Score >= 60 AND < 75: "INTERVIEW"
- IF Final_Score < 60: "REJECT"

---
OUTPUT BLOCK (Strict JSON - No Markdown, No Extra Text)
{
  "score": number (integer 0-95),
  "knockout_fail": boolean,
  "suggested_cv_name": string (exact filename from provided CV list only),
  "pillar_scores": { "industry": number, "function": number, "scale": number, "tools": number, "location": number },
  "taxes_applied": [string],
  "total_questions_asked": number,
  "yes_answers": number,
  "recruiter_verdict": "HIRE" | "INTERVIEW" | "REJECT"
}`;

    try {
      const raw = await callAIWithFallback(
        deepSystemPrompt,
        `Candidate Profile:\n${profileContext}\n\nFull Job Specification:\n${fullSpec}\n\nJob Title: ${job.title}\nCompany: ${job.company_name}\nLocation: ${job.location}`,
        `search pass 2${pfRound ? ` (PF round ${pfRound})` : ""}: ${job.title} at ${job.company_name}`,
        { responseMimeType: "application/json", temperature: 0.1 }
      );
      const deepResult = JSON.parse(raw);

      const questions = deepResult.total_questions_asked ?? 0;
      const yes = deepResult.yes_answers ?? 0;
      const verdict = deepResult.recruiter_verdict ?? (deepResult.score >= 75 ? "HIRE" : deepResult.score >= 60 ? "INTERVIEW" : "REJECT");
      const autoSummary = `Verdict: ${verdict}, met ${yes} of ${questions} requirements.${deepResult.taxes_applied?.length ? " Taxes: " + deepResult.taxes_applied.join(", ") + "." : ""}`;

      outputs.push({
        user_id: user.id,
        search_id: searchId,
        job_title: job.title,
        company: job.company_name,
        location: job.location,
        estimated_salary: deepResult.estimated_salary || batchResult?.estimated_salary || "",
        match_score: Math.round(deepResult.score),
        match_summary: autoSummary,
        verdict_bullets: deepResult.bullet_points || null,
        job_url: jobUrl,
        full_spec: fullSpec,
        search_query: query,
        domain_verified: (job as any)._domainVerified ?? true,
        domain_unverified_reason: (job as any)._domainReason ?? "",
        posted_at: (job as any)._postedAt ?? "",
        posted_at_ms: (job as any)._postedAtMs ?? 0,
        suggested_cv: deepResult.suggested_cv_name || "",
        knockout_fail: deepResult.knockout_fail ?? null,
        pillar_scores: deepResult.pillar_scores ?? null,
        taxes_applied: deepResult.taxes_applied ?? null,
        total_questions_asked: questions > 0 ? questions : null,
        yes_answers: yes > 0 ? yes : null,
        recruiter_verdict: verdict,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      debugLog(`[AI] Pass 2 failed for "${job.title}" at ${job.company_name}: ${errMsg.slice(0, 150)}`);
      let fallbackScore = batchResult?.score != null ? Math.round(batchResult.score) : 30;
      let fallbackSummary = batchResult?.reason || "Analysis unavailable";
      let fallbackSalary = batchResult?.estimated_salary || "";
      try {
        const retryPrompt = `You are a Recruitment Auditor AI. Score this job match for the candidate using a simplified formula.

Identify the candidate's specific sub-vertical (NOT macro industry) and the job's sub-vertical. Select the CV variation whose functional content best matches the role's core duties (use exact filename from input).

Evaluate across 5 pillars (each 0-100): Industry (25%), Function (30%), Scale (20%), Tools (15%), Location (10%).
Location guide: same city/remote=100, same province=70, different province=30, different country=0.
Then apply deductions: Hopper Tax (-15, exempt self-employed/freelance blocks), Overqualified Tax (-10), Vague Achievement Tax (-10), No Degree Tax (-10), Salary Mismatch Tax (-10).
Final Score = sum(weighted pillars) * 0.95 - total taxes. Cap at 0-95.
Knockout (score=25) if mandatory degree, license, language, or sub-vertical tenure requirement is unmet.

Return ONLY valid JSON (no markdown, no code fences):
{ "score": number (integer 0-95), "knockout_fail": boolean, "suggested_cv_name": string, "pillar_scores": { "industry": number, "function": number, "scale": number, "tools": number, "location": number }, "taxes_applied": [string], "total_questions_asked": number, "yes_answers": number, "recruiter_verdict": "HIRE"|"INTERVIEW"|"REJECT" }`;
        const retryRaw = await callAIWithFallback(
          retryPrompt,
          `Candidate Profile:\n${profileContext}\n\nFull Job Specification:\n${fullSpec}\n\nJob Title: ${job.title}\nCompany: ${job.company_name}\nLocation: ${job.location}`,
          `search pass 2 retry${pfRound ? ` (PF round ${pfRound})` : ""}: ${job.title} at ${job.company_name}`,
          { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1024 }
        );
        const retryResult = JSON.parse(retryRaw);
        fallbackScore = retryResult.score != null ? Math.round(retryResult.score) : fallbackScore;
        fallbackSummary = retryResult.recruiter_verdict
          ? `Verdict: ${retryResult.recruiter_verdict}, met ${retryResult.yes_answers ?? "?"} of ${retryResult.total_questions_asked ?? "?"} requirements.`
          : (retryResult.match_summary || fallbackSummary);
        fallbackSalary = retryResult.estimated_salary || fallbackSalary;
        debugLog(`[AI] Pass 2 retry succeeded for "${job.title}" at ${job.company_name}`);
      } catch {
        debugLog(`[AI] Pass 2 retry also failed for "${job.title}" at ${job.company_name}, using Pass 1 fallback`);
      }
      outputs.push({
        user_id: user.id,
        search_id: searchId,
        job_title: job.title,
        company: job.company_name,
        location: job.location,
        estimated_salary: fallbackSalary,
        match_score: fallbackScore,
        match_summary: fallbackSummary,
        verdict_bullets: null,
        job_url: jobUrl,
        full_spec: fullSpec,
        search_query: query,
        domain_verified: (job as any)._domainVerified ?? true,
        domain_unverified_reason: (job as any)._domainReason ?? "",
        posted_at: (job as any)._postedAt ?? "",
        posted_at_ms: (job as any)._postedAtMs ?? 0,
        suggested_cv: "",
        knockout_fail: null,
        pillar_scores: null,
        taxes_applied: null,
        total_questions_asked: null,
        yes_answers: null,
        recruiter_verdict: null,
      });
    }

    // Incremental save: insert each result as it's analyzed
    const lastResult = outputs[outputs.length - 1];
    if (lastResult) {
      const row = {
        id: crypto.randomUUID(), user_id: lastResult.user_id, search_id: lastResult.search_id, profile_id: null,
        job_title: lastResult.job_title, company: lastResult.company, location: lastResult.location,
        estimated_salary: lastResult.estimated_salary, match_score: lastResult.match_score,
        match_summary: lastResult.match_summary, job_url: lastResult.job_url, full_spec: lastResult.full_spec,
        search_query: lastResult.search_query, domain_verified: lastResult.domain_verified,
        domain_unverified_reason: lastResult.domain_unverified_reason, posted_at: lastResult.posted_at,
        suggested_cv: lastResult.suggested_cv, verdict_bullets: lastResult.verdict_bullets,
        knockout_fail: lastResult.knockout_fail, pillar_scores: lastResult.pillar_scores,
        taxes_applied: lastResult.taxes_applied, total_questions_asked: lastResult.total_questions_asked,
        yes_answers: lastResult.yes_answers, recruiter_verdict: lastResult.recruiter_verdict,
      };
      dataClient.from("job_results").insert(row).then(({ error }: any) => {
        if (error) console.error("[SEARCH] Failed to insert incremental result:", error.message);
      });
    }
  }

  if (aiRejectedJobs.length > 0) {
    const rows = aiRejectedJobs.map(({ job, reason, stage }) => ({
      user_id: user.id, search_id: searchId, search_query: query,
      job_title: job.title, company: job.company_name, location: job.location ?? '',
      snippet: (job.description ?? '').slice(0, 500), job_url: buildJobUrl(job),
      reason: `ai_${stage}: ${reason}`,
      rejection_category: 'ai', rejection_reason: `${stage}: ${reason}`,
      passed_domain_filter: true, passed_banned_filter: true,
      passed_pass1: stage !== "pass1", passed_pass2: stage === "pass2",
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && debugLog('[SEARCH] Failed to log AI rejected:', r.error));
  }

  if (dedupSets) {
    const allExisting = new Set([...dedupSets.history, ...dedupSets.saved, ...dedupSets.blocked, ...(dedupSets.rejected ?? [])]);
    if (allExisting.size > 0) {
      const deduped: JobRow[] = [];
      for (const r of outputs) {
        if (allExisting.has(r.job_url)) {
          if (dedupSets.history.has(r.job_url)) filteredCounts.history++;
          else if (dedupSets.saved.has(r.job_url)) filteredCounts.saved++;
          else if (dedupSets.blocked.has(r.job_url)) filteredCounts.blocked++;
        } else {
          deduped.push(r);
        }
      }
      outputs = deduped;
    }
  }

  if (!timedOut) {
    onStatus?.({ type: "almost_done", progress: 90 });
  }

  return { results: outputs, queryUsed: query, filteredCounts, timedOut };
}

function insertJobRows(dataClient: any, rows: any[]) {
  if (rows.length === 0) return;
  dataClient.from("job_results").insert(rows).then(({ error }: any) => {
    if (error) console.error("[SEARCH] Failed to insert job results:", error.message);
  });
}


export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const searchId = crypto.randomUUID();
  try {
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = checkRateLimit(`search:${user.id}`, "search");
    if (!rl.allowed) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: `Too many searches. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.` },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();
    const { query, profile_id, pf_mode, continuation } = body;
    const isContinuation = !!continuation;

    if (!isContinuation) {
      if (!query && !pf_mode) {
        return NextResponse.json({ error: "SEARCH_001" }, { status: 400 });
      }
      debugLog(`[SEARCH] Search started at: ${new Date().toISOString()}`);
      debugLog(`[SEARCH] Query: ${query ?? "(pf_mode)"}, PF mode: ${pf_mode}, Profile: ${profile_id}`);
    } else {
      debugLog(`[SEARCH] Continue at: ${new Date().toISOString()}`);
    }

    const userEmail = user.email ?? "";

    // Create data client
    const dataClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${authHeader}` } },
        auth: { persistSession: false },
      }
    );

    let state: any = {};

    if (isContinuation) {
      // Decode continuation state
      state = JSON.parse(Buffer.from(continuation, "base64").toString());
    } else {
      // Get profile
      const { data: profile, error: profileErr } = await dataClient
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr || !profile) {
        return NextResponse.json({ error: "PROFILE_NOT_FOUND", message: "Please set up your profile before searching." }, { status: 404 });
      }

      const isAdmin = profile.is_admin ?? false;

      // Account security gates
      if (!isAdmin) {
        if (profile.account_status === "blocked") {
          return NextResponse.json({ code: "ACCOUNT_BLOCKED", message: "Your account has been disabled due to suspicious activity." }, { status: 403 });
        }
        if (!profile.email_verified) {
          return NextResponse.json({ code: "EMAIL_NOT_VERIFIED", message: "Please verify your email before searching." }, { status: 403 });
        }
      }

      // Live balances to send back to frontend in streaming events
      let liveBalances: { search: number; cv: number; pf: number } | undefined;
      let livePlan: string | undefined;

      // Balance check
      if (!isAdmin) {
        const searchBalance = profile.search_balance ?? 0;
        if (searchBalance <= 0) {
          return NextResponse.json({ code: "LIMIT_001" }, { status: 403 });
        }

        if (pf_mode) {
          const pfBalance = profile.persistent_finder_balance ?? 0;
          if (pfBalance <= 0) {
            return NextResponse.json({ code: "LIMIT_003", message: "No Persistent Finder rounds remaining. Upgrade your plan." }, { status: 403 });
          }
        }

        // Atomic balance deduction — before any search work
        if (pf_mode) {
          const { error: sErr } = await dataClient.rpc("decrement_search_balance", { p_user_id: user.id, p_amount: 1 });
          if (sErr) {
            console.error("[SEARCH] RPC decrement_search_balance failed:", sErr);
            return NextResponse.json({ code: "GENERIC_ERROR", message: "Failed to deduct search credit. Please try again." }, { status: 500 });
          }
          const { error: pfErr } = await dataClient.rpc("decrement_pf_balance", { p_user_id: user.id, p_amount: 1 });
          if (pfErr) {
            console.error("[SEARCH] RPC decrement_pf_balance failed:", pfErr);
            return NextResponse.json({ code: "GENERIC_ERROR", message: "Failed to deduct PF credit. Please try again." }, { status: 500 });
          }
        } else {
          const { error: sErr } = await dataClient.rpc("decrement_search_balance", { p_user_id: user.id, p_amount: 1 });
          if (sErr) {
            console.error("[SEARCH] RPC decrement_search_balance failed:", sErr);
            return NextResponse.json({ code: "GENERIC_ERROR", message: "Failed to deduct search credit. Please try again." }, { status: 500 });
          }
        }

        // Fetch fresh balances after atomic deduction so frontend gets live values
        const { data: freshBalances } = await dataClient
          .from("profiles")
          .select("search_balance, cv_generation_balance, persistent_finder_balance, plan")
          .eq("id", user.id)
          .maybeSingle();
        if (freshBalances) {
          liveBalances = {
            search: freshBalances.search_balance ?? 0,
            cv: freshBalances.cv_generation_balance ?? 0,
            pf: freshBalances.persistent_finder_balance ?? 0,
          };
        }
        livePlan = freshBalances?.plan ?? profile.plan;
      }

      // Admin: use profile values (no deduction happened)
      if (!liveBalances) {
        liveBalances = {
          search: profile.search_balance ?? 0,
          cv: profile.cv_generation_balance ?? 0,
          pf: profile.persistent_finder_balance ?? 0,
        };
        livePlan = profile.plan ?? "free";
      }

      // Banned lists
      state.bannedJobs = profile.banned_jobs ?? [];
      state.bannedCompanies = profile.banned_companies ?? [];

      // Get search profile data
      let titles: string[] = [];
      let profileLocation = "";
      let profileIndustry = "";
      let cvVariations: { name: string; file_path: string }[] = [];

      if (profile_id) {
        const { data: searchProfile } = await dataClient
          .from("search_profiles")
          .select("job_titles, location, industry, cv_variations")
          .eq("id", profile_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (searchProfile?.job_titles?.length) {
          titles = searchProfile.job_titles;
          profileLocation = searchProfile.location ?? "";
          profileIndustry = searchProfile.industry ?? "";
          cvVariations = searchProfile.cv_variations ?? [];
        }
      }

      titles = await deduplicateTitles(titles);

      if (titles.length === 0) {
        return NextResponse.json({ results: [], code: "NO_TITLES", message: "Add job titles to your search profile first." });
      }

      // Auto-generate industry if missing (runs in parallel with CV downloads)
      let industryPromise: Promise<string | null> = Promise.resolve(null);
      if (!profileIndustry && titles.length > 0) {
        industryPromise = (async () => {
          try {
            const industryRaw = await callAIWithFallback(
              `Based on the given job titles, determine the single most likely industry the candidate works in.
Rules:
- Return one concise word or short phrase (e.g. "Fintech", "Healthcare", "SaaS", "E-commerce", "Construction", "Education", "Logistics").
- Do NOT include the job titles in your response. Just the industry.
- If unclear, use the most specific industry that fits.
Return ONLY valid JSON (no markdown, no code fences):
{ "industry": string }`,
              `Job titles: ${JSON.stringify(titles)}`,
              "auto-generate industry",
              { responseMimeType: "application/json", temperature: 0.3 }
            );
            const cleaned = industryRaw.slice(industryRaw.indexOf("{"), industryRaw.lastIndexOf("}") + 1);
            const industry = JSON.parse(cleaned).industry?.trim() ?? "";
            if (industry && profile_id) {
              dataClient.from("search_profiles").update({ industry })
                .eq("id", profile_id).eq("user_id", user.id)
                .then(() => {}, () => {});
              return industry;
            }
          } catch {}
          return null;
        })();
      }

      // Load CV texts
      let cvTexts: { name: string; text: string }[] = [];
      const cvDownloads = cvVariations.map(async (cv) => {
        if (!cv.file_path) return null;
        try {
          const { data: fileData } = await dataClient
            .storage
            .from("cv-files")
            .download(cv.file_path);
          if (fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer());
            const text = await extractTextFromPDF(buffer);
            return { name: cv.name || "CV", text: text.slice(0, 5000) };
          }
        } catch {}
        return null;
      });
      const [cvResults, generatedIndustry] = await Promise.all([
        Promise.all(cvDownloads),
        industryPromise,
      ]);
      cvTexts = cvResults.filter((r): r is { name: string; text: string } => r !== null);
      if (generatedIndustry) {
        profileIndustry = generatedIndustry;
      }

      const cvText = cvTexts.map(cv => cv.text).join("\n\n---\n\n");
      debugLog(`[SEARCH] CV variations: ${cvTexts.length}, total text length: ${cvText.length}, titles: ${titles.length}`);

      // Pre-fetch existing job URLs for dedup
      const [existingResultsRes, existingSavedRes] = await Promise.all([
        dataClient.from("job_results").select("job_url, is_deleted, job_title, company").eq("user_id", user.id),
        dataClient.from("saved_jobs").select("job_url").eq("user_id", user.id),
      ]);
      const historyUrls = new Set<string>();
      const rejectedUrls = new Set<string>();
      const hiddenJobKeys = new Set<string>();
      for (const r of existingResultsRes.data ?? []) {
        if (r.is_deleted) {
          rejectedUrls.add(r.job_url);
          hiddenJobKeys.add(`${r.job_title ?? ''}|${r.company ?? ''}`.toLowerCase().trim());
        } else {
          historyUrls.add(r.job_url);
        }
      }
      const savedUrls = new Set((existingSavedRes.data ?? []).map((r: any) => r.job_url));
      const blockedUrls = new Set<string>(profile.banned_jobs ?? []);

      state = {
        mode: pf_mode ? "pf" : "normal",
        profile,
        isAdmin,
        titles,
        profileLocation,
        profileIndustry,
        cvTexts,
        cvText,
        dedupSets: { history: historyUrls, saved: savedUrls, rejected: rejectedUrls, blocked: blockedUrls },
        hiddenJobKeys: [...hiddenJobKeys],
        bannedJobs: state.bannedJobs,
        bannedCompanies: state.bannedCompanies,
        pf_mode: !!pf_mode,
        query: query ?? "",
        balances: liveBalances,
        plan: livePlan,
      };
    }

    // === STREAMING SEARCH ===
    const stream = new ReadableStream({
      async start(controller) {
        const writer = new StreamWriter(controller);
        const sendStatus = (event: SearchEvent) => writer.send(event);
        const sendComplete = (event: SearchEvent) => {
          if (state.balances) {
            writer.send({ ...event, balances: state.balances, plan: state.plan } as SearchEvent);
          } else {
            writer.send(event);
          }
        };
        const startTime = Date.now();

        try {
          const effectivePfMode = state.pf_mode ?? (state.mode === "pf");

          if (!effectivePfMode) {
            let searchQuery = state.query || state.searchQuery;
            if (!searchQuery) {
              const normQuery = buildOrQuery(state.titles);
              searchQuery = [normQuery, state.profileLocation].filter(Boolean).join(" in ");
            }

            if (!searchQuery || searchQuery === "jobs") {
              writer.send({ type: "error", code: "NO_QUERY", message: "Add job titles to your search profile first.", progress: 0 });
              writer.close();
              return;
            }

            if (isContinuation) {
              // Continuation: skip filtering, go straight to AI screening
              const result = await screenAndAnalyze(
                state.rawJobs, state.jobSpecs, state.jobUrls, state.queryUsed,
                state.profileLocation, state.profileIndustry, state.titles, state.cvTexts,
                user, searchId, dataClient, state.bannedJobs, state.bannedCompanies,
                sendStatus, undefined,
                { history: new Set(state.dedupSets.history), saved: new Set(state.dedupSets.saved), blocked: new Set(state.dedupSets.blocked), rejected: new Set(state.dedupSets.rejected ?? []) },
                startTime
              );

              const totalFiltered = result.filteredCounts.history + result.filteredCounts.saved + result.filteredCounts.rejected + result.filteredCounts.blocked;
              if (totalFiltered > 0) {
                writer.send({ type: "filtered_summary", ...result.filteredCounts, progress: 50 });
              }

              if (result.timedOut) {
                const processedCount = result.results.length;
                const remainingJobs = state.rawJobs.slice(processedCount);
                const remainingSpecs = state.jobSpecs.slice(processedCount);
                const remainingUrls = state.jobUrls.slice(processedCount);
                const withIds = result.results.map((r: JobRow) => ({ ...r, id: crypto.randomUUID() }));
                sendComplete({
                  type: "partial_complete",
                  results: withIds.map(normalize),
                  progress: 55 + (processedCount / state.rawJobs.length) * 30,
                    continuation: Buffer.from(JSON.stringify({
                      mode: "normal",
                      rawJobs: remainingJobs,
                      jobSpecs: remainingSpecs,
                      jobUrls: remainingUrls,
                      queryUsed: state.queryUsed,
                      searchId: searchId,
                      titles: state.titles,
                      profileLocation: state.profileLocation,
                      profileIndustry: state.profileIndustry,
                      cvTexts: state.cvTexts,
                      bannedJobs: state.bannedJobs,
                      bannedCompanies: state.bannedCompanies,
                      hiddenJobKeys: state.hiddenJobKeys,
                      query: state.query,
                      dedupSets: { history: [...state.dedupSets.history], saved: [...state.dedupSets.saved], blocked: [...state.dedupSets.blocked], rejected: [...state.dedupSets.rejected ?? []] },
                    })).toString("base64"),
                  message: `Analysed ${processedCount} of ${state.rawJobs.length} jobs so far. Continue to screen remaining ${remainingJobs.length} jobs?`,
                });
                writer.close();
                return;
              }

              if (result.results.length > 0) {
                const withIds = result.results.map((r: JobRow) => ({ ...r, id: crypto.randomUUID() }));
                sendComplete({ type: "complete", results: withIds.map(normalize), progress: 100, ...(totalFiltered > 0 ? { filtered_summary: result.filteredCounts } : {}) });
              } else {
                sendComplete({ type: "complete", results: [], progress: 100, message: "No strong matches found. Try broadening your criteria." });
              }
              writer.close();
              return;
            }

            // Phase 1: search + filter (no AI) — initial call
            const hiddenKeys = state.hiddenJobKeys ? new Set<string>(state.hiddenJobKeys as string[]) : undefined;
            const { rawJobs, jobSpecs, jobUrls, queryUsed } = await fetchAndFilterJobs(
              searchQuery, state.profileLocation, user, searchId,
              state.bannedJobs, state.bannedCompanies, dataClient, sendStatus, undefined,
              hiddenKeys
            );

            if (rawJobs.length === 0) {
              sendComplete({ type: "complete", results: [], progress: 100, message: "No matching jobs found. Try broadening your criteria." });
              writer.close();
              return;
            }

            // Pause after filtering — user clicks Continue to start AI screening
            sendComplete({
              type: "pause",
              message: `Found ${rawJobs.length} matching results. Ready to screen?`,
              progress: 20,
              continuation: Buffer.from(JSON.stringify({
                mode: "normal",
                rawJobs,
                jobSpecs,
                jobUrls,
                queryUsed,
                searchId,
                titles: state.titles,
                profileLocation: state.profileLocation,
                profileIndustry: state.profileIndustry,
                cvTexts: state.cvTexts,
                bannedJobs: state.bannedJobs,
                bannedCompanies: state.bannedCompanies,
                hiddenJobKeys: state.hiddenJobKeys,
                query: searchQuery,
                dedupSets: { history: [...state.dedupSets.history], saved: [...state.dedupSets.saved], blocked: [...state.dedupSets.blocked], rejected: [...state.dedupSets.rejected] },
              })).toString("base64"),
            });
            writer.close();
            return;
          }

          // === PERSISTENT FINDER MODE (laddered broadening, 5 deterministic rounds) ===
          // Round ladder
          const ROUNDS = [
            { id: 1, titleTier: "specific" as const, industryTier: "specific" as const },
            { id: 2, titleTier: "broad" as const, industryTier: "specific" as const },
            { id: 3, titleTier: "broadest" as const, industryTier: "specific" as const },
            { id: 4, titleTier: "broad" as const, industryTier: "broad" as const },
            { id: 5, titleTier: "broadest" as const, industryTier: "broadest" as const },
          ];

          let allResults: JobRow[] = [];
          let pfFilteredCounts = { history: 0, saved: 0, rejected: 0, blocked: 0 };
          let seenUrls = new Set<string>();
          let pfRoundsExecuted: number;
          let pfAborted: boolean;
          let pfTitles: string[];
          let pfLocation: string;
          let pfIndustry: string;
          let pfCvTexts: { name: string; text: string }[];
          let pfBannedJobs: string[];
          let pfBannedCompanies: string[];
          let pfDedupSets: any;
          let startRoundIndex: number;
          let titleTiers: Record<string, string[]>;
          let industryTiers: Record<string, string>;
          let hardStop = false;

          if (isContinuation && state.mode === "pf") {
            // Restore accumulated state from continuation token
            allResults = state.allResults || [];
            pfFilteredCounts = state.pfFilteredCounts || { history: 0, saved: 0, rejected: 0, blocked: 0 };
            seenUrls = new Set(state.seenUrls || []);
            pfRoundsExecuted = state.pfRoundsExecuted || 0;
            startRoundIndex = state.nextRoundIndex || 0;
            pfAborted = state.pfAborted || false;
            pfTitles = state.titles;
            pfLocation = state.profileLocation;
            pfIndustry = state.profileIndustry;
            pfCvTexts = state.cvTexts;
            pfBannedJobs = state.bannedJobs || [];
            pfBannedCompanies = state.bannedCompanies || [];
            pfDedupSets = state.dedupSets;
            titleTiers = state.titleTiers;
            industryTiers = state.industryTiers;
            debugLog(`[PF] Resuming at round ${startRoundIndex + 1}/${ROUNDS.length}, ${allResults.length} results so far`);
          } else {
            // Fresh start
            pfTitles = state.titles;
            pfLocation = state.profileLocation;
            pfIndustry = state.profileIndustry;
            pfCvTexts = state.cvTexts;
            pfBannedJobs = state.bannedJobs;
            pfBannedCompanies = state.bannedCompanies;
            pfDedupSets = state.dedupSets;
            pfRoundsExecuted = 0;
            pfAborted = false;
            startRoundIndex = 0;
            seenUrls = new Set([...pfDedupSets.history, ...pfDedupSets.saved, ...pfDedupSets.blocked]);

            // Auto-generate PF industry if missing
            if (!pfIndustry && pfTitles.length > 0) {
              try {
                const industryRaw = await callAIWithFallback(
                  `Based on the given job titles, determine the single most likely industry the candidate works in.
Rules:
- Return one concise word or short phrase.
- Do NOT include the job titles in your response. Just the industry.
- If unclear, use the most specific industry that fits.
Return ONLY valid JSON (no markdown, no code fences):
{ "industry": string }`,
                  `Job titles: ${JSON.stringify(pfTitles)}`,
                  "PF auto-generate industry",
                  { responseMimeType: "application/json", temperature: 0.3 }
                );
                const cleaned = industryRaw.slice(industryRaw.indexOf("{"), industryRaw.lastIndexOf("}") + 1);
                pfIndustry = JSON.parse(cleaned).industry?.trim() ?? "";
              } catch { /* proceed without industry */ }
            }

            // Build title and industry tiers
            titleTiers = {
              specific: pfTitles,
              broad: pfTitles.map((t: string) => broadenTitle(t)).filter((t: string, i: number, a: string[]) => a.indexOf(t) === i),
              broadest: pfTitles.map((t: string) => broadenTitleMax(t)).filter((t: string, i: number, a: string[]) => a.indexOf(t) === i),
            };
            industryTiers = {
              specific: pfIndustry,
              broad: broadenIndustry(pfIndustry, 1),
              broadest: broadenIndustry(pfIndustry, 2),
            };
          }

          const usedQueries = new Set<string>();
          const pfStartTime = Date.now();

          for (let i = startRoundIndex; i < ROUNDS.length; i++) {
            const round = ROUNDS[i];

            if (Date.now() - pfStartTime > 240_000) {
              debugLog(`[PF] Time limit reached, stopping after ${pfRoundsExecuted} rounds`);
              pfAborted = true;
              break;
            }

            const titles = titleTiers[round.titleTier];
            const industry = industryTiers[round.industryTier];

            if (titles.length === 0) {
              debugLog(`[PF] Round ${round.id}: no titles for "${round.titleTier}" tier, skipping`);
              continue;
            }

            const titleQuery = buildOrQuery(titles);
            const industryPart = industry ? `"${industry}"` : "";
            const fullQuery = [titleQuery, industryPart, pfLocation ? `in ${pfLocation}` : ""].filter(Boolean).join(" ");

            if (usedQueries.has(fullQuery)) {
              debugLog(`[PF] Round ${round.id}: skipping duplicate query "${fullQuery}"`);
              continue;
            }
            usedQueries.add(fullQuery);

            debugLog(`[PF] Round ${round.id}/5 [${round.titleTier} titles, ${round.industryTier} industry]: "${fullQuery}"`);
            sendStatus({ type: "pf_round", round: round.id, max: 5, query: fullQuery, progress: Math.min((round.id / 5) * 80, 80) });

            if (pfRoundsExecuted > 0 && lastAITier === "openrouter") {
              await sleep(3000);
            }

            try {
              const pfHiddenKeys = state.hiddenJobKeys ? new Set<string>(state.hiddenJobKeys as string[]) : undefined;
              const filtered = await fetchAndFilterJobs(
                fullQuery, pfLocation, user, searchId,
                pfBannedJobs, pfBannedCompanies, dataClient, sendStatus, round.id,
                pfHiddenKeys
              );

              let roundResults: JobRow[] = [];
              let roundFilteredCounts = { history: 0, saved: 0, rejected: 0, blocked: 0 };

              if (filtered.rawJobs.length > 0) {
                const result = await screenAndAnalyze(
                  filtered.rawJobs, filtered.jobSpecs, filtered.jobUrls, filtered.queryUsed,
                  pfLocation, pfIndustry, pfTitles, pfCvTexts,
                  user, searchId, dataClient, pfBannedJobs, pfBannedCompanies,
                  sendStatus, round.id,
                  { history: new Set(pfDedupSets.history || []), saved: new Set(pfDedupSets.saved || []), blocked: new Set(pfDedupSets.blocked || []), rejected: new Set(pfDedupSets.rejected || []) },
                  pfStartTime
                );
                roundResults = result.results;
                roundFilteredCounts = result.filteredCounts;
              }

              pfFilteredCounts.history += roundFilteredCounts.history;
              pfFilteredCounts.saved += roundFilteredCounts.saved;
              pfFilteredCounts.rejected += roundFilteredCounts.rejected;
              pfFilteredCounts.blocked += roundFilteredCounts.blocked;

              for (const r of roundResults) {
                if (!seenUrls.has(r.job_url)) {
                  seenUrls.add(r.job_url);
                  allResults.push(r);
                }
              }

              pfRoundsExecuted++;
              debugLog(`[PF] Round ${round.id}: ${roundResults.length} valid (total unique: ${allResults.length})`);

              const highScoreCount = allResults.filter((r) => (r.match_score ?? 0) >= 80).length;
              if (highScoreCount >= 5) {
                debugLog(`[PF] Stopping early, ${highScoreCount} jobs >= 80 (round ${round.id})`);
                hardStop = true;
                break;
              }

              // Pause after round (except last or early stop)
              const isLastRound = i >= ROUNDS.length - 1;
              if (!isLastRound && !hardStop) {
                sendComplete({
                  type: "pause",
                  message: `Round ${round.id} of 5 complete, ${allResults.length} results so far. Continue to round ${round.id + 1}?`,
                  progress: Math.min((round.id / 5) * 80, 80),
                  continuation: Buffer.from(JSON.stringify({
                    mode: "pf",
                    nextRoundIndex: i + 1,
                    allResults,
                    seenUrls: [...seenUrls],
                    pfFilteredCounts,
                    pfRoundsExecuted,
                    pfAborted,
                    searchId,
                    titles: pfTitles,
                    titleTiers,
                    industryTiers,
                    profileLocation: pfLocation,
                    profileIndustry: pfIndustry,
                    cvTexts: pfCvTexts,
                    bannedJobs: pfBannedJobs,
                    bannedCompanies: pfBannedCompanies,
                    dedupSets: {
                      history: pfDedupSets.history ? [...pfDedupSets.history] : [],
                      saved: pfDedupSets.saved ? [...pfDedupSets.saved] : [],
                      blocked: pfDedupSets.blocked ? [...pfDedupSets.blocked] : [],
                      rejected: pfDedupSets.rejected ? [...pfDedupSets.rejected] : [],
                    },
                  })).toString("base64"),
                });
                writer.close();
                return;
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              debugLog(`[PF] Round ${round.id} failed, error: ${errMsg}`);
              pfRoundsExecuted++;
            }
          }

          // Finalize (all rounds done, or early stop)
          allResults.sort((a, b) => {
            if (a.domain_verified !== b.domain_verified) return a.domain_verified ? -1 : 1;
            return (b.match_score ?? 0) - (a.match_score ?? 0);
          });

          debugLog(`[PF] Total unique: ${allResults.length} across ${pfRoundsExecuted} rounds`);

          const topTier = allResults.filter(r => r.match_score >= 75);
          const midTier = allResults.filter(r => r.match_score >= 60 && r.match_score < 75);
          const lowTier = allResults.filter(r => r.match_score < 60);

          const pfTotalFiltered = pfFilteredCounts.history + pfFilteredCounts.saved + pfFilteredCounts.rejected + pfFilteredCounts.blocked;
          if (pfTotalFiltered > 0) {
            writer.send({ type: "filtered_summary", ...pfFilteredCounts, progress: 90 });
          }

          if (allResults.length > 0) {
            const withIds = allResults.map((r) => ({ ...r, id: crypto.randomUUID() }));

            const pfMessage = pfAborted
              ? `Search stopped early, showing ${allResults.length} results found so far`
              : undefined;

            sendComplete({
              type: "complete",
              results: withIds.map(normalize),
              progress: 100,
              pf_mode: true,
              pf_rounds: pfRoundsExecuted,
              pf_tiers: { hire: topTier.length, interview: midTier.length, reject: lowTier.length },
              pf_summary: { totalFound: allResults.length, highCount: topTier.length, midCount: midTier.length, lowCount: lowTier.length, roundsExecuted: pfRoundsExecuted },
              ...(pfTotalFiltered > 0 ? { filtered_summary: pfFilteredCounts } : {}),
              ...(pfMessage ? { message: pfMessage } : {}),
            });

            const rows = withIds.map((r) => ({
              id: r.id,
              user_id: r.user_id, search_id: r.search_id, profile_id: profile_id ?? null,
              job_title: r.job_title, company: r.company, location: r.location,
              estimated_salary: r.estimated_salary, match_score: r.match_score,
              match_summary: r.match_summary, job_url: r.job_url, full_spec: r.full_spec,
              search_query: r.search_query, domain_verified: r.domain_verified,
              domain_unverified_reason: r.domain_unverified_reason, posted_at: r.posted_at,
              suggested_cv: r.suggested_cv, verdict_bullets: r.verdict_bullets,
              knockout_fail: r.knockout_fail, pillar_scores: r.pillar_scores,
              taxes_applied: r.taxes_applied, total_questions_asked: r.total_questions_asked,
              yes_answers: r.yes_answers, recruiter_verdict: r.recruiter_verdict,
            }));
            dataClient.from("job_results").insert(rows).then(({ error }: any) => {
              if (error) console.error("[PF] Failed to insert job results:", error.message);
            });
          } else {
            const noResultsMessage = pfAborted
              ? "Search stopped early, no results were found. Try again later."
              : "Persistent Finder completed but found no matches. Try different profile keywords.";
            sendComplete({ type: "complete", results: [], progress: 100, message: noResultsMessage, pf_mode: true, pf_rounds: pfRoundsExecuted });
          }

          writer.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          debugLog("[SEARCH] Unhandled error:", msg);
          try {
            writer.send({ type: "error", code: "GENERIC_ERROR", message: "Something went wrong. Please try again.", progress: 0 });
            writer.close();
          } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog("[SEARCH] Unhandled error:", msg);
    return NextResponse.json({ results: [], code: "GENERIC_ERROR", message: "Something went wrong. Please try again." });
  }
}
