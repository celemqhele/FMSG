import { checkApiLimit, recordApiCall, recordApiFailure } from "./api-rate-limit";
import { chromium } from "playwright";

const SERPAPI_KEY = process.env.SERPAPI_API_KEY;

interface ApplyOption {
  link: string;
  title: string;
}

export interface SerpJob {
  title: string;
  company_name: string;
  location: string;
  description?: string;
  link?: string;
  via?: string;
  job_id?: string;
  posted_at?: string;
  apply_options?: ApplyOption[];
  job_highlights?: { link?: string };
  hasFullSpec?: boolean;
  spec_source?: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "google_search" | "web_jobs";
}

interface SerpParams {
  q: string;
  location?: string;
  hl?: string;
  gl?: string;
  start?: number;
}

export async function searchGoogleJobs(params: SerpParams): Promise<SerpJob[]> {
  const rl = checkApiLimit("serpapi");
  if (!rl.allowed) {
    console.warn(`[SRC1-GOOGLE-JOBS] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining, retry in ${Math.ceil(rl.retryAfterMs / 1000)}s`);
    return [];
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_jobs");
  url.searchParams.set("q", params.q);
  url.searchParams.set("api_key", SERPAPI_KEY!);
  if (params.location) url.searchParams.set("location", params.location);
  if (params.hl) url.searchParams.set("hl", params.hl);
  if (params.gl) url.searchParams.set("gl", params.gl);
  if (params.start != null) url.searchParams.set("start", String(params.start));

  const fullUrl = url.toString();
  const safeUrl = fullUrl.replace(/api_key=[^&]+/, "api_key=***");
  console.log("[SRC1-GOOGLE-JOBS] REQ params:", JSON.stringify({ q: params.q, location: params.location, gl: params.gl }));
  console.log("[SRC1-GOOGLE-JOBS] URL:", safeUrl);

  const res = await fetch(fullUrl);
  console.log(`[SRC1-GOOGLE-JOBS] HTTP ${res.status} ${res.statusText}`);
  if (!res.ok) {
    const err = await res.text();
    console.error(`[SRC1-GOOGLE-JOBS] FAIL status=${res.status} body=${err.slice(0, 300)}`);
    if (res.status === 429) {
      recordApiFailure("serpapi");
      console.warn(`[SRC1-GOOGLE-JOBS] 429 detected — marking serpapi as exhausted until window resets`);
    }
    throw new Error(`SerpAPI search error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const jobs = data.jobs_results ?? [];
  recordApiCall("serpapi");
  const remaining = rl.remaining - 1;
  console.log(`[SRC1-GOOGLE-JOBS] OK ${jobs.length} jobs returned (serpapi quota: ${remaining}/${rl.total})`);
  if (jobs.length > 0) {
    console.log(`[SRC1-GOOGLE-JOBS] First: "${jobs[0].title}" at "${jobs[0].company_name}"`);
  }
  return jobs;
}

// ─── Source 2: JSearch API (RapidAPI) ──────────────────────────────────────

export async function searchJSearch(params: SerpParams): Promise<SerpJob[]> {
  const apiKey = process.env.JSEARCH_API;
  if (!apiKey) {
    console.warn("[SRC2-JSEARCH] SKIP — no JSEARCH_API key set");
    return [];
  }

  const rl = checkApiLimit("jsearch");
  if (!rl.allowed) {
    console.warn(`[SRC2-JSEARCH] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining, retry in ${Math.ceil(rl.retryAfterMs / 1000)}s`);
    return [];
  }

  const query = cleanQueryForSearch([params.q, params.location, "South Africa"].filter(Boolean).join(" "), params.location);
  const url = new URL("https://jsearch.p.rapidapi.com/search-v2");
  url.searchParams.set("query", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("country", "za");

  console.log("[SRC2-JSEARCH] REQ params:", JSON.stringify({ query, country: "za", num_pages: 1 }));
  console.log("[SRC2-JSEARCH] URL: https://jsearch.p.rapidapi.com/search-v2");
  console.log("[SRC2-JSEARCH] Key present:", apiKey ? `${apiKey.slice(0, 8)}...` : "MISSING");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
      },
    });

    console.log(`[SRC2-JSEARCH] HTTP ${res.status} ${res.statusText}`);
    if (!res.ok) {
      const err = await res.text();
      console.error(`[SRC2-JSEARCH] FAIL status=${res.status} body=${err.slice(0, 300)}`);
      return [];
    }

    // Parse rate limit headers from JSearch/RapidAPI
    const quotaRemaining = res.headers.get("x-ratelimit-requests-remaining");
    const quotaLimit = res.headers.get("x-ratelimit-requests-limit");
    if (quotaRemaining !== null) {
      console.log(`[SRC2-JSEARCH] Quota from API: ${quotaRemaining}/${quotaLimit || "?"} remaining`);
    }

    const data = await res.json();
    console.log(`[SRC2-JSEARCH] API status=${data.status} request_id=${data.request_id}`);
    const jobs = data.data?.jobs ?? data.data ?? [];
    recordApiCall("jsearch");
    const ourRemaining = rl.remaining - 1;
    console.log(`[SRC2-JSEARCH] OK ${jobs.length} jobs returned (jsearch quota: ${ourRemaining}/${rl.total})`);
    if (jobs.length > 0) {
      const first = jobs[0];
      console.log(`[SRC2-JSEARCH] First: "${first.job_title}" at "${first.employer_name}" desc_len=${(first.job_description || "").length}`);
    }
    return jobs.map((j: any) => {
      const fullDesc = j.job_description || "";
      return {
        title: j.job_title || "",
        company_name: j.employer_name || "Unknown",
        location: j.job_city || j.job_state || params.location || "",
        description: fullDesc.slice(0, 3000),
        link: j.job_apply_link || j.job_google_link || "",
        via: j.employer_name || "",
        posted_at: j.job_posted_at_datetime_utc || "",
        hasFullSpec: fullDesc.length > 300,
        spec_source: "jsearch" as const,
      };
    });
  } catch (err) {
    console.error(`[SRC2-JSEARCH] EXCEPTION:`, err);
    return [];
  }
}

// ─── Source 3: Adzuna API ───────────────────────────────────────────────────

export async function searchAdzuna(params: SerpParams): Promise<SerpJob[]> {
  const appId = process.env.ADZUNA_APP_ID ?? process.env.Adzuna_APP_ID;
  const appKey = process.env.ADZUNA_API ?? process.env.Adzuna_API;
  if (!appId || !appKey) {
    console.warn("[SRC3-ADZUNA] SKIP — missing Adzuna_APP_ID or Adzuna_API");
    return [];
  }

  const rl = checkApiLimit("adzuna");
  if (!rl.allowed) {
    console.warn(`[SRC3-ADZUNA] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining, retry in ${Math.ceil(rl.retryAfterMs / 1000)}s`);
    return [];
  }

  // Strip Google-style operators and noise words that Adzuna doesn't support
  const what = (params.q || "")
    .replace(/["*]/g, "")           // remove quotes and wildcards
    .replace(/\b(OR|AND|NOT)\b/gi, "") // remove boolean operators
    .replace(/\b(in|jobs|job|south africa|cape town|johannesburg|durban|pretoria)\b/gi, "") // remove noise/location
    .replace(/\s+/g, " ")           // collapse whitespace
    .trim();
  const where = params.location || "South Africa";

  const url = new URL("https://api.adzuna.com/v1/api/jobs/za/search/1");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("what", what);
  url.searchParams.set("where", where);
  url.searchParams.set("results_per_page", "20");
  url.searchParams.set("content-type", "application/json");

  console.log("[SRC3-ADZUNA] REQ params:", JSON.stringify({ what, where, results_per_page: 20 }));
  console.log("[SRC3-ADZUNA] URL: https://api.adzuna.com/v1/api/jobs/za/search/1");
  console.log("[SRC3-ADZUNA] Key present:", appKey ? `${appKey.slice(0, 8)}...` : "MISSING");

  try {
    const res = await fetch(url.toString());
    console.log(`[SRC3-ADZUNA] HTTP ${res.status} ${res.statusText}`);
    if (!res.ok) {
      const err = await res.text();
      console.error(`[SRC3-ADZUNA] FAIL status=${res.status} body=${err.slice(0, 300)}`);
      return [];
    }

    const data = await res.json();
    const jobs = data.results ?? [];
    recordApiCall("adzuna");
    const remaining = rl.remaining - 1;
    console.log(`[SRC3-ADZUNA] OK ${jobs.length} jobs returned (adzuna quota: ${remaining}/${rl.total})`);
    if (jobs.length > 0) {
      const first = jobs[0];
      console.log(`[SRC3-ADZUNA] First: "${first.title}" at "${first.company?.display_name}" desc_len=${(first.description || "").length}`);
    }
    return jobs.map((j: any) => {
      const snippet = j.description || "";
      return {
        title: j.title || "",
        company_name: j.company?.display_name || "Unknown",
        location: j.location?.display_name || "",
        description: snippet.slice(0, 3000),
        link: j.redirect_url || "",
        via: j.company?.display_name || "",
        posted_at: j.created || "",
        hasFullSpec: false,
        spec_source: "adzuna" as const,
      };
    });
  } catch (err) {
    console.error(`[SRC3-ADZUNA] EXCEPTION:`, err);
    return [];
  }
}

// ─── Source 4: LinkedIn Public Guest API ────────────────────────────────────
// LinkedIn geoId for South Africa
const LINKEDIN_SA_GEOID = "105365746";

export async function searchLinkedInJobs(params: SerpParams): Promise<SerpJob[]> {
  const query = params.q;
  if (!query) {
    console.warn("[SRC4-LINKEDIN] SKIP — no query");
    return [];
  }

  const rl = checkApiLimit("linkedin");
  if (!rl.allowed) {
    console.warn(`[SRC4-LINKEDIN] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining, retry in ${Math.ceil(rl.retryAfterMs / 1000)}s`);
    return [];
  }

  const url = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
  url.searchParams.set("keywords", query);
  url.searchParams.set("location", "South Africa");
  url.searchParams.set("geoId", LINKEDIN_SA_GEOID);
  url.searchParams.set("f_TPR", "r604800"); // past week
  url.searchParams.set("start", "0");

  const linkedinUrl = url.toString();
  const proxyUrl = process.env.LINKEDIN_PROXY_URL;
  const viaProxy = !!proxyUrl;

  console.log("[SRC4-LINKEDIN] REQ params:", JSON.stringify({ keywords: query, location: "South Africa", geoId: LINKEDIN_SA_GEOID }));
  console.log(`[SRC4-LINKEDIN] URL: ${linkedinUrl}`);
  console.log(`[SRC4-LINKEDIN] Mode: ${viaProxy ? `PROXY (${proxyUrl})` : "DIRECT (will likely fail from Vercel)"}`);

  try {
    let res: Response;
    if (viaProxy) {
      res = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Target-URL": linkedinUrl,
        },
      });
    } else {
      res = await fetch(linkedinUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.linkedin.com/jobs/search/?keywords=" + encodeURIComponent(query),
          "Connection": "keep-alive",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
        },
      });
    }

    console.log(`[SRC4-LINKEDIN] HTTP ${res.status} ${res.statusText}`);
    if (!res.ok) {
      console.error(`[SRC4-LINKEDIN] FAIL status=${res.status}`);
      return [];
    }

    const html = await res.text();
    console.log(`[SRC4-LINKEDIN] Response HTML length: ${html.length}`);

    // Parse individual job cards from the HTML
    const jobCards = html.match(/<li[\s\S]*?<\/li>/g) ?? [];
    console.log(`[SRC4-LINKEDIN] Raw HTML cards found: ${jobCards.length}`);

    const jobs: SerpJob[] = [];

    for (const card of jobCards) {
      try {
        // Extract title + link
        const titleMatch = card.match(/<a[^>]*href="([^"]*)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/);
        const link = titleMatch?.[1]?.trim() || "";
        let title = titleMatch?.[2]?.replace(/<[^>]+>/g, "").trim() || "";

        // Extract company
        const companyMatch = card.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
        const company = companyMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "Unknown";

        // Extract location
        const locationMatch = card.match(/<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/);
        const location = locationMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "";

        if (!title || !link) continue;

        // Make link absolute
        const fullLink = link.startsWith("http") ? link : `https://www.linkedin.com${link}`;

        jobs.push({
          title,
          company_name: company,
          location,
          description: "",
          link: fullLink,
          via: "linkedin.com",
          hasFullSpec: false,
          spec_source: "linkedin" as const,
        });
      } catch {
        // Skip malformed cards
      }
    }

    console.log(`[SRC4-LINKEDIN] OK ${jobs.length} jobs parsed from HTML (linkedin quota: ${rl.remaining - 1}/${rl.total})`);
    recordApiCall("linkedin");
    if (jobs.length > 0) {
      console.log(`[SRC4-LINKEDIN] First: "${jobs[0].title}" at "${jobs[0].company_name}"`);
    }
    return jobs;
  } catch (err) {
    console.error(`[SRC4-LINKEDIN] EXCEPTION:`, err);
    return [];
  }
}

