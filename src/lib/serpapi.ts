import { checkApiLimit, recordApiCall } from "./api-rate-limit";

const SERPAPI_KEY = process.env.SERPAPI_API_KEY;

export interface ApplyOption {
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
  spec_source?: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "google_search";
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

export async function fetchJobDetails(jobId: string, params: SerpParams): Promise<{ description?: string }> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_jobs");
  url.searchParams.set("q", params.q);
  url.searchParams.set("job_id", jobId);
  url.searchParams.set("api_key", SERPAPI_KEY!);
  if (params.location) url.searchParams.set("location", params.location);
  if (params.hl) url.searchParams.set("hl", params.hl);
  if (params.gl) url.searchParams.set("gl", params.gl);

  const fullUrl = url.toString();
  const safeUrl = fullUrl.replace(/api_key=[^&]+/, "api_key=***");
  console.log("[SERPAPI] GET", safeUrl);

  const res = await fetch(fullUrl);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SerpAPI detail error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data;
}

export async function searchJinaWeb(params: SerpParams): Promise<SerpJob[]> {
  const query = [params.q, params.location, "job"].filter(Boolean).join(" ");
  const url = new URL("https://s.jina.ai/");
  url.searchParams.set("q", query);

  const headers: Record<string, string> = {
    "Accept": "application/json",
  };
  if (process.env.JINA_API) headers["Authorization"] = `Bearer ${process.env.JINA_API}`;

  const fullUrl = url.toString();
  console.log("[JINA SEARCH] GET", fullUrl);

  const res = await fetch(fullUrl, { headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jina search error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const results = data.data ?? [];

  return results.map((r: any, i: number) => ({
    title: r.title?.split(" | ")[0]?.split(" at ")[0]?.trim() || r.title || `Job ${i + 1}`,
    company_name: r.title?.split(" at ")[1]?.split(" | ")[0]?.trim() || r.title?.split(" | ")[1]?.trim() || "Unknown",
    location: params.location || "",
    description: r.content?.slice(0, 2000) || r.description || "",
    link: r.url,
    via: new URL(r.url || "https://example.com").hostname,
  }));
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

  const query = [params.q, params.location, "South Africa"].filter(Boolean).join(" ");
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

  const what = params.q || "";
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

  console.log("[SRC4-LINKEDIN] REQ params:", JSON.stringify({ keywords: query, location: "South Africa", geoId: LINKEDIN_SA_GEOID }));
  console.log("[SRC4-LINKEDIN] URL: https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

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
  { domain: "za.indeed.com", jobPattern: /\/viewjob\?jk=/i, listingPatterns: [/\/jobs\/?$/i] },
  { domain: "linkedin.com", jobPattern: /\/jobs\/view\/\d+/i, listingPatterns: [/\/jobs\/search\//i] },
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
    if (
      lowerContent.includes("total jobs found") ||
      lowerContent.includes("results for") && lowerContent.includes("jobs in") ||
      lowerContent.includes("search results") ||
      lowerContent.includes("refine your search") ||
      lowerContent.includes("sort by") && lowerContent.includes("per page") ||
      lowerContent.match(/\d+\s+jobs?\s+found/i) ||
      lowerContent.match(/\d+\s+results?\s+for/i) ||
      lowerContent.match(/show\s+\d+\s+\d+\s+\d+/i) ||
      (lowerContent.includes("save this job") && lowerContent.split("save this job").length > 3) ||
      (lowerContent.includes("cookie") && (lowerContent.includes("privacy") || lowerContent.includes("consent") || lowerContent.includes("policy"))) ||
      (lowerContent.includes("we use cookies") && lowerContent.length < 2000) ||
      lowerContent.includes("cookie policy") && !lowerContent.includes("job requirements") ||
      lowerContent.match(/we\s+(use|use|and|store)\s+cookies/i)
    ) {
      console.warn(`[SRC5-SCRAPE] REJECTED listing/cookie page: ${url} (first 100 chars: ${content.slice(0, 100)})`);
      return null;
    }

    const domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    const titleMatch = content.match(/^#\s+(.+)/m) || content.match(/^##\s+(.+)/m);
    let title = titleMatch?.[1]?.trim() || "";

    if (!title) {
      const ogTitle = json.data?.metadata?.title;
      if (ogTitle) title = ogTitle.split(" | ")[0].split(" - ")[0].trim();
    }
    if (!title) {
      const titleLines = content.split("\n").filter((l: string) => l.trim().length > 5 && l.trim().length < 120);
      title = titleLines[0]?.replace(/^#+\s*/, "").trim() || "";
    }

    let company = "";
    const companyPatterns = [
      /(?:at|@|company:\s*)(.+)/i,
      /(?:employer|organisation):\s*(.+)/i,
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
    return {
      title: title.slice(0, 200),
      company_name: company || "Unknown",
      location: location || "",
      description: content.slice(0, 3000),
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
