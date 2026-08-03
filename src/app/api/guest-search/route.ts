import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { searchAdzuna, searchDittoJobs, type SerpJob } from "@/lib/serpapi";
import { BLACKLISTED_DOMAINS, BLACKLISTED_COMPANIES, extractDomain, buildJobUrl, isBlacklistedByVia } from "@/lib/job-filter";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const IP_HASH_SALT = process.env.GUEST_IP_HASH_SALT ?? "fmsg-guest";
const SEARCH_TIMEOUT_MS = 25_000;
const DITTO_MAX_CARDS = 6;
const MAX_RESULTS = 3;

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
    salary: "",
    applyUrl: buildJobUrl(job) || job.link || "",
    source,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json().catch(() => ({}));
    const q = typeof query === "string" ? query.trim() : "";
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

    const [adzunaResult, dittoResult] = await Promise.allSettled([
      withTimeout(searchAdzuna({ q, location: "South Africa" }), SEARCH_TIMEOUT_MS, "Adzuna").catch((err) => {
        console.error(`[GUEST] Adzuna failed: ${err instanceof Error ? err.message : String(err)}`);
        return [] as SerpJob[];
      }),
      withTimeout(searchDittoJobs({ q, maxCards: DITTO_MAX_CARDS }), SEARCH_TIMEOUT_MS, "Ditto").catch((err) => {
        console.error(`[GUEST] Ditto failed: ${err instanceof Error ? err.message : String(err)}`);
        return [] as SerpJob[];
      }),
    ]);

    const adzunaJobs = adzunaResult.status === "fulfilled" ? adzunaResult.value : [];
    const dittoJobs = dittoResult.status === "fulfilled" ? dittoResult.value : [];
    const allJobs = [
      ...adzunaJobs.map((j) => ({ job: j, source: "Adzuna" as const })),
      ...dittoJobs.map((j) => ({ job: j, source: "Ditto" as const })),
    ];

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
      if (results.length >= MAX_RESULTS) break;
    }

    if (results.length === 0) {
      return NextResponse.json(
        { results: [], used: false, remaining: 1, queryUsed: q, message: "No jobs found. Try a different search." },
        { status: 200 }
      );
    }

    await supabase.from("guest_searches").insert({ ip_hash: ipHash, query: q }).then(({ error }) => {
      if (error) console.error("[GUEST] Failed to record guest search:", error);
    });

    return NextResponse.json({ results, used: true, remaining: 0, queryUsed: q });
  } catch (err) {
    console.error("[GUEST-SEARCH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