// ─── Source 5: Google Search + Jina (two-step crawl) ───────────────────────
// Step 1: Google Search returns listing page URLs
// Step 2: Jina reads listing page → extract individual job URLs
// Step 3: Jina reads each individual URL → full spec

const JINA_SCRAPEABLE_DOMAINS = [
  { domain: "careerjunction.co.za", jobPattern: /job-\d+\.aspx/i, listingPatterns: [/\/jobs\/[a-z0-9-]+$/i, /\/jobs\/[a-z0-9-]+\/[a-z0-9-]+$/i] },
  { domain: "jobmail.co.za", jobPattern: /-id-\d+$/i, listingPatterns: [/\/jobs\/?$/i, /\/jobs\/[a-z0-9-]+\/?$/i, /\/jobs\/[a-z0-9-]+\/[a-z0-9-]+\/?$/i] },
  { domain: "pnet.co.za", jobPattern: /--[\w-]+--\d+-inline\.html/i, listingPatterns: [/\/jobs\/[a-z0-9-]+$/i] },
];

export function isListingPage(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const domain = JINA_SCRAPEABLE_DOMAINS.find(d => host === d.domain || host.endsWith(`.${d.domain}`));
    if (!domain) return false;
    return domain.listingPatterns.some(p => p.test(u.pathname));
  } catch {
    return false;
  }
}

