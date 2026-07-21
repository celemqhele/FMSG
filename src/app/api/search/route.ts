// BUILD_CACHE_BUST: jun30-1
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs, searchJSearch, searchAdzuna, searchWebJobs, searchGooglePages, scrapeJobPage, extractJobUrlsFromListingPage, isListingPage, isIndividualJobPage, type SerpJob } from "@/lib/serpapi";
import { extractText } from "@/lib/pdf";
import { callAIWithFallback, lastAITier } from "@/lib/gemini";
import { StreamWriter, type SearchEvent } from "@/lib/search-stream";
import { debugLog } from "@/lib/debug";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateScrapeUrl } from "@/lib/url-validation";

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

async function fetchJinaPage(url: string, apiKey: string | null): Promise<string> {
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
          return "";
        }
      } catch {}
    }
    return "";
  }

  try {
    const json = await res.json();
    if (json.code === 200 && json.data?.content) return json.data.content.trim();
  } catch {}
  return "";
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
  spec_source: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "google_search" | null;
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
  const buildSerpParams = (location?: string) => ({
    q: query,
    location: location,
    hl: "en" as const,
    gl: "za" as const,
  });

  const serpParams = buildSerpParams(sanitisedLocation);
  const pages = maxPages ?? 2;

  let rawJobs: SerpJob[];
  try {
    // ─── Platform-aware source selection ──────────────────────────────────
    const isAll = !allowedPlatforms || allowedPlatforms.length === 0;
    const hasNonLinkedIn = !isAll;

    const sources = {
      googleJobs: true,            // always run
      jSearch: isAll || hasNonLinkedIn,  // skip when only LinkedIn
      adzuna: isAll,               // only when All
      webJobs: isAll,               // Multi-service fallback (Jina → Firecrawl → Scrappa)
      googlePages: isAll,          // only when All
    };

    const enabledCount = Object.values(sources).filter(Boolean).length;
    console.log(`[PIPELINE] Starting ${enabledCount}-source parallel search:`, JSON.stringify({ query, location: sanitisedLocation, pages, platforms: allowedPlatforms, sources }));

    // Build promises for enabled sources only
    const promiseEntries = Object.entries(sources).filter(([, enabled]) => enabled).map(([key]) => {
      switch (key) {
        case "googleJobs":
          return ["googleJobs", withTimeout(fetchPaginatedJobs(serpParams, pages), 15_000, "Google Jobs").catch((err) => { console.error(`[PIPELINE] Google Jobs TIMEOUT/FAIL: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`); return [] as SerpJob[]; })] as const;
        case "jSearch":
          return ["jSearch", withTimeout(searchJSearch(serpParams), 15_000, "JSearch").catch((err) => { console.error(`[PIPELINE] JSearch TIMEOUT/FAIL: ${err}`); return [] as SerpJob[]; })] as const;
        case "adzuna":
          return ["adzuna", withTimeout(searchAdzuna(serpParams), 8_000, "Adzuna").catch((err) => { console.error(`[PIPELINE] Adzuna TIMEOUT/FAIL: ${err}`); return [] as SerpJob[]; })] as const;
        case "webJobs":
          return ["webJobs", withTimeout(searchWebJobs(serpParams), 20_000, "Web Jobs").catch((err) => { console.error(`[PIPELINE] Web Jobs TIMEOUT/FAIL: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`); return [] as SerpJob[]; })] as const;
        case "googlePages":
          return ["googlePages", withTimeout(searchGooglePages(serpParams), 25_000, "Google Search/Jina").catch((err) => { console.error(`[PIPELINE] Google Search/Jina TIMEOUT/FAIL: ${err}`); return [] as { title: string; link: string; snippet: string; domain: string }[]; })] as const;
        default:
          return [key, Promise.resolve([])] as const;
      }
    });

    const results = await Promise.all(promiseEntries.map(([, p]) => p));
    const resultObj: Record<string, any[]> = {};
    promiseEntries.forEach(([key], i) => { resultObj[key] = results[i]; });

    const googleJobs = (resultObj["googleJobs"] ?? []) as SerpJob[];
    const jsearchJobs = (resultObj["jSearch"] ?? []) as SerpJob[];
    const adzunaJobs = (resultObj["adzuna"] ?? []) as SerpJob[];
    const webJobsJobs = (resultObj["webJobs"] ?? []) as SerpJob[];
    const googlePages = (resultObj["googlePages"] ?? []) as { title: string; link: string; snippet: string; domain: string }[];

    console.log(`[PIPELINE] Sources returned: GoogleJobs=${googleJobs.length} JSearch=${jsearchJobs.length} Adzuna=${adzunaJobs.length} WebJobs=${webJobsJobs.length} GooglePages=${googlePages.length}`);

    // Scrape Google Search URLs with Jina (two-step crawl, parallel)
    console.log(`[PIPELINE] Starting two-step crawl for ${googlePages.length} Google Search URLs`);
    const scrapedGoogleJobs: SerpJob[] = [];

    // Phase 1: Classify all URLs and extract individual URLs from listing pages (parallel)
    const classifications = await Promise.all(googlePages.map(async (v) => {
      if (!validateScrapeUrl(v.link).ok) {
        return { type: "skipped" as const, domain: v.domain };
      } else if (isIndividualJobPage(v.link)) {
        return { type: "direct" as const, url: v.link, domain: v.domain, title: v.title };
      } else if (isListingPage(v.link)) {
        console.log(`[PIPELINE] Listing page detected, extracting URLs: ${v.link}`);
        const individualUrls = await withTimeout(extractJobUrlsFromListingPage(v.link, JINA_API ?? null), 15_000, `Jina extract ${v.domain}`).catch(() => [] as string[]);
        console.log(`[PIPELINE] Extracted ${individualUrls.length} individual URLs from ${v.domain}`);
        return { type: "listing" as const, urls: individualUrls, domain: v.domain };
      } else {
        return { type: "direct" as const, url: v.link, domain: v.domain, title: v.title };
      }
    }));

    // Collect all URLs to scrape
    const urlsToScrape: { url: string; domain: string; title?: string }[] = [];
    for (const c of classifications) {
      if (c.type === "skipped") {
        continue;
      } else if (c.type === "direct") {
        urlsToScrape.push({ url: c.url, domain: c.domain, title: c.title });
      } else {
        for (const url of c.urls) {
          urlsToScrape.push({ url, domain: c.domain });
        }
      }
    }
    console.log(`[PIPELINE] Phase 1 complete: ${urlsToScrape.length} URLs to scrape`);

    // Phase 2: Scrape all URLs in parallel batches of 5
    const CONCURRENCY = 5;
    const safeUrlsToScrape = urlsToScrape.filter(({ url }) => validateScrapeUrl(url).ok);
    for (let i = 0; i < safeUrlsToScrape.length; i += CONCURRENCY) {
      const batch = safeUrlsToScrape.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(({ url, domain, title }) =>
          withTimeout(scrapeJobPage(url, JINA_API ?? null), 15_000, `Jina scrape ${domain}`)
            .then((job) => {
              if (job) {
                if (title) job.title = job.title || title;
                console.log(`[PIPELINE] Scraped OK: "${job.title}" at "${job.company_name}"`);
              }
              return job;
            })
            .catch(() => null)
        )
      );
      scrapedGoogleJobs.push(...batchResults.filter((j): j is SerpJob => j !== null));
    }
    console.log(`[PIPELINE] Two-step crawl complete: ${scrapedGoogleJobs.length} jobs scraped from ${urlsToScrape.length} URLs`);

    // Merge all sources with dedup (priority: JSearch > Google Jobs > LinkedIn > Google Search > Adzuna)
    rawJobs = [];
    const seenKeys = new Set<string>();

    function addJobs(jobs: SerpJob[]) {
      for (const j of jobs) {
        const key = `${j.title ?? ""}|${j.company_name ?? ""}`.toLowerCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          rawJobs.push(j);
        } else {
          // If existing job has shorter description, replace with this one
          const existing = rawJobs.find(
            (r) => `${r.title ?? ""}|${r.company_name ?? ""}`.toLowerCase() === key
          );
          if (existing) {
            const existingLen = existing.description?.length ?? 0;
            const newLen = j.description?.length ?? 0;
            if (newLen > existingLen) {
              // Preserve spec_source of the better source
              j.spec_source = j.spec_source ?? existing.spec_source;
              Object.assign(existing, { description: j.description, hasFullSpec: j.hasFullSpec, spec_source: j.spec_source });
            }
          }
        }
      }
    }

    // Priority order: JSearch (best inline) → Google Jobs → Web Jobs → Google Search (Jina) → Adzuna (snippet)
    console.log("[PIPELINE] Merging sources (priority: JSearch > Google > Web Jobs > Scrape > Adzuna)");
    addJobs(jsearchJobs);
    addJobs(googleJobs);
    addJobs(webJobsJobs);
    addJobs(scrapedGoogleJobs);
    addJobs(adzunaJobs);

    console.log(`[PIPELINE] Dedup complete: ${rawJobs.length} unique jobs from ${googleJobs.length + jsearchJobs.length + adzunaJobs.length + webJobsJobs.length + scrapedGoogleJobs.length} total`);
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

  if (maxAgeDays) {
    const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    rawJobs = rawJobs.filter((j) => {
      const postedMs = (j as any)._postedAtMs ?? 0;
      if (postedMs > 0 && postedMs < cutoffMs) return false;
      return true;
    });
    if (rawJobs.length === 0) {
      debugLog(`[SEARCH] All jobs filtered out by date filter (${maxAgeDays}d)`);
      return { rawJobs: [], jobSpecs: [], jobUrls: [], queryUsed: query };
    }
  }

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

  const tempJobUrls = new Map<number, string>();
  const tempJobSpecs = new Map<number, string>();
  for (let i = 0; i < rawJobs.length; i++) {
    const job = rawJobs[i];
    const jobUrl = buildJobUrl(job);
    tempJobUrls.set(i, jobUrl);

    if (job.hasFullSpec && job.description && job.description.length >= SHORT_SPEC_THRESHOLD) {
      tempJobSpecs.set(i, job.description);
      if (isExpired(job.description)) (job as any)._expired = true;
      continue;
    }

    let specText = "";
    if (jobUrl) {
      try {
        specText = await fetchJinaPage(jobUrl, JINA_API ?? null);
        if (!specText && JINA_API) specText = await fetchJinaPage(jobUrl, null);
      } catch {}
    }
    if (!specText) {
      (job as any)._noSpec = true;
      continue;
    }
    tempJobSpecs.set(i, specText);
    if (isExpired(specText)) (job as any)._expired = true;
  }

  const noSpecRejected = rawJobs.filter((j) => (j as any)._noSpec);
  if (noSpecRejected.length > 0) {
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

  const preFilterUrls = new Map(tempJobUrls);
  const preFilterSpecs = new Map(tempJobSpecs);
  rawJobs = rawJobs.filter((j) => !(j as any)._expired);
  const rebuiltUrls = new Map(rawJobs.map((j, i) => [i, buildJobUrl(j)] as const));
  const rebuiltSpecs = new Map<number, string>();
  for (let i = 0; i < rawJobs.length; i++) {
    const url = rebuiltUrls.get(i) ?? "";
    const origEntry = [...preFilterSpecs.entries()].find(([origIdx]) => preFilterUrls.get(origIdx) === url);
    rebuiltSpecs.set(i, origEntry?.[1] ?? "");
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
      }
    });
    rawJobs = filtered;
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
): Promise<{ results: JobRow[]; queryUsed: string; filteredCounts: { history: number; saved: number; rejected: number; blocked: number } }> {
  const filteredCounts = { history: 0, saved: 0, rejected: 0, blocked: 0 };

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
    return { results, queryUsed: query, filteredCounts };
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
    ? `\nDATE CONSTRAINT: Only consider jobs posted within the last ${maxAgeDays} day(s). If no posted date is available, assume it passes. Jobs older than ${maxAgeDays} days are irrelevant — score them 0 with reason "Posted outside date filter".`
    : "";

  const dynamicScoringPrompt = `You are a strict Recruitment Auditor acting as a hiring manager. You analyze ONE job spec against the candidate's CV and score the match.

CANDIDATE INDUSTRY: ${profileIndustry || "Unknown"}

---
PROCESS:

STEP 0: SUB-VERTICAL IDENTIFICATION & CV SELECTION
A) Identify the candidate's professional sub-vertical from their EMPLOYERS, not their tools.
   Industry is where the COMPANIES operate. Digital marketer at Superbalist = E-commerce, NOT SaaS.
B) Identify the job's sub-vertical — what does the hiring company sell?
C) Select the CV variation whose day-to-day responsibilities most closely match the role.
D) Set suggested_cv_name to the exact CV filename.

STEP 1: EXTRACT REQUIREMENTS FROM THE JOB SPEC
Read the FULL job description. Extract EVERY requirement INDIVIDUALLY — do NOT group, summarize, or combine requirements.

BAD (grouped): "Experience with digital marketing platforms"
GOOD (individual): "Experience with Google Ads", "Experience with Facebook Ads", "Experience with SEO"

Each bullet point, each tool name, each skill mentioned in the requirements section is a SEPARATE requirement.

For each, classify as:
- MANDATORY: stated with words like "required", "must have", "essential", "mandatory", "necessary", "minimum"
- PREFERRED: stated with words like "preferred", "advantageous", "nice to have", "desirable", "ideal", "bonus"
If neither label is explicitly used, treat as MANDATORY unless the context clearly implies optional (e.g. "a bonus", "would be nice").

Include: certifications, licenses, tools, platforms, languages, experience thresholds (years, team size, deal size, revenue), industry background, specific responsibilities, soft skills if stated as requirements.

CRITICAL RULE — DEGREES: NEVER create a degree requirement unless the JD contains an EXPLICIT phrase like:
  "Bachelor's degree required", "Degree in X", "NQF level 7+", "tertiary qualification required"
If the JD lists skills, experience, tools, and responsibilities WITHOUT explicitly stating a degree is needed, NO degree requirement may be created. A professional job listing does NOT imply a degree requirement.

STEP 2: GENERATE YES/NO QUESTIONS
For EACH extracted requirement, generate ONE specific yes/no question.
The question must reference the EXACT tool/skill/requirement from the spec.

BAD: "Does the candidate have marketing tool experience?"
GOOD: "Does the candidate have experience with Google Ads?"

Categorize each into the correct pillar:
- "industry": sub-vertical match, sector experience, employer background
- "function": role type, daily responsibilities, task experience
- "scale": years of experience, team size, revenue managed, stakeholder level
- "tools": specific tools, certifications, platforms, methodologies, licenses
- "location": geography, relocation, remote/hybrid/wfh

If the spec lists 15 requirements, you MUST generate 15 questions. Do not reduce.

STEP 3: ANSWER FROM CV
For each question, check the CV text and answer:
- "met": true if the CV provides evidence of meeting the requirement
- "met": false if the CV has no evidence or contradicts the requirement
- "evidence": specific quote/detail from the CV (employer names, skills, dates, numbers)

RULES FOR ANSWERING:
- If the CV doesn't mention it at all → met: false
- If the role says "bilingual Afrikaans/English" and CV shows no Afrikaans → met: false
- Transferable skills count: Salesforce→HubSpot CRM = met, Python→Java backend = met
- MORE years than required = met (overqualification is positive)
- Equivalent qualifications count: BA Economics meets BCom, BEng meets BSc, LLB satisfies any "degree"

STEP 4: SCORE PILLARS (each 0-100)
For each pillar, calculate: (questions answered met:true / total questions in that pillar) × 100
Then adjust based on these rules:
- Industry: SAME sub-vertical=70-95, ADJACENT=40-65, DIFFERENT=0-30
- Function: Same role type=70-95, Adjacent role=40-65, Different role type=0-30
- Scale: MORE years than required=positive (≥80), LESS than minimum=negative
- Tools: Direct match=80-95, Transferable/adjacent=50-75, Missing critical=0-30
- Location: Same city or remote no restriction=100, Same province=70, Different province=30, Different country=0

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

STEP 7: FINAL SCORE
Core = Industry×0.25 + Function×0.30 + Scale×0.20 + Tools×0.15 + Location×0.10
Core = Core × 0.95 (competition penalty)
Final = Core − total taxes. Cap 0-95.
If knockout → score = 25.

STEP 8: VERDICT
>= 75: "HIRE" | >= 60: "INTERVIEW" | < 60: "REJECT"

STEP 9: SELF-VERIFY
A) Compute: (Industry×0.25 + Function×0.30 + Scale×0.20 + Tools×0.15 + Location×0.10) × 0.95 − taxes.
   Does this match final score? Fix both if diverge by >5 pts.
B) Reasons MUST reference CV specifics (employer names, skills, numbers).
C) Adjust by ±5 (max ±10) if score feels wrong. Set adjustment_note.
D) pillar_scores MUST reflect the final math.

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

${blacklistInfo}${bannedInfo}${dateConstraintInfo}`;

  let outputs: JobRow[] = [];

  // Pre-scoring dedup: filter out jobs already in user's history/saved/blocked
  let allExisting: Set<string> | null = null;
  let preDedupCount = 0;
  if (dedupSets) {
    const s = new Set([...dedupSets.history, ...dedupSets.saved, ...dedupSets.blocked, ...(dedupSets.rejected ?? [])]);
    if (s.size > 0) allExisting = s;
  }

  debugLog(`[SEARCH] Starting one-by-one scoring (${rawJobs.length} jobs)`);
  onStatus?.({ type: "screening_job", current: 0, total: rawJobs.length, progress: 25 });

  for (let i = 0; i < rawJobs.length; i++) {
    const job = rawJobs[i];
    const jobUrl = jobUrls.get(i) || buildJobUrl(job);

    // Pre-scoring dedup: skip jobs already seen — save AI calls
    if (allExisting?.has(jobUrl)) {
      if (dedupSets!.history.has(jobUrl)) filteredCounts.history++;
      else if (dedupSets!.saved.has(jobUrl)) filteredCounts.saved++;
      else if (dedupSets!.rejected?.has(jobUrl)) filteredCounts.rejected++;
      else if (dedupSets!.blocked.has(jobUrl)) filteredCounts.blocked++;
      preDedupCount++;
      continue;
    }

    const fullSpec = jobSpecs.get(i) || "";

    const progress = Math.min(25 + ((i + 1) / rawJobs.length) * 55, 80);
    onStatus?.({ type: "analyzing_job", title: job.title, company: job.company_name, current: i + 1, total: rawJobs.length, progress });

    if (i > 0) await sleep(lastAITier === "gemini" ? 4000 : 1000);

    let result: any = null;
    try {
      const jobInput = fullSpec.replace(/["\r\t]/g, " ").replace(/\s+/g, " ").trim();
      const raw = await callAIWithFallback(
        dynamicScoringPrompt,
        `Candidate Profile:\n${profileContext}\n\nJob:\n${JSON.stringify({ job_title: job.title, company: job.company_name, location: job.location, description: jobInput, url: jobUrl }, null, 2)}`,
        `one-by-one scoring ${i + 1}/${rawJobs.length}${pfRound ? ` (PF round ${pfRound})` : ""}`,
        { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 16384 }
      );
      result = JSON.parse(raw);
      debugLog(`[SEARCH] Job ${i + 1}/${rawJobs.length}: "${job.title}" scored ${result.score} (${result.recruiter_verdict})`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      debugLog(`[SEARCH] Job ${i + 1}/${rawJobs.length} AI failed: ${errMsg.slice(0, 100)}`);
      result = { score: 30, reason: "Screening unavailable", estimated_salary: "", dynamic_requirements: null };
    }

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

    const score = Math.round(result.score ?? 30);
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

  if (preDedupCount > 0) debugLog(`[SEARCH] Pre-scoring dedup skipped ${preDedupCount} already-seen jobs`);

  onStatus?.({ type: "almost_done", progress: 90 });

  return { results: outputs, queryUsed: query, filteredCounts };
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
      let titles: string[] = [];
      let profileLocation = "";
      let profileIndustry = "";
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
            const nicheTitle = state.titles?.[0] ?? "";
            const titleQuery = buildOrQuery([nicheTitle]);
            const industryPart = state.profileIndustry ? state.profileIndustry : "";
            const locationPart = state.profileLocation ? `in ${state.profileLocation}` : "";
            const searchQuery = [titleQuery, industryPart, locationPart, "jobs"].filter(Boolean).join(" ");

            if (!searchQuery || searchQuery === "jobs") {
              writer.send({ type: "error", code: "NO_QUERY", message: "Add job titles to your search profile first.", progress: 0 });
              writer.close();
              return;
            }

            if (isContinuation) {
              const result = await screenAndAnalyze(
                state.rawJobs, state.jobSpecs, state.jobUrls, state.queryUsed,
                state.profileLocation, state.profileIndustry, state.titles, state.cvTexts,
                user, searchId, dataClient, state.bannedJobs, state.bannedCompanies, state.profile_id,
                sendStatus, undefined,
                { history: new Set(state.dedupSets.history), saved: new Set(state.dedupSets.saved), blocked: new Set(state.dedupSets.blocked), rejected: new Set(state.dedupSets.rejected ?? []) },
                state.maxAgeDays
              );

              const totalFiltered = result.filteredCounts.history + result.filteredCounts.saved + result.filteredCounts.rejected + result.filteredCounts.blocked;
              if (totalFiltered > 0) {
                writer.send({ type: "filtered_summary", ...result.filteredCounts, progress: 50 });
              }

              if (result.results.length > 0) {
                const withIds = result.results.map((r: JobRow) => ({ ...r, id: crypto.randomUUID() }));
                const normalized = withIds.map(normalize);
                pinReferralJob(normalized, state.referralUrl);
                sendComplete({ type: "complete", results: normalized, progress: 100, ...(totalFiltered > 0 ? { filtered_summary: result.filteredCounts } : {}) });
                const rows = withIds.map((r) => ({
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
                maxAgeDays: state.maxAgeDays,
                profile_id: state.profile_id,
                referralUrl: state.referralUrl,
              })).toString("base64"),
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

            if (Date.now() - pfStartTime > 240_000) {
              debugLog(`[PF] Time limit reached, stopping after ${pfRoundsExecuted} rounds`);
              pfAborted = true;
              break;
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
                  })).toString("base64"),
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
