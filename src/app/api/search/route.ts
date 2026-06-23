import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs } from "@/lib/serpapi";
import { extractTextFromPDF } from "@/lib/pdf";
import { callAIWithFallback, lastAITier } from "@/lib/gemini";
import { StreamWriter, type SearchEvent } from "@/lib/search-stream";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const JINA_API_KEY = process.env.JINA_API_KEY;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      passed_domain_filter: false, passed_banned_filter: false,
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && console.log('[SEARCH] Failed to log blacklist rejected:', r.error));
  }

  const bannedRejected: any[] = [];
  rawJobs = rawJobs.filter((j) => {
    const url = buildJobUrl(j);
    if (url && bannedJobs.includes(url)) { bannedRejected.push(j); return false; }
    const companyLower = (j.company_name ?? "").toLowerCase();
    if (bannedCompanies.some((bc) => companyLower.includes(bc.toLowerCase()))) { bannedRejected.push(j); return false; }
    return true;
  });
  if (bannedRejected.length > 0) {
    const rows = bannedRejected.map(j => ({
      user_id: user.id, search_id: searchId, search_query: query,
      job_title: j.title, company: j.company_name, location: j.location ?? '',
      snippet: (j.description ?? '').slice(0, 500), job_url: buildJobUrl(j),
      reason: `banned_${bannedJobs.includes(buildJobUrl(j)) ? 'job' : 'company'}`,
      passed_domain_filter: true, passed_banned_filter: false,
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && console.log('[SEARCH] Failed to log banned rejected:', r.error));
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
  dedupSets?: { history: Set<string>; saved: Set<string>; blocked: Set<string> }
): Promise<{ results: JobRow[]; queryUsed: string; filteredCounts: { history: number; saved: number; rejected: number; blocked: number } }> {
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
    console.log(`[SEARCH] Starting Pass 1 batch (${rawJobs.length} jobs)`);
    rawPass1 = await callAIWithFallback(
      batchSystemPrompt,
      `Candidate Profile:\n${profileContext}\n\nJobs:\n${JSON.stringify(batchInput, null, 2)}`,
      `search pass 1${pfRound ? ` (PF round ${pfRound})` : ""}`,
      { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 8192 }
    );
    const parsedPass1 = JSON.parse(rawPass1);
    const unwrappedPass1 = unwrapArray(parsedPass1);
    if (!Array.isArray(unwrappedPass1) || unwrappedPass1.length === 0) {
      console.log(`[SEARCH] Pass 1 batch returned empty/unexpected format, falling back to individual`);
      throw new Error("batch empty");
    }
    batchResults = unwrappedPass1 as { index: number; score: number; reason: string; estimated_salary: string }[];
    console.log(`[SEARCH] Pass 1 batch succeeded via ${lastAITier} (${batchResults.length} results)`);
  } catch {
    console.log(`[SEARCH] Pass 1 batch failed, falling back to individual (${rawJobs.length} jobs)`);
    for (let i = 0; i < rawJobs.length; i++) {
      const job = rawJobs[i];
      const progress = Math.min(20 + ((i + 1) / rawJobs.length) * 35, 55);
      onStatus?.({ type: "screening_job", current: i + 1, total: rawJobs.length, progress });
      if (i > 0) await sleep(6000);
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
        batchResults.push({ index: i, ...parsed });
      } catch {
        batchResults.push({ index: i, score: 30, reason: "Screening unavailable", estimated_salary: "" });
      }
    }
  }

  console.log(`[SEARCH] Starting Pass 2 deep analysis (${rawJobs.length} jobs)`);
  let outputs: JobRow[] = [];
  for (let i = 0; i < rawJobs.length; i++) {
    const job = rawJobs[i];
    const batchResult = batchResults.find((r) => r.index === i);
    const jobUrl = jobUrls.get(i) || buildJobUrl(job);
    const fullSpec = jobSpecs.get(i) || job.description || "";

    const progress = Math.min(55 + ((i + 1) / rawJobs.length) * 30, 85);
    onStatus?.({ type: "analyzing_job", title: job.title, company: job.company_name, current: i + 1, total: rawJobs.length, progress });

    if (i > 0) await sleep(6000);

    const deepSystemPrompt = `You are a strict Recruitment Auditor AI. Evaluate the candidate's CVs against the job description.

CANDIDATE INDUSTRY: ${profileIndustry || "Unknown"}

40% COMPETITOR BENCHMARK:
Assume 40% of applicants are perfect direct matches who tick every requirement. Only score highly if the candidate can stand out against this competition.

SCORING:
- 0–30: Total mismatch in industry, sector, or core capabilities.
- 31–59: Some transferable skills but significant gaps in industry nuance or scale.
- 60–74: Good foundation but lacks a critical requirement direct competitors will have.
- 75–100: Exceptional match — direct industry alignment, matching functional scale, clear competitive advantage.

INDUSTRY MATCH RULES:
- First, identify the job's industry from the full job specification.
- If the job's industry is clearly different from the candidate's industry (e.g. Healthcare vs Construction, Education vs Fintech), the score MUST NOT exceed 30.
- Understand that functions like HR, IT, Admin, Finance, or Project Management can span multiple industries — in those cases, assess normally based on the role itself.
- Set industry_match to true if the industries are the same, closely related, or the role is a cross-industry function. Set to false for clear mismatches.

RULES:
- Judge transferable skills and career trajectory, not keywords.
- Reference specifics from the CV and job spec.
- Choose the CV variation that best matches this role and return its name in suggested_cv_name.

${blacklistInfo}${bannedInfo}

Return ONLY valid JSON (no markdown, no code fences). Exact schema:
{
  "score": number (0-100),
  "estimated_salary": string,
  "suggested_cv_name": string,
  "match_summary": string,
  "job_industry": string,
  "industry_match": boolean,
  "bullet_points": {
    "industry": string,
    "function": string,
    "competition": string
  }
}`;

    try {
      const raw = await callAIWithFallback(
        deepSystemPrompt,
        `Candidate Profile:\n${profileContext}\n\nFull Job Specification:\n${fullSpec}\n\nJob Title: ${job.title}\nCompany: ${job.company_name}\nLocation: ${job.location}`,
        `search pass 2${pfRound ? ` (PF round ${pfRound})` : ""}: ${job.title} at ${job.company_name}`,
        { responseMimeType: "application/json", temperature: 0.1 }
      );
      const deepResult = JSON.parse(raw);

      if (deepResult.industry_match === false && deepResult.score > 30) {
        console.warn(`[AI] Industry mismatch: "${job.title}" at ${job.company_name} (candidate: ${profileIndustry}, job: ${deepResult.job_industry ?? "unknown"}, score: ${deepResult.score})`);
      }

      outputs.push({
        user_id: user.id,
        search_id: searchId,
        job_title: job.title,
        company: job.company_name,
        location: job.location,
        estimated_salary: deepResult.estimated_salary || batchResult?.estimated_salary || "",
        match_score: deepResult.score,
        match_summary: deepResult.match_summary || batchResult?.reason || "",
        verdict_bullets: deepResult.bullet_points || null,
        job_url: jobUrl,
        full_spec: fullSpec,
        search_query: query,
        domain_verified: (job as any)._domainVerified ?? true,
        domain_unverified_reason: (job as any)._domainReason ?? "",
        posted_at: (job as any)._postedAt ?? "",
        posted_at_ms: (job as any)._postedAtMs ?? 0,
        suggested_cv: deepResult.suggested_cv_name || "",
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[AI] Pass 2 failed for "${job.title}" at ${job.company_name}: ${errMsg.slice(0, 150)}`);
      let fallbackScore = batchResult?.score ?? 30;
      let fallbackSummary = batchResult?.reason || "Analysis unavailable";
      let fallbackSalary = batchResult?.estimated_salary || "";
      try {
        const retryPrompt = `You are a Recruitment Auditor AI. Score this job match for the candidate.

CANDIDATE INDUSTRY: ${profileIndustry || "Unknown"}

SCORING:
- 0–30: Total mismatch in industry, sector, or core capabilities.
- 31–59: Some transferable skills but significant gaps.
- 60–74: Good foundation but lacks a critical requirement.
- 75–100: Exceptional match — direct alignment.

INDUSTRY MATCH RULES:
- If the job's industry is clearly different from the candidate's industry (e.g. Healthcare vs Construction), the score MUST NOT exceed 30.
- Functions like HR, IT, Admin, Finance, or Project Management can span multiple industries.

Return ONLY valid JSON (no markdown, no code fences):
{ "score": number (0-100), "estimated_salary": string, "match_summary": string, "suggested_cv_name": string }`;
        const retryRaw = await callAIWithFallback(
          retryPrompt,
          `Candidate Profile:\n${profileContext}\n\nFull Job Specification:\n${fullSpec}\n\nJob Title: ${job.title}\nCompany: ${job.company_name}\nLocation: ${job.location}`,
          `search pass 2 retry${pfRound ? ` (PF round ${pfRound})` : ""}: ${job.title} at ${job.company_name}`,
          { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1024 }
        );
        const retryResult = JSON.parse(retryRaw);
        fallbackScore = retryResult.score ?? fallbackScore;
        fallbackSummary = retryResult.match_summary || fallbackSummary;
        fallbackSalary = retryResult.estimated_salary || fallbackSalary;
        console.log(`[AI] Pass 2 retry succeeded for "${job.title}" at ${job.company_name}`);
      } catch {
        console.log(`[AI] Pass 2 retry also failed for "${job.title}" at ${job.company_name}, using Pass 1 fallback`);
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
      });
    }
  }

  if (aiRejectedJobs.length > 0) {
    const rows = aiRejectedJobs.map(({ job, reason, stage }) => ({
      user_id: user.id, search_id: searchId, search_query: query,
      job_title: job.title, company: job.company_name, location: job.location ?? '',
      snippet: (job.description ?? '').slice(0, 500), job_url: buildJobUrl(job),
      reason: `ai_${stage}: ${reason}`,
      passed_domain_filter: true, passed_banned_filter: true,
      passed_pass1: stage !== "pass1", passed_pass2: stage === "pass2",
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && console.log('[SEARCH] Failed to log AI rejected:', r.error));
  }

  if (dedupSets) {
    const allExisting = new Set([...dedupSets.history, ...dedupSets.saved, ...dedupSets.blocked]);
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

  onStatus?.({ type: "almost_done", progress: 90 });

  return { results: outputs, queryUsed: query, filteredCounts };
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

    const body = await request.json();
    const { query, profile_id, pf_mode, continuation } = body;
    const isContinuation = !!continuation;

    if (!isContinuation) {
      if (!query && !pf_mode) {
        return NextResponse.json({ error: "SEARCH_001" }, { status: 400 });
      }
      console.log(`[SEARCH] Search started at: ${new Date().toISOString()}`);
      console.log(`[SEARCH] Query: ${query ?? "(pf_mode)"}, PF mode: ${pf_mode}, Profile: ${profile_id}`);
    } else {
      console.log(`[SEARCH] Continue at: ${new Date().toISOString()}`);
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

      const isAdmin = (profile.is_admin ?? false) || (ADMIN_EMAIL && user.email === ADMIN_EMAIL);

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

      // Load CV texts
      let cvTexts: { name: string; text: string }[] = [];
      for (const cv of cvVariations) {
        if (!cv.file_path) continue;
        try {
          const { data: fileData } = await dataClient
            .storage
            .from("cv-files")
            .download(cv.file_path);
          if (fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer());
            const text = await extractTextFromPDF(buffer);
            cvTexts.push({ name: cv.name || "CV", text: text.slice(0, 5000) });
          }
        } catch {}
      }

      const cvText = cvTexts.map(cv => cv.text).join("\n\n---\n\n");
      console.log(`[SEARCH] CV variations: ${cvTexts.length}, total text length: ${cvText.length}, titles: ${titles.length}`);

      // Pre-fetch existing job URLs for dedup
      const [existingResultsRes, existingSavedRes] = await Promise.all([
        dataClient.from("job_results").select("job_url, is_deleted").eq("user_id", user.id),
        dataClient.from("saved_jobs").select("job_url").eq("user_id", user.id),
      ]);
      const historyUrls = new Set<string>();
      const rejectedUrls = new Set<string>();
      for (const r of existingResultsRes.data ?? []) {
        if (r.is_deleted) rejectedUrls.add(r.job_url);
        else historyUrls.add(r.job_url);
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
        bannedJobs: state.bannedJobs,
        bannedCompanies: state.bannedCompanies,
        pf_mode: !!pf_mode,
        query: query ?? "",
      };
    }

    // === STREAMING SEARCH ===
    const stream = new ReadableStream({
      async start(controller) {
        const writer = new StreamWriter(controller);
        const sendStatus = (event: SearchEvent) => writer.send(event);

        try {
          // Balance deduction (only at start, not on continuation)
          if (!isContinuation && !state.isAdmin) {
            if (state.pf_mode) {
              await dataClient.from("profiles").update({
                search_balance: (state.profile.search_balance ?? 3) - 1,
                persistent_finder_balance: (state.profile.persistent_finder_balance ?? 0) - 1,
              }).eq("id", user.id);
            } else {
              await dataClient.from("profiles").update({
                search_balance: (state.profile.search_balance ?? 3) - 1,
              }).eq("id", user.id);
            }
          }

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
                { history: new Set(state.dedupSets.history), saved: new Set(state.dedupSets.saved), blocked: new Set(state.dedupSets.blocked) }
              );

              const totalFiltered = result.filteredCounts.history + result.filteredCounts.saved + result.filteredCounts.rejected + result.filteredCounts.blocked;
              if (totalFiltered > 0) {
                writer.send({ type: "filtered_summary", ...result.filteredCounts, progress: 50 });
              }

              if (result.results.length > 0) {
                const withIds = result.results.map((r: JobRow) => ({ ...r, id: crypto.randomUUID() }));
                writer.send({ type: "complete", results: withIds.map(normalize), progress: 100, ...(totalFiltered > 0 ? { filtered_summary: result.filteredCounts } : {}) });

                const rows = withIds.map((r: any) => ({
                  id: r.id, user_id: r.user_id, search_id: r.search_id, profile_id: null,
                  job_title: r.job_title, company: r.company, location: r.location,
                  estimated_salary: r.estimated_salary, match_score: r.match_score,
                  match_summary: r.match_summary, job_url: r.job_url, full_spec: r.full_spec,
                  search_query: r.search_query, domain_verified: r.domain_verified,
                  domain_unverified_reason: r.domain_unverified_reason, posted_at: r.posted_at,
                  suggested_cv: r.suggested_cv, verdict_bullets: r.verdict_bullets,
                }));
                dataClient.from("job_results").insert(rows).then(({ error }: any) => {
                  if (error) console.error("[SEARCH] Failed to insert job results:", error.message);
                });
              } else {
                writer.send({ type: "complete", results: [], progress: 100, message: "No strong matches found. Try broadening your criteria." });
              }
              writer.close();
              return;
            }

            // Phase 1: search + filter (no AI) — initial call
            const { rawJobs, jobSpecs, jobUrls, queryUsed } = await fetchAndFilterJobs(
              searchQuery, state.profileLocation, user, searchId,
              state.bannedJobs, state.bannedCompanies, dataClient, sendStatus
            );

            if (rawJobs.length === 0) {
              writer.send({ type: "complete", results: [], progress: 100, message: "No matching jobs found. Try broadening your criteria." });
              writer.close();
              return;
            }

            // Pause after filtering — user clicks Continue to start AI screening
            writer.send({
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
                query: searchQuery,
                dedupSets: { history: [...state.dedupSets.history], saved: [...state.dedupSets.saved], blocked: [...state.dedupSets.blocked] },
              })).toString("base64"),
            });
            writer.close();
            return;
          }

          // === PERSISTENT FINDER MODE (adaptive OR, per-round checkpoint) ===
          const MAX_ROUNDS = 8;
          const STOP_THRESHOLD = 80;
          const STOP_COUNT = 5;

          const pfTitles = state.titles;
          const pfLocation = state.profileLocation;
          const pfIndustry = state.profileIndustry;
          const pfCvTexts = state.cvTexts;
          const pfCvText = state.cvText;
          const pfBannedJobs = state.bannedJobs;
          const pfBannedCompanies = state.bannedCompanies;
          const pfDedupSets = state.dedupSets;

          let allResults: JobRow[] = isContinuation ? (state.allResults || []) : [];
          const pfFilteredCounts = isContinuation
            ? (state.pfFilteredCounts || { history: 0, saved: 0, rejected: 0, blocked: 0 })
            : { history: 0, saved: 0, rejected: 0, blocked: 0 };
          const seenUrls = new Set<string>(
            isContinuation ? (state.seenUrls || []) : [...pfDedupSets.history, ...pfDedupSets.saved, ...pfDedupSets.blocked]
          );
          let activeTitles = isContinuation ? (state.activeTitles || [...pfTitles]) : [...pfTitles];
          const usedTitles = new Set<string>(isContinuation ? (state.usedTitles || pfTitles) : pfTitles);
          const usedQueries = new Set<string>(isContinuation ? (state.usedQueries || []) : []);
          let pfRound = isContinuation ? (state.nextRound - 1) : 0;
          let pfAborted = isContinuation ? (state.pfAborted || false) : false;

          for (let round = 0; round < MAX_ROUNDS; round++) {
            pfRound = round + 1;

            if (activeTitles.length === 0) {
              console.log(`[PF] Round ${pfRound}/${MAX_ROUNDS}: no titles to search — stopping`);
              break;
            }

            const orQuery = buildOrQuery(activeTitles);
            const fullQuery = [orQuery, pfLocation].filter(Boolean).join(" in ");

            if (usedQueries.has(fullQuery)) {
              console.log(`[PF] Round ${pfRound}/${MAX_ROUNDS}: skipping duplicate query "${fullQuery}"`);
              continue;
            }
            usedQueries.add(fullQuery);

            console.log(`[PF] Round ${pfRound}/${MAX_ROUNDS}: "${fullQuery}"`);
            sendStatus({ type: "pf_round", round: pfRound, max: MAX_ROUNDS, query: fullQuery, progress: Math.min((pfRound / MAX_ROUNDS) * 90, 90) });

            if (lastAITier === "openrouter") {
              console.log("[PF] On OpenRouter tier — using 12s delay between rounds");
              await sleep(12000);
            }

            try {
              const filtered = await fetchAndFilterJobs(
                fullQuery, pfLocation, user, searchId,
                pfBannedJobs, pfBannedCompanies, dataClient, sendStatus, pfRound
              );

              let roundResults: JobRow[] = [];
              let roundFilteredCounts = { history: 0, saved: 0, rejected: 0, blocked: 0 };

              if (filtered.rawJobs.length > 0) {
                const result = await screenAndAnalyze(
                  filtered.rawJobs, filtered.jobSpecs, filtered.jobUrls, filtered.queryUsed,
                  pfLocation, pfIndustry, pfTitles, pfCvTexts,
                  user, searchId, dataClient, pfBannedJobs, pfBannedCompanies,
                  sendStatus, pfRound,
                  { history: new Set(pfDedupSets.history), saved: new Set(pfDedupSets.saved), blocked: new Set(pfDedupSets.blocked) }
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

              console.log(`[PF] Round ${pfRound}: ${roundResults.length} valid (total unique: ${allResults.length})`);

              const highScoreCount = allResults.filter((r) => r.match_score >= STOP_THRESHOLD).length;
              if (highScoreCount >= STOP_COUNT) {
                console.log(`[PF] Stopping early — ${highScoreCount} jobs >= ${STOP_THRESHOLD} (round ${pfRound})`);
                break;
              }

              const isLastRound = pfRound >= MAX_ROUNDS;
              if (isLastRound) break;

              // Generate new title variations
              const variationPrompt = `You are a job search strategist. The candidate's original job titles are: ${JSON.stringify(pfTitles)}.
The following titles were just searched and didn't return enough valid results: ${JSON.stringify(activeTitles)}.
Previous titles already tried: ${JSON.stringify([...usedTitles])}.
Round feedback: ${roundResults.length} valid jobs found.
Banned companies: ${pfBannedCompanies.join(", ") || "none"}.

Generate 3-4 NEW job title variations that are related BUT DIFFERENT from the ones already tried. Suggest alternative phrasings, adjacent roles, or more specific titles. Avoid titles likely to hit blocked companies or similar dead ends.
Return ONLY a JSON array of strings. No explanation.`;

              try {
                const variationResult = await callAIWithFallback(
                  variationPrompt,
                  `Candidate original titles: ${JSON.stringify(pfTitles)}\nLocation: ${pfLocation}\nCV summary: ${(pfCvText || "No CV").slice(0, 500)}`,
                  `PF round ${pfRound} title variation`,
                  { responseMimeType: "application/json", temperature: 0.7 }
                );
                const parsed = JSON.parse(variationResult);
                const newTitles = unwrapArray(parsed) as string[];
                const freshTitles = newTitles.filter(t => !usedTitles.has(t));
                if (freshTitles.length > 0) {
                  activeTitles = freshTitles;
                  freshTitles.forEach(t => usedTitles.add(t));
                  console.log(`[PF] New titles for round ${pfRound + 1}: ${activeTitles.join(", ")}`);
                } else {
                  console.log(`[PF] AI returned only already-tried titles — keeping current`);
                }
              } catch {
                console.log(`[PF] AI title generation failed — keeping current titles`);
              }

              // Pause after round — send continuation to client
              writer.send({
                type: "pause",
                message: roundResults.length > 0
                  ? `Round ${pfRound} complete — ${allResults.length} results so far. Continue to round ${pfRound + 1}?`
                  : `Round ${pfRound} found no matches. Continue to round ${pfRound + 1}?`,
                progress: Math.min((pfRound / MAX_ROUNDS) * 90, 90),
                continuation: Buffer.from(JSON.stringify({
                  mode: "pf",
                  nextRound: pfRound + 1,
                  allResults,
                  seenUrls: [...seenUrls],
                  activeTitles,
                  usedTitles: [...usedTitles],
                  usedQueries: [...usedQueries],
                  pfFilteredCounts,
                  searchId,
                  titles: pfTitles,
                  profileLocation: pfLocation,
                  profileIndustry: pfIndustry,
                  cvTexts: pfCvTexts,
                  bannedJobs: pfBannedJobs,
                  bannedCompanies: pfBannedCompanies,
                  dedupSets: { history: [...pfDedupSets.history], saved: [...pfDedupSets.saved], blocked: [...pfDedupSets.blocked] },
                })).toString("base64"),
              });
              writer.close();
              return; // Stream ends here, client resumes via /api/search/continue
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.log(`[PF] Round ${pfRound} failed — error: ${errMsg}`);
              pfAborted = true;
              break;
            }
          }

          // Finalize (reached after last round or early stop)
          allResults.sort((a, b) => {
            if (a.domain_verified !== b.domain_verified) return a.domain_verified ? -1 : 1;
            return b.posted_at_ms - a.posted_at_ms;
          });

          console.log(`[PF] Total unique results: ${allResults.length}`);

          const pfTotalFiltered = pfFilteredCounts.history + pfFilteredCounts.saved + pfFilteredCounts.rejected + pfFilteredCounts.blocked;
          if (pfTotalFiltered > 0) {
            writer.send({ type: "filtered_summary", ...pfFilteredCounts, progress: 50 });
          }

          if (allResults.length > 0) {
            const withIds = allResults.map((r) => ({ ...r, id: crypto.randomUUID() }));

            const pfMessage = pfAborted
              ? `Search stopped early due to high demand — showing ${allResults.length} result${allResults.length === 1 ? "" : "s"} found so far`
              : undefined;

            writer.send({ type: "complete", results: withIds.map(normalize), progress: 100, pf_mode: true, pf_rounds: pfRound, ...(pfTotalFiltered > 0 ? { filtered_summary: pfFilteredCounts } : {}), ...(pfMessage ? { message: pfMessage } : {}) });

            const rows = withIds.map((r) => ({
              id: r.id,
              user_id: r.user_id, search_id: r.search_id, profile_id: profile_id ?? null,
              job_title: r.job_title, company: r.company, location: r.location,
              estimated_salary: r.estimated_salary, match_score: r.match_score,
              match_summary: r.match_summary, job_url: r.job_url, full_spec: r.full_spec,
              search_query: r.search_query, domain_verified: r.domain_verified,
              domain_unverified_reason: r.domain_unverified_reason, posted_at: r.posted_at,
              suggested_cv: r.suggested_cv, verdict_bullets: r.verdict_bullets,
            }));
            dataClient.from("job_results").insert(rows).then(({ error }: any) => {
              if (error) console.error("[PF] Failed to insert job results:", error.message);
            });
          } else {
            const noResultsMessage = pfAborted
              ? "Search stopped early due to high demand — no results were found. Try again later."
              : "Persistent Finder completed but found no matches. Try different profile keywords.";
            writer.send({ type: "complete", results: [], progress: 100, message: noResultsMessage, pf_mode: true, pf_rounds: pfRound });
          }

          writer.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log("[SEARCH] Unhandled error:", msg);
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
    console.log("[SEARCH] Unhandled error:", msg);
    return NextResponse.json({ results: [], code: "GENERIC_ERROR", message: "Something went wrong. Please try again." });
  }
}