export function isIndividualJobPage(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const domain = JINA_SCRAPEABLE_DOMAINS.find(d => host === d.domain || host.endsWith(`.${d.domain}`));
    if (!domain) return false;
    return domain.jobPattern.test(u.pathname + u.search);
  } catch {
    return false;
  }
}

export async function searchGooglePages(params: SerpParams): Promise<{ title: string; link: string; snippet: string; domain: string }[]> {
  const allResults: { title: string; link: string; snippet: string; domain: string }[] = [];

  // Check shared SerpAPI rate limit before starting
  const rl = checkApiLimit("serpapi");
  if (!rl.allowed) {
    console.warn(`[SRC5-GOOGLE-SCRAPE] RATE LIMITED — serpapi quota exhausted (${rl.remaining}/${rl.total}), skipping`);
    return [];
  }

  console.log(`[SRC5-GOOGLE-SCRAPE] Starting search for ${JINA_SCRAPEABLE_DOMAINS.length} domains (serpapi quota: ${rl.remaining}/${rl.total})`);

  const domainResults = await Promise.all(
    JINA_SCRAPEABLE_DOMAINS.map(async ({ domain }) => {
      const query = `${params.q} site:${domain}`;

      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google");
      url.searchParams.set("q", query);
      url.searchParams.set("api_key", SERPAPI_KEY!);
      if (params.location) url.searchParams.set("location", params.location);
      if (params.hl) url.searchParams.set("hl", params.hl || "en");
      if (params.gl) url.searchParams.set("gl", params.gl || "za");
      url.searchParams.set("num", "10");

      const fullUrl = url.toString();
      const safeUrl = fullUrl.replace(/api_key=[^&]+/, "api_key=***");
      console.log(`[SRC5-GOOGLE-SCRAPE] REQ site:${domain} url=${safeUrl}`);

      const matched: { title: string; link: string; snippet: string; domain: string }[] = [];

      try {
        const res = await fetch(fullUrl);
        console.log(`[SRC5-GOOGLE-SCRAPE] site:${domain} HTTP ${res.status} ${res.statusText}`);
        if (!res.ok) {
          console.error(`[SRC5-GOOGLE-SCRAPE] site:${domain} FAIL status=${res.status}`);
          if (res.status === 429) {
            recordApiFailure("serpapi");
            console.warn(`[SRC5-GOOGLE-SCRAPE] 429 detected — marking serpapi as exhausted until window resets`);
          }
          return matched;
        }
        const data = await res.json();
        recordApiCall("serpapi");
        const organic = data.organic_results ?? [];
        console.log(`[SRC5-GOOGLE-SCRAPE] site:${domain} OK ${organic.length} organic results`);
        for (const r of organic) {
          if (!r.link) continue;
          try {
            const resultDomain = new URL(r.link).hostname.replace(/^www\./, "").toLowerCase();
            if (resultDomain === domain || resultDomain.endsWith(`.${domain}`)) {
              matched.push({
                title: r.title || "",
                link: r.link,
                snippet: r.snippet || "",
                domain: resultDomain,
              });
            }
          } catch {}
        }
        console.log(`[SRC5-GOOGLE-SCRAPE] site:${domain} matched ${matched.length} URLs for scraping`);
      } catch (err) {
        console.error(`[SRC5-GOOGLE-SCRAPE] site:${domain} EXCEPTION:`, err);
      }

      return matched;
    })
  );

  for (const results of domainResults) {
    allResults.push(...results);
  }

  console.log(`[SRC5-GOOGLE-SCRAPE] TOTAL ${allResults.length} URLs collected across all domains`);
  return allResults;
}

export async function extractJobUrlsFromListingPage(
  listingUrl: string,
  jinaApiKey: string | null
): Promise<string[]> {
  const rl = checkApiLimit("jina");
  if (!rl.allowed) {
    console.warn(`[SRC5-EXTRACT] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining, skipping ${listingUrl}`);
    return [];
  }

  try {
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "X-Return-Format": "markdown",
      "X-Remove-Images": "true",
    };
    if (jinaApiKey) headers["Authorization"] = `Bearer ${jinaApiKey}`;

    console.log(`[SRC5-EXTRACT] Jina REQ: ${listingUrl} (jina quota: ${rl.remaining}/${rl.total})`);
    let res = await fetch(`https://r.jina.ai/${encodeURIComponent(listingUrl)}`, { headers });
    console.log(`[SRC5-EXTRACT] Jina HTTP ${res.status} ${res.statusText} for ${listingUrl}`);

    // Retry once on 429 with backoff
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "5", 10);
      console.warn(`[SRC5-EXTRACT] Jina 429, retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      res = await fetch(`https://r.jina.ai/${encodeURIComponent(listingUrl)}`, { headers });
      console.log(`[SRC5-EXTRACT] Jina retry HTTP ${res.status} ${res.statusText} for ${listingUrl}`);
    }

    if (!res.ok) {
      console.error(`[SRC5-EXTRACT] Jina FAIL status=${res.status} for ${listingUrl}`);
      return [];
    }

    recordApiCall("jina");

    const json = await res.json();
    if (json.code !== 200 || !json.data?.content) {
      console.warn(`[SRC5-EXTRACT] Jina OK but no content (code=${json.code}) for ${listingUrl}`);
      return [];
    }

    const content: string = json.data.content;
    console.log(`[SRC5-EXTRACT] Content length: ${content.length} for ${listingUrl}`);

    const baseHost = new URL(listingUrl).hostname.replace(/^www\./, "").toLowerCase();
    const domain = JINA_SCRAPEABLE_DOMAINS.find(d => baseHost === d.domain || baseHost.endsWith(`.${d.domain}`));
    if (!domain) {
      console.warn(`[SRC5-EXTRACT] No domain config for ${baseHost}`);
      return [];
    }

    // Extract all URLs from the markdown content
    const urlRegex = /https?:\/\/[^\s\)>\]"]+/g;
    const allUrls: string[] = [...(content.match(urlRegex) ?? [])];

    // Also extract relative URLs and convert to absolute
    const relativeUrlRegex = /\]\((\/[^\)]+)\)/g;
    let match;
    while ((match = relativeUrlRegex.exec(content)) !== null) {
      allUrls.push(`https://${baseHost}${match[1]}`);
    }

    const jobUrls: string[] = [];
    const seen = new Set<string>();

    for (const rawUrl of allUrls) {
      try {
        const u = new URL(rawUrl);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();

        // Must be same domain
        if (host !== domain.domain && !host.endsWith(`.${domain.domain}`)) continue;

        // Must match individual job page pattern
        if (!domain.jobPattern.test(u.pathname + u.search)) continue;

        const clean = u.origin + u.pathname;
        if (!seen.has(clean)) {
          seen.add(clean);
          jobUrls.push(clean);
        }
      } catch {}
    }

    console.log(`[SRC5-EXTRACT] Found ${jobUrls.length} individual job URLs from ${listingUrl}`);
    return jobUrls.slice(0, 8);
  } catch (err) {
    console.error(`[SRC5-EXTRACT] EXCEPTION for ${listingUrl}:`, err);
    return [];
  }
}

