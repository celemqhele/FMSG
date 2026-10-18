// BUILD_CACHE_BUST: jun30-1
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs, searchJSearch, searchAdzuna, searchWebJobs, searchJinaBingJobs, searchDittoJobs, isCategoryPage, scrapePageBrightData, scrapePageApify, type SerpJob } from "@/lib/serpapi";
import { searchWorkdayJobs, fetchWorkdayDetail, WORKDAY_TENANTS, type WorkdayTenant } from "@/lib/workday";
import { extractText } from "@/lib/pdf";
import {
  mapLocationToProvince,
  resolveJobGeos,
  foldScopeVerdicts,
  buildLadderFromProfileLocation,
  type LocationScope,
  type LocationLadder,
} from "@/lib/location";
import { callAIWithFallback, lastAITier } from "@/lib/gemini";
import { scoreMatch } from "@/lib/ats-scoring";
import { embedTexts, cosineSimilarity, reciprocalRankFusion, buildCandidateText, buildJobText, EMBEDDING_MODEL } from "@/lib/ats-embeddings";
import { StreamWriter, type SearchEvent } from "@/lib/search-stream";
import { debugLog } from "@/lib/debug";
import { serializeError, trackBackground } from "@/lib/log";
import { checkRateLimit } from "@/lib/rate-limit";
import { signContinuationToken, verifyAndDecodeContinuationToken } from "@/lib/continuation-token";
import { BLACKLISTED_DOMAINS, BLACKLISTED_COMPANIES, extractDomain, buildJobUrl, isBlacklistedByVia, decodeGoogleRedirect, decodeBingRedirect } from "@/lib/job-filter";
import { buildIndustryQuery } from "@/lib/search-query";

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

// Source priority for spec dedup tie-breaking (higher = keep this source)
const SPEC_SOURCE_PRIORITY: Record<string, number> = {
  jsearch: 7,
  google_jobs: 6,
  bing_jobs: 5,
  ditto: 4,
  workday: 3,
  scrappa: 2,
  adzuna: 1,
};

function specSourcePriority(job: any): number {
  return SPEC_SOURCE_PRIORITY[job?.spec_source ?? ""] ?? 0;
}

