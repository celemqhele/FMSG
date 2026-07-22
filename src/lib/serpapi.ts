import { checkApiLimit, recordApiCall, recordApiFailure } from "./api-rate-limit";
import puppeteer from "puppeteer-core";

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
  spec_source?: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "bing_jobs" | "web_jobs";
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


// ─── Scrape a single job page via Jina (used by admin create-job-post) ──────

export async function scrapeJobPage(
  url: string,
  jinaApiKey: string | null
): Promise<SerpJob | null> {
  const rl = checkApiLimit("jina");
  if (!rl.allowed) {
    console.warn(`[SCRAPE-JOB] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining, skipping ${url}`);
    return null;
  }

  try {
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "X-Return-Format": "markdown",
      "X-Remove-Images": "true",
    };
    if (jinaApiKey) headers["Authorization"] = `Bearer ${jinaApiKey}`;

    console.log(`[SCRAPE-JOB] Jina REQ: ${url} (jina quota: ${rl.remaining}/${rl.total})`);
    let res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers });
    console.log(`[SCRAPE-JOB] Jina HTTP ${res.status} ${res.statusText} for ${url}`);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "5", 10);
      console.warn(`[SCRAPE-JOB] Jina 429, retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers });
      console.log(`[SCRAPE-JOB] Jina retry HTTP ${res.status} ${res.statusText} for ${url}`);
    }

    if (!res.ok) {
      console.error(`[SCRAPE-JOB] Jina FAIL status=${res.status} for ${url}`);
      return null;
    }

    recordApiCall("jina");

    const json = await res.json();
    if (json.code !== 200 || !json.data?.content) {
      console.warn(`[SCRAPE-JOB] Jina OK but bad code=${json.code} or no content for ${url}`);
      return null;
    }

    const content: string = json.data.content.trim();
    console.log(`[SCRAPE-JOB] Content length: ${content.length} for ${url}`);
    if (content.length < 300) {
      console.warn(`[SCRAPE-JOB] Rejected too short (${content.length} chars): ${url}`);
      return null;
    }

    const domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    // Find first heading that isn't a sidebar pattern
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

    console.log(`[SCRAPE-JOB] OK title="${title.slice(0, 60)}" company="${company || "Unknown"}" desc_len=${content.slice(0, 3000).length}`);
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
    };
  } catch (err) {
    console.error(`[SCRAPE-JOB] EXCEPTION for ${url}:`, err);
    return null;
  }
}


// ─── Source 7: Job Search via Fallback Chain ────────────────────────────────
// Reader chain (URL → markdown): Jina → Bright Data → Apify
// Then Scrappa (Google Jobs API) as last resort

const JINA_READER_BASE = "https://r.jina.ai";

// ─── Jina Reader: Google Jobs via ibp=htl;jobs ────────────────────────────
// Uses Jina Reader to scrape Google's Jobs tab directly.
// Same token pool as Bing scraping — both fail when tokens are exhausted.

export async function searchJinaBingJobs(params: SerpParams): Promise<SerpJob[]> {
  const rl = checkApiLimit("bing-jina");
  if (!rl.allowed) {
    console.warn(`[SRC8-JINA-BING] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining`);
    return [];
  }

  const query = cleanQueryForSearch([params.q, params.location, "South Africa"].filter(Boolean).join(" "), params.location);
  const location = params.location || "South Africa";

  recordApiCall("bing-jina");
  return tryBrightDataWebJobs(query, location);
}



export async function searchWebJobs(params: SerpParams): Promise<SerpJob[]> {
  const query = cleanQueryForSearch([params.q, params.location, "South Africa"].filter(Boolean).join(" "), params.location);

  console.log(`[SRC7-SEARCH] Searching Google Jobs via Scrappa: "${query}"`);

  const scrappaResult = await tryScrappaJobs(query, params.location || "South Africa");
  console.log(`[SRC7-SEARCH] Scrappa returned ${scrappaResult.length} jobs`);
  return scrappaResult;
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

  const jinaFetchUrl = `${JINA_READER_BASE}/${encodeURIComponent(bingUrl.toString())}`;
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

// ─── Bright Data Browser API — click-to-expand Bing Jobs for full specs ──

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

async function tryBrightDataWebJobs(query: string, location: string): Promise<SerpJob[]> {
  const wsEndpoint = process.env.BRIGHTDATA_API;
  if (!wsEndpoint || !wsEndpoint.startsWith("wss://")) {
    console.warn(`[BRIGHTDATA] SKIP — BRIGHTDATA_API is not a valid WebSocket URL`);
    return [];
  }

  const rl = checkApiLimit("brightdata");
  if (!rl.allowed) {
    console.warn(`[BRIGHTDATA] RATE LIMITED — ${rl.label}, ${rl.remaining}/${rl.total} remaining`);
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

  console.log(`[BRIGHTDATA] Click-to-expand Bing Jobs: ${bingUrl.toString()}`);

  let browser;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
    const page = await browser.newPage();

    await page.goto(bingUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".jb_l2_cardlist", { timeout: 15000 });
    await page.waitForSelector(".jb_jlc", { timeout: 15000 });

    const cardCount = await page.evaluate(() => document.querySelectorAll(".jb_jlc").length);
    console.log(`[BRIGHTDATA] Found ${cardCount} job cards`);

    if (cardCount === 0) {
      console.warn(`[BRIGHTDATA] No job cards found`);
      return [];
    }

    const jobs: SerpJob[] = [];
    const maxCards = Math.min(cardCount, 20);

    for (let i = 0; i < maxCards; i++) {
      try {
        await page.evaluate((idx) => {
          const cards = document.querySelectorAll(".jb_jlc");
          if (cards[idx]) (cards[idx] as HTMLElement).click();
        }, i);

        await new Promise(r => setTimeout(r, 1500));

        const job = await page.evaluate(() => {
          const title = document.querySelector(".jb_title")?.textContent?.trim() ?? "";

          // coLoc: try child elements first, fall back to innerText split
          let company = "";
          let loc = "";
          const coLocEl = document.querySelector(".jbpnl_coLoc");
          if (coLocEl) {
            const coNameEl = coLocEl.querySelector(".jbpnl_coName, .jb_coName, [class*='coName']");
            const locEl = coLocEl.querySelector(".jbpnl_loc, .jb_loc, [class*='loc']");
            if (coNameEl && locEl) {
              company = coNameEl.textContent?.trim() ?? "";
              loc = locEl.textContent?.trim() ?? "";
            } else {
              const text = (coLocEl as HTMLElement).innerText?.trim() ?? "";
              const lines = text.split("\n").map((s: string) => s.trim()).filter(Boolean);
              company = lines[0] || "";
              loc = lines[1] || "";
            }
          }

          const description = (document.querySelector(".jbpnl_description") as HTMLElement | null)?.innerText?.trim() ?? "";

          // Apply link: try multiple selectors, decode Bing redirects
          let applyLink = "";
          const selectors = [".jb_slimApply a", ".jb_applyBtnContainer a", "a[href*='bing.com/ck/a']", ".jb_l2_jbpnl a[href]"];
          for (const sel of selectors) {
            const el = document.querySelector(sel) as HTMLAnchorElement | null;
            if (el?.href && !el.href.includes("javascript:")) {
              applyLink = el.href;
              break;
            }
          }

          return { title, company, location: loc, description, applyLink };
        });

        if (job.title && job.description.length > 50) {
          const decodedLink = decodeBingRedirect(job.applyLink);
          jobs.push({
            title: job.title,
            company_name: job.company || "Unknown",
            location: job.location || location,
            description: job.description.slice(0, 3000),
            link: decodedLink,
            via: "bing",
            hasFullSpec: job.description.length > 300,
            spec_source: "bing_jobs" as const,
          });
          console.log(`[BRIGHTDATA] Card ${i + 1}: "${job.title}" at "${job.company}" — ${job.description.length} chars, link=${decodedLink ? "yes" : "no"}`);
        }
      } catch (cardErr) {
        console.warn(`[BRIGHTDATA] Card ${i} failed: ${cardErr instanceof Error ? cardErr.message.slice(0, 100) : String(cardErr).slice(0, 100)}`);
      }
    }

    recordApiCall("brightdata");
    console.log(`[BRIGHTDATA] SUCCESS — ${jobs.length} jobs with full specs`);
    const first = jobs[0];
    if (first) {
      console.log(`[BRIGHTDATA] First: "${first.title}" at "${first.company_name}" — desc=${first.description?.length ?? 0} chars`);
    }
    return jobs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BRIGHTDATA] EXCEPTION: ${msg.slice(0, 200)}`);
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