export async function scrapeJobPage(
  url: string,
  jinaApiKey: string | null
): Promise<SerpJob | null> {
  const rl = checkApiLimit("jina");
  if (!rl.allowed) {
    console.warn(`[SRC5-SCRAPE] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining, skipping ${url}`);
    return null;
  }

  try {
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "X-Return-Format": "markdown",
      "X-Remove-Images": "true",
    };
    if (jinaApiKey) headers["Authorization"] = `Bearer ${jinaApiKey}`;

    console.log(`[SRC5-SCRAPE] Jina REQ: ${url} (jina quota: ${rl.remaining}/${rl.total})`);
    let res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers });
    console.log(`[SRC5-SCRAPE] Jina HTTP ${res.status} ${res.statusText} for ${url}`);

    // Retry once on 429 with backoff
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "5", 10);
      console.warn(`[SRC5-SCRAPE] Jina 429, retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers });
      console.log(`[SRC5-SCRAPE] Jina retry HTTP ${res.status} ${res.statusText} for ${url}`);
    }

    if (!res.ok) {
      if (res.status === 429 || res.status === 403) {
        try {
          const err = await res.json();
          console.warn(`[SRC5-SCRAPE] Jina rate/auth error code=${err.code} for ${url}`);
        } catch {}
      }
      console.error(`[SRC5-SCRAPE] Jina FAIL status=${res.status} for ${url}`);
      return null;
    }

    recordApiCall("jina");

    const json = await res.json();
    if (json.code !== 200 || !json.data?.content) {
      console.warn(`[SRC5-SCRAPE] Jina OK but bad code=${json.code} or no content for ${url}`);
      return null;
    }

    const content: string = json.data.content.trim();
    console.log(`[SRC5-SCRAPE] Content length: ${content.length} for ${url}`);
    if (content.length < 300) {
      console.warn(`[SRC5-SCRAPE] Rejected too short (${content.length} chars): ${url}`);
      return null;
    }

    // Validate this looks like an individual job page, not a search/listing/cookie page
    const lowerContent = content.toLowerCase();
    const isListingPage =
      lowerContent.includes("total jobs found") ||
      (lowerContent.includes("results for") && lowerContent.includes("jobs in")) ||
      lowerContent.includes("search results") ||
      lowerContent.includes("refine your search") ||
      (lowerContent.includes("sort by") && lowerContent.includes("per page")) ||
      lowerContent.match(/\d+\s+jobs?\s+found/i) ||
      lowerContent.match(/\d+\s+results?\s+for/i) ||
      lowerContent.match(/show\s+\d+\s+\d+\s+\d+/i) ||
      (lowerContent.includes("save this job") && lowerContent.split("save this job").length > 3);

    const isCookieOnly =
      lowerContent.length < 5000 && (
        (lowerContent.includes("cookie") && (lowerContent.includes("privacy") || lowerContent.includes("consent") || lowerContent.includes("policy"))) ||
        lowerContent.includes("we use cookies") ||
        lowerContent.includes("cookie policy") ||
        lowerContent.match(/we\s+(use|and|store)\s+cookies/i)
      );

    const isSignInPage =
      lowerContent.length < 5000 && (
        lowerContent.includes("join or sign in") ||
        lowerContent.includes("additional verification required") ||
        lowerContent.match(/to see more than one page.*sign in/i) ||
        (lowerContent.includes("sign in") && lowerContent.includes("create an account"))
      );

    if (isListingPage || isCookieOnly || isSignInPage) {
      console.warn(`[SRC5-SCRAPE] REJECTED listing/cookie/signin page: ${url} (first 100 chars: ${content.slice(0, 100)})`);
      return null;
    }

    const domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    // Find first heading that isn't a sidebar pattern (e.g. "N jobs in Location")
    const sidebarHeadingPattern = /^[\d,*]+\s+\*{0,2}[\w\s/]+\*{0,2}\s+jobs?\s+in\s+/i;
    let title = "";
    for (const match of content.matchAll(/^(#{1,2})\s+(.+)/gm)) {
      const headingText = match[2].trim();
      if (!sidebarHeadingPattern.test(headingText)) {
        title = headingText;
        break;
      }
    }

    if (!title) {
      const ogTitle = json.data?.metadata?.title;
      if (ogTitle) title = ogTitle.split(" | ")[0].split(" - ")[0].trim();
    }
    if (!title) {
      // Fall back to URL slug
      const slug = url.split("/").pop()?.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "";
      if (slug.length > 5 && slug.length < 120) title = slug;
    }
    if (!title) {
      const titleLines = content.split("\n").filter((l: string) => l.trim().length > 5 && l.trim().length < 120);
      title = titleLines[0]?.replace(/^#+\s*/, "").trim() || "";
    }

    let company = "";
    const companyPatterns = [
      /\*\*(?:Company|Employer)\*\*:\s*(.+)/i,
      /(?:company|employer|organisation|hiring\s+(?:company|organisation)):\s*(.+)/i,
    ];
    for (const pat of companyPatterns) {
      const m = content.match(pat);
      if (m) { company = m[1].trim().split("\n")[0].slice(0, 80); break; }
    }

    let location = "";
    const locationPatterns = [
      /(?:location|city|region|address):\s*(.+)/i,
      /(?:in|based in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    ];
    for (const pat of locationPatterns) {
      const m = content.match(pat);
      if (m) { location = m[1].trim().split("\n")[0].slice(0, 80); break; }
    }

    console.log(`[SRC5-SCRAPE] OK title="${title.slice(0, 60)}" company="${company || "Unknown"}" desc_len=${content.slice(0, 3000).length}`);
    const titleIdx = content.indexOf(title);
    const descriptionStart = titleIdx >= 0 ? titleIdx : 0;
    return {
      title: title.slice(0, 200),
      company_name: company || "Unknown",
      location: location || "",
      description: content.slice(descriptionStart, descriptionStart + 3000),
      link: url,
      via: domain,
      hasFullSpec: true,
      spec_source: "google_search",
    };
  } catch (err) {
    console.error(`[SRC5-SCRAPE] EXCEPTION for ${url}:`, err);
    return null;
  }
}

// ─── Source 6: Gemini Google Search Jobs ─────────────────────────────────────
// Uses Gemini API with Google Search grounding to find real job listings.
// Bypasses SerpAPI quota — taps into Google's index directly via Gemini.

import { callGeminiWithSearch } from "./gemini";

export async function searchGoogleJobsViaGemini(params: SerpParams): Promise<SerpJob[]> {
  const location = params.location || "South Africa";
  const query = params.q;

  const systemPrompt = `You are a job search assistant. You have access to Google Search. 
Search for current job listings matching the user's query.

IMPORTANT RULES:
1. Return ONLY a JSON array — no markdown, no explanation, no wrapping text.
2. Each object must have exactly these keys: "title", "company_name", "location", "description", "link"
3. "description" should be a meaningful excerpt from the job listing (50-300 chars), not a summary.
4. "link" must be the direct URL to the job posting (not a search results page).
5. Return up to 20 jobs. If fewer found, return what you have.
6. Focus on South African job boards: careerjunction.co.za, pnet.co.za, indeed.co.za, jobmail.co.za, and company career pages.
7. Do NOT include aggregator pages like "top 10 jobs" — only individual job postings.`;

  const userText = `Search Google for: ${query} jobs in ${location}, South Africa. Return JSON array of individual job postings.`;

  console.log(`[SRC6-GEMINI-SEARCH] REQ query="${query}" location="${location}"`);

  try {
    const result = await callGeminiWithSearch(systemPrompt, userText, {
      temperature: 0.1,
      maxOutputTokens: 8192,
    });

    console.log(`[SRC6-GEMINI-SEARCH] Response length: ${result.text.length} chars`);

    // Extract JSON array from response (may be wrapped in markdown code block)
    let jsonStr = result.text.trim();
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn(`[SRC6-GEMINI-SEARCH] No JSON array found in response`);
      console.warn(`[SRC6-GEMINI-SEARCH] Response preview: ${jsonStr.slice(0, 300)}`);
      return [];
    }
    jsonStr = jsonMatch[0];

    let parsed: any[];
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error(`[SRC6-GEMINI-SEARCH] JSON parse error:`, parseErr);
      console.error(`[SRC6-GEMINI-SEARCH] Raw JSON: ${jsonStr.slice(0, 500)}`);
      return [];
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.warn(`[SRC6-GEMINI-SEARCH] Empty or non-array result`);
      return [];
    }

    // Map to SerpJob format
    const jobs: SerpJob[] = parsed
      .filter((j) => j.title && j.link)
      .map((j) => ({
        title: String(j.title || "").trim(),
        company_name: String(j.company_name || j.company || "Unknown").trim(),
        location: String(j.location || location).trim(),
        description: String(j.description || "").slice(0, 3000),
        link: String(j.link || ""),
        via: (() => { try { return new URL(j.link).hostname.replace(/^www\./, ""); } catch { return "google_search"; } })(),
        hasFullSpec: (j.description?.length ?? 0) > 300,
        spec_source: "google_search" as const,
      }));

    console.log(`[SRC6-GEMINI-SEARCH] OK ${jobs.length} jobs parsed`);
    if (jobs.length > 0) {
      console.log(`[SRC6-GEMINI-SEARCH] First: "${jobs[0].title}" at "${jobs[0].company_name}"`);
    }

    // Log grounding metadata if available
    if (result.groundingMetadata?.groundingChunks) {
      const sources = result.groundingMetadata.groundingChunks
        .filter((c) => c.web)
        .map((c) => c.web!.title || c.web!.uri)
        .slice(0, 5);
      console.log(`[SRC6-GEMINI-SEARCH] Grounding sources: ${sources.join(", ")}`);
    }

    return jobs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SRC6-GEMINI-SEARCH] FAIL: ${msg.slice(0, 300)}`);
    return [];
  }
}

