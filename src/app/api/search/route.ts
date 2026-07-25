// BUILD_CACHE_BUST: jun30-1
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs, searchJSearch, searchAdzuna, searchWebJobs, searchJinaBingJobs, searchDittoJobs, isCategoryPage, scrapePageBrightData, scrapePageApify, type SerpJob } from "@/lib/serpapi";
import { searchWorkdayJobs, fetchWorkdayDetail, WORKDAY_TENANTS, type WorkdayTenant } from "@/lib/workday";
import { extractText } from "@/lib/pdf";
import { mapLocationToProvince } from "@/lib/location";
import { callAIWithFallback, lastAITier } from "@/lib/gemini";
import { StreamWriter, type SearchEvent } from "@/lib/search-stream";
import { debugLog } from "@/lib/debug";
import { checkRateLimit } from "@/lib/rate-limit";
import { signContinuationToken, verifyAndDecodeContinuationToken } from "@/lib/continuation-token";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const JINA_API = process.env.JINA_API;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[TIMEOUT] ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}

interface JinaResult { content: string; status: number; }

async function fetchJinaPage(url: string, apiKey: string | null): Promise<JinaResult> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "X-Return-Format": "markdown",
    "X-Remove-Images": "true",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers });

  if (!res.ok) {
    if (apiKey && (res.status === 429 || res.status === 403)) {
      try {
        const err = await res.json();
        if (err.code?.startsWith("RATE_") || err.code?.startsWith("AUTHZ_")) {
          return { content: "", status: res.status };
        }
      } catch {}
    }
    return { content: "", status: res.status };
  }

  try {
    const json = await res.json();
    if (json.code === 200 && json.data?.content) return { content: json.data.content.trim(), status: res.status };
  } catch {}
  return { content: "", status: res.status };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SHORT_SPEC_THRESHOLD = 500;

const BLOCKED_ATS_TRACKERS = [
  '#J-18808-Ljbffr',
  'jobleads',
  'getwork',
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
  'joub.co.za',
  'jooble.org',
  'jooble.com',
  'jooble.co.za',
  'executiveplacements.com',
  'executiveplacements.co.za',
  'whatjobs.com',
  'en-za.whatjobs.com',
  'cosmoquick.com',
  'cosmoquick.club',
  'naukri.my',
  // Job aggregator / meta-search sites (redirect to other boards, no real listings)
  'jobrapido.com',
  'jobrapido.co.za',
  'jobrapido.co.uk',
  'jobrapido.com.au',
  'jobrapido.de',
  'jobrapido.fr',
  'jobrapido.it',
  'jobrapido.es',
  'careerjet.co.za',
  'careerjet.co',
  'jobsearch101.co.za',
  'jobsearch101.com',
  'neuvoo.co.za',
  'neuvoo.com',
  'simplyhired.com',
];

