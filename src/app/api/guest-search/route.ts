import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs, searchJSearch, searchAdzuna, searchWebJobs, searchJinaBingJobs, searchDittoJobs, type SerpJob } from "@/lib/serpapi";
import { searchWorkdayJobs } from "@/lib/workday";
import { mapLocationToProvince } from "@/lib/location";
import { BLACKLISTED_DOMAINS, BLACKLISTED_COMPANIES, extractDomain, buildJobUrl, isBlacklistedByVia } from "@/lib/job-filter";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const IP_HASH_SALT = process.env.GUEST_IP_HASH_SALT ?? "fmsg-guest";
const FAST_SOURCE_TIMEOUT_MS = 25_000;
const DITTO_TIMEOUT_MS = 60_000;
const DITTO_MAX_CARDS = 6;
const JOB_POST_MAX_RESULTS = 3;
const LANDING_MAX_RESULTS = 4;

function getIP(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "127.0.0.1";
}

function hashIP(ip: string): string {
  return createHash("sha256").update(`${IP_HASH_SALT}:${ip}`).digest("hex");
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[GUEST] ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}

function isBlacklisted(job: SerpJob): boolean {
  const url = buildJobUrl(job);
  const domain = extractDomain(url);
  if (isBlacklistedByVia(job.via)) return true;
  if (domain && BLACKLISTED_DOMAINS.some((d) => domain === d || domain?.endsWith(`.${d}`) || domain?.includes(d))) return true;
  const companyLower = (job.company_name ?? "").toLowerCase();
  return BLACKLISTED_COMPANIES.some((c) => companyLower.includes(c));
}