// ─── Source 7: Job Search via Fallback Chain ────────────────────────────────
// Reader chain (URL → markdown): Jina → Bright Data → Apify
// Then Scrappa (Google Jobs API) as last resort

const JINA_READER_BASE = "https://r.jina.ai";

// ─── Jina Reader: Google Jobs via ibp=htl;jobs ────────────────────────────
// Uses Jina Reader to scrape Google's Jobs tab directly.
// Same token pool as Bing scraping — both fail when tokens are exhausted.

export async function searchJinaGoogleJobs(params: SerpParams): Promise<SerpJob[]> {
  const rl = checkApiLimit("bing-jina");
  if (!rl.allowed) {
    console.warn(`[SRC8-JINA-GOOGLE] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining`);
    return [];
  }

  const query = cleanQueryForSearch([params.q, params.location, "South Africa"].filter(Boolean).join(" "), params.location);
  const location = params.location || "South Africa";

  const googleJobsUrl = new URL("https://www.google.com/search");
  googleJobsUrl.searchParams.set("q", `${query} jobs`);
  googleJobsUrl.searchParams.set("ibp", "htl;jobs");
  googleJobsUrl.searchParams.set("gl", "za");
  googleJobsUrl.searchParams.set("hl", "en");

  const jinaFetchUrl = `${JINA_READER_BASE}/${googleJobsUrl.toString()}`;
  console.log(`[SRC8-JINA-GOOGLE] Fetching Google Jobs via Jina: ${googleJobsUrl.toString()}`);

  try {
    const jinaKey = process.env.JINA_API;
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "X-Return-Format": "markdown",
    };
    if (jinaKey) {
      headers["Authorization"] = `Bearer ${jinaKey}`;
    }

    const res = await fetch(jinaFetchUrl, { headers });
    console.log(`[SRC8-JINA-GOOGLE] HTTP ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 402) {
        console.error(`[SRC8-JINA-GOOGLE] OUT OF CREDITS (402) — will try next source`);
      } else {
        console.error(`[SRC8-JINA-GOOGLE] FAIL status=${res.status} body=${err.slice(0, 200)}`);
      }
      return [];
    }

    const data = await res.json();
    const content = data?.data?.[0]?.content ?? data?.content ?? "";
    console.log(`[SRC8-JINA-GOOGLE] Response: ${content.length} chars`);

    if (!content || content.length < 50) {
      console.warn(`[SRC8-JINA-GOOGLE] Empty or too short response — will try next source`);
      return [];
    }

    recordApiCall("bing-jina");
    const jobs = parseGoogleJobsMarkdown(content, location);
    console.log(`[SRC8-JINA-GOOGLE] SUCCESS — ${jobs.length} jobs parsed`);
    if (jobs.length > 0) {
      console.log(`[SRC8-JINA-GOOGLE] First: "${jobs[0].title}" at "${jobs[0].company_name}"`);
    }
    return jobs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SRC8-JINA-GOOGLE] EXCEPTION: ${msg.slice(0, 200)} — will try next source`);
    return [];
  }
}

// ─── Parse Google Jobs markdown (from Jina Reader) ────────────────────────