const BLACKLISTED_COMPANIES = [
  'joub.co.za',
  'jooble',
  'executiveplacements',
  'cosmoquick',
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

function decodeBingRedirect(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("bing.com") && u.pathname.includes("/ck/a")) {
      const raw = u.searchParams.get("u");
      if (raw) {
        for (let offset = 1; offset <= 3; offset++) {
          if (raw.length > offset) {
            const decoded = Buffer.from(raw.slice(offset), "base64").toString("utf-8");
            if (decoded.startsWith("http")) return decoded;
          }
        }
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

function extractPostedDateFromSpec(spec: string): string {
  const text = spec.toLowerCase().slice(0, 3000);
  const patterns = [
    /posted\s+(\d+)\s+(day|week|month|year)s?\s+ago/i,
    /(\d+)\s+(day|week|month|year)s?\s+ago/i,
    /active\s+since\s+(.+)/i,
    /date posted[:\s]+(.+)/i,
    /posted on[:\s]+(.+)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[0];
  }
  return "";
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
  // 404 / not-found / error page indicators
  "page not found",
  "job not found",
  "listing not found",
  "this job could not be found",
  "the position you're looking for",
  "the job you're looking for",
  "does not exist",
  "does not appear to exist",
  "we couldn't find",
  "we could not find",
  "no longer exists",
  "removed from",
  "this page is no longer",
  "error 404",
  "404 not found",
  "404 error",
];

function isExpired(text: string): boolean {
  const lower = text.toLowerCase();
  return EXPIRED_PATTERNS.some((p) => lower.includes(p));
}

/** Check if Jina returned an HTTP error status (404, 410, 5xx) or the content is an error page */
function isJinaErrorPage(status: number, content: string): boolean {
  if (status === 404 || status === 410) return true;
  if (status >= 500) return true;
  if (content.length < 200 && isExpired(content)) return true;
  return false;
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
  posted_at: string;
  posted_at_ms: number;
  suggested_cv: string;
  knockout_fail: boolean | null;
  pillar_scores: { industry: number; function: number; scale: number; tools: number; location: number } | null;
  taxes_applied: string[] | null;
  total_questions_asked: number | null;
  yes_answers: number | null;
  recruiter_verdict: string | null;
  dynamic_requirements: { requirement: string; mandatory: boolean; pillar: string; met: boolean; evidence: string }[] | null;
  spec_source: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "bing_jobs" | "scrappa" | "ditto" | "workday" | null;
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
  const tryDecode = (u: string) => decodeBingRedirect(decodeGoogleRedirect(u));
  if (job.apply_options?.[0]?.link) return tryDecode(job.apply_options[0].link);
  if (job.job_highlights?.link) return tryDecode(job.job_highlights.link);
  if (job.link) return tryDecode(job.link);
  return '';
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
  (s ?? "").replace(/["\r\t]/g, " ").replace(/[^\S\n]+/g, " ").trim();

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

const SERP_PAGE_SIZE = 10;

async function fetchPaginatedJobs(params: { q: string; location?: string; hl?: string; gl?: string; start?: number }, maxPages: number): Promise<SerpJob[]> {
  const all: SerpJob[] = [];
  const seen = new Set<string>();

  // Primary: SerpAPI Google Jobs
  try {
    for (let p = 0; p < maxPages; p++) {
      const jobs = await searchGoogleJobs({ ...params, start: p * SERP_PAGE_SIZE });
      if (!jobs || jobs.length === 0) break;
      for (const j of jobs) {
        const key = `${j.title ?? ""}|${j.company_name ?? ""}`.toLowerCase();
        if (!seen.has(key)) { seen.add(key); j.spec_source = "google_jobs"; all.push(j); }
      }
      if (jobs.length < SERP_PAGE_SIZE) break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog(`[SEARCH] SerpAPI failed: ${msg.slice(0, 150)}`);
  }

  return all;
}

async function fetchAndFilterJobs(
  query: string,
  profileLocation: string,
  user: any,
  searchId: string,
  bannedJobs: string[],
  bannedCompanies: string[],
  dataClient: any,
  profile_id: string | null,
  onStatus?: (event: SearchEvent) => void,
  pfRound?: number,
  hiddenJobKeys?: Set<string>,
  maxAgeDays?: number,
  maxPages?: number,
  allowedPlatforms?: string[] | null,
): Promise<{ rawJobs: any[]; jobSpecs: [number, string][]; jobUrls: [number, string][]; queryUsed: string }> {
  function sanitiseLocation(raw: string): string | undefined {
    if (!raw) return undefined;
    const stripped = raw.replace(/\b(Remote|Hybrid|On-site|Online|Work from home|WFH|Flexible|Anywhere)\b/gi, "").trim();
    const cleaned = stripped.replace(/^[\s,;/-]+|[\s,;/-]+$/g, "").replace(/[\s,;/-]+/g, " ");
    if (!cleaned || cleaned.length < 2) return undefined;
    return cleaned;
  }

  const sanitisedLocation = sanitiseLocation(profileLocation);

  // Province corrector — map suburb/city to province for tighter source queries
  const locationMapped = mapLocationToProvince(sanitisedLocation ?? "");
  const tightenedLocation = locationMapped.province || sanitisedLocation;
  if (sanitisedLocation && tightenedLocation !== sanitisedLocation) {
    console.log(`[PIPELINE] Location corrected: "${sanitisedLocation}" → "${tightenedLocation}" (province: ${locationMapped.province})`);
  }

  const buildSerpParams = (location?: string) => ({
    q: query,
    location: location,
    hl: "en" as const,
    gl: "za" as const,
  });

  const serpParams = buildSerpParams(tightenedLocation);
  const pages = maxPages ?? 2;

  let rawJobs: SerpJob[];
  let dedupCount = 0;
  let catFilterRemoved = 0;
  let locationFilterRemoved = 0;
  try {
    // ─── Platform-aware source selection ──────────────────────────────────
    const isAll = !allowedPlatforms || allowedPlatforms.length === 0;
    const hasNonLinkedIn = !isAll;

    const sources = {
      googleJobs: true,            // always run
      jSearch: isAll || hasNonLinkedIn,  // skip when only LinkedIn
      adzuna: isAll,               // only when All
      webJobs: isAll,               // Scrappa (Google Jobs API)
      jinaBing: isAll,              // Jina Reader scraping Bing Jobs
      ditto: isAll,                 // Ditto Jobs (BrightData browser)
      workday: isAll,               // Workday CXS API (29 SA tenants, no browser)
    };

    const enabledCount = Object.values(sources).filter(Boolean).length;
    console.log(`[PIPELINE] Starting ${enabledCount}-source parallel search:`, JSON.stringify({ query, location: sanitisedLocation, pages, platforms: allowedPlatforms, sources }));

    // Build promises for enabled sources only
    const promiseEntries = Object.entries(sources).filter(([, enabled]) => enabled).map(([key]) => {
      switch (key) {
        case "googleJobs":
          return ["googleJobs", withTimeout(fetchPaginatedJobs(serpParams, pages), 60_000, "Google Jobs").catch((err) => { console.error(`[PIPELINE] Google Jobs TIMEOUT/FAIL: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`); return [] as SerpJob[]; })] as const;
        case "jSearch":
          return ["jSearch", withTimeout(searchJSearch(serpParams), 60_000, "JSearch").catch((err) => { console.error(`[PIPELINE] JSearch TIMEOUT/FAIL: ${err}`); return [] as SerpJob[]; })] as const;
        case "adzuna":
          return ["adzuna", withTimeout(searchAdzuna(serpParams), 60_000, "Adzuna").catch((err) => { console.error(`[PIPELINE] Adzuna TIMEOUT/FAIL: ${err}`); return [] as SerpJob[]; })] as const;
        case "webJobs":
          return ["webJobs", withTimeout(searchWebJobs(serpParams), 60_000, "Web Jobs").catch((err) => { console.error(`[PIPELINE] Web Jobs TIMEOUT/FAIL: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`); return [] as SerpJob[]; })] as const;
        case "jinaBing":
          return ["jinaBing", searchJinaBingJobs(serpParams).catch((err) => { console.error(`[PIPELINE] Jina Bing Jobs FAIL: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`); return [] as SerpJob[]; })] as const;
        case "ditto":
          return ["ditto", withTimeout(searchDittoJobs(serpParams), 90_000, "Ditto Jobs").catch((err) => { console.error(`[PIPELINE] Ditto Jobs TIMEOUT/FAIL: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`); return [] as SerpJob[]; })] as const;
        case "workday":
          return ["workday", withTimeout(searchWorkdayJobs(serpParams), 60_000, "Workday").catch((err) => { console.error(`[PIPELINE] Workday TIMEOUT/FAIL: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`); return [] as SerpJob[]; })] as const;
        default:
          return [key, Promise.resolve([])] as const;
      }
    });

    const pipelineStart = Date.now();
    const resultObj: Record<string, any[]> = {};
    const sourcePromises = promiseEntries.map(([key, promise]) => {
      return promise.then((result) => {
        resultObj[key] = result;
        console.log(`[PIPELINE] ${key} resolved: ${(result as any[]).length} jobs (${Date.now() - pipelineStart}ms elapsed)`);
      }).catch(() => { resultObj[key] = []; });
    });

    const PIPELINE_DEADLINE_MS = 270_000;
    const deadline = new Promise<void>((resolve) => setTimeout(resolve, PIPELINE_DEADLINE_MS));
    await Promise.race([Promise.all(sourcePromises), deadline]);

    const googleJobs = (resultObj["googleJobs"] ?? []) as SerpJob[];
    const jsearchJobs = (resultObj["jSearch"] ?? []) as SerpJob[];
    const adzunaJobs = (resultObj["adzuna"] ?? []) as SerpJob[];
    const webJobsJobs = (resultObj["webJobs"] ?? []) as SerpJob[];
    const jinaBingJobs = (resultObj["jinaBing"] ?? []) as SerpJob[];
    const dittoJobs = (resultObj["ditto"] ?? []) as SerpJob[];
    const workdayJobs = (resultObj["workday"] ?? []) as SerpJob[];

    console.log(`[PIPELINE] Sources returned after ${Date.now() - pipelineStart}ms: GoogleJobs=${googleJobs.length} JSearch=${jsearchJobs.length} Adzuna=${adzunaJobs.length} WebJobs=${webJobsJobs.length} JinaBing=${jinaBingJobs.length} Ditto=${dittoJobs.length} Workday=${workdayJobs.length}`);

    // Merge all sources with dedup (priority: JSearch > Google Jobs > Bing Jobs > Scrappa > Adzuna)
    rawJobs = [];
    const seenKeys = new Set<string>();

    function addJobs(jobs: SerpJob[]) {
      for (const j of jobs) {
        const url = buildJobUrl(j);
        const key = url
          ? url.toLowerCase().replace(/\/+$/, "")
          : `${j.title ?? ""}|${j.company_name ?? ""}`.toLowerCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          rawJobs.push(j);
        } else {
          // If existing job has shorter description, replace with this one
          const existing = rawJobs.find((r) => {
            const eUrl = buildJobUrl(r);
            const eKey = eUrl
              ? eUrl.toLowerCase().replace(/\/+$/, "")
              : `${r.title ?? ""}|${r.company_name ?? ""}`.toLowerCase();
            return eKey === key;
          });
          if (existing) {
            const existingLen = existing.description?.length ?? 0;
            const newLen = j.description?.length ?? 0;
            if (newLen > existingLen) {
              j.spec_source = j.spec_source ?? existing.spec_source;
              Object.assign(existing, { description: j.description, hasFullSpec: j.hasFullSpec, spec_source: j.spec_source });
            }
          }
        }
      }
    }

    // Priority order: JSearch (best inline) → Google Jobs → Bing Jobs → Ditto → Workday → Scrappa → Adzuna
    console.log("[PIPELINE] Merging sources (priority: JSearch > Google > Bing > Ditto > Workday > Scrappa > Adzuna)");
    addJobs(jsearchJobs);
    addJobs(googleJobs);
    addJobs(jinaBingJobs);
    addJobs(dittoJobs);
    addJobs(workdayJobs);
    addJobs(webJobsJobs);
    addJobs(adzunaJobs);

    console.log(`[PIPELINE] Dedup complete: ${rawJobs.length} unique jobs from ${googleJobs.length + jsearchJobs.length + adzunaJobs.length + webJobsJobs.length + jinaBingJobs.length + dittoJobs.length + workdayJobs.length} total`);
    dedupCount = rawJobs.length;

    // Filter out category/search/listing pages masquerading as individual job listings
    const beforeCatFilter = rawJobs.length;
    rawJobs = rawJobs.filter((j) => {
      const url = buildJobUrl(j);
      if (isCategoryPage(j.title, url)) {
        console.log(`[PIPELINE] Filtered category page: "${j.title}" at ${url}`);
        return false;
      }
      return true;
    });
    if (beforeCatFilter !== rawJobs.length) {
      catFilterRemoved = beforeCatFilter - rawJobs.length;
      console.log(`[PIPELINE] Category filter removed ${catFilterRemoved} non-job pages`);
    }

    // Persist raw found jobs immediately
    const rawRows = rawJobs.map(j => ({
      user_id: user.id,
      search_id: searchId,
      job_title: j.title ?? 'Unknown',
      company: j.company_name ?? 'Unknown',
      location: j.location ?? '',
      job_url: buildJobUrl(j),
      status: 'pending',
      match_score: -1
    }));
    await getSupabase().from("job_results").insert(rawRows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("(400)")) {
      try {
        rawJobs = await fetchPaginatedJobs(buildSerpParams(undefined), pages);
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
    const postedStr = (j as any).detected_extensions?.posted_at ?? (j as any).posted_at ?? "";
    (j as any)._postedAt = postedStr;
    (j as any)._postedAtMs = parsePostedAt(postedStr) ?? 0;
  }

  // Location safety net — whitelist: only keep jobs in SA, remote, or with no location
  const SA_CITIES = /\b(johannesburg|cape town|durban|pretoria|gqeberha|port elizabeth|bloemfontein|east london|polokwane|nelspruit|kimberley|soweto|centurion|sandton|midrand|stellenbosch|roodepoort|benoni|boksburg|germiston|vereeniging|umhlanga|pinetown|pietermaritzburg|howick|newcastle|barberton|white river|graskop|hoedspruit|phalaborwa|thohoyandou|tzaneen|haenertsburg|rustenburg|klerksdorp|potchefstroom|upington|george|knysna|plettenberg bay|mossel bay|hermanus|paarl|worcester|makhanda|jeffreys bay)\b/i;
  const SA_PROVINCES = /\b(gauteng|western cape|kwazulu-natal|kwa-zulu natal|eastern cape|free state|limpopo|mpumalanga|north west|northern cape|south africa)\b/i;

  const beforeCount = rawJobs.length;
  rawJobs = rawJobs.filter((j) => {
    const loc = ((j as any).location ?? "").toLowerCase();
    const title = ((j as any).title ?? "").toLowerCase();
    const company = ((j as any).company_name ?? "").toLowerCase();
    const combined = `${loc} ${title} ${company}`;

    // Remote jobs — keep (can be worked from anywhere)
    if (/\b(remote|work from home|anywhere|worldwide|global|flexible)\b/i.test(combined)) return true;

    // Jobs with no location — keep (don't lose potential matches)
    if (!loc || loc.length < 2) return true;

    // Explicitly SA — keep (check location, title, and company)
    if (SA_CITIES.test(loc) || SA_PROVINCES.test(loc) || /south africa|\bSA\b|\bZA\b/i.test(combined)) return true;

    // Has a specific location but it's not SA — reject (whitelist approach)
    return false;
  });

  if (rawJobs.length < beforeCount) {
    locationFilterRemoved = beforeCount - rawJobs.length;
    console.log(`[PIPELINE] Location filter removed ${locationFilterRemoved} non-SA jobs (${beforeCount} → ${rawJobs.length})`);
  }

  // Domain blacklist pre-filter — deterministic, blocks aggregator/spam sites before spec scraping
  const blacklistRejected: { job: any; reason: string }[] = [];
  rawJobs = rawJobs.filter((j) => {
    const url = buildJobUrl(j);
    const domain = extractDomain(url);
    const viaBlocked = isBlacklistedByVia(j.via);
    const domainBlocked = domain && BLACKLISTED_DOMAINS.some((d) => domain === d || domain?.endsWith(`.${d}`) || domain?.includes(d));
    const companyLower = (j.company_name ?? "").toLowerCase();
    const companyBlocked = BLACKLISTED_COMPANIES.some((c) => companyLower.includes(c));
    if (domainBlocked || viaBlocked || companyBlocked) {
      const reason = viaBlocked ? `blacklisted_via: ${j.via}` : companyBlocked ? `blacklisted_company: ${j.company_name}` : `blacklisted_domain: ${domain}`;
      blacklistRejected.push({ job: j, reason });
      return false;
    }
    return true;
  });
  if (blacklistRejected.length > 0) {
    for (const { job: j, reason } of blacklistRejected) {
      console.log(`[PIPELINE] Blacklisted: "${j.title}" at "${j.company_name}" — ${reason} — url=${buildJobUrl(j)}`);
    }
    const rows = blacklistRejected.map(({ job: j, reason }) => ({
      user_id: user.id, search_id: searchId, search_query: query,
      profile_id: profile_id,
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
      profile_id: profile_id,
      job_title: j.title, company: j.company_name, location: j.location ?? '',
      snippet: (j.description ?? '').slice(0, 500), job_url: buildJobUrl(j),
      reason: `banned_${bannedJobs.includes(buildJobUrl(j)) ? 'job' : 'company'}`,
      rejection_category: 'banned', rejection_reason: bannedJobs.includes(buildJobUrl(j)) ? 'banned_job' : 'banned_company',
      passed_domain_filter: true, passed_banned_filter: false,
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && debugLog('[SEARCH] Failed to log banned rejected:', r.error));
  }

  // Platform filter: keep only jobs from allowed platforms
  if (allowedPlatforms && allowedPlatforms.length > 0) {
    const before = rawJobs.length;
    rawJobs = rawJobs.filter((j) => {
      const via = (j.via ?? "").toLowerCase();
      const url = buildJobUrl(j).toLowerCase();
      return allowedPlatforms.some((p) => via.includes(p) || url.includes(p));
    });
    if (rawJobs.length < before) {
      debugLog(`[SEARCH] Platform filter: ${before - rawJobs.length} jobs removed, ${rawJobs.length} kept`);
    }
  }

  // Pre-filter: reject ATS tracker / job lead aggregator jobs before Jina scraping
  const atsRejected: any[] = [];
  rawJobs = rawJobs.filter((j) => {
    const desc = j.description ?? "";
    if (BLOCKED_ATS_TRACKERS.some(t => desc.includes(t))) {
      atsRejected.push(j);
      return false;
    }
    return true;
  });
  if (atsRejected.length > 0) {
    const rows = atsRejected.map(j => ({
      user_id: user.id, search_id: searchId, search_query: query,
      profile_id: profile_id,
      job_title: j.title, company: j.company_name, location: j.location ?? '',
      snippet: (j.description ?? '').slice(0, 500), job_url: buildJobUrl(j),
      reason: 'ats_tracker', rejection_category: 'spam', rejection_reason: 'ats_tracker_or_lead_aggregator',
      passed_domain_filter: false, passed_banned_filter: false,
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && debugLog('[SEARCH] Failed to log ATS rejected:', r.error));
  }

  // Reject jobs with no real URL or search-result-page URLs (saves Jina API calls)
  const noUrlRejected: any[] = [];
  rawJobs = rawJobs.filter((j) => {
    const url = buildJobUrl(j);
    if (!url) {
      noUrlRejected.push(j);
      return false;
    }
    // Reject Google/Bing search URLs masquerading as job links
    const lower = url.toLowerCase();
    if (lower.includes('google.com/search') || lower.includes('bing.com/search')) {
      noUrlRejected.push(j);
      return false;
    }
    return true;
  });
  if (noUrlRejected.length > 0) {
    const rows = noUrlRejected.map(j => ({
      user_id: user.id, search_id: searchId, search_query: query,
      profile_id: profile_id,
      job_title: j.title, company: j.company_name, location: j.location ?? '',
      snippet: (j.description ?? '').slice(0, 500), job_url: buildJobUrl(j),
      reason: 'no_real_url', rejection_category: 'spam', rejection_reason: 'no_real_job_url_or_search_page',
      passed_domain_filter: false, passed_banned_filter: false,
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && debugLog('[SEARCH] Failed to log no-URL rejected:', r.error));
    console.log(`[PIPELINE] Rejected ${noUrlRejected.length} jobs with no real URL`);
  }

  // Reject low-quality search snippets (e.g. Bing search results masquerading as jobs)
  // These have short descriptions, no real URL, and no inline spec
  const snippetRejected: any[] = [];
  rawJobs = rawJobs.filter((j) => {
    const url = j.link ?? '';
    const desc = j.description ?? '';
    const hasSpec = j.hasFullSpec && desc.length >= SHORT_SPEC_THRESHOLD;
    // Bing Jobs always have real specs from Bright Data — never reject as snippet
    if (j.spec_source === "bing_jobs") return true;
    // If no real link AND short description AND no inline spec → it's a search snippet, not a job
    if (!url && !hasSpec && desc.length < 500) {
      snippetRejected.push(j);
      return false;
    }
    return true;
  });
  if (snippetRejected.length > 0) {
    console.log(`[PIPELINE] Rejected ${snippetRejected.length} low-quality search snippets`);
  }

  console.log(`[PIPELINE] Filter breakdown: dedup=${dedupCount} → cat=${catFilterRemoved}, loc=${locationFilterRemoved}, blacklist=${blacklistRejected.length}, banned=${bannedRejected.length}, ats=${atsRejected.length}, noUrl=${noUrlRejected.length}, snippet=${snippetRejected.length} → survived=${rawJobs.length}`);
  console.log(`[PIPELINE] Spec assignment: ${rawJobs.length} jobs entering (bing=${rawJobs.filter((j) => j.spec_source === "bing_jobs").length}, fullSpec=${rawJobs.filter((j) => j.hasFullSpec).length})`);
  for (let i = 0; i < rawJobs.length; i++) {
    const job = rawJobs[i];
    const jobUrl = buildJobUrl(job);

    if (job.hasFullSpec && job.description && (job.description.length >= SHORT_SPEC_THRESHOLD || job.spec_source === "bing_jobs")) {
      (job as any)._spec = job.description;
      if (isExpired(job.description)) (job as any)._expired = true;
      continue;
    }

    let specText = "";
    let jinaStatus = 0;
    if (jobUrl) {
      // Fast-path: Workday CXS API (instant JSON, no browser needed)
      if (job.spec_source === "workday" && (job as any)._workdayTenant && (job as any)._workdayPath) {
        try {
          specText = await fetchWorkdayDetail((job as any)._workdayTenant as WorkdayTenant, (job as any)._workdayPath as string);
        } catch {}
      }
      // Cascade: Jina (fast, free) → Bright Data (renders JS) → Apify (markdown)
      if (!specText) {
        try {
          const jina1 = await fetchJinaPage(jobUrl, JINA_API ?? null);
          jinaStatus = jina1.status;
          specText = jina1.content;
          if (!specText && JINA_API) {
            const jina2 = await fetchJinaPage(jobUrl, null);
            jinaStatus = jina2.status;
            specText = jina2.content;
          }
        } catch {}
        if (!specText) {
          try { specText = await scrapePageBrightData(jobUrl); } catch {}
        }
        if (!specText) {
          try { specText = await scrapePageApify(jobUrl); } catch {}
        }
      }
    }
    if (!specText) {
      (job as any)._noSpec = true;
      continue;
    }
    (job as any)._spec = specText;
    // Check for expired/unavailable jobs: text patterns OR Jina HTTP error page
    if (isExpired(specText) || isJinaErrorPage(jinaStatus, specText)) {
      (job as any)._expired = true;
      console.log(`[PIPELINE] Expired/unavailable: "${job.title}" at "${job.company_name}" — jina=${jinaStatus}, reason=${isJinaErrorPage(jinaStatus, specText) ? 'jina_error_page' : 'expired_pattern'}`);
    }
  }


  const noSpecRejected = rawJobs.filter((j) => (j as any)._noSpec);
  if (noSpecRejected.length > 0) {
    console.log(`[PIPELINE] Rejected ${noSpecRejected.length} jobs with no spec (Jina+BD+Apify all failed)`);
    const rows = noSpecRejected.map((j) => ({
      user_id: user.id, search_id: searchId, search_query: query,
      profile_id: profile_id,
      job_title: j.title, company: j.company_name, location: j.location ?? '',
      snippet: '', job_url: buildJobUrl(j),
      reason: 'jina_read_failed', rejection_category: 'ai', rejection_reason: 'jina_read_failed',
      passed_domain_filter: false, passed_banned_filter: false,
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && debugLog('[SEARCH] Failed to log no-spec rejected:', r.error));
  }
  rawJobs = rawJobs.filter((j) => !(j as any)._noSpec);
  if (rawJobs.length === 0) return { rawJobs: [], jobSpecs: [], jobUrls: [], queryUsed: query };

  const expiredCount = rawJobs.filter((j) => (j as any)._expired).length;
  if (expiredCount > 0) console.log(`[PIPELINE] ${expiredCount} jobs flagged expired before spec-length gate`);
  rawJobs = rawJobs.filter((j) => !(j as any)._expired);
  console.log(`[PIPELINE] Pre-spec-gate: ${rawJobs.length} jobs (specs set=${rawJobs.filter((j) => (j as any)._spec).length}, bing=${rawJobs.filter((j) => j.spec_source === "bing_jobs").length})`);

  {
    const filtered: typeof rawJobs = [];
    const filteredSpecs = new Map<number, string>();
    const filteredUrls = new Map<number, string>();
    const droppedShort: any[] = [];
    const droppedAts: any[] = [];
    rawJobs.forEach((j) => {
      const spec = (j as any)._spec ?? "";
      if (BLOCKED_ATS_TRACKERS.some(t => spec.includes(t))) { droppedAts.push(j); return; }
      if (spec.length >= SHORT_SPEC_THRESHOLD || j.spec_source === "bing_jobs") {
        const newIdx = filtered.length;
        filtered.push(j); filteredSpecs.set(newIdx, spec); filteredUrls.set(newIdx, buildJobUrl(j));
      } else {
        droppedShort.push(j);
      }
    });
    if (droppedShort.length > 0) {
      console.log(`[PIPELINE] Dropped ${droppedShort.length} jobs with short spec (<${SHORT_SPEC_THRESHOLD} chars): [${droppedShort.slice(0, 5).map((j: any) => `"${j.title}" (${j.company_name}) spec=${((j as any)._spec ?? "").length}ch`).join(', ')}]`);
    }
    if (droppedAts.length > 0) {
      console.log(`[PIPELINE] Dropped ${droppedAts.length} jobs containing ATS trackers`);
    }
    rawJobs = filtered;
    console.log(`[PIPELINE] fetchAndFilterJobs returning ${rawJobs.length} jobs for scoring (specs=${filteredSpecs.size})`);
    return { rawJobs, jobSpecs: [...filteredSpecs.entries()], jobUrls: [...filteredUrls.entries()], queryUsed: query };
  }
}

function extractMandatoryMissing(specLower: string, cvLower: string): string | null {
  const patterns = [
    // "Dispensing license - MUST HAVE", "X is required", "X is mandatory"
    /(?:^|\n|[.;!\-])\s*([\w\s\-/]+?(?:license|licence|certificate|certification|registration|permit))\s*[-:]\s*(must have|required|essential|mandatory|a must)\b/gi,
    // "MUST HAVE a valid X", "must hold X license"
    /\b(must have|must hold|must possess)\s+(?:a\s+|an\s+)?(?:valid\s+|current\s+|active\s+)?([\w\s\-/]+?(?:license|licence|certificate|certification|registration|permit))\b/gi,
    // "X is required/essential/mandatory"
    /([\w\s\-/]+?(?:license|licence|certificate|certification|registration|permit))\s+(?:is\s+)?(?:required|essential|mandatory)\b/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(specLower)) !== null) {
      const requirement = (pattern === patterns[0] ? match[1] : match[2] || match[1] || "").trim().toLowerCase();
      if (!requirement || requirement.length < 3) continue;
      const cleaned = requirement.replace(/^(valid|current|active|relevant)\s+/i, "").trim();
      if (!cvLower.includes(cleaned)) {
        return `"${cleaned}" is mandatory but missing from CV`;
      }
    }
  }
  return null;
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
  profile_id: string | null,
  onStatus?: (event: SearchEvent) => void,
  pfRound?: number,
  dedupSets?: { history: Set<string>; saved: Set<string>; blocked: Set<string>; rejected?: Set<string> },
  maxAgeDays?: number,
  offset: number = 0,
): Promise<{ results: JobRow[]; queryUsed: string; filteredCounts: { history: number; saved: number; rejected: number; blocked: number }; nextOffset: number }> {
  const filteredCounts = { history: 0, saved: 0, rejected: 0, blocked: 0 };
  let nextOffset = offset;

  // AI scoring toggle — set AI_SCORING=false to disable matching — jun27
  const aiScoringEnabled = process.env.AI_SCORING !== "false";

  if (!aiScoringEnabled) {
    const jobSpecs = new Map(jobSpecsEntries);
    const jobUrls = new Map(jobUrlsEntries);
    const results: JobRow[] = rawJobs.map((job: any, i: number) => ({
      user_id: user.id,
      search_id: searchId,
      job_title: job.title,
      company: job.company_name,
      location: job.location,
      estimated_salary: "",
      match_score: 0,
      match_summary: "Scoring is currently disabled.",
      verdict_bullets: null,
      job_url: jobUrls.get(i) || buildJobUrl(job),
      full_spec: jobSpecs.get(i) || job.description || "",
      search_query: query,
      posted_at: "",
      posted_at_ms: 0,
      suggested_cv: "",
      knockout_fail: null,
      pillar_scores: null,
      taxes_applied: null,
      total_questions_asked: null,
      yes_answers: null,
      recruiter_verdict: null,
      dynamic_requirements: null,
      spec_source: job.spec_source ?? null,
    }));
    onStatus?.({ type: "almost_done", progress: 90 });
    return { results, queryUsed: query, filteredCounts, nextOffset };
  }

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

  const blacklistInfo = `BLACKLISTED_DOMAINS: ${BLACKLISTED_DOMAINS.join(", ")}`;
  const bannedInfo = bannedCompanies.length > 0 ? `\nUSER-BANNED COMPANIES: ${bannedCompanies.join(", ")}` : "";
  const dateConstraintInfo = maxAgeDays
    ? `\nDATE CONSTRAINT: Only consider jobs posted within the last ${maxAgeDays} day(s). Check the job spec text for ANY date indicators: "posted X days/weeks/months ago", "date posted:", "active since", or any date mentioned. If a date is found and the job is older than ${maxAgeDays} days, immediately score 0 with reason "Posted outside date filter". If no date is found anywhere in the spec, assume it passes.`
    : "";
  const locationConstraintInfo = profileLocation
    ? `\nLOCATION CONSTRAINT: The candidate is based in "${profileLocation}", South Africa. Check the job's location field in the input JSON AND scan the full job spec for any location indicators. If the job is explicitly located in a city/country OUTSIDE South Africa (e.g. "London", "New York", "Dubai", "Singapore", "Remote - US only", "EU only", "Americas", "EMEA" targeting non-SA), immediately score 0 with reason "Job is not hiring in candidate's location". EXCEPTIONS — do NOT reject if: (a) the job says "Remote", "Work from home", "Anywhere", "Worldwide", "Global", "Flexible location"; (b) the job says "Hybrid" or "On-site" but the location is in South Africa; (c) the location field is empty or missing.\nPROXIMITY: If the job is in a DIFFERENT South African province from the candidate's location (${profileLocation}), apply the Location Tax (-30) in STEP 6. If in the SAME province, no penalty. Remote/Work-from-home with no location restriction = no penalty.`
    : "";

  const dynamicScoringPrompt = `You are a strict Recruitment Auditor acting as a hiring manager. You analyze ONE job spec against the candidate's CV and score the match.

CANDIDATE INDUSTRY: ${profileIndustry || "Unknown"}

---
PROCESS:

PRE-CHECK: DOMAIN, DATE, LOCATION, AND DUPLICATE FILTERS
A) DOMAIN CHECK: The job URL is provided in the input JSON. Check if the URL contains any domain from the BLACKLISTED_DOMAINS list below. If it matches (exact domain or subdomain of any blacklisted entry), immediately return: { "score": 0, "reason": "Job is from a blacklisted aggregator domain (<domain>)", "knockout_fail": true, "recruiter_verdict": "REJECT", ... } with all other fields filled with defaults. Do NOT continue to Step 0.
B) DATE CHECK: Scan the full job spec text for any date indicators — "posted X days/weeks/months ago", "date posted:", "active since", "applications close [date]", or any explicit date. If a posting date is found and it is older than the DATE CONSTRAINT below, immediately score 0 with reason "Posted outside date filter". If no date is found, it passes.
C) LOCATION CHECK: Check the job's location field in the input JSON AND scan the full spec for any location indicators. If the job is explicitly located outside South Africa (e.g. "London", "New York", "Dubai", "Singapore", "US only", "EU only", "EMEA" not including SA), immediately score 0 with reason "Job is not hiring in candidate's location". EXCEPTIONS — do NOT reject if: (a) the job says "Remote", "Work from home", "Anywhere", "Worldwide", "Global", "Flexible"; (b) location is in South Africa; (c) location field is empty or missing.
D) DUPLICATE CHECK: Compare this job's title + company against the PREVIOUSLY SCORED JOBS list below. If the same title AND company appear in the list, immediately return: { "score": 0, "reason": "Duplicate of previously processed job: <title> at <company>", "knockout_fail": true, "recruiter_verdict": "REJECT", ... } with all other fields filled with defaults. Do NOT continue to Step 0.

If all four checks pass, proceed to Step 0.

STEP 0: SUB-VERTICAL IDENTIFICATION & CV SELECTION
A) Identify the candidate's professional sub-vertical from their EMPLOYERS, not their tools.
   Industry is where the COMPANIES operate. Digital marketer at Superbalist = E-commerce, NOT SaaS.
B) Identify the job's sub-vertical — what does the hiring company sell?
C) Select the CV variation whose day-to-day responsibilities most closely match the role.
D) Set suggested_cv_name to the exact CV filename.

STEP 1: RECRUITER QUESTIONS
Think like a hiring manager reviewing this CV for this role. Read the FULL job spec. For EACH requirement, generate ONE interview question you would ask the candidate.

Classify each requirement as MANDATORY or PREFERRED:
- MANDATORY: stated with "required", "must have", "essential", "mandatory", "necessary", "minimum"
- PREFERRED: stated with "preferred", "advantageous", "nice to have", "desirable", "ideal", "bonus"
If neither label is explicit, treat as MANDATORY unless context clearly implies optional.

MANDATORY requirements become direct questions:
- "Do you have experience with Python 3.9 and Pytest?" (if spec says "Python 3.9, Pytest required")
- "Have you managed a month-end close process?"

PREFERRED requirements become softer questions:
- "Have you worked with Terraform or similar IaC tools?"

Include: certifications, licenses, tools, platforms, languages, experience thresholds (years, team size, deal size, revenue), industry background, specific responsibilities, soft skills if stated as requirements.

CRITICAL RULE — DEGREES: NEVER create a degree requirement unless the JD contains an EXPLICIT phrase like:
  "Bachelor's degree required", "Degree in X", "NQF level 7+", "tertiary qualification required"

Each requirement = one question. Do not combine. 15 requirements = 15 questions.

Categorize each into the correct pillar:
- "industry": sub-vertical match, sector experience, employer background
- "function": role type, daily responsibilities, task experience
- "scale": years of experience, team size, revenue managed, stakeholder level
- "tools": specific tools, certifications, platforms, methodologies, licenses
- "location": geography, relocation, remote/hybrid/wfh

STEP 2: ANSWER FROM CV
For each question, answer YES or NO based ONLY on what the CV explicitly states.

YES rules — answer YES only if:
- The tool/skill/experience is literally mentioned in the CV (skills list OR work experience)
- The CV shows direct, specific evidence of the requirement
- Include the specific quote/detail from the CV as evidence

NO rules — answer NO if ANY of these apply:
- The CV doesn't mention it at all → NO
- The CV mentions a DIFFERENT tool, language, or category → NO
  - "Python 3.9 required", CV has TypeScript → NO (different language)
  - "Pytest required", CV has Jest → NO (different testing framework)
  - "Terraform required", CV has Docker → NO (different tool category)
- "Industry standard" or "common practice" is NOT evidence → NO
- Inference or assumption is NOT evidence → NO
- Transferable ONLY within the EXACT same tool category: Salesforce→HubSpot CRM (both CRMs) = YES, React→Angular (both React-ecosystem frameworks) = YES. Cross-language or cross-category = NO

It is NORMAL and EXPECTED for 30-60% of answers to be NO. Marking everything as YES is a scoring failure. A candidate cannot match every single requirement — that is fine and honest.

STEP 4: SCORE PILLARS (each 0-100)
For each pillar, calculate: (questions answered met:true / total questions in that pillar) × 100
Then adjust based on these rules:
- Industry: SAME sub-vertical=70-95, ADJACENT=40-65, DIFFERENT=0-30
- Function: Same role type=70-95, Adjacent role=40-65, Different role type=0-30
- Scale: MORE years than required=positive (≥80), LESS than minimum=negative
- Tools: All requirements met=80-95, Most met (≥70%)=50-75, Half met (40-69%)=30-50, Few met (<40%)=0-30. "Met" means the tool appears literally in the CV. Inferred/transferable tools do NOT count as met.
- Location: Same city or remote no restriction=100, Same province=70, Different province=30, Different country=0. CRITICAL: If the candidate is in South Africa and the job is in another country (UK, US, UAE, etc.), Location MUST be 0. "Remote" or "Work from home" with no country restriction = 100. "Remote - US only" or "Remote - EU only" = 0 (not available to SA candidates).

For each pillar, provide a SPECIFIC reason in pillar_reasons referencing CV details.
Good: "Candidate worked at Superbalist and Takealot — both e-commerce, same sub-vertical."
Bad: "Company operates in e-commerce."

STEP 5: KNOCKOUT
If ANY MANDATORY requirement question is met:false → knockout_fail = true → score = 25.

STEP 6: TAXES
- Hopper Tax (-15): 3+ jobs in last 5 years AND avg tenure < 18 months. EXEMPT: self-employed, freelance, founder periods count as one continuous block.
- Overqualified Tax (-10): Current title is significantly MORE senior than JD title.
- Vague Achievement Tax (-10): CV has fewer than 3 specific numbers/percentages.
- No Degree Tax (-10): ONLY if the JD contains an EXPLICIT degree requirement (e.g. "Bachelor's degree required", "Degree in X", "NQF level 7+", "tertiary qualification required") AND the candidate has no tertiary qualification. If the JD does not contain one of these explicit phrases, this tax is FORBIDDEN. Do NOT assume professional roles require degrees.
- Salary Mismatch Tax (-10): JD max salary is below 70% of candidate's implied market rate.
- Location Tax (-30): Job is in a DIFFERENT province from the candidate's location (e.g. candidate in Gauteng, job in Western Cape). EXEMPT if: (a) job says "Remote"/"Work from home"/"Anywhere"/"Worldwide" with no location restriction; (b) job is in the SAME province as the candidate; (c) candidate's location is empty/missing. This is a hard penalty — not discretionary.

STEP 7: FINAL SCORE
Core = Industry×0.25 + Function×0.30 + Scale×0.20 + Tools×0.15 + Location×0.10
Core = Core × 0.95 (competition penalty)
Final = Core − total taxes. Cap 0-95.
If knockout → score = 25.

STEP 8: VERDICT
>= 75: "HIRE" | >= 60: "INTERVIEW" | < 60: "REJECT"

STEP 9: SELF-VERIFY
A) Compute: (Industry×0.25 + Function×0.30 + Scale×0.20 + Tools×0.15 + Location×0.10) × 0.95 − taxes (including Location Tax of -30 if applicable).
   Does this match final score? Fix both if diverge by >5 pts.
B) Reasons MUST reference CV specifics (employer names, skills, numbers).
C) Adjust by ±5 (max ±10) if score feels wrong. Set adjustment_note.
D) pillar_scores MUST reflect the final math.
E) Fabrication check: Count YES answers across all dynamic_requirements. If ≥90% are YES, you have likely fabricated justifications. Revisit Step 2 with strict CV-evidence-only rules. Marking nearly everything as YES is a scoring failure, not a strong candidate.

Return ONLY valid JSON (no markdown, no code fences):
{
  "score": number (integer 0-95),
  "adjustment_note": string | null,
  "reason": string (2-3 sentence match explanation),
  "estimated_salary": string,
  "knockout_fail": boolean,
  "suggested_cv_name": string,
  "pillar_scores": { "industry": number, "function": number, "scale": number, "tools": number, "location": number },
  "pillar_reasons": { "industry": "...", "function": "...", "scale": "...", "tools": "...", "location": "..." },
  "taxes_applied": [string],
  "total_questions_asked": number,
  "yes_answers": number,
  "recruiter_verdict": "HIRE" | "INTERVIEW" | "REJECT",
  "dynamic_requirements": [
    { "requirement": "...", "mandatory": boolean, "pillar": "industry|function|scale|tools|location", "met": boolean, "evidence": "..." }
  ]
}

${blacklistInfo}${bannedInfo}${dateConstraintInfo}${locationConstraintInfo}`;

  let outputs: JobRow[] = [];

  const seenSpecs: { title: string; company: string; url: string }[] = [];

  debugLog(`[SEARCH] Starting one-by-one scoring (${rawJobs.length} jobs, offset ${offset})`);
  onStatus?.({ type: "screening_job", current: 0, total: rawJobs.length, progress: 25 });
  await sleep(80);

  for (let i = offset; i < rawJobs.length; i++) {
    const job = rawJobs[i];
    nextOffset = i + 1;
    const jobUrl = jobUrls.get(i) || buildJobUrl(job);

    const fullSpec = jobSpecs.get(i) || "";

    const progress = Math.min(25 + ((i + 1) / rawJobs.length) * 55, 80);
    onStatus?.({ type: "analyzing_job", title: job.title, company: job.company_name, current: i + 1, total: rawJobs.length, progress });
    await sleep(lastAITier === "gemini" ? 4000 : 1000);

    const dedupContext = seenSpecs.length > 0
      ? `\nPREVIOUSLY SCORED JOBS: ${JSON.stringify(seenSpecs)}\n`
      : "\nPREVIOUSLY SCORED JOBS: (none yet)\n";

    let result: any = null;
    try {
      const jobInput = fullSpec.replace(/["\r\t]/g, " ").replace(/\s+/g, " ").trim();
      const raw = await callAIWithFallback(
        dynamicScoringPrompt + dedupContext,
        `Candidate Profile:\n${profileContext}\n\nJob:\n${JSON.stringify({ job_title: job.title, company: job.company_name, location: job.location, description: jobInput, url: jobUrl }, null, 2)}`,
        `one-by-one scoring ${i + 1}/${rawJobs.length}${pfRound ? ` (PF round ${pfRound})` : ""}`,
        { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 16384 }
      );
      result = JSON.parse(raw);
      debugLog(`[SEARCH] Job ${i + 1}/${rawJobs.length}: "${job.title}" scored ${result.score} (${result.recruiter_verdict})`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      debugLog(`[SEARCH] Job ${i + 1}/${rawJobs.length} AI failed: ${errMsg.slice(0, 100)}`);
      result = { score: 0, reason: "Screening unavailable", estimated_salary: "", dynamic_requirements: null };
    }

    // Track this job for dedup in subsequent iterations
    seenSpecs.push({ title: job.title, company: job.company_name, url: jobUrl });

    // Post-scoring sanity check
    if (result.score >= 40 && !result.knockout_fail) {
      const cvTextLower = cvTexts.map(cv => cv.text).join(" ").toLowerCase();
      const specLower = fullSpec.toLowerCase();
      const mandatory = extractMandatoryMissing(specLower, cvTextLower);
      if (mandatory) {
        result.score = 25;
        result.knockout_fail = true;
        result.taxes_applied = [];
        result.adjustment_note = `Auto-corrected: ${mandatory} is required but absent from CV`;
        result.recruiter_verdict = "REJECT";
        debugLog(`[SEARCH] Post-scoring knockout on job ${i + 1}: ${mandatory}`);
      }
    }

    const score = Math.round(result.score ?? 0);
    const ps = result.pillar_scores;
    const taxes = (result.taxes_applied as string[])?.filter((t: string) => t.length > 0) ?? [];
    const rawVerdict = result.recruiter_verdict ?? (score >= 75 ? "HIRE" : score >= 60 ? "INTERVIEW" : "REJECT");
    const verdict = (rawVerdict === "HIRE" && taxes.includes("Overqualified")) ? "INTERVIEW" : rawVerdict;
    const dr = result.dynamic_requirements ?? null;

    const deductionLabels: Record<string, string> = {
      "Hopper Tax": "Short tenure history — 3+ jobs in 5 years with average under 18 months",
      "Overqualified": "Current role is more senior — may be screened out as overqualified",
      "Vague Achievement Tax": "CV lacks specific metrics and measurable achievements",
      "No Degree Tax": "Role requires a degree which candidate does not have",
      "Salary Mismatch Tax": "Job salary is below 70% of candidate's market rate",
      "Location Tax": "Job is in a different province from the candidate's location",
    };

    const autoSummary = (() => {
      const lines: string[] = [];
      if (dr && dr.length > 0) {
        const met = dr.filter((r: any) => r.met).length;
        lines.push(`Requirements: ${met} of ${dr.length} met`);
      }
      if (ps) {
        const pillarLabels: Record<string, string> = { industry: "Industry", function: "Function", scale: "Experience", tools: "Tools", location: "Location" };
        const psEntries = Object.entries(ps as Record<string, number>);
        const sorted = psEntries.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
        const good = sorted.filter(([, v]) => (v ?? 0) >= 60).slice(0, 2);
        const bad = sorted.filter(([, v]) => (v ?? 0) < 60).slice(0, 2);
        if (good.length > 0) {
          for (const [k] of good) {
            const reason = (result.pillar_reasons as Record<string, string>)?.[k] ?? "";
            if (reason) lines.push(`• ${pillarLabels[k] || k}: ${reason}`);
          }
        }
        if (bad.length > 0) {
          for (const [k] of bad) {
            const reason = (result.pillar_reasons as Record<string, string>)?.[k] ?? "";
            if (reason) lines.push(`• ${pillarLabels[k] || k}: ${reason}`);
          }
        }
      } else {
        const reasonText = result.reason?.trim() || "";
        if (reasonText) lines.push(reasonText);
      }
      for (const t of taxes) {
        const human = deductionLabels[t] || t;
        lines.push(`• ${human}`);
      }
      if (result.adjustment_note) lines.push(`Score adjusted: ${result.adjustment_note}`);
      lines.push(`Verdict: ${verdict}`);
      return lines.join("\n");
    })();

    outputs.push({
      user_id: user.id,
      search_id: searchId,
      job_title: job.title,
      company: job.company_name,
      location: job.location,
      estimated_salary: result.estimated_salary || "",
      match_score: score,
      match_summary: autoSummary,
      verdict_bullets: null,
      job_url: jobUrl,
      full_spec: fullSpec,
      search_query: query,
      posted_at: (job as any)._postedAt ?? "",
      posted_at_ms: (job as any)._postedAtMs ?? 0,
      suggested_cv: result.suggested_cv_name || "",
      knockout_fail: result.knockout_fail ?? null,
      pillar_scores: ps as { industry: number; function: number; scale: number; tools: number; location: number } | null,
      taxes_applied: taxes as string[] | null,
      total_questions_asked: result.total_questions_asked ?? null,
      yes_answers: result.yes_answers ?? null,
      recruiter_verdict: verdict,
      dynamic_requirements: dr,
      spec_source: job.spec_source ?? null,
    });
  }

  if (aiRejectedJobs.length > 0) {
    const rows = aiRejectedJobs.map(({ job, reason, stage }) => ({
      user_id: user.id, search_id: searchId, search_query: query,
      profile_id: profile_id,
      job_title: job.title, company: job.company_name, location: job.location ?? '',
      snippet: (job.description ?? '').slice(0, 500), job_url: buildJobUrl(job),
      reason: `ai_${stage}: ${reason}`,
      rejection_category: 'ai', rejection_reason: `${stage}: ${reason}`,
      passed_domain_filter: true, passed_banned_filter: true,
      passed_pass1: stage !== "pass1", passed_pass2: stage === "pass2",
    }));
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => r.error && debugLog('[SEARCH] Failed to log AI rejected:', r.error));
  }

  onStatus?.({ type: "almost_done", progress: 90 });

  return { results: outputs, queryUsed: query, filteredCounts, nextOffset };
}

function pinReferralJob(results: any[], referralUrl: string | null): any[] {
  if (!referralUrl || results.length === 0) return results;
  const idx = results.findIndex((r) => r.job_url === referralUrl);
  if (idx > 0) {
    const [pinned] = results.splice(idx, 1);
    results.unshift(pinned);
  }
  return results;
}


export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  let searchId = crypto.randomUUID();
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
    const { query, profile_id, pf_mode, continuation, date_filter_days, platforms, referral_url, finish_now } = body;
    const maxAgeDays = date_filter_days ? parseInt(String(date_filter_days), 10) : undefined;
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

    // Rotation state — hoisted to outer scope so ReadableStream can access
    let industrySteps: string[] = [];
    let rotationTitleIndex = 0;
    let rotationIndustryIndex = 0;
    let titles: string[] = [];
    let profileLocation = "";
    let profileIndustry = "";

    if (isContinuation) {
      // Decode continuation state securely
      try {
        state = verifyAndDecodeContinuationToken(continuation, SUPABASE_SERVICE_KEY);
      } catch (err) {
        return NextResponse.json({ error: "Invalid or tampered continuation token." }, { status: 400 });
      }
      // Preserve original searchId from the continuation token
      if (state.searchId) {
        searchId = state.searchId;
      }
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

      // Plan expiry enforcement — revert expired paid plans to Free
      if (!isAdmin && profile.plan !== "free" && profile.plan_expiry && new Date(profile.plan_expiry) < new Date()) {
        const freeLimits = { searches: 2, cv_gens: 0, pf_balance: 0 };
        await dataClient.from("profiles").update({
          plan: "free",
          plan_expiry: null,
          search_balance: freeLimits.searches,
          cv_generation_balance: freeLimits.cv_gens,
          persistent_finder_balance: freeLimits.pf_balance,
        }).eq("id", user.id);

        // Send plan expired email in background
        const planName = profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1);
        const { sendPlanExpired } = await import("@/lib/email");
        sendPlanExpired(userEmail, planName).catch(() => {});

        // Refresh profile after revert
        const { data: refreshedProfile } = await dataClient.from("profiles").select("*").eq("id", user.id).maybeSingle();
        if (refreshedProfile) {
          profile.plan = "free";
          profile.plan_expiry = null;
          profile.search_balance = freeLimits.searches;
          profile.cv_generation_balance = freeLimits.cv_gens;
          profile.persistent_finder_balance = freeLimits.pf_balance;
        }
      }

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
      let liveBalances: { search: number; cv: number; pf: number; has_searched: boolean } | undefined;
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
            return NextResponse.json({ code: "LIMIT_003", message: "No Persistent Finder rounds remaining. Top up to continue." }, { status: 403 });
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

        // Mark that this user has performed at least one search
        await dataClient
          .from("profiles")
          .update({ has_searched: true })
          .eq("id", user.id);

        // Fetch fresh balances after atomic deduction so frontend gets live values
        const { data: freshBalances } = await dataClient
          .from("profiles")
          .select("search_balance, cv_generation_balance, persistent_finder_balance, plan, has_searched")
          .eq("id", user.id)
          .maybeSingle();
        if (freshBalances) {
          liveBalances = {
            search: freshBalances.search_balance ?? 0,
            cv: freshBalances.cv_generation_balance ?? 0,
            pf: freshBalances.persistent_finder_balance ?? 0,
            has_searched: freshBalances.has_searched ?? false,
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
          has_searched: profile.has_searched ?? false,
        };
        livePlan = profile.plan ?? "free";
      }

      // Banned lists
      state.bannedJobs = profile.banned_jobs ?? [];
      state.bannedCompanies = profile.banned_companies ?? [];

      // Get search profile data
      let cvVariations: { name: string; file_path: string }[] = [];

      if (profile_id) {
        const { data: searchProfile } = await dataClient
          .from("search_profiles")
          .select("job_titles, location, industry, industry_step_1, industry_step_2, industry_step_3, industry_step_4, industry_step_5, cv_variations")
          .eq("id", profile_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (searchProfile?.job_titles?.length) {
          titles = searchProfile.job_titles;
          profileLocation = searchProfile.location ?? "";
          profileIndustry = searchProfile.industry ?? "";
          cvVariations = searchProfile.cv_variations ?? [];
          // Pre-load industry ladder steps
          state.industryStep1 = (searchProfile as any).industry_step_1 ?? "";
          state.industryStep2 = (searchProfile as any).industry_step_2 ?? "";
          state.industryStep3 = (searchProfile as any).industry_step_3 ?? "";
          state.industryStep4 = (searchProfile as any).industry_step_4 ?? "";
          state.industryStep5 = (searchProfile as any).industry_step_5 ?? "";
        }
      }

      titles = await deduplicateTitles(titles);

      if (titles.length === 0) {
        return NextResponse.json({ results: [], code: "NO_TITLES", message: "Add job titles to your search profile first." });
      }

      // Build industry steps array from profile
      industrySteps = [
        state.industryStep1 || "",
        state.industryStep2 || "",
        state.industryStep3 || "",
        state.industryStep4 || "",
        state.industryStep5 || "",
      ].filter(Boolean);

      // Look up search rotation state (which title/industry combo to use next)
      if (profile_id) {
        try {
          const { data: rotation } = await dataClient
            .from("search_rotation")
            .select("last_title_index, last_industry_index")
            .eq("profile_id", profile_id)
            .maybeSingle();
          if (rotation) {
            rotationTitleIndex = rotation.last_title_index ?? 0;
            rotationIndustryIndex = rotation.last_industry_index ?? 0;
          }
        } catch {
          // Table may not exist yet — default to index 0
        }
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
            const text = await extractText(buffer, cv.file_path);
            return { name: cv.name || "CV", text: text.slice(0, 5000) };
          }
        } catch {}
        return null;
      });
      const cvResults = await Promise.all(cvDownloads);
      cvTexts = cvResults.filter((r): r is { name: string; text: string } => r !== null);

      const cvText = cvTexts.map(cv => cv.text).join("\n\n---\n\n");
      debugLog(`[SEARCH] CV variations: ${cvTexts.length}, total text length: ${cvText.length}, titles: ${titles.length}`);

      // Auto-generate industry if missing (now uses full CV text)
      if (!profileIndustry && titles.length > 0 && cvText.trim()) {
        try {
          const industryRaw = await callAIWithFallback(
            `Determine the single most likely industry the candidate works in by reading their CV.

CRITICAL: Industry is where the candidate's EMPLOYERS/COMPANIES operate, not what their job title suggests.
- "Customer Success Manager" at a datacenter company = Critical Digital Infrastructure, NOT SaaS.
- "Digital marketer" at an online retailer = E-commerce, NOT SaaS.
Look at the actual business of the companies listed in the work history.

Rules:
- Return one concise label (e.g. "Fintech", "Healthcare", "E-commerce", "Construction", "Critical Digital Infrastructure", "Manufacturing").
- Do NOT include job titles or company names in your response. Just the industry.
Return ONLY valid JSON (no markdown, no code fences):
{ "industry": string }`,
            `CV text:\n${cvText.slice(0, 8000)}`,
            "auto-generate industry",
            { responseMimeType: "application/json", temperature: 0.3 }
          );
          const cleaned = industryRaw.slice(industryRaw.indexOf("{"), industryRaw.lastIndexOf("}") + 1);
          const generatedIndustry = JSON.parse(cleaned).industry?.trim() ?? "";
          if (generatedIndustry) {
            profileIndustry = generatedIndustry;
            if (profile_id) {
              dataClient.from("search_profiles").update({ industry: generatedIndustry })
                .eq("id", profile_id).eq("user_id", user.id)
                .then(() => {}, () => {});
            }
          }
        } catch {}
      }

      // Pre-fetch existing job URLs for dedup
      const [existingResultsRes, existingSavedRes] = await Promise.all([
        dataClient.from("job_results").select("job_url, is_deleted, job_title, company").eq("user_id", user.id).eq("profile_id", profile_id),
        dataClient.from("saved_jobs").select("job_url").eq("user_id", user.id).eq("profile_id", profile_id),
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
        profile_id,
        pf_mode: !!pf_mode,
        query: query ?? "",
        balances: liveBalances,
        plan: livePlan,
        maxAgeDays,
        referralUrl: referral_url ?? null,
      };
    }

    // === STREAMING SEARCH ===
    const stream = new ReadableStream({
      async start(controller) {
        const writer = new StreamWriter(controller);
        writer.send({ type: "search_started", search_id: searchId });
        const sendStatus = (event: SearchEvent) => writer.send(event);
        const sendComplete = (event: SearchEvent) => {
          if (state.balances) {
            writer.send({ ...event, balances: state.balances, plan: state.plan } as SearchEvent);
          } else {
            writer.send(event);
          }
        };
        try {
          const effectivePfMode = state.pf_mode ?? (state.mode === "pf");

          if (!effectivePfMode) {
            // Rotate through titles and industries (most relevant first)
            const nicheTitle = state.titles?.[rotationTitleIndex % titles.length] ?? state.titles?.[0] ?? "";
            const titleQuery = buildOrQuery([nicheTitle]);
            const rotatedIndustry = industrySteps.length > 0
              ? industrySteps[rotationIndustryIndex % industrySteps.length]
              : (state.profileIndustry ?? "");
            const industryPart = rotatedIndustry || "";
            const locationPart = state.profileLocation ? `in ${state.profileLocation}` : "";
            const searchQuery = [titleQuery, industryPart, locationPart, "jobs"].filter(Boolean).join(" ");

            console.log(`[SEARCH] Rotation: title[${rotationTitleIndex % titles.length}]="${nicheTitle}", industry[${rotationIndustryIndex % (industrySteps.length || 1)}]="${industryPart}"`);

            if (!searchQuery || searchQuery === "jobs") {
              writer.send({ type: "error", code: "NO_QUERY", message: "Add job titles to your search profile first.", progress: 0 });
              writer.close();
              return;
            }

            sendStatus({ type: "searching", query: searchQuery, progress: 10 });

             if (isContinuation) {
              const offset = state.nextOffset ?? 0;
              const result = await screenAndAnalyze(
                state.rawJobs, state.jobSpecs, state.jobUrls, state.queryUsed,
                state.profileLocation, state.profileIndustry, state.titles, state.cvTexts,
                user, searchId, dataClient, state.bannedJobs, state.bannedCompanies, state.profile_id,
                sendStatus, undefined,
                { history: new Set(state.dedupSets.history), saved: new Set(state.dedupSets.saved), blocked: new Set(state.dedupSets.blocked), rejected: new Set(state.dedupSets.rejected ?? []) },
                state.maxAgeDays,
                offset
              );

              const totalFiltered = result.filteredCounts.history + result.filteredCounts.saved + result.filteredCounts.rejected + result.filteredCounts.blocked;
              if (totalFiltered > 0) {
                writer.send({ type: "filtered_summary", ...result.filteredCounts, progress: 50 });
              }

              // All jobs processed
              const allResults = [...(state.allResults || []), ...result.results];
              if (allResults.length > 0) {
                const withIds = allResults.map((r: any) => ({ ...r, id: crypto.randomUUID() }));
                const normalized = withIds.map(normalize);
                pinReferralJob(normalized, state.referralUrl);
                sendComplete({ type: "complete", results: normalized, progress: 100, ...(totalFiltered > 0 ? { filtered_summary: result.filteredCounts } : {}) });
                const rows = withIds.map((r: any) => ({
                  id: r.id,
                  user_id: r.user_id, search_id: r.search_id, profile_id: state.profile_id ?? null,
                  job_title: r.job_title, company: r.company, location: r.location,
                  estimated_salary: r.estimated_salary, match_score: r.match_score,
                  match_summary: r.match_summary, job_url: r.job_url, full_spec: r.full_spec,
                  search_query: r.search_query, posted_at: r.posted_at,
                  suggested_cv: r.suggested_cv, verdict_bullets: r.verdict_bullets,
                  knockout_fail: r.knockout_fail, pillar_scores: r.pillar_scores,
                  taxes_applied: r.taxes_applied, total_questions_asked: r.total_questions_asked,
                  yes_answers: r.yes_answers, recruiter_verdict: r.recruiter_verdict,
                  dynamic_requirements: r.dynamic_requirements,
                  spec_source: r.spec_source,
                }));
                const { error: insertErr } = await getSupabase().from("job_results").insert(rows);
                if (insertErr) console.error("[HISTORY] Failed to insert continuation results:", insertErr.message);
                else console.log(`[HISTORY] Auto-saved ${rows.length} jobs to history (continuation)`);
              } else {
                sendComplete({ type: "complete", results: [], progress: 100, message: "No strong matches found. Try broadening your criteria." });
              }
              writer.close();
              return;
            }

            // Search + filter + screen in one shot
            const hiddenKeys = state.hiddenJobKeys ? new Set<string>(state.hiddenJobKeys as string[]) : undefined;
            const { rawJobs, jobSpecs, jobUrls, queryUsed } = await fetchAndFilterJobs(
              searchQuery, state.profileLocation, user, searchId,
              state.bannedJobs, state.bannedCompanies, dataClient, state.profile_id, sendStatus, undefined,
              hiddenKeys, state.maxAgeDays, 2, platforms
            );

            // Advance rotation for next search
            if (profile_id) {
              const nextTitleIdx = (rotationTitleIndex + 1) % titles.length;
              const nextIndustryIdx = industrySteps.length > 0
                ? (rotationIndustryIndex + 1) % industrySteps.length
                : 0;
              try {
                await dataClient.from("search_rotation").upsert({
                  profile_id,
                  last_title_index: nextTitleIdx,
                  last_industry_index: nextIndustryIdx,
                  updated_at: new Date().toISOString(),
                }, { onConflict: "profile_id" });
                console.log(`[SEARCH] Rotation advanced: title=${nextTitleIdx}, industry=${nextIndustryIdx}`);
              } catch (e) {
                console.warn(`[SEARCH] Failed to update rotation:`, e);
              }
            }

            if (rawJobs.length === 0) {
              sendComplete({ type: "complete", results: [], progress: 100, message: "No matching jobs found. Try broadening your criteria." });
              writer.close();
              return;
            }

            // Pause after finding results — user clicks Continue to start AI scoring
            sendComplete({
              type: "pause",
              message: `Found ${rawJobs.length} matching results. Ready to score?`,
              progress: 20,
                continuation: signContinuationToken({
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
                  maxAgeDays: state.maxAgeDays,
                  profile_id: state.profile_id,
                  referralUrl: state.referralUrl,
                  allResults: [],
                  nextOffset: 0,
                }, SUPABASE_SERVICE_KEY),
              });
            writer.close();
            return;
          }

          // === PERSISTENT FINDER MODE (AI-generated career chains, 5 rounds) ===
          const MAX_ROUNDS = 5;

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
          let startRoundIndex: number = 0;
          let titleChainSteps: string[][] = []; // [step][titles] — 5 steps, each is all titles for that round
          let industryChain: string[] = [];    // [step] — 5 industry terms
          let hardStop = false;

          if (isContinuation && state.mode === "pf") {
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
            titleChainSteps = state.titleChainSteps;
            industryChain = state.industryChain;
            debugLog(`[PF] Resuming at round ${startRoundIndex + 1}/${MAX_ROUNDS}, ${allResults.length} results so far`);
            if (finish_now) {
              hardStop = true;
              debugLog("[PF] finish_now flag set, will finalize after current round");
            }
          } else {
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

            // Title ladder: job_titles IS the 5-step broadening ladder
            titleChainSteps = Array.from({ length: MAX_ROUNDS }, (_, i) => {
              const title = pfTitles[i]?.trim();
              return title ? [title] : [];
            });
            for (let s = 0; s < MAX_ROUNDS; s++) {
              if (titleChainSteps[s].length === 0) titleChainSteps[s] = [...pfTitles];
            }

            // Industry ladder: directly from search_profiles columns (set during profile load)
            industryChain = [
              state.industryStep1 || pfIndustry || "",
              state.industryStep2 || pfIndustry || "",
              state.industryStep3 || pfIndustry || "",
              state.industryStep4 || pfIndustry || "",
              state.industryStep5 || pfIndustry || "",
            ];
            debugLog(`[PF] Title ladder: ${pfTitles.join(" > ")}`);
            debugLog(`[PF] Industry ladder: ${industryChain.join(" > ")}`);
          }

          const usedQueries = new Set<string>();
          const pfStartTime = Date.now();

          for (let i = startRoundIndex; i < MAX_ROUNDS; i++) {
            const roundNum = i + 1;

            if (Date.now() - pfStartTime > 270_000) {
              debugLog(`[PF] Time limit reached (270s), pausing after round ${roundNum - 1}`);
              pfAborted = true;
              
              // Immediate checkpoint and pause
              sendComplete({
                type: "pause",
                message: `Timeout approaching, saving progress at round ${roundNum - 1}.`,
                progress: Math.min(((roundNum - 1) / MAX_ROUNDS) * 80, 80),
                continuation: signContinuationToken({
                  mode: "pf",
                  nextRoundIndex: i,
                  allResults,
                  seenUrls: [...seenUrls],
                  pfFilteredCounts,
                  pfRoundsExecuted,
                  pfAborted: true,
                  searchId,
                  titles: pfTitles,
                  titleChainSteps,
                  industryChain,
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
                  maxAgeDays: state.maxAgeDays,
                  profile_id: state.profile_id,
                }, SUPABASE_SERVICE_KEY),
              });
              writer.close();
              return;
            }

            const titles = titleChainSteps[i];
            const industry = industryChain[i] || pfIndustry;

            if (titles.length === 0) {
              titles.push(...pfTitles);
            }

            const titleQuery = buildOrQuery(titles);
            const industryPart = industry ? industry : "";
            const fullQuery = [titleQuery, industryPart, pfLocation ? `in ${pfLocation}` : "", "jobs"].filter(Boolean).join(" ");

            if (usedQueries.has(fullQuery.toLowerCase())) {
              debugLog(`[PF] Round ${roundNum}: skipping duplicate query "${fullQuery}"`);
              continue;
            }
            usedQueries.add(fullQuery.toLowerCase());

            debugLog(`[PF] Round ${roundNum}/${MAX_ROUNDS}: "${fullQuery}"`);
            sendStatus({ type: "pf_round", round: roundNum, max: MAX_ROUNDS, query: fullQuery, progress: Math.min((roundNum / MAX_ROUNDS) * 80, 80) });

            if (pfRoundsExecuted > 0 && lastAITier === "openrouter") {
              await sleep(3000);
            }

            try {
              const pfHiddenKeys = state.hiddenJobKeys ? new Set<string>(state.hiddenJobKeys as string[]) : undefined;
              const filtered = await fetchAndFilterJobs(
                fullQuery, pfLocation, user, searchId,
                pfBannedJobs, pfBannedCompanies, dataClient, state.profile_id, sendStatus, roundNum,
                pfHiddenKeys, state.maxAgeDays, 5, platforms
              );

              let roundResults: JobRow[] = [];
              let roundFilteredCounts = { history: 0, saved: 0, rejected: 0, blocked: 0 };

              if (filtered.rawJobs.length > 0) {
                const result = await screenAndAnalyze(
                  filtered.rawJobs, filtered.jobSpecs, filtered.jobUrls, filtered.queryUsed,
                  pfLocation, pfIndustry, pfTitles, pfCvTexts,
                  user, searchId, dataClient, pfBannedJobs, pfBannedCompanies, state.profile_id,
                  sendStatus, roundNum,
                  { history: new Set(pfDedupSets.history || []), saved: new Set(pfDedupSets.saved || []), blocked: new Set(pfDedupSets.blocked || []), rejected: new Set(pfDedupSets.rejected || []) },
                  state.maxAgeDays
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
              debugLog(`[PF] Round ${roundNum}: ${roundResults.length} valid (total unique: ${allResults.length})`);

              const highScoreCount = allResults.filter((r) => (r.match_score ?? 0) >= 80).length;
              if (highScoreCount >= 5) {
                debugLog(`[PF] Stopping early, ${highScoreCount} jobs >= 80 (round ${roundNum})`);
                hardStop = true;
                break;
              }

              const isLastRound = i >= MAX_ROUNDS - 1;
              if (!isLastRound && !hardStop) {
                sendComplete({
                  type: "pause",
                  message: `Round ${roundNum} of ${MAX_ROUNDS} complete, ${allResults.length} results so far. Continue to round ${roundNum + 1}?`,
                  progress: Math.min((roundNum / MAX_ROUNDS) * 80, 80),
                  continuation: signContinuationToken({
                    mode: "pf",
                    nextRoundIndex: i + 1,
                    allResults,
                    seenUrls: [...seenUrls],
                    pfFilteredCounts,
                    pfRoundsExecuted,
                    pfAborted,
                    searchId,
                    titles: pfTitles,
                    titleChainSteps,
                    industryChain,
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
                    maxAgeDays: state.maxAgeDays,
                    profile_id: state.profile_id,
                  }, SUPABASE_SERVICE_KEY),
                });
                writer.close();
                return;
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              debugLog(`[PF] Round ${roundNum} failed, error: ${errMsg}`);
              pfRoundsExecuted++;
            }
          }

          // Finalize
          allResults.sort((a, b) => {
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
            const normalized = withIds.map(normalize);
            pinReferralJob(normalized, state.referralUrl);

            const pfMessage = pfAborted
              ? `Search stopped early, showing ${allResults.length} results found so far`
              : undefined;

            sendComplete({
              type: "complete",
              results: normalized,
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
              search_query: r.search_query, posted_at: r.posted_at,
              suggested_cv: r.suggested_cv, verdict_bullets: r.verdict_bullets,
              knockout_fail: r.knockout_fail, pillar_scores: r.pillar_scores,
              taxes_applied: r.taxes_applied, total_questions_asked: r.total_questions_asked,
              yes_answers: r.yes_answers, recruiter_verdict: r.recruiter_verdict,
              dynamic_requirements: r.dynamic_requirements,
              spec_source: r.spec_source,
            }));
            const { error: insertErr } = await getSupabase().from("job_results").insert(rows);
            if (insertErr) console.error("[HISTORY] Failed to insert PF job results:", insertErr.message);
            else console.log(`[HISTORY] Auto-saved ${rows.length} jobs to history (PF mode)`);
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