const safe = (p: Promise<SerpJob[]>, label: string) =>
  p.catch((err: unknown) => {
    console.error(`[GUEST] ${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    return [] as SerpJob[];
  });

interface GuestJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  applyUrl: string;
  source: string;
}

function toGuestJob(job: SerpJob, source: string): GuestJob {
  return {
    title: job.title || "",
    company: job.company_name || "Unknown",
    location: job.location || "",
    salary: translateAdzunaSalary(job),
    applyUrl: buildJobUrl(job) || job.link || "",
    source,
  };
}

/** Adzuna returns numeric annual ZAR salary bounds, render as readable text. */
function translateAdzunaSalary(job: SerpJob): string {
  const min = job.salary_min;
  const max = job.salary_max;
  if (typeof min !== "number" || typeof max !== "number" || min <= 0 || max <= 0) return "";
  const fmt = (n: number) => `R${Math.round(n / 1000)}k`;
  const range = min === max ? fmt(min) : `${fmt(min)} - ${fmt(max)}`;
  return `${range} per year`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const q = typeof body.query === "string" ? body.query.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const funnel: "job-post" | "landing" = body.mode === "job-post" ? "job-post" : "landing";
    if (!q) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const ip = getIP(request);
    const ipHash = hashIP(ip);

    const rl = checkRateLimit(`guest:${ipHash}`, "guest_search");
    if (!rl.allowed) {
      return NextResponse.json(
        { code: "GUEST_LIMIT", message: "You've used your free search for today. Sign up to keep searching.", used: true, remaining: 0 },
        { status: 403 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: existing } = await supabase
      .from("guest_searches")
      .select("id")
      .eq("ip_hash", ipHash)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { code: "GUEST_LIMIT", message: "You've already used your free search. Sign up to keep searching.", used: true, remaining: 0 },
        { status: 403 }
      );
    }

    // Source selection
    // Job-post funnel (came from a shared job post): 2 sources (Adzuna + Ditto).
    // Landing funnel (arrived at /guest directly): all sources.
    let allJobs: { job: SerpJob; source: string }[];

    if (funnel === "job-post") {
      const [adzunaJobs, dittoJobs] = await Promise.all([
        safe(withTimeout(searchAdzuna({ q, location: location || "South Africa" }), FAST_SOURCE_TIMEOUT_MS, "Adzuna"), "Adzuna"),
        safe(withTimeout(searchDittoJobs({ q, location: location || undefined, maxCards: DITTO_MAX_CARDS }), DITTO_TIMEOUT_MS, "Ditto"), "Ditto"),
      ]);
      allJobs = [
        ...adzunaJobs.map((j) => ({ job: j, source: "Adzuna" as const })),
        ...dittoJobs.map((j) => ({ job: j, source: "Ditto" as const })),
      ];
    } else {
      const tightened = location ? mapLocationToProvince(location).province || location : "";
      const serpParams = { q, location: tightened || undefined, hl: "en" as const, gl: "za" as const };
      const [jsearchJobs, googleJobs, adzunaJobs, bingJobs, webJobs, dittoJobs, workdayJobs] = await Promise.all([
        safe(withTimeout(searchJSearch(serpParams), FAST_SOURCE_TIMEOUT_MS, "JSearch"), "JSearch"),
        safe(withTimeout(searchGoogleJobs(serpParams), FAST_SOURCE_TIMEOUT_MS, "Google Jobs"), "Google Jobs"),
        safe(withTimeout(searchAdzuna(serpParams), FAST_SOURCE_TIMEOUT_MS, "Adzuna"), "Adzuna"),
        safe(withTimeout(searchJinaBingJobs(serpParams), FAST_SOURCE_TIMEOUT_MS, "Bing Jobs"), "Bing Jobs"),
        safe(withTimeout(searchWebJobs(serpParams), FAST_SOURCE_TIMEOUT_MS, "Web Jobs"), "Web Jobs"),
        safe(withTimeout(searchDittoJobs({ ...serpParams, maxCards: DITTO_MAX_CARDS }), DITTO_TIMEOUT_MS, "Ditto"), "Ditto"),
        safe(withTimeout(searchWorkdayJobs(serpParams), FAST_SOURCE_TIMEOUT_MS, "Workday"), "Workday"),
      ]);
      // Priority: JSearch > Google > Bing > Ditto > Workday > Web > Adzuna
      allJobs = [
        ...jsearchJobs.map((j) => ({ job: j, source: "JSearch" as const })),
        ...googleJobs.map((j) => ({ job: j, source: "Google Jobs" as const })),
        ...bingJobs.map((j) => ({ job: j, source: "Bing Jobs" as const })),
        ...dittoJobs.map((j) => ({ job: j, source: "Ditto" as const })),
        ...workdayJobs.map((j) => ({ job: j, source: "Workday" as const })),
        ...webJobs.map((j) => ({ job: j, source: "Web Jobs" as const })),
        ...adzunaJobs.map((j) => ({ job: j, source: "Adzuna" as const })),
      ];
    }

    const maxResults = funnel === "job-post" ? JOB_POST_MAX_RESULTS : LANDING_MAX_RESULTS;

    const seenUrls = new Set<string>();
    const seenKeys = new Set<string>();
    const results: GuestJob[] = [];
    for (const { job, source } of allJobs) {
      const guestJob = toGuestJob(job, source);
      if (!guestJob.applyUrl && !guestJob.title) continue;
      if (isBlacklisted(job)) continue;

      const urlKey = guestJob.applyUrl.toLowerCase();
      const key = `${guestJob.title.toLowerCase().trim()}|${guestJob.company.toLowerCase().trim()}`;
      if (urlKey && seenUrls.has(urlKey)) continue;
      if (seenKeys.has(key)) continue;

      if (urlKey) seenUrls.add(urlKey);
      seenKeys.add(key);
      results.push(guestJob);
      if (results.length >= maxResults) break;
    }

    if (results.length === 0) {
      return NextResponse.json(
        { results: [], used: false, remaining: 1, queryUsed: q, message: "No jobs found. Try a different search." },
        { status: 200 }
      );
    }

    await supabase.from("guest_searches").insert({ ip_hash: ipHash, query: q, location: location || null }).then(({ error }) => {
      if (error) console.error("[GUEST] Failed to record guest search:", error);
    });

    return NextResponse.json({ results, used: true, remaining: 0, queryUsed: q });
  } catch (err) {
    console.error("[GUEST-SEARCH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