function parseGoogleJobsMarkdown(content: string, defaultLocation?: string): SerpJob[] {
  const jobs: SerpJob[] = [];
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentTitle = "";
  let currentCompany = "";
  let currentLocation = "";
  let currentDescription = "";
  let currentLink = "";
  let currentVia = "";

  const jobKeywords = /\b(manager|developer|engineer|analyst|specialist|coordinator|director|assistant|consultant|designer|administrator|officer|lead|senior|junior|executive|representative|account|sales|marketing|finance|hr|human resources|it|tech|data|cloud|devops|product|project)\b/i;

  for (const line of lines) {
    if (line.startsWith("## Filters") || line.startsWith("## Sort") || line.startsWith("Show") || line.startsWith("Skip to")) continue;
    if (line.includes("successfully saved") || line.includes("Something went wrong")) continue;
    if (line.includes("View it in Saved") || line.includes("was not saved")) continue;
    if (line.startsWith("Important:") || line.startsWith("Important :")) continue;
    if (line === "Not applicable" || line === "N/A") continue;

    // Detect URLs
    const urlMatch = line.match(/(https?:\/\/[^\s)]+)/);
    if (urlMatch && !currentTitle) {
      currentLink = urlMatch[1];
      continue;
    }

    const boldMatch = line.match(/^\*\*(.+?)\*\*/);
    const isJobTitle = boldMatch || (jobKeywords.test(line) && line.length < 150 && !line.startsWith("-") && !line.startsWith("*"));

    if (isJobTitle && !line.includes("|")) {
      if (currentTitle) {
        jobs.push({
          title: cleanText(currentTitle),
          company_name: cleanText(currentCompany) || "Unknown",
          location: cleanText(currentLocation) || defaultLocation || "",
          description: cleanText(currentDescription).slice(0, 3000),
          link: currentLink,
          via: currentVia || "google_jobs",
          hasFullSpec: currentDescription.length > 300,
          spec_source: "web_jobs" as const,
        });
      }
      currentTitle = boldMatch ? boldMatch[1] : line;
      currentCompany = "";
      currentLocation = "";
      currentDescription = "";
      currentLink = "";
      currentVia = "";
      continue;
    }

    if (currentTitle && !currentCompany) {
      const atMatch = line.match(/(?:at|@)\s+(.+)/i);
      if (atMatch) {
        currentCompany = atMatch[1];
      } else if (line.length < 100 && !line.match(/\d{4}/) && !line.startsWith("**")) {
        currentCompany = line;
      }
      continue;
    }

    if (currentTitle && currentCompany && !currentLocation) {
      const locationPattern = /(?:,\s*(?:GT|WC|KZN|EC|FS|MP|NW|LP|NC)|Johannesburg|Cape Town|Durban|Pretoria|Sandton|Midrand|Remote|South Africa)/i;
      if (locationPattern.test(line) || line.length < 60) {
        currentLocation = line;
        continue;
      }
    }

    if (currentTitle && line.length > 30) {
      currentDescription += (currentDescription ? " " : "") + line;
    }

    const viaMatch = line.match(/via\s+(LinkedIn|Indeed|Glassdoor|ZipRecruiter|PNet|CareerJunction|JobMail|Company Site|Direct)/i);
    if (viaMatch) {
      currentVia = viaMatch[1].toLowerCase();
    }
  }

  if (currentTitle) {
    jobs.push({
      title: cleanText(currentTitle),
      company_name: cleanText(currentCompany) || "Unknown",
      location: cleanText(currentLocation) || defaultLocation || "",
      description: cleanText(currentDescription).slice(0, 3000),
      link: currentLink,
      via: currentVia || "google_jobs",
      hasFullSpec: currentDescription.length > 300,
      spec_source: "web_jobs" as const,
    });
  }

  return jobs.filter((j) => {
    const t = j.title.toLowerCase();
    const c = j.company_name.toLowerCase();
    if (t.length < 3 || t.length > 200) return false;
    if (t.includes("filter") || t.includes("sort") || t.includes("show") || t.includes("sign in")) return false;
    if (t.endsWith(" - search")) return false;
    if (t.includes("successfully saved") || t.includes("view it in saved")) return false;
    if (t.includes("important:") || t.includes("something went wrong")) return false;
    if (t.includes("not applicable") || t === "n/a") return false;
    if (c === "unknown" && !jobKeywords.test(j.title)) return false;
    if (c.length <= 1 || c === "[" || c === "n/a") return false;
    if (j.location.toLowerCase() === "n/a" || j.location === "Not applicable") return false;
    return true;
  });
}

export async function searchWebJobs(params: SerpParams): Promise<SerpJob[]> {
  const query = cleanQueryForSearch([params.q, params.location, "South Africa"].filter(Boolean).join(" "), params.location);
  const location = params.location || "South Africa";

  console.log(`[SRC7-SEARCH] Starting fallback chain for query: "${query}"`);

  const jinaResult = await tryJinaWebJobs(query, location);
  console.log(`[SRC7-SEARCH] Jina returned ${jinaResult.length} jobs`);
  if (jinaResult.length > 0) return jinaResult;

  const brightDataResult = await tryBrightDataWebJobs(query, location);
  console.log(`[SRC7-SEARCH] Bright Data returned ${brightDataResult.length} jobs`);
  if (brightDataResult.length > 0) return brightDataResult;

  const apifyResult = await tryApifyWebJobs(query, location);
  console.log(`[SRC7-SEARCH] Apify returned ${apifyResult.length} jobs`);
  if (apifyResult.length > 0) return apifyResult;

  const scrappaResult = await tryScrappaJobs(query, location);
  console.log(`[SRC7-SEARCH] Scrappa returned ${scrappaResult.length} jobs`);
  if (scrappaResult.length > 0) return scrappaResult;

  console.warn(`[SRC7-SEARCH] ALL SOURCES FAILED — returning 0 jobs`);
  return [];
}

// ─── Reader 1: Jina Reader (free, no key required) ────────────────────────

async function tryJinaWebJobs(query: string, location: string): Promise<SerpJob[]> {
  const rl = checkApiLimit("bing-jina");
  if (!rl.allowed) {
    console.warn(`[SRC7-JINA] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining`);
    return [];
  }

  const bingUrl = new URL("https://www.bing.com/jobs");
  bingUrl.searchParams.set("q", query);
  bingUrl.searchParams.set("scp", "0");
  bingUrl.searchParams.set("rb", "0");
  bingUrl.searchParams.set("rc", "20");
  bingUrl.searchParams.set("L2", "true");
  bingUrl.searchParams.set("c", "1");
  bingUrl.searchParams.set("cc", "ZA");
  bingUrl.searchParams.set("form", "JOBL2S");

  const jinaFetchUrl = `${JINA_READER_BASE}/${bingUrl.toString()}`;
  console.log(`[SRC7-JINA] Fetching Bing Jobs via Jina: ${bingUrl.toString()}`);

  try {
    const jinaKey = process.env.JINA_API;
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "X-Return-Format": "markdown",
    };
    if (jinaKey) {
      headers["Authorization"] = `Bearer ${jinaKey}`;
    }

    const res = await fetch(jinaFetchUrl, { headers });

    console.log(`[SRC7-JINA] HTTP ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 402) {
        console.error(`[SRC7-JINA] OUT OF CREDITS (402) — will try next source`);
      } else {
        console.error(`[SRC7-JINA] FAIL status=${res.status} body=${err.slice(0, 200)}`);
      }
      return [];
    }

    const data = await res.json();
    const content = data?.data?.[0]?.content ?? data?.content ?? "";
    console.log(`[SRC7-JINA] Response: ${content.length} chars`);

    if (!content || content.length < 50) {
      console.warn(`[SRC7-JINA] Empty or too short response — will try next source`);
      return [];
    }

    recordApiCall("bing-jina");
    const jobs = parseBingJobsMarkdown(content, location);
    console.log(`[SRC7-JINA] SUCCESS — ${jobs.length} jobs parsed`);
    if (jobs.length > 0) {
      console.log(`[SRC7-JINA] First: "${jobs[0].title}" at "${jobs[0].company_name}"`);
    }
    return jobs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SRC7-JINA] EXCEPTION: ${msg.slice(0, 200)} — will try next source`);
    return [];
  }
}

// ─── Attempt 2: Scrappa (Google Jobs API) ────────────────────────────────

