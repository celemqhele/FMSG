/**
 * Source 10: Workday Jobs — public CXS JSON API (no browser needed)
 *
 * Every Workday tenant exposes a free, unauthenticated JSON endpoint:
 *   POST /wday/cxs/{tenant}/{site}/jobs   — search listings
 *   GET  /wday/cxs/{tenant}/{site}/job{path} — full job detail
 *
 * We search all 29 known SA Workday tenants in parallel,
 * then fetch full descriptions for jobs that survive pipeline filtering.
 */

import https from "https";
import { checkApiLimit, recordApiCall } from "./api-rate-limit";
import type { SerpJob } from "./serpapi";

// ─── SA Workday Tenants ──────────────────────────────────────────────────
// Hardcoded list — the CXS API is per-tenant, no global search exists.
// To add a new tenant, find their {company}.wd{N}.myworkdayjobs.com URL
// and extract: host, site (path segment after /en-US/).

export interface WorkdayTenant {
  name: string;      // display name
  host: string;      // e.g. "absa.wd3.myworkdayjobs.com"
  site: string;      // path segment, e.g. "ABSAcareersite"
}

export const WORKDAY_TENANTS: WorkdayTenant[] = [
  // Financial Services, Banking, and Asset Management
  { name: "Absa",              host: "absa.wd3.myworkdayjobs.com",              site: "ABSAcareersite" },
  { name: "Old Mutual",        host: "oldmutual.wd3.myworkdayjobs.com",         site: "Old_Mutual_Careers" },
  { name: "FirstRand",         host: "firstrand.wd3.myworkdayjobs.com",         site: "FRB" },
  { name: "Apex Group",        host: "theapexgroup.wd3.myworkdayjobs.com",      site: "apexgroupcareers" },
  { name: "AIG",               host: "aig.wd1.myworkdayjobs.com",               site: "aig" },
  { name: "Visa",              host: "visa.wd5.myworkdayjobs.com",              site: "Visa" },

  // Biopharmaceuticals, Healthcare, and Life Sciences
  { name: "Sanofi",            host: "sanofi.wd3.myworkdayjobs.com",            site: "SanofiCareers" },
  { name: "AstraZeneca",       host: "astrazeneca.wd3.myworkdayjobs.com",       site: "Careers" },
  { name: "Pfizer",            host: "pfizer.wd1.myworkdayjobs.com",            site: "PfizerCareers" },
  { name: "BeiGene",           host: "beigene.wd5.myworkdayjobs.com",           site: "beigene" },
  { name: "Stryker",           host: "stryker.wd1.myworkdayjobs.com",           site: "strykercareers" },
  { name: "IDEXX",             host: "idexx.wd1.myworkdayjobs.com",             site: "IDEXX" },
  { name: "Kimberly Clark",    host: "kimberlyclark.wd1.myworkdayjobs.com",     site: "Arbex" },

  // Technology, Software, and Digital Services
  { name: "nCino",             host: "ncino.wd5.myworkdayjobs.com",             site: "nCinoCareers" },
  { name: "Salesforce",        host: "salesforce.wd12.myworkdayjobs.com",       site: "External_Career_Site" },
  { name: "Aveva",             host: "aveva.wd3.myworkdayjobs.com",             site: "RIB_Careers" },

  // Energy, Infrastructure, Logistics, and Real Estate
  { name: "Glencore/Astron",   host: "glencore.wd3.myworkdayjobs.com",          site: "astronenergy" },
  { name: "Maersk",            host: "maersk.wd3.myworkdayjobs.com",            site: "Maersk_Manual" },
  { name: "JLL",               host: "jll.wd1.myworkdayjobs.com",               site: "jllcareers" },
  { name: "Vantage DC",        host: "vantagedc.wd1.myworkdayjobs.com",         site: "Vantage" },
  { name: "Trafigura",         host: "trafigura.wd3.myworkdayjobs.com",         site: "Puma_Energy_Careers" },

  // FMCG / Consumer
  { name: "Unilever",          host: "unilever.wd3.myworkdayjobs.com",          site: "TMICC" },
  { name: "Lindt",             host: "lindtspruengli.wd103.myworkdayjobs.com",  site: "LindtSpruengliGroupCareers" },
  { name: "MyHCM/Betway",      host: "myhcm.wd3.myworkdayjobs.com",            site: "Betway_Africa" },

  // Non-Profit, Scientific Research, Media, and NGOs
  { name: "AHRI",              host: "ahri.wd3.myworkdayjobs.com",              site: "AHRI1" },
  { name: "Nature Conservancy", host: "nature.wd108.myworkdayjobs.com",          site: "externalcareers" },
  { name: "IPAS",              host: "ipas.wd5.myworkdayjobs.com",              site: "Ipas" },

  // Recruitment / RPO
  { name: "Wilson HCG",        host: "wilsonhcg.wd5.myworkdayjobs.com",         site: "Wilson_Careers" },

  // Other
  { name: "Lumine/Vas-X",      host: "luminegrp.wd3.myworkdayjobs.com",         site: "Vas-X" },
];