function parseBingJobsMarkdown(content: string, defaultLocation?: string, pageLinks?: { text: string; href: string }[]): SerpJob[] {
  const jobs: SerpJob[] = [];
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

  // Pre-filter links: skip Bing internal navigation, keep only external job board URLs
  const filteredLinks = (pageLinks ?? []).filter((l) => {
    const href = l.href.toLowerCase();
    if (href.includes("bing.com/search") || href.includes("bing.com/jobs/redirect") || href.includes("go.microsoft.com")) return false;
    if (href.includes("google.com/search") || href.includes("google.com/url")) return false;
    if (href.includes("javascript:") || href.startsWith("mailto:")) return false;
    // Keep links that point to actual job boards
    try {
      const host = new URL(l.href).hostname.replace(/^www\./, "").toLowerCase();
      const isJobBoard = /linkedin\.com|indeed\.com|careerjunction|jobmail|pnet\.co\.za|glassdoor|ziprecruiter|simplyhired|monster\.com|reed\.co\.uk|totaljobs|jobs\.co|bright|adzuna|jooble|careerjet|jobrapido|glassdoor/.test(host);
      return isJobBoard || l.href.includes("/job") || l.href.includes("/viewjob") || l.href.includes("/jobs/view/");
    } catch {
      return false;
    }
  });
  if (filteredLinks.length > 0) {
    console.log(`[BING-PARSER] ${filteredLinks.length} external job board links found`);
  }

  // Match a job title to the best link by text similarity
  function findBestLink(title: string, company: string): string {
    if (filteredLinks.length === 0) return "";
    const titleLower = title.toLowerCase();
    const companyLower = company.toLowerCase();
    let bestHref = "";
    let bestScore = 0;
    for (const link of filteredLinks) {
      const textLower = link.text.toLowerCase();
      // Exact title match in link text
      if (textLower.includes(titleLower) && titleLower.length > 5) {
        return link.href;
      }
      // Title words match
      const titleWords = titleLower.split(/\s+/).filter((w) => w.length > 3);
      const matchCount = titleWords.filter((w) => textLower.includes(w)).length;
      const score = titleWords.length > 0 ? matchCount / titleWords.length : 0;
      // Boost if company name also matches
      const companyBoost = companyLower.length > 2 && textLower.includes(companyLower) ? 0.2 : 0;
      const totalScore = score + companyBoost;
      if (totalScore > bestScore && totalScore >= 0.3) {
        bestScore = totalScore;
        bestHref = link.href;
      }
    }
    return bestHref;
  }

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
          link: findBestLink(currentTitle, currentCompany) || extractBestJobUrl(currentDescription),
          via: currentVia || "bing",
          hasFullSpec: currentDescription.length > 300,
          spec_source: "bing_jobs" as const,
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
      link: findBestLink(currentTitle, currentCompany) || extractBestJobUrl(currentDescription),
      via: currentVia || "bing_jobs",
      hasFullSpec: currentDescription.length > 300,
      spec_source: "bing_jobs" as const,
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
 * Extract the best individual job URL from a block of text.
 * Prioritizes known job board URLs (LinkedIn /jobs/view/, Indeed /viewjob, etc.)
 * over generic search results or aggregator links.
 */
function extractBestJobUrl(text: string): string {
  const urlRegex = /https?:\/\/[^\s)>\]"]+/g;
  const allUrls: string[] = [...(text.match(urlRegex) ?? [])];

  // Priority 1: Direct job listing pages (LinkedIn /jobs/view/, Indeed /viewjob, etc.)
  const directJobPatterns = [
    /linkedin\.com\/jobs\/view\/\d+/i,
    /indeed\.com\/viewjob\?/i,
    /za\.indeed\.com\/viewjob\?/i,
    /careerjunction\.co\.za\/job-\d+/i,
    /jobmail\.co\.za\/.*-id-\d+/i,
    /pnet\.co\.za\/.*--[\w-]+--\d+/i,
    /glassdoor\.com\/job-listing/i,
  ];

  for (const url of allUrls) {
    for (const pattern of directJobPatterns) {
      if (pattern.test(url)) {
        return url.split(/[)\s]/)[0]; // Clean trailing chars
      }
    }
  }

  // Priority 2: Known job board domain links (not aggregators)
  const goodDomains = ['linkedin.com', 'indeed.com', 'za.indeed.com', 'careerjunction.co.za', 'jobmail.co.za', 'pnet.co.za', 'glassdoor.com'];
  for (const url of allUrls) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      if (goodDomains.some(d => host === d || host.endsWith(`.${d}`))) {
        return url.split(/[)\s]/)[0];
      }
    } catch {}
  }

  // Priority 3: Any URL that looks like an individual job page (not a search/listing page)
  for (const url of allUrls) {
    const lower = url.toLowerCase();
    // Skip obvious non-job URLs
    if (lower.includes('/jobs/search') || lower.includes('/jobs?') || lower.includes('?q=') && lower.includes('/jobs')) continue;
    if (lower.includes('google.com/search') || lower.includes('bing.com/search')) continue;
    if (lower.includes('jobrapido') || lower.includes('careerjet') || lower.includes('neuvoo') || lower.includes('jooble')) continue;
    // Accept anything that looks like a specific page (has a numeric ID or unique path)
    if (/\/\d{5,}/.test(url) || /\/[a-z0-9-]{10,}\/?$/i.test(url)) {
      return url.split(/[)\s]/)[0];
    }
  }

  return '';
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
export function isCategoryPage(title: string, url: string): boolean {
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

// ─── Individual Page Scrapers (for spec fetch loop) ─────────────────────────

export async function scrapePageBrightData(url: string): Promise<string> {
  const wsEndpoint = process.env.BRIGHTDATA_API;
  if (!wsEndpoint || !wsEndpoint.startsWith("wss://")) return "";

  const rl = checkApiLimit("brightdata");
  if (!rl.allowed) return "";

  let browser;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const content = await page.evaluate(() => document.body.innerText);
    if (!content || content.length < 100) return "";

    recordApiCall("brightdata");
    console.log(`[SCRAPE-BRIGHTDATA] OK ${content.length} chars from ${url.slice(0, 80)}`);
    return content.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[SCRAPE-BRIGHTDATA] FAIL ${msg.slice(0, 100)} from ${url.slice(0, 80)}`);
    return "";
  } finally {
    if (browser) try { await browser.close(); } catch {}
  }
}

export async function scrapePageApify(url: string): Promise<string> {
  const apiKey = process.env.APIFY_API;
  if (!apiKey) return "";

  const rl = checkApiLimit("apify");
  if (!rl.allowed) return "";

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~url-to-markdown/run-sync-get-dataset-items?token=${apiKey}&timeout=30`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }
    );

    if (!res.ok) return "";

    const data = await res.json();
    const items = Array.isArray(data) ? data : [data];
    const content = items[0]?.markdown ?? items[0]?.content ?? "";
    if (!content || content.length < 100) return "";

    recordApiCall("apify");
    console.log(`[SCRAPE-APIFY] OK ${content.length} chars from ${url.slice(0, 80)}`);
    return content.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[SCRAPE-APIFY] FAIL ${msg.slice(0, 100)} from ${url.slice(0, 80)}`);
    return "";
  }
}