async function tryScrappaJobs(rawQuery: string, location: string): Promise<SerpJob[]> {
  const query = cleanQueryForSearch(rawQuery, location);
  const apiKey = process.env.SCRAPPA_API;
  if (!apiKey) {
    console.warn(`[SRC7-SCRAPPA] SKIP — no SCRAPPA_API key`);
    return [];
  }

  const rl = checkApiLimit("scrappa");
  if (!rl.allowed) {
    console.warn(`[SRC7-SCRAPPA] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining`);
    return [];
  }

  const url = new URL("https://scrappa.co/api/google/jobs");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", "za");
  url.searchParams.set("hl", "en");

  console.log(`[SRC7-SCRAPPA] Fetching Google Jobs: ${url.toString()}`);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "X-API-KEY": apiKey,
        "Accept": "application/json",
      },
    });

    console.log(`[SRC7-SCRAPPA] HTTP ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 402) {
        console.error(`[SRC7-SCRAPPA] OUT OF CREDITS (402) — will try next source`);
      } else {
        console.error(`[SRC7-SCRAPPA] FAIL status=${res.status} body=${err.slice(0, 200)}`);
      }
      return [];
    }

    const data = await res.json();
    const results = data?.jobs_results ?? [];
    console.log(`[SRC7-SCRAPPA] API returned ${results.length} results`);

    if (results.length === 0) {
      console.warn(`[SRC7-SCRAPPA] No jobs returned — will try next source`);
      return [];
    }

    recordApiCall("scrappa");
    const jobs: SerpJob[] = results.map((j: any) => ({
      title: String(j.title || "").trim(),
      company_name: String(j.company_name || "Unknown").trim(),
      location: String(j.location || location).trim(),
      description: String(j.description || "").slice(0, 3000),
      link: String(j.link || ""),
      via: String(j.via || "google_jobs").toLowerCase(),
      posted_at: j.detected_extensions?.posted_at || "",
      hasFullSpec: (j.description?.length ?? 0) > 300,
      spec_source: "web_jobs" as const,
    }));

    console.log(`[SRC7-SCRAPPA] SUCCESS — ${jobs.length} jobs parsed`);
    if (jobs.length > 0) {
      console.log(`[SRC7-SCRAPPA] First: "${jobs[0].title}" at "${jobs[0].company_name}"`);
    }
    return jobs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SRC7-SCRAPPA] EXCEPTION: ${msg.slice(0, 200)} — will try next source`);
    return [];
  }
}

// ─── Bright Data Browser API — scrapes Bing Jobs page via remote browser ──

async function tryBrightDataWebJobs(query: string, location: string): Promise<SerpJob[]> {
  const wsEndpoint = process.env.BRIGHTDATA_API;
  if (!wsEndpoint || !wsEndpoint.startsWith("wss://")) {
    console.warn(`[SRC7-BRIGHTDATA] SKIP — BRIGHTDATA_API is not a valid WebSocket URL (must start with wss://)`);
    return [];
  }

  const rl = checkApiLimit("brightdata");
  if (!rl.allowed) {
    console.warn(`[SRC7-BRIGHTDATA] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining`);
    return [];
  }

  const bingUrl = new URL("https://www.bing.com/jobs");
  bingUrl.searchParams.set("q", query);
  bingUrl.searchParams.set("scp", "0");
  bingUrl.searchParams.set("rb", "0");
  bingUrl.searchParams.set("rc", "20");
  bingUrl.searchParams.set("L2", "true");
  bingUrl.searchParams.set("c", "1");
  bingUrl.searchParams.set("cc", "ZA");
  bingUrl.searchParams.set("form", "JOBL2S");

  console.log(`[SRC7-BRIGHTDATA] Scraping Bing Jobs via Browser API: ${bingUrl.toString()}`);

  let browser;
  try {
    browser = await chromium.connectOverCDP(wsEndpoint);
    const page = await browser.newPage();

    await page.goto(bingUrl.toString(), { timeout: 60000 });

    // Wait for job cards to render
    try {
      await page.waitForSelector("#b_results", { timeout: 5000 });
    } catch {
      console.warn(`[SRC7-BRIGHTDATA] #b_results not found — proceeding with page content`);
    }

    const content = await page.evaluate(() => document.body.innerText);
    console.log(`[SRC7-BRIGHTDATA] Page content: ${content.length} chars`);

    if (!content || content.length < 50) {
      console.warn(`[SRC7-BRIGHTDATA] Empty page content — will try next source`);
      return [];
    }

    recordApiCall("brightdata");
    const jobs = parseBingJobsMarkdown(content, location);
    console.log(`[SRC7-BRIGHTDATA] SUCCESS — ${jobs.length} jobs parsed`);
    if (jobs.length > 0) {
      console.log(`[SRC7-BRIGHTDATA] First: "${jobs[0].title}" at "${jobs[0].company_name}"`);
    }
    return jobs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SRC7-BRIGHTDATA] EXCEPTION: ${msg.slice(0, 200)} — will try next source`);
    return [];
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

// ─── Reader 3: Apify URL-to-Markdown ($5 free credits/month) ───────────────

async function tryApifyWebJobs(query: string, location: string): Promise<SerpJob[]> {
  const apiKey = process.env.APIFY_API;
  if (!apiKey) {
    console.warn(`[SRC7-APIFY] SKIP — no APIFY_API key`);
    return [];
  }

  const rl = checkApiLimit("apify");
  if (!rl.allowed) {
    console.warn(`[SRC7-APIFY] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining`);
    return [];
  }

  const bingUrl = new URL("https://www.bing.com/jobs");
  bingUrl.searchParams.set("q", query);
  bingUrl.searchParams.set("scp", "0");
  bingUrl.searchParams.set("rb", "0");
  bingUrl.searchParams.set("rc", "20");
  bingUrl.searchParams.set("L2", "true");
  bingUrl.searchParams.set("c", "1");
  bingUrl.searchParams.set("cc", "ZA");
  bingUrl.searchParams.set("form", "JOBL2S");

  console.log(`[SRC7-APIFY] Fetching Bing Jobs via Apify: ${bingUrl.toString()}`);

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~url-to-markdown/run-sync-get-dataset-items?token=${apiKey}&timeout=30`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: bingUrl.toString(),
        }),
      }
    );

    console.log(`[SRC7-APIFY] HTTP ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 402) {
        console.error(`[SRC7-APIFY] OUT OF CREDITS (402) — will try next source`);
      } else {
        console.error(`[SRC7-APIFY] FAIL status=${res.status} body=${err.slice(0, 200)}`);
      }
      return [];
    }

    const data = await res.json();
    const items = Array.isArray(data) ? data : [data];
    const content = items[0]?.markdown ?? items[0]?.content ?? "";
    console.log(`[SRC7-APIFY] Response: ${content.length} chars`);
    console.log(`[SRC7-APIFY] Preview: ${content.slice(0, 500)}`);

    if (!content || content.length < 50) {
      console.warn(`[SRC7-APIFY] Empty or too short response — will try next source`);
      return [];
    }

    recordApiCall("apify");
    const jobs = parseBingJobsMarkdown(content, location);
    console.log(`[SRC7-APIFY] SUCCESS — ${jobs.length} jobs parsed`);
    if (jobs.length > 0) {
      console.log(`[SRC7-APIFY] First: "${jobs[0].title}" at "${jobs[0].company_name}"`);
    }
    return jobs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SRC7-APIFY] EXCEPTION: ${msg.slice(0, 200)} — will try next source`);
    return [];
  }
}