// ─── CXS API Helpers ─────────────────────────────────────────────────────

interface WorkdayListing {
  title: string;
  externalPath: string;
  locationsText: string;
  postedOn: string;
  remoteType: string;
  bulletFields: string[];
}

interface WorkdaySearchResponse {
  jobPostings: WorkdayListing[];
  total: number;
  facets: Record<string, unknown>;
}

interface WorkdayDetailResponse {
  jobPostingInfo: {
    jobTitle: string;
    jobDescription: string;
    location: string;
    timeType: string;
    postedOn: string;
    startDate: string;
  };
  hiringOrganization: { name: string };
}

function tenantSlug(host: string): string {
  return host.split(".")[0];
}

function cxsPostUrl(tenant: WorkdayTenant): string {
  return `https://${tenant.host}/wday/cxs/${tenantSlug(tenant.host)}/${tenant.site}/jobs`;
}

function cxsGetUrl(tenant: WorkdayTenant, externalPath: string): string {
  // externalPath starts with "/job/..." — append directly to base
  return `https://${tenant.host}/wday/cxs/${tenantSlug(tenant.host)}/${tenant.site}${externalPath}`;
}

function httpPost(url: string, body: Record<string, unknown>, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const opts: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "POST",
      timeout: timeoutMs,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Language": "en-US",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": `${parsed.origin}/en-US/`,
      },
    };

    const req = https.request(opts, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => resolve(chunks));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(data);
    req.end();
  });
}

function httpGet(url: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      timeout: timeoutMs,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": `${parsed.origin}/en-US/`,
      },
    };

    const req = https.request(opts, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => resolve(chunks));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

// ─── Search All Tenants ──────────────────────────────────────────────────

async function searchSingleTenant(
  tenant: WorkdayTenant,
  query: string,
): Promise<SerpJob[]> {
  const url = cxsPostUrl(tenant);

  try {
    const raw = await httpPost(url, {
      appliedFacets: {},
      limit: 20,
      offset: 0,
      searchText: query,
    });

    const data: WorkdaySearchResponse = JSON.parse(raw);
    const postings = data.jobPostings ?? [];

    if (postings.length === 0) return [];

    return postings.map((p) => ({
      title: p.title || "",
      company_name: tenant.name,
      location: p.locationsText || "",
      description: "", // fetched later via detail endpoint
      link: `https://${tenant.host}/en-US/${tenant.site}${p.externalPath}`,
      via: "workday",
      posted_at: p.postedOn || "",
      hasFullSpec: false,
      spec_source: "workday" as const,
      // Stash tenant metadata for detail fetch
      _workdayTenant: tenant,
      _workdayPath: p.externalPath,
      _workdayRemote: p.remoteType || "",
    }));
  } catch {
    return [];
  }
}

export async function searchWorkdayJobs(params: { q: string; location?: string }, deadline?: number): Promise<SerpJob[]> {
  const rl = checkApiLimit("workday");
  if (!rl.allowed) {
    console.warn(`[WORKDAY] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining`);
    return [];
  }

  const query = params.q || "";
  if (!query) {
    console.warn(`[WORKDAY] SKIP — empty query`);
    return [];
  }

  console.log(`[WORKDAY] Searching ${WORKDAY_TENANTS.length} SA tenants: "${query}"`);

  const startTime = Date.now();

  // Search all tenants in parallel
  const results = await Promise.all(
    WORKDAY_TENANTS.map((t) => searchSingleTenant(t, query).catch(() => [] as SerpJob[])),
  );

  // Check deadline after parallel tenant search
  if (deadline && Date.now() >= deadline) {
    console.log(`[WORKDAY] Deadline reached after tenant search, returning early`);
    return results.flat();
  }

  const allJobs = results.flat();
  const elapsed = Date.now() - startTime;
  console.log(`[WORKDAY] Search complete in ${elapsed}ms — ${allJobs.length} raw results from ${results.filter((r) => r.length > 0).length} tenants`);

  recordApiCall("workday");

  if (allJobs.length > 0) {
    console.log(`[WORKDAY] First: "${allJobs[0].title}" at "${allJobs[0].company_name}"`);
  }

  return allJobs;
}

// ─── Fetch Full Job Description ──────────────────────────────────────────

export async function fetchWorkdayDetail(
  tenant: WorkdayTenant,
  externalPath: string,
): Promise<string> {
  const url = cxsGetUrl(tenant, externalPath);

  try {
    const raw = await httpGet(url);
    const data: WorkdayDetailResponse = JSON.parse(raw);

    // Extract job description HTML and strip tags for plain text
    const html = data.jobPostingInfo?.jobDescription ?? "";
    const plainText = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|nav|main|aside|strong|b|em|i|u|a|span|div|blockquote|pre|code)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (plainText.length > 50) {
      console.log(`[WORKDAY-DETAIL] OK ${plainText.length} chars from ${tenant.name}`);
      return plainText.slice(0, 3000);
    }

    return "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[WORKDAY-DETAIL] FAIL ${msg.slice(0, 100)} from ${tenant.name}`);
    return "";
  }
}