// 100% keyword-match fingerprint: lowercase, whitespace collapsed. Identical specs dedup.
function specFingerprint(spec: string): string {
  return (spec || "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
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

async function loadCheckpoint(checkpointId: string, userId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("search_checkpoints")
    .select("continuation_token")
    .eq("id", checkpointId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Checkpoint not found");
  console.log(`[CHECKPOINT] Loaded checkpoint ${checkpointId}`);
  return data.continuation_token;
}

interface JobRow {
  id: string;
  user_id: string;
  search_id: string;
  profile_id: string | null;
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

const SEARCH_PROFILE_COLUMNS =
  "job_titles, location, industry, industry_step_1, industry_step_2, industry_step_3, industry_step_4, industry_step_5, cv_variations";
const LOCATION_SCOPE_COLUMNS =
  "location_scope, location_step_1, location_step_2, location_step_3, location_step_4";

/**
 * Load a search profile including the location-scope columns from migration 036.
 * Falls back to the pre-036 column set when those columns don't exist yet, so a
 * deploy that lands before the migration is applied doesn't break searching.
 */
async function loadSearchProfile(client: any, profileId: string, userId: string) {
  const withScope = await client
    .from("search_profiles")
    .select(`${SEARCH_PROFILE_COLUMNS}, ${LOCATION_SCOPE_COLUMNS}`)
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!withScope.error) return withScope.data;
  debugLog("[SEARCH] location scope columns missing, using legacy profile select:", withScope.error?.message);
  const legacy = await client
    .from("search_profiles")
    .select(SEARCH_PROFILE_COLUMNS)
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (legacy.error) debugLog("[SEARCH] search_profiles select failed:", legacy.error.message);
  return legacy.data;
}

/**
 * Fire-and-forget `rejected_jobs` insert. Every rejection-logging call in this file happens
 * *after* the pipeline has moved on (on Vercel possibly after the response is flushed), and
 * the old code used the DEBUG-gated `debugLog` — a no-op in production — with no rejection
 * handler at all, so a failed insert simply vanished. Now every failure is logged with its
 * category so the tracking table can be reconciled against the pipeline counters.
 */
function logRejectedJobs(dataClient: any, rows: any[], label: string) {
  if (!rows || rows.length === 0) return;
  trackBackground(
    `rejected_jobs insert (${label})`,
    dataClient.from("rejected_jobs").insert(rows).then((r: any) => {
      if (r?.error) console.warn(`[SEARCH] rejected_jobs insert failed (${label}): ${serializeError(r.error)}`);
    }),
  );
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
  deadline?: number,
  locationScope?: LocationScope,
  locationLadder?: LocationLadder,
): Promise<{ rawJobs: any[]; jobSpecs: [number, string][]; jobUrls: [number, string][]; queryUsed: string; deadlineHit?: boolean }> {
  // Guard: `deadline` must be a finite number. It is subtracted from Date.now() and fed
  // to setTimeout below, so ANY non-numeric value (e.g. a positional argument that shifted
  // by one because an optional slot was skipped) becomes setTimeout(NaN) → fires after ~1ms
  // → the Promise.race in the parallel-search phase is lost instantly and the search
  // returns 0 jobs without a single source being awaited. Fail loudly instead.
  if (deadline !== undefined && !Number.isFinite(deadline)) {
    console.warn(`[PIPELINE] Non-numeric deadline ignored (${typeof deadline}: ${String(deadline).slice(0, 40)}) — check call-site argument order`);
    deadline = undefined;
  }

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
  const sid = searchId ? searchId.slice(0, 8) : "no-id";

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

    const sid = searchId ? searchId.slice(0, 8) : "no-id";
    const enabledCount = Object.values(sources).filter(Boolean).length;
    console.log(`[PIPELINE ${sid}] Starting ${enabledCount}-source parallel search:`, JSON.stringify({ query, location: sanitisedLocation, pages, platforms: allowedPlatforms, sources }));

    // Build promises for enabled sources only
    const promiseEntries = Object.entries(sources).filter(([, enabled]) => enabled).map(([key]) => {
      switch (key) {
        case "googleJobs":
          return ["googleJobs", withTimeout(fetchPaginatedJobs(serpParams, pages), 60_000, "Google Jobs").catch((err) => { console.error(`[PIPELINE ${sid}] Google Jobs TIMEOUT/FAIL: ${serializeError(err)}`); return [] as SerpJob[]; })] as const;
        case "jSearch":
          return ["jSearch", withTimeout(searchJSearch(serpParams), 60_000, "JSearch").catch((err) => { console.error(`[PIPELINE ${sid}] JSearch TIMEOUT/FAIL: ${serializeError(err)}`); return [] as SerpJob[]; })] as const;
        case "adzuna":
          return ["adzuna", withTimeout(searchAdzuna(serpParams), 60_000, "Adzuna").catch((err) => { console.error(`[PIPELINE ${sid}] Adzuna TIMEOUT/FAIL: ${serializeError(err)}`); return [] as SerpJob[]; })] as const;
        case "webJobs":
          return ["webJobs", withTimeout(searchWebJobs(serpParams), 60_000, "Web Jobs").catch((err) => { console.error(`[PIPELINE ${sid}] Web Jobs TIMEOUT/FAIL: ${serializeError(err)}`); return [] as SerpJob[]; })] as const;
        case "jinaBing":
          const jinaBingDeadline = deadline ? deadline - Date.now() : 60_000;
          return ["jinaBing", searchJinaBingJobs(serpParams, jinaBingDeadline).catch((err) => { console.error(`[PIPELINE ${sid}] Jina Bing Jobs FAIL: ${serializeError(err)}`); return [] as SerpJob[]; })] as const;
        case "ditto":
          const dittoDeadline = deadline ? deadline - Date.now() : 90_000;
          return ["ditto", withTimeout(searchDittoJobs(serpParams, dittoDeadline), 90_000, "Ditto Jobs").catch((err) => { console.error(`[PIPELINE ${sid}] Ditto Jobs TIMEOUT/FAIL: ${serializeError(err)}`); return [] as SerpJob[]; })] as const;
        case "workday":
          const workdayDeadline = deadline ? deadline - Date.now() : 60_000;
          return ["workday", withTimeout(searchWorkdayJobs(serpParams, workdayDeadline), 60_000, "Workday").catch((err) => { console.error(`[PIPELINE ${sid}] Workday TIMEOUT/FAIL: ${serializeError(err)}`); return [] as SerpJob[]; })] as const;
        default:
          return [key, Promise.resolve([])] as const;
      }
    });

    const pipelineStart = Date.now();
    const resultObj: Record<string, any[]> = {};
    // Flipped once the race below stops waiting. Sources that answer afterwards are then
    // logged as LATE (result discarded) instead of looking like ordinary results — this is
    // what made the 2026-10-17 "search failed instantly" logs so confusing: Workday's 378
    // jobs were logged 3s AFTER the pipeline had already merged nothing.
    let pipelineContinued = false;
    const sourcePromises = promiseEntries.map(([key, promise]) => {
      return promise.then((result) => {
        resultObj[key] = result;
        const elapsed = Date.now() - pipelineStart;
        if (pipelineContinued) {
          console.warn(`[PIPELINE ${sid}] ${key} resolved LATE (+${elapsed}ms): ${(result as any[]).length} jobs — pipeline already continued without it, RESULT DISCARDED`);
        } else {
          console.log(`[PIPELINE ${sid}] ${key} resolved: ${(result as any[]).length} jobs (${elapsed}ms elapsed)`);
        }
      }).catch((err) => { resultObj[key] = []; console.warn(`[PIPELINE ${sid}] ${key} settle handler failed: ${serializeError(err)}`); });
    });

    // Use passed deadline or default to 270s for backward compatibility
    const pipelineDeadlineMs = deadline ? (deadline - Date.now()) : 270_000;
    const pipelineTimeoutMs = Math.max(1000, pipelineDeadlineMs);
    const pipelineTimeout = new Promise<void>((resolve) => setTimeout(resolve, pipelineTimeoutMs));
    await Promise.race([Promise.all(sourcePromises), pipelineTimeout]);
    pipelineContinued = true;

    // Make the outcome of the race explicit: "every source settled" vs "gave up waiting".
    // An abandoned search would otherwise be indistinguishable from a genuinely empty one.
    const settledKeys = promiseEntries.map(([k]) => k).filter((k) => k in resultObj);
    const pendingKeys = promiseEntries.map(([k]) => k).filter((k) => !(k in resultObj));
    if (pendingKeys.length === 0) {
      console.log(`[PIPELINE ${sid}] parallel-search race: all ${promiseEntries.length} sources settled in ${Date.now() - pipelineStart}ms`);
    } else {
      console.warn(`[PIPELINE ${sid}] parallel-search race TIMED OUT after ${Math.round(pipelineTimeoutMs / 1000)}s — only ${settledKeys.length}/${promiseEntries.length} sources settled; continuing WITHOUT [${pendingKeys.join(", ")}] (they keep running in the background; their results are discarded and logged as LATE)`);
    }

    // Check deadline after parallel search phase
    if (deadline && Date.now() >= deadline) {
      console.warn(`[PIPELINE ${sid}] deadline reached after the parallel search phase — returning 0 jobs (settled ${settledKeys.length}/${promiseEntries.length} sources)`);
      return { rawJobs: [], jobSpecs: [], jobUrls: [], queryUsed: query };
    }

    const googleJobs = (resultObj["googleJobs"] ?? []) as SerpJob[];
    const jsearchJobs = (resultObj["jSearch"] ?? []) as SerpJob[];
    const adzunaJobs = (resultObj["adzuna"] ?? []) as SerpJob[];
    const webJobsJobs = (resultObj["webJobs"] ?? []) as SerpJob[];
    const jinaBingJobs = (resultObj["jinaBing"] ?? []) as SerpJob[];
    const dittoJobs = (resultObj["ditto"] ?? []) as SerpJob[];
    const workdayJobs = (resultObj["workday"] ?? []) as SerpJob[];

    console.log(`[PIPELINE ${sid}] Sources returned after ${Date.now() - pipelineStart}ms (settled ${settledKeys.length}/${promiseEntries.length}${pendingKeys.length ? `, missing [${pendingKeys.join(", ")}]` : ""}): GoogleJobs=${googleJobs.length} JSearch=${jsearchJobs.length} Adzuna=${adzunaJobs.length} WebJobs=${webJobsJobs.length} JinaBing=${jinaBingJobs.length} Ditto=${dittoJobs.length} Workday=${workdayJobs.length}`);

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
    console.log(`[PIPELINE ${sid}] Merging sources (priority: JSearch > Google > Bing > Ditto > Workday > Scrappa > Adzuna)`);
    addJobs(jsearchJobs);
    addJobs(googleJobs);
    addJobs(jinaBingJobs);
    addJobs(dittoJobs);
    addJobs(workdayJobs);
    addJobs(webJobsJobs);
    addJobs(adzunaJobs);

    console.log(`[PIPELINE ${sid}] Dedup complete: ${rawJobs.length} unique jobs from ${googleJobs.length + jsearchJobs.length + adzunaJobs.length + webJobsJobs.length + jinaBingJobs.length + dittoJobs.length + workdayJobs.length} total`);
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

  // Location scope filter — hard filter on the user's chosen tier
  // (local / provincial / country / continental / world). Stage 1 runs on the
  // location field only (pre-scrape, saves scraping credits); jobs whose
  // location can't be resolved are KEPT and demoted, then re-checked in
  // stage 2 once the spec is scraped.
  const effectiveScope: LocationScope = locationScope ?? "country";
  const effectiveLadder: LocationLadder =
    locationLadder && (locationLadder.country || locationLadder.continent)
      ? locationLadder
      : buildLadderFromProfileLocation(profileLocation);

  const scopeRejected: { job: any; reason: string }[] = [];
  if (effectiveScope !== "world" && (effectiveLadder.country || effectiveLadder.continent)) {
    const beforeScope = rawJobs.length;
    let keptMatch = 0, keptDemote = 0;
    rawJobs = rawJobs.filter((j) => {
      const geos = resolveJobGeos({
        field: (j as any).location ?? "",
        extras: (j as any)._extraLocations,
        link: buildJobUrl(j),
        unverified: (j as any)._locationUnverified === true,
      });
      const verdict = foldScopeVerdicts(geos, effectiveLadder, effectiveScope);
      if (verdict === "drop") {
        (j as any)._scopeRejected = true;
        const geo = geos.find((g) => g.confidence !== "unknown") ?? geos[0];
        scopeRejected.push({
          job: j,
          reason: `outside_${effectiveScope}_scope (job: ${geo.country || geo.region || geo.city || "unknown"}, you: ${effectiveLadder.country || effectiveLadder.continent})`,
        });
        return false;
      }
      if (verdict === "match") keptMatch++;
      else { keptDemote++; (j as any)._scopeUnverified = true; } // re-checked in stage 2 with the scraped spec
      return true;
    });
    console.log(`[PIPELINE ${sid}] Location scope (${effectiveScope}, ladder: ${effectiveLadder.city || "-"}/${effectiveLadder.region || "-"}/${effectiveLadder.country || "-"}/${effectiveLadder.continent || "-"}): kept ${keptMatch} match + ${keptDemote} unverified, rejected ${scopeRejected.length} (${beforeScope} → ${rawJobs.length})`);
    if (scopeRejected.length > 0) {
      const rows = scopeRejected.map(({ job: j, reason }) => ({
        user_id: user.id, search_id: searchId, search_query: query,
        profile_id: profile_id,
        job_title: j.title, company: j.company_name, location: j.location ?? '',
        snippet: (j.description ?? '').slice(0, 500), job_url: buildJobUrl(j), reason,
        rejection_category: 'location', rejection_reason: reason,
        passed_domain_filter: false, passed_banned_filter: false,
      }));
      logRejectedJobs(dataClient, rows, "location stage 1");
      locationFilterRemoved = scopeRejected.length;
    }
  } else if (effectiveScope !== "world") {
    // No ladder resolvable at all (e.g. profile location "Remote") — keep everything
    console.log(`[PIPELINE] Location scope filter skipped — no ladder resolvable from "${profileLocation}"`);
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
    logRejectedJobs(dataClient, rows, "blacklist");
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
    logRejectedJobs(dataClient, rows, "banned");
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
    const url = buildJobUrl(j) ?? "";
    if (BLOCKED_ATS_TRACKERS.some(t => desc.includes(t) || url.includes(t))) {
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
    logRejectedJobs(dataClient, rows, "ats-tracker");
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
    logRejectedJobs(dataClient, rows, "no-url");
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
  // ─── Spec fetch: bounded worker pool ─────────────────────────────────────────
  // This used to be a sequential `for` loop — the dominant wall-clock cost of a search
  // (N jobs × per-job Jina → BrightData → Apify cascade; 450 jobs could blow past the
  // 290s watchdog and return nothing). Spec fetches are independent, so run up to
  // SPEC_CONCURRENCY (default 8) at once, each job hard-capped at 30s so one hanging
  // fetch can't straggle the pool. When the deadline passes, workers stop pulling new
  // jobs and everything fetched so far is KEPT (best-so-far) instead of the old
  // behaviour of `return { rawJobs: [] }` — discarding the whole search.
  const specTotal = rawJobs.length;
  const specConcurrency = Math.max(1, Math.min(Number(process.env.SPEC_CONCURRENCY) || 8, 16));
  const SPEC_JOB_TIMEOUT_MS = 30_000;
  let specNext = 0;
  let specAttempted = 0;
  let specDeadlineHit = false;
  const specStartedAt = Date.now();

  // One job's full spec cascade: Workday CXS (instant JSON) → Jina → BrightData → Apify.
  // `aborted: true` = the deadline cut the cascade short (job never fully fetched).
  const scrapeSpecFor = async (job: any, jobUrl: string): Promise<{ specText: string; jinaStatus: number; aborted: boolean }> => {
    let specText = "";
    let jinaStatus = 0;
    if (jobUrl) {
      if (job.spec_source === "workday" && job._workdayTenant && job._workdayPath) {
        if (deadline && Date.now() >= deadline) return { specText, jinaStatus, aborted: true };
        try {
          const detail = await fetchWorkdayDetail(job._workdayTenant as WorkdayTenant, job._workdayPath as string);
          specText = detail.text;
          // The detail endpoint's location feeds the scope filter (stage 1 already
          // ran on the listing fields; this helps stage 2/3 decide foreign vs local).
          if (detail.location) {
            const extras: string[] = Array.isArray(job._extraLocations) ? job._extraLocations : [];
            if (!extras.includes(detail.location)) extras.push(detail.location);
            job._extraLocations = extras;
          }
        } catch {}
      }
      if (!specText) {
        try {
          const jina1 = await fetchJinaPage(jobUrl, JINA_API ?? null);
          jinaStatus = jina1.status;
          specText = jina1.content;
          if (!specText && JINA_API) {
            if (deadline && Date.now() >= deadline) return { specText, jinaStatus, aborted: true };
            const jina2 = await fetchJinaPage(jobUrl, null);
            jinaStatus = jina2.status;
            specText = jina2.content;
          }
        } catch {}
        if (!specText) {
          if (deadline && Date.now() >= deadline) return { specText, jinaStatus, aborted: true };
          try { specText = await scrapePageBrightData(jobUrl); } catch {}
        }
        if (!specText) {
          if (deadline && Date.now() >= deadline) return { specText, jinaStatus, aborted: true };
          try { specText = await scrapePageApify(jobUrl); } catch {}
        }
      }
    }
    return { specText, jinaStatus, aborted: false };
  };

  const specWorker = async (workerId: number): Promise<void> => {
    while (true) {
      if (deadline && Date.now() >= deadline) { specDeadlineHit = true; return; }
      const i = specNext++;
      if (i >= specTotal) return;
      const job: any = rawJobs[i];
      const jobUrl = buildJobUrl(job);

      try {
        if (job.hasFullSpec && job.description && (job.description.length >= SHORT_SPEC_THRESHOLD || job.spec_source === "bing_jobs")) {
          job._spec = job.description;
          if (isExpired(job.description)) job._expired = true;
        } else {
          const fetched = await withTimeout(
            scrapeSpecFor(job, jobUrl),
            SPEC_JOB_TIMEOUT_MS,
            `spec scrape worker${workerId} "${String(job.title ?? "").slice(0, 40)}"`
          ).catch(() => ({ specText: "", jinaStatus: 0, aborted: false }));

          if (fetched.aborted) {
            // Deadline cut this job short — leave it unmarked so it's dropped with the
            // "never fetched" group below rather than logged as a scrape failure.
          } else if (!fetched.specText) {
            job._noSpec = true;
          } else {
            job._spec = fetched.specText;
            // Check for expired/unavailable jobs: text patterns OR Jina HTTP error page
            if (isExpired(fetched.specText) || isJinaErrorPage(fetched.jinaStatus, fetched.specText)) {
              job._expired = true;
              console.log(`[PIPELINE] Expired/unavailable: "${job.title}" at "${job.company_name}" — jina=${fetched.jinaStatus}, reason=${isJinaErrorPage(fetched.jinaStatus, fetched.specText) ? 'jina_error_page' : 'expired_pattern'}`);
            }
          }
        }
      } catch (err) {
        // Never let one job kill a worker — mark it spec-less so the normal filters drop it.
        console.warn(`[PIPELINE ${sid}] Spec worker ${workerId} error on "${String(job.title ?? "").slice(0, 40)}": ${serializeError(err)}`);
        job._noSpec = true;
      }

      specAttempted++;
      if (specAttempted % 10 === 0 || specAttempted === specTotal) {
        onStatus?.({
          type: "specs_progress",
          completed: specAttempted,
          total: specTotal,
          progress: 20 + Math.round((specAttempted / Math.max(1, specTotal)) * 5),
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(specConcurrency, specTotal) }, (_, w) => specWorker(w)));

  {
    const withSpec = rawJobs.filter((j: any) => j._spec).length;
    if (specDeadlineHit) {
      const attempted = rawJobs.filter((j: any) => j._spec || j._noSpec).length;
      const skipped = specTotal - attempted;
      if (skipped > 0) rawJobs = rawJobs.filter((j: any) => j._spec || j._noSpec);
      console.log(`[PIPELINE ${sid}] Spec deadline hit after ${Math.round((Date.now() - specStartedAt) / 1000)}s — best-so-far kept: ${withSpec} jobs with spec (${skipped} never fetched, ${specAttempted}/${specTotal} attempted)`);
    } else {
      console.log(`[PIPELINE ${sid}] Spec fetch complete: ${specTotal} jobs in ${Math.round((Date.now() - specStartedAt) / 1000)}s (${specConcurrency} workers, ${withSpec} with spec, ${specAttempted - withSpec} failed)`);
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
    logRejectedJobs(dataClient, rows, "no-spec");
  }
  rawJobs = rawJobs.filter((j) => !(j as any)._noSpec);
  if (rawJobs.length === 0) return { rawJobs: [], jobSpecs: [], jobUrls: [], queryUsed: query };

  const expiredCount = rawJobs.filter((j) => (j as any)._expired).length;
  if (expiredCount > 0) console.log(`[PIPELINE] ${expiredCount} jobs flagged expired before spec-length gate`);
  rawJobs = rawJobs.filter((j) => !(j as any)._expired);
  console.log(`[PIPELINE] Pre-spec-gate: ${rawJobs.length} jobs (specs set=${rawJobs.filter((j) => (j as any)._spec).length}, bing=${rawJobs.filter((j) => j.spec_source === "bing_jobs").length})`);

  // Stage 2 location scope re-check — now that specs are scraped, re-resolve the
  // jobs whose location was unknown at stage 1 (field-only) and drop the ones
  // the spec reveals to be out of scope.
  if (effectiveScope !== "world" && (effectiveLadder.country || effectiveLadder.continent)) {
    const stage2Candidates = rawJobs.filter((j) => (j as any)._scopeUnverified);
    if (stage2Candidates.length > 0) {
      const stage2Rejected: { job: any; reason: string }[] = [];
      rawJobs = rawJobs.filter((j) => {
        if (!(j as any)._scopeUnverified) return true;
        const geos = resolveJobGeos({
          field: (j as any).location ?? "",
          extras: (j as any)._extraLocations,
          link: buildJobUrl(j),
          spec: (j as any)._spec ?? "",
          unverified: (j as any)._locationUnverified === true,
        });
        const verdict = foldScopeVerdicts(geos, effectiveLadder, effectiveScope);
        if (verdict === "drop") {
          const geo = geos.find((g) => g.confidence !== "unknown") ?? geos[0];
          stage2Rejected.push({
            job: j,
            reason: `outside_${effectiveScope}_scope_spec (job: ${geo.country || geo.region || geo.city || "unknown"}, you: ${effectiveLadder.country || effectiveLadder.continent})`,
          });
          return false;
        }
        // Resolved to a confident match (e.g. spec/link named an in-scope place) —
        // no longer "unverified", so stage 3 won't queue it for the LLM.
        if (verdict === "match") (j as any)._scopeUnverified = false;
        return true;
      });
      if (stage2Rejected.length > 0) {
        console.log(`[PIPELINE ${sid}] Location scope stage 2 (spec re-check): rejected ${stage2Rejected.length} of ${stage2Candidates.length} unverified`);
        const rows = stage2Rejected.map(({ job: j, reason }) => ({
          user_id: user.id, search_id: searchId, search_query: query,
          profile_id: profile_id,
          job_title: j.title, company: j.company_name, location: j.location ?? '',
          snippet: ((j as any)._spec ?? '').slice(0, 500), job_url: buildJobUrl(j), reason,
          rejection_category: 'location', rejection_reason: reason,
          passed_domain_filter: false, passed_banned_filter: false,
        }));
        logRejectedJobs(dataClient, rows, "location stage 2");
        locationFilterRemoved += stage2Rejected.length;
      }
    }
  }

  // Stage 3 — LLM location verdict for jobs the deterministic layers couldn't
  // place. Only jobs still unknown after field + extras + link country-code +
  // spec are queued. The prompt is deliberately minimal and the reply must be
  // strictly "true" (in scope) or "false" (foreign) — no explanation — to keep
  // token and rate-limit burn near zero. "false" drops the job; any parse
  // failure or API error FAILS OPEN (job is kept, demoted) so a flaky AI tier
  // never mass-drops good jobs.
  if (effectiveScope !== "world" && (effectiveLadder.country || effectiveLadder.continent)) {
    const LOC_VERDICT_MAX = Math.max(0, Number(process.env.LOC_VERDICT_MAX) || 30);
    const LOC_VERDICT_CONCURRENCY = 3;

    // Human phrase for the seeker's target area, inserted verbatim into the prompt.
    const targetArea =
      effectiveScope === "local" && effectiveLadder.city ? effectiveLadder.city
      : effectiveScope === "provincial" && effectiveLadder.region ? effectiveLadder.region
      : effectiveScope === "continental" && effectiveLadder.continent ? effectiveLadder.continent
      : effectiveLadder.country || effectiveLadder.continent || "";

    const stage3Candidates: any[] = [];
    for (const j of rawJobs) {
      if (!(j as any)._scopeUnverified) continue;               // already placed confidently
      if ((j as any).isRemote || (j as any)._workdayRemote) continue; // remote always matches
      if (stage3Candidates.length >= LOC_VERDICT_MAX) break;
      stage3Candidates.push(j);
    }

    if (stage3Candidates.length > 0 && targetArea) {
      const stage3Rejected: { job: any; reason: string }[] = [];
      let passed = 0, failedOpen = 0;
      let next = 0;
      const t0 = Date.now();
      const worker = async () => {
        while (true) {
          const i = next++;
          if (i >= stage3Candidates.length) return;
          const j = stage3Candidates[i];
          // Probe text = every location string we hold for this job (field + extras).
          const parts = [String((j as any).location ?? "")]
            .concat(Array.isArray((j as any)._extraLocations) ? (j as any)._extraLocations.map((s: unknown) => String(s ?? "")) : [])
            .map((s) => s.trim())
            .filter((s) => s.length > 1);
          const probe = Array.from(new Set(parts)).join(" / ").slice(0, 300);
          const userText = `Is "${probe}" within ${targetArea}? Reply true or false.`;
          try {
            const raw = await callAIWithFallback(
              "You are a strict location filter. Reply with exactly one word: true or false. No explanation.",
              userText,
              "location_verdict",
              { maxOutputTokens: 4, temperature: 0, responseMimeType: "text/plain" }
            );
            const word = raw.trim().toLowerCase();
            if (word.startsWith("false")) {
              stage3Rejected.push({
                job: j,
                reason: `outside_${effectiveScope}_scope_llm (job: ${probe || "unknown"}, you: ${targetArea})`,
              });
            } else if (word.startsWith("true")) {
              passed++;
              (j as any)._scopeUnverified = false; // placed — don't re-queue on later rounds
            } else {
              // Fail-open: unparseable reply keeps the job (demoted), never drops it.
              failedOpen++;
              console.warn(`[PIPELINE ${sid}] loc-verdict unparseable for "${(j as any).title}": ${JSON.stringify(raw.slice(0, 40))}`);
            }
          } catch (err) {
            // Fail-open: API error keeps the job (demoted).
            failedOpen++;
            console.warn(`[PIPELINE ${sid}] loc-verdict error for "${(j as any).title}": ${serializeError(err).slice(0, 100)}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(LOC_VERDICT_CONCURRENCY, stage3Candidates.length) }, () => worker()));

      if (stage3Rejected.length > 0) {
        const dropSet = new Set(stage3Rejected.map((r) => r.job));
        rawJobs = rawJobs.filter((j) => !dropSet.has(j));
        const rows = stage3Rejected.map(({ job: j, reason }) => ({
          user_id: user.id, search_id: searchId, search_query: query,
          profile_id: profile_id,
          job_title: j.title, company: j.company_name, location: j.location ?? '',
          snippet: ((j as any)._spec ?? '').slice(0, 500), job_url: buildJobUrl(j), reason,
          rejection_category: 'location', rejection_reason: reason,
          passed_domain_filter: false, passed_banned_filter: false,
        }));
        logRejectedJobs(dataClient, rows, "location stage 3 (llm)");
        locationFilterRemoved += stage3Rejected.length;
      }
      console.log(`[PIPELINE ${sid}] Location stage 3 (LLM verdict): ${stage3Candidates.length} queued (cap ${LOC_VERDICT_MAX}) → passed ${passed}, rejected ${stage3Rejected.length}, failed-open ${failedOpen} in ${Date.now() - t0}ms`);
    }
  }

  {
    const filtered: typeof rawJobs = [];
    const filteredSpecs = new Map<number, string>();
    const filteredUrls = new Map<number, string>();
    const droppedShort: any[] = [];
    const droppedAts: any[] = [];
    rawJobs.forEach((j) => {
      const spec = (j as any)._spec ?? "";
      const url = buildJobUrl(j) ?? "";
      if (BLOCKED_ATS_TRACKERS.some(t => spec.includes(t) || url.includes(t))) { droppedAts.push(j); return; }
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
    return { rawJobs, jobSpecs: [...filteredSpecs.entries()], jobUrls: [...filteredUrls.entries()], queryUsed: query, ...(specDeadlineHit ? { deadlineHit: true } : {}) };
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
  profile_id: string | null,
  onStatus?: (event: SearchEvent) => void,
  pfRound?: number,
  dedupSets?: { history: Set<string>; saved: Set<string>; blocked: Set<string>; rejected?: Set<string> },
  maxAgeDays?: number,
  offset: number = 0,
  deadline?: number,
  outputs?: JobRow[],
  priorSpecKeys?: Set<string>,
  locationScope?: LocationScope,
  locationLadder?: LocationLadder,
): Promise<{ results: JobRow[]; queryUsed: string; filteredCounts: { history: number; saved: number; rejected: number; blocked: number }; nextOffset: number }> {
  // Guard: see the matching guard in fetchAndFilterJobs. A non-numeric deadline would make
  // every `Date.now() < deadline` check false, silently disabling the embedding budget and
  // the early-exit checks.
  if (deadline !== undefined && !Number.isFinite(deadline)) {
    console.warn(`[SCREENING] Non-numeric deadline ignored (${typeof deadline}: ${String(deadline).slice(0, 40)}) — check call-site argument order`);
    deadline = undefined;
  }

  const filteredCounts = { history: 0, saved: 0, rejected: 0, blocked: 0 };
  let nextOffset = offset;

  // AI scoring toggle — set AI_SCORING=false to disable matching — jun27
  const aiScoringEnabled = process.env.AI_SCORING !== "false";

  if (!aiScoringEnabled) {
    const jobSpecs = new Map(jobSpecsEntries);
    const jobUrls = new Map(jobUrlsEntries);
    const results: JobRow[] = rawJobs.map((job: any, i: number) => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      search_id: searchId,
      profile_id: profile_id,
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

  let jobSpecs = new Map(jobSpecsEntries);
  let jobUrls = new Map(jobUrlsEntries);

  // ---- Spec dedup: collapse 100% keyword-matching specs (same job posted on multiple boards) ----
  // Runs at the start of every call. priorSpecKeys carries fingerprints scored in earlier PF rounds
  // → jobs that already appeared in a prior round get deduped from the total.
  // priorFpKeys is NOT seeded from `outputs`: outputs holds the current round's already-scored jobs,
  // which must stay in the list so resume offset math stays deterministic; they are only used below
  // to remap `offset` to the deduped index space.
  const scoredFpKeys = new Set<string>();
  for (const r of outputs ?? []) {
    const fk = specFingerprint((r as any).full_spec ?? "");
    if (fk) scoredFpKeys.add(fk);
  }
  const priorFpKeys = new Set<string>(priorSpecKeys ?? []);
  const keptJobs: any[] = [];
  const keptSpecsEntries: [number, string][] = [];
  const keptUrlsEntries: [number, string][] = [];
  const keptFingerprints: (string | null)[] = [];
  const fpToKeptIndex = new Map<string, number>();
  let droppedFromTotal = 0;
  let droppedInBatch = 0;
  for (let i = 0; i < rawJobs.length; i++) {
    const job = rawJobs[i];
    const spec = jobSpecs.get(i) || (job as any)._spec || job.description || "";
    const url = jobUrls.get(i) || buildJobUrl(job);
    const fp = specFingerprint(spec);
    if (!fp) {
      const ni = keptJobs.length;
      keptJobs.push(job); keptSpecsEntries.push([ni, spec]); keptUrlsEntries.push([ni, url]); keptFingerprints.push(null);
      continue;
    }
    if (priorFpKeys.has(fp)) {
      droppedFromTotal++;
      continue;
    }
    const existingIdx = fpToKeptIndex.get(fp);
    if (existingIdx !== undefined) {
      droppedInBatch++;
      const existing = keptJobs[existingIdx];
      const existingLen = keptSpecsEntries[existingIdx][1].length;
      if (spec.length > existingLen || (spec.length === existingLen && specSourcePriority(job) > specSourcePriority(existing))) {
        keptJobs[existingIdx] = job;
        keptSpecsEntries[existingIdx] = [existingIdx, spec];
        keptUrlsEntries[existingIdx] = [existingIdx, url];
      }
      continue;
    }
    const ni = keptJobs.length;
    keptJobs.push(job); keptSpecsEntries.push([ni, spec]); keptUrlsEntries.push([ni, url]); keptFingerprints.push(fp);
    fpToKeptIndex.set(fp, ni);
  }
  if (droppedFromTotal + droppedInBatch > 0) {
    // Remap offset to the deduped index space: the jobs already scored on a previous call (their
    // fingerprints are in `outputs`) are the first N kept jobs in original order → resume at N.
    let newOffset = 0;
    for (const fp of keptFingerprints) {
      if (fp !== null && scoredFpKeys.has(fp)) newOffset++;
      else break;
    }
    offset = newOffset;
    rawJobs = keptJobs;
    jobSpecsEntries = keptSpecsEntries;
    jobUrlsEntries = keptUrlsEntries;
    jobSpecs = new Map(keptSpecsEntries);
    jobUrls = new Map(keptUrlsEntries);
    console.log(`[DEDUP] Spec dedup: dropped ${droppedFromTotal} from prior rounds + ${droppedInBatch} in-batch duplicates → ${rawJobs.length} jobs to score (offset remapped to ${newOffset})`);
  }

  const localOutputs = outputs ?? [];
  const priorCount = localOutputs.length;

  const seenSpecs: { title: string; company: string; url: string }[] = [];

  // Deterministic ATS scoring — synchronous, zero external calls, no quota concerns.
  const batchSize = Math.min(16, Math.max(1, Math.floor(rawJobs.length / 5)));
  const interBatchDelayMs = 50;

  debugLog(`[SCREENING] Starting deterministic ATS scoring: ${rawJobs.length} jobs, offset ${offset}, batchSize=${batchSize}, prior results=${priorCount}`);
  onStatus?.({ type: "screening_job", current: offset, total: rawJobs.length, progress: 25 });
  await sleep(40);

  // ---- Phase 2: semantic embeddings + RRF fusion (optional, degrades to lexical-only) ----
  // Embed candidate profile + each job spec once per run, then fuse dense similarity
  // with the deterministic score via Reciprocal Rank Fusion.
  let semanticSims: (number | null)[] | null = null;
  const embeddingBudgetOk = !deadline || Date.now() < deadline - 35_000;
  if (embeddingBudgetOk) {
    try {
      const candidateText = buildCandidateText({
        titles: titles ?? [],
        industry: profileIndustry ?? "",
        cvText: cvTexts.map((c) => c.text).join("\n"),
      });
      const candidateVecs = await embedTexts([candidateText], { timeoutMs: 25_000 });
      const candidateVec = candidateVecs?.[0];
      if (candidateVec) {
        const jobTexts = rawJobs.map((job: any, i: number) =>
          buildJobText({
            title: job.title,
            company: job.company_name,
            location: job.location,
            spec: jobSpecs.get(i) || job.description || "",
          })
        );
        const jobVecs = await embedTexts(jobTexts, { timeoutMs: 25_000, maxBatch: 64 });
        if (jobVecs && jobVecs.length > 0) {
          semanticSims = rawJobs.map((_: any, i: number) =>
            jobVecs[i] ? cosineSimilarity(candidateVec, jobVecs[i]) : null
          );
          const withSim = semanticSims.filter((s) => s != null).length;
          console.log(`[SEMANTIC] Embeddings ready: candidate + ${withSim}/${rawJobs.length} jobs (${EMBEDDING_MODEL}) — RRF fusion enabled`);
        }
      }
    } catch (err) {
      console.warn(`[SEMANTIC] Skipped, falling back to lexical-only: ${(err as Error).message?.slice(0, 150)}`);
    }
  }

  // Map job_url -> cosine similarity for RRF fusion across results
  const simByUrl = new Map<string, number>();
  if (semanticSims) {
    for (let i = 0; i < rawJobs.length; i++) {
      const url = jobUrls.get(i) || buildJobUrl(rawJobs[i]);
      const s = semanticSims[i];
      if (url && s != null) simByUrl.set(url, s);
    }
  }

  const applySemanticFusion = () => {
    if (simByUrl.size === 0) return;
    const scored = localOutputs.filter((r: JobRow) => r.match_score !== -1 && r.match_score != null);
    if (scored.length < 3) return;
    const lexRankMap = new Map<string, number>();
    [...scored]
      .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
      .forEach((r, i) => lexRankMap.set(r.job_url, i + 1));
    const withSim = scored.filter((r) => simByUrl.has(r.job_url));
    const denseRankMap = new Map<string, number>();
    [...withSim]
      .sort((a, b) => (simByUrl.get(b.job_url) ?? 0) - (simByUrl.get(a.job_url) ?? 0))
      .forEach((r, i) => denseRankMap.set(r.job_url, i + 1));
    let maxRrf = 0;
    const rrfOf = new Map<string, number>();
    for (const r of withSim) {
      const lexRank = lexRankMap.get(r.job_url) ?? scored.length;
      const denseRank = denseRankMap.get(r.job_url) ?? withSim.length;
      const rrf = 1 / (60 + lexRank) + 1 / (60 + denseRank);
      rrfOf.set(r.job_url, rrf);
      if (rrf > maxRrf) maxRrf = rrf;
    }
    let fusedCount = 0;
    for (const r of withSim) {
      const rrf = rrfOf.get(r.job_url)!;
      const rrfNorm = maxRrf > 0 ? (rrf / maxRrf) * 95 : 0;
      const lex = r.match_score ?? 0;
      const fused = Math.max(0, Math.min(95, Math.round(0.85 * lex + 0.15 * rrfNorm)));
      r.match_score = fused;
      const overq = (r.taxes_applied ?? []).includes("Overqualified");
      r.recruiter_verdict = fused >= 75 && !overq ? "Apply" : fused >= 60 ? "Consider" : "Don't apply";
      if (r.match_summary) {
        r.match_summary = r.match_summary.replace(/Verdict: [^\n]*/, `Verdict: ${r.recruiter_verdict}`);
      }
      fusedCount++;
    }
    console.log(`[SEMANTIC] RRF fused ${fusedCount}/${scored.length} scored results`);
  };

  // Process one job synchronously — pure function, safe to run in parallel
  const processSingleJob = (job: any, index: number): { result: any; fullSpec: string; jobUrl: string } => {
    const jobUrl = jobUrls.get(index) || buildJobUrl(job);
    const fullSpec = jobSpecs.get(index) || "";
    const result = scoreMatch({
      jobTitle: job.title ?? "",
      company: job.company_name ?? "",
      location: job.location ?? "",
      jobDescription: fullSpec || job.description || "",
      jobUrl,
      candidateLocation: profileLocation ?? "",
      candidateIndustry: profileIndustry ?? "",
      candidateTitles: titles ?? [],
      cvTexts,
      maxAgeDays,
      bannedCompanies,
      locationScope,
      locationLadder,
      locationUnverified: job._locationUnverified === true,
    });
    console.log(`[SCREENING] Job ${index + 1}/${rawJobs.length}: "${job.title}" @ "${job.company_name}" scored ${result.score} (${result.recruiter_verdict})${semanticSims?.[index] != null ? ` sim=${semanticSims[index].toFixed(2)}` : ""}`);
    return { result, fullSpec, jobUrl };
  };

  let processedCount = offset;
  const totalBatches = Math.ceil((rawJobs.length - offset) / batchSize);

  for (let batchStart = offset; batchStart < rawJobs.length; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, rawJobs.length);
    const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, k) => batchStart + k);
    const batchNum = Math.floor((batchStart - offset) / batchSize) + 1;

    // Check deadline before each batch (allows early exit before Vercel 300s timeout)
    if (deadline && Date.now() > deadline) {
      debugLog(`[SCREENING] Deadline reached at job ${batchStart}/${rawJobs.length}, pausing with ${rawJobs.length - batchStart} jobs remaining`);
      applySemanticFusion();
      return { results: localOutputs, queryUsed: query, filteredCounts, nextOffset: batchStart };
    }

    console.log(`[SCREENING] Batch ${batchNum}/${totalBatches}: jobs ${batchStart + 1}-${batchEnd}/${rawJobs.length}`);
    onStatus?.({ type: "screening_job", current: batchStart, total: rawJobs.length, progress: Math.min(25 + (batchStart / rawJobs.length) * 55, 80) });

    // Run batch synchronously — ATS scoring is a pure function, no rate limits
    const batchResults = batchIndices.map((globalIdx) =>
      processSingleJob(rawJobs[globalIdx], globalIdx)
    );

    // Process batch results sequentially to keep ordering + seenSpecs dedup consistent
    for (let k = 0; k < batchResults.length; k++) {
      const globalIdx = batchIndices[k];
      const job = rawJobs[globalIdx];
      const { result, fullSpec, jobUrl } = batchResults[k];
      processedCount = globalIdx + 1;
      nextOffset = processedCount;

      // Track this job for dedup in subsequent batches
      seenSpecs.push({ title: job.title, company: job.company_name, url: jobUrl });

      const score = Math.round(result.score ?? 0);
      const ps = result.pillar_scores;
      const taxes = (result.taxes_applied as string[])?.filter((t: string) => t.length > 0) ?? [];
      const rawVerdict = result.recruiter_verdict ?? (score >= 75 ? "Apply" : score >= 60 ? "Consider" : "Don't apply");
      const verdict = (rawVerdict === "Apply" && taxes.includes("Overqualified")) ? "Consider" : rawVerdict;
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

      localOutputs.push({
        id: crypto.randomUUID(),
        user_id: user.id,
        search_id: searchId,
        profile_id: profile_id,
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

      // Emit job_scored event — the client renders the card immediately (progressive
      // population); `current` is jobs scored THIS run (localOutputs may be seeded with
      // prior results in continuation/PF rounds, which would overcount vs `total`).
      onStatus?.({
          type: "job_scored",
          search_id: searchId,
          job: localOutputs[localOutputs.length - 1],
          current: localOutputs.length - priorCount,
          total: rawJobs.length,
          progress: Math.min(25 + ((localOutputs.length - priorCount) / rawJobs.length) * 55, 80),
        });
    }

    if (batchEnd < rawJobs.length) await sleep(interBatchDelayMs);
  }

  onStatus?.({ type: "almost_done", progress: 90 });

  applySemanticFusion();

  const verdictCounts = localOutputs.reduce<Record<string, number>>((acc, r) => {
    const v = (r as any).recruiter_verdict ?? "Unknown";
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[SCREENING] ATS scoring complete: ${localOutputs.length} scored, verdicts=${JSON.stringify(verdictCounts)}`);

  return { results: localOutputs, queryUsed: query, filteredCounts, nextOffset };
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
    const { query, profile_id, pf_mode, continuation, date_filter_days, platforms, finish_now } = body;
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
      // Decode continuation state securely — support both full signed tokens and minimal { checkpoint_id } refs
      let rawToken = continuation;
      try {
        const parsed = JSON.parse(continuation);
        if (parsed && typeof parsed === "object" && parsed.checkpoint_id) {
          console.log(`[CHECKPOINT] Resuming via checkpoint ${parsed.checkpoint_id}`);
          rawToken = await loadCheckpoint(parsed.checkpoint_id, user.id);
          // Keep checkpoint on resume so user can retry if this attempt fails
        }
      } catch {}
      try {
        state = verifyAndDecodeContinuationToken(rawToken, SUPABASE_SERVICE_KEY);
      } catch (err) {
        return NextResponse.json({ error: "Invalid or tampered continuation token." }, { status: 400 });
      }
      // Preserve original searchId from the continuation token
      if (state.searchId) {
        searchId = state.searchId;
      }

      // Re-fetch search profile to get latest job_titles, industry steps, cv_variations
      // This ensures profile edits are reflected when resuming a paused search
      if (state.profile_id) {
        const searchProfile = await loadSearchProfile(dataClient, state.profile_id, user.id);
        if (searchProfile?.job_titles?.length) {
          state.titles = searchProfile.job_titles;
          state.profileLocation = searchProfile.location ?? "";
          state.profileIndustry = searchProfile.industry ?? "";
          state.cvVariations = searchProfile.cv_variations ?? [];
          state.industryStep1 = (searchProfile as any).industry_step_1 ?? "";
          state.industryStep2 = (searchProfile as any).industry_step_2 ?? "";
          state.industryStep3 = (searchProfile as any).industry_step_3 ?? "";
          state.industryStep4 = (searchProfile as any).industry_step_4 ?? "";
          state.industryStep5 = (searchProfile as any).industry_step_5 ?? "";
          state.locationScope = (searchProfile as any).location_scope ?? "country";
          state.locationLadder = {
            city: (searchProfile as any).location_step_1 ?? "",
            region: (searchProfile as any).location_step_2 ?? "",
            country: (searchProfile as any).location_step_3 ?? "",
            continent: (searchProfile as any).location_step_4 ?? "",
          };
          debugLog(`[SEARCH] Refreshed search profile on resume: ${state.titles.length} titles, industry steps updated`);
        }
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
        const searchProfile = await loadSearchProfile(dataClient, profile_id, user.id);
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
          state.locationScope = (searchProfile as any).location_scope ?? "country";
          state.locationLadder = {
            city: (searchProfile as any).location_step_1 ?? "",
            region: (searchProfile as any).location_step_2 ?? "",
            country: (searchProfile as any).location_step_3 ?? "",
            continent: (searchProfile as any).location_step_4 ?? "",
          };
        }
      }

      if (!pf_mode) {
        titles = await deduplicateTitles(titles);
      }

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
        // Industry ladder steps (for PF mode)
        industryStep1: state.industryStep1 || "",
        industryStep2: state.industryStep2 || "",
        industryStep3: state.industryStep3 || "",
        industryStep4: state.industryStep4 || "",
        industryStep5: state.industryStep5 || "",
        // Location scope (local/provincial/country/continental/world) + AI ladder
        locationScope: state.locationScope ?? "country",
        locationLadder: state.locationLadder ?? buildLadderFromProfileLocation(profileLocation),
      };
    }

    // === STREAMING SEARCH ===
    const stream = new ReadableStream({
      async start(controller) {
        const writer = new StreamWriter(controller);
        writer.send({ type: "search_started", search_id: searchId });
        
        // Array to store scored jobs for watchdog timeout
        const outputs: JobRow[] = [];
        
        // 290s watchdog timer - triggers before Vercel 300s timeout
        let killTimer = setTimeout(() => {
          debugLog(`[SEARCH] 290s watchdog triggered for search ${searchId}`);
          writer.send({ 
            type: "search_timeout", 
            search_id: searchId, 
            results: outputs,  // all jobs scored so far (empty for PF mode)
            message: "Search timed out. Showing results so far.",
            progress: 100 
          });
          writer.close();
        }, 290_000);

        const closeWriter = () => {
          clearTimeout(killTimer);
          writer.close();
        };

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

          // Typed locals for the location scope + ladder. `state` is `any` (`let state: any`),
          // and passing it straight into fetchAndFilterJobs/screenAndAnalyze let a *missing
          // optional argument* shift every later argument by one without tsc noticing — the
          // 2026-10-17 bug where the scope string landed in the `deadline` slot, so
          // setTimeout(NaN) fired after ~1ms and every search returned 0 jobs instantly.
          // With concrete declared types here, such a shift fails to compile.
          const scopeForSearch: LocationScope = state.locationScope ?? "country";
          const ladderForSearch: LocationLadder = state.locationLadder ?? buildLadderFromProfileLocation(profileLocation);

          if (!effectivePfMode) {
            // Rotate through titles and industries (most relevant first)
            const nicheTitle = state.titles?.[rotationTitleIndex % titles.length] ?? state.titles?.[0] ?? "";
            const titleQuery = buildOrQuery([nicheTitle]);
            const rotatedIndustry = industrySteps.length > 0
              ? industrySteps[rotationIndustryIndex % industrySteps.length]
              : (state.profileIndustry ?? "");
            const industryPart = buildIndustryQuery(rotatedIndustry);
            const searchQuery = [titleQuery, industryPart, "jobs"].filter(Boolean).join(" ");

            console.log(`[SEARCH] Rotation: title[${rotationTitleIndex % titles.length}]="${nicheTitle}", industry[${rotationIndustryIndex % (industrySteps.length || 1)}]="${industryPart}"`);

            if (!searchQuery || searchQuery === "jobs") {
              writer.send({ type: "error", code: "NO_QUERY", message: "Add job titles to your search profile first.", progress: 0 });
              closeWriter();
              return;
            }

            sendStatus({ type: "searching", query: searchQuery, progress: 10 });

             if (isContinuation) {
              const offset = state.nextOffset ?? 0;
              const continuationDeadline = Date.now() + 240_000;

              // Seed outputs with prior results so screenAndAnalyze accumulates over them
              const priorResults: JobRow[] = state.allResults || [];
              for (const r of priorResults) outputs.push(r);

              const result = await screenAndAnalyze(
                state.rawJobs, state.jobSpecs, state.jobUrls, state.queryUsed,
                state.profileLocation, state.profileIndustry, state.titles, state.cvTexts,
                user, searchId, dataClient, state.bannedJobs, state.bannedCompanies, state.profile_id,
                sendStatus, undefined,
                { history: new Set(state.dedupSets.history), saved: new Set(state.dedupSets.saved), blocked: new Set(state.dedupSets.blocked), rejected: new Set(state.dedupSets.rejected ?? []) },
                state.maxAgeDays,
                offset,
                continuationDeadline,
                outputs,
                undefined,
                scopeForSearch,
                ladderForSearch
              );

              const totalFiltered = result.filteredCounts.history + result.filteredCounts.saved + result.filteredCounts.rejected + result.filteredCounts.blocked;
              if (totalFiltered > 0) {
                writer.send({ type: "filtered_summary", ...result.filteredCounts, progress: 50 });
              }

              // All jobs processed (result.results already includes prior results seeded into outputs)
              const allResults = result.results;
              // Scored jobs first (best match on top), unscored cards (-1) at the bottom
              allResults.sort((a: JobRow, b: JobRow) => {
                const aScored = a.match_score !== -1;
                const bScored = b.match_score !== -1;
                if (aScored !== bScored) return aScored ? -1 : 1;
                return b.match_score - a.match_score;
              });
              if (allResults.length > 0) {
                const withIds = allResults.map((r: any) => ({ ...r, id: crypto.randomUUID() }));
                const normalized = withIds.map(normalize);
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
              closeWriter();
              return;
            }

            // Search + filter + screen in one shot
            const hiddenKeys = state.hiddenJobKeys ? new Set<string>(state.hiddenJobKeys as string[]) : undefined;
            // The `undefined` is the optional `deadline` slot — it must not be skipped:
            // dropping it shifts every later argument (the 2026-10-17 "0 jobs in 16ms" bug).
            // With `scopeForSearch`/`ladderForSearch` carrying concrete types, such a shift
            // is a compile error. The Parameters<> annotation pins arity the same way.
            const findArgs: Parameters<typeof fetchAndFilterJobs> = [
              searchQuery, state.profileLocation, user, searchId,
              state.bannedJobs, state.bannedCompanies, dataClient, state.profile_id, sendStatus, undefined,
              hiddenKeys, state.maxAgeDays, 2, platforms, Date.now() + 250_000,
              scopeForSearch, ladderForSearch,
            ];
            // Fetch budget: 250s of the 290s watchdog — if the spec pool exhausts it, it
            // returns best-so-far (deadlineHit) instead of running into the watchdog with
            // nothing to show. The remaining ~40s cover the rotation upsert + pause event.
            const { rawJobs, jobSpecs, jobUrls, queryUsed, deadlineHit } = await fetchAndFilterJobs(...findArgs);

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
              closeWriter();
              return;
            }

            // Pause after finding results — user clicks Continue to start AI scoring
            const totalFiltered = state.dedupSets.history.size + state.dedupSets.saved.size + state.dedupSets.rejected.size + state.dedupSets.blocked.size;
            sendComplete({
              type: "pause",
              message: `Found ${rawJobs.length} matching results${deadlineHit ? " (search window exhausted — showing best so far)" : ""}. Ready to score?`,
              progress: 20,
              ...(totalFiltered > 0 ? { filtered_summary: { history: state.dedupSets.history.size, saved: state.dedupSets.saved.size, rejected: state.dedupSets.rejected.size, blocked: state.dedupSets.blocked.size } } : {}),
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
                  locationScope: state.locationScope,
                  locationLadder: state.locationLadder,
                  allResults: [],
                  nextOffset: 0,
}, SUPABASE_SERVICE_KEY),
                });
                closeWriter();
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

            debugLog(`[PF] Resuming continuation: mode=pf, startRoundIndex=${startRoundIndex}, pfRoundsExecuted=${pfRoundsExecuted}, allResults.length=${allResults.length}`);

            // Rebuild title ladder and industry chain from refreshed profile data
            // (in case profile was edited while search was paused)
            titleChainSteps = Array.from({ length: MAX_ROUNDS }, (_, i) => {
              const title = pfTitles[i]?.trim();
              return title ? [title] : [];
            });
            for (let s = 0; s < MAX_ROUNDS; s++) {
              if (titleChainSteps[s].length === 0) titleChainSteps[s] = [...pfTitles];
            }
            industryChain = [
              state.industryStep1 || pfIndustry || "",
              state.industryStep2 || pfIndustry || "",
              state.industryStep3 || pfIndustry || "",
              state.industryStep4 || pfIndustry || "",
              state.industryStep5 || pfIndustry || "",
            ];
            debugLog(`[PF] Resuming at round ${startRoundIndex + 1}/${MAX_ROUNDS}, ${allResults.length} results so far`);
            debugLog(`[PF] Rebuilt title ladder: ${pfTitles.join(" > ")}`);
            debugLog(`[PF] Rebuilt industry ladder: ${industryChain.join(" > ")}`);
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

          for (let i = startRoundIndex; i < MAX_ROUNDS && !finish_now; i++) {
            const roundNum = i + 1;

            if (Date.now() - pfStartTime > 240_000) {
              debugLog(`[PF] Time limit reached (240s), pausing after round ${roundNum - 1}`);
              pfAborted = true;
              
              // Immediate checkpoint and pause
              const timeoutTotalFiltered = pfFilteredCounts.history + pfFilteredCounts.saved + pfFilteredCounts.rejected + pfFilteredCounts.blocked;
              sendComplete({
                type: "pause",
                message: `Timeout approaching, saving progress at round ${roundNum - 1}.`,
                progress: Math.min(((roundNum - 1) / MAX_ROUNDS) * 80, 80),
                ...(timeoutTotalFiltered > 0 ? { filtered_summary: pfFilteredCounts } : {}),
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
                  locationScope: state.locationScope,
                  locationLadder: state.locationLadder,
                }, SUPABASE_SERVICE_KEY),
              });
              closeWriter();
              return;
            }

            const titles = titleChainSteps[i];
            const industry = industryChain[i] || pfIndustry;

            if (titles.length === 0) {
              titles.push(...pfTitles);
            }

            const titleQuery = buildOrQuery(titles);
            const industryPart = buildIndustryQuery(industry);
            // Location is deliberately NOT in `q`. fetchAndFilterJobs passes it as SerpAPI's
            // geo `location` param (province-mapped), which is already broader than the raw
            // city+province string. Space-joining it here AND-ed both tokens and dropped
            // legitimately-matching jobs (e.g. a "Pretoria" posting under a "Johannesburg" profile).
            const fullQuery = [titleQuery, industryPart, "jobs"].filter(Boolean).join(" ");

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
              let filtered;
              debugLog(`[PF] Round ${roundNum}: Starting SEARCH phase`);
              const pfHiddenKeys = state.hiddenJobKeys ? new Set<string>(state.hiddenJobKeys as string[]) : undefined;
              // Typed tuple — see the note at the previous call site. `undefined` = deadline.
              const pfFindArgs: Parameters<typeof fetchAndFilterJobs> = [
                fullQuery, pfLocation, user, searchId,
                pfBannedJobs, pfBannedCompanies, dataClient, state.profile_id, sendStatus, roundNum,
                pfHiddenKeys, state.maxAgeDays, 5, platforms, pfStartTime + 200_000,
                scopeForSearch, ladderForSearch,
              ];
              filtered = await fetchAndFilterJobs(...pfFindArgs);
              debugLog(`[PF] Round ${roundNum}: fetchAndFilterJobs returned ${filtered.rawJobs?.length || 0} raw jobs`);

              let roundResults: JobRow[] = [];
              let roundFilteredCounts = { history: 0, saved: 0, rejected: 0, blocked: 0 };

              if (filtered.rawJobs.length > 0) {
                const roundDeadline = Date.now() + 240_000;
                debugLog(`[PF] Round ${roundNum}: Starting SCORING phase with ${filtered.rawJobs.length} jobs, deadline in ${Math.round((roundDeadline - Date.now()) / 1000)}s`);

                const result = await screenAndAnalyze(
                  filtered.rawJobs, filtered.jobSpecs, filtered.jobUrls, filtered.queryUsed,
                  pfLocation, pfIndustry, pfTitles, pfCvTexts,
                  user, searchId, dataClient, pfBannedJobs, pfBannedCompanies, state.profile_id,
                  sendStatus, roundNum,
                  { history: new Set(pfDedupSets.history || []), saved: new Set(pfDedupSets.saved || []), blocked: new Set(pfDedupSets.blocked || []), rejected: new Set(pfDedupSets.rejected || []) },
                  state.maxAgeDays,
                  0,
                  roundDeadline,
                  outputs,
                  // Cross-round spec dedup: fingerprints already scored in earlier PF rounds
                  (() => {
                    const keys = new Set<string>();
                    for (const r of allResults) {
                      const fk = specFingerprint(r.full_spec ?? "");
                      if (fk) keys.add(fk);
                    }
                    return keys;
                  })(),
                  scopeForSearch,
                  ladderForSearch
                );
                roundResults = result.results;
                roundFilteredCounts = result.filteredCounts;
                debugLog(`[PF] Round ${roundNum}: screenAndAnalyze completed - ${roundResults.length} scored, filtered: H=${roundFilteredCounts.history} S=${roundFilteredCounts.saved} R=${roundFilteredCounts.rejected} B=${roundFilteredCounts.blocked}`);
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
                const roundTotalFiltered = pfFilteredCounts.history + pfFilteredCounts.saved + pfFilteredCounts.rejected + pfFilteredCounts.blocked;
                sendComplete({
                  type: "pause",
                  message: `Round ${roundNum} of ${MAX_ROUNDS} complete, ${allResults.length} results so far. Continue to round ${roundNum + 1}?`,
                  progress: Math.min((roundNum / MAX_ROUNDS) * 80, 80),
                  ...(roundTotalFiltered > 0 ? { filtered_summary: pfFilteredCounts } : {}),
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
                    locationScope: state.locationScope,
                    locationLadder: state.locationLadder,
                  }, SUPABASE_SERVICE_KEY),
                });
                closeWriter();
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

          closeWriter();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          debugLog("[SEARCH] Unhandled error in stream:", msg);
          try {
            writer.send({ type: "error", code: "GENERIC_ERROR", message: "Something went wrong. Please try again.", progress: 0 });
            closeWriter();
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