// ─── Shared Helpers ───────────────────────────────────────────────────────

function extractCompanyFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname.includes("linkedin")) return "LinkedIn";
    if (hostname.includes("indeed")) return "Indeed";
    if (hostname.includes("glassdoor")) return "Glassdoor";
    if (hostname.includes("careerjunction")) return "CareerJunction";
    if (hostname.includes("pnet")) return "PNet";
    if (hostname.includes("jobmail")) return "JobMail";
    return hostname.split(".")[0];
  } catch {
    return "Unknown";
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "unknown";
  }
}

function parseBingJobsMarkdown(content: string, defaultLocation?: string): SerpJob[] {
  const jobs: SerpJob[] = [];
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentTitle = "";
  let currentCompany = "";
  let currentLocation = "";
  let currentDescription = "";
  let currentVia = "";

  const jobKeywords = /\b(manager|developer|engineer|analyst|specialist|coordinator|director|assistant|consultant|designer|administrator|officer|lead|senior|junior|executive|representative|account|sales|marketing|finance|hr|human resources|it|tech|data|cloud|devops|product|project)\b/i;

  for (const line of lines) {
    if (line.startsWith("## Filters") || line.startsWith("## Sort") || line.startsWith("Show") || line.startsWith("Skip to")) continue;
    if (line.includes("successfully saved") || line.includes("Something went wrong")) continue;
    if (line.includes("View it in Saved") || line.includes("was not saved")) continue;
    if (line.startsWith("Important:") || line.startsWith("Important :")) continue;
    if (line === "Not applicable" || line === "N/A") continue;

    const boldMatch = line.match(/^\*\*(.+?)\*\*/);
    const isJobTitle = boldMatch || (jobKeywords.test(line) && line.length < 150 && !line.startsWith("-") && !line.startsWith("*"));

    if (isJobTitle && !line.includes("|")) {
      if (currentTitle) {
        jobs.push({
          title: cleanText(currentTitle),
          company_name: cleanText(currentCompany) || "Unknown",
          location: cleanText(currentLocation) || defaultLocation || "",
          description: cleanText(currentDescription).slice(0, 3000),
          link: "",
          via: currentVia || "bing",
          hasFullSpec: false,
          spec_source: "web_jobs" as const,
        });
      }
      currentTitle = boldMatch ? boldMatch[1] : line;
      currentCompany = "";
      currentLocation = "";
      currentDescription = "";
      currentVia = "";
      continue;
    }

    if (currentTitle && !currentCompany) {
      const atMatch = line.match(/(?:at|@)\s+(.+)/i);
      if (atMatch) {
        currentCompany = atMatch[1];
      } else if (line.length < 100 && !line.match(/\d{4}/) && !line.startsWith("**")) {
        currentCompany = line;
      }
      continue;
    }

    if (currentTitle && currentCompany && !currentLocation) {
      const locationPattern = /(?:,\s*(?:GT|WC|KZN|EC|FS|MP|NW|LP|NC)|Johannesburg|Cape Town|Durban|Pretoria|Sandton|Midrand|Remote|South Africa)/i;
      if (locationPattern.test(line) || line.length < 60) {
        currentLocation = line;
        continue;
      }
    }

    if (currentTitle && line.length > 30) {
      currentDescription += (currentDescription ? " " : "") + line;
    }

    const viaMatch = line.match(/via\s+(LinkedIn|Indeed|Glassdoor|ZipRecruiter|PNet|CareerJunction|JobMail|Company Site|Direct)/i);
    if (viaMatch) {
      currentVia = viaMatch[1].toLowerCase();
    }
  }

  if (currentTitle) {
    jobs.push({
      title: cleanText(currentTitle),
      company_name: cleanText(currentCompany) || "Unknown",
      location: cleanText(currentLocation) || defaultLocation || "",
      description: cleanText(currentDescription).slice(0, 3000),
      link: "",
      via: currentVia || "bing_jobs",
      hasFullSpec: false,
      spec_source: "web_jobs" as const,
    });
  }

  return jobs.filter((j) => {
    const t = j.title.toLowerCase();
    const c = j.company_name.toLowerCase();
    if (t.length < 3 || t.length > 200) return false;
    if (t.includes("filter") || t.includes("sort") || t.includes("show") || t.includes("sign in")) return false;
    if (t.endsWith(" - search")) return false;
    if (t.includes("successfully saved") || t.includes("view it in saved")) return false;
    if (t.includes("important:") || t.includes("something went wrong")) return false;
    if (t.includes("not applicable") || t === "n/a") return false;
    if (c === "unknown" && !jobKeywords.test(j.title)) return false;
    if (c.length <= 1 || c === "[" || c === "n/a") return false;
    if (j.location.toLowerCase() === "n/a" || j.location === "Not applicable") return false;
    return true;
  });
}

function cleanText(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Strip Google operators and noise words from queries so they work
 * across all sources (Adzuna, Scrappa, Bing, etc.).
 */
function cleanQueryForSearch(raw: string, location?: string): string {
  let q = raw;
  // Remove Google operators
  q = q.replace(/"/g, "");
  q = q.replace(/\*/g, "");
  q = q.replace(/\bOR\b/gi, " ");
  q = q.replace(/\bAND\b/gi, " ");
  q = q.replace(/\bNOT\b/gi, " ");
  // Remove noise words
  const noiseWords = ["in", "jobs", "job", "hiring", "now", "near", "the", "a", "for", "of"];
  const locLower = (location || "").toLowerCase();
  for (const w of noiseWords) {
    const re = new RegExp(`\\b${w}\\b`, "gi");
    q = q.replace(re, " ");
  }
  // Strip location name if duplicated
  if (locLower) {
    for (const part of locLower.split(/[,\s]+/)) {
      if (part.length > 2) {
        const re = new RegExp(`\\b${part}\\b`, "gi");
        q = q.replace(re, " ");
      }
    }
  }
  return q.replace(/\s+/g, " ").trim();
}

/**
 * Detect search/category pages that are NOT actual job listings.
 * Returns true if the result should be filtered out.
 */
function isCategoryPage(title: string, url: string): boolean {
  const t = title.toLowerCase();
  const u = url.toLowerCase();

  // Title patterns: "X+ jobs in Y", "X jobs in Y", etc.
  if (/^\d+[\+]?\s+(jobs|vacancies|openings)/.test(t)) return true;
  if (/^\d+[\+]?\s+\w+\s+jobs\b/.test(t)) return true;
  if (/\bjobs\s+(and|&)\s+work\b/.test(t)) return true;
  if (/^all\b/.test(t) && /\bjobs?\b/.test(t)) return true;
  if (/^job\s+ad\b/.test(t)) return true;

  // URL patterns: search/listing pages, not individual jobs
  if (u.includes("/jobs/search")) return true;
  if (u.includes("/jobs?")) return true;
  if (u.includes("?q=") && u.includes("/jobs")) return true;
  if (/\/jobs\/?$/.test(u)) return true;

  return false;
}
