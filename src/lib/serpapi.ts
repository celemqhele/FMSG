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
  console.log("[SERPAPI] GET", safeUrl);

  const res = await fetch(fullUrl);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SerpAPI search error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.jobs_results ?? [];
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
  if (!apiKey) return [];

  const query = [params.q, params.location, "South Africa"].filter(Boolean).join(" ");
  const url = new URL("https://jsearch.p.rapidapi.com/search-v2");
  url.searchParams.set("query", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("country", "za");

  console.log("[JSEARCH] GET https://jsearch.p.rapidapi.com/search-v2");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[JSEARCH] Error ${res.status}: ${err.slice(0, 200)}`);
      return [];
    }

    const data = await res.json();
    const jobs = data.data?.jobs ?? data.data ?? [];

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
    console.warn(`[JSEARCH] Failed: ${err}`);
    return [];
  }
}

// ─── Source 3: Adzuna API ───────────────────────────────────────────────────

export async function searchAdzuna(params: SerpParams): Promise<SerpJob[]> {
  const appId = process.env.Adzuna_APP_ID;
  const appKey = process.env.Adzuna_API;
  if (!appId || !appKey) return [];

  const what = params.q || "";
  const where = params.location || "South Africa";

  const url = new URL("https://api.adzuna.com/v1/api/jobs/za/search/1");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("what", what);
  url.searchParams.set("where", where);
  url.searchParams.set("results_per_page", "20");
  url.searchParams.set("content-type", "application/json");

  console.log("[ADZUNA] GET https://api.adzuna.com/v1/api/jobs/za/search/1");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const err = await res.text();
      console.warn(`[ADZUNA] Error ${res.status}: ${err.slice(0, 200)}`);
      return [];
    }

    const data = await res.json();
    const jobs = data.results ?? [];

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
    console.warn(`[ADZUNA] Failed: ${err}`);
    return [];
  }
}

// ─── Source 4: LinkedIn Public Guest API ────────────────────────────────────
// LinkedIn geoId for South Africa
const LINKEDIN_SA_GEOID = "105365746";

export async function searchLinkedInJobs(params: SerpParams): Promise<SerpJob[]> {
  const query = params.q;
  if (!query) return [];

  const url = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
  url.searchParams.set("keywords", query);
  url.searchParams.set("location", "South Africa");
  url.searchParams.set("geoId", LINKEDIN_SA_GEOID);
  url.searchParams.set("f_TPR", "r604800"); // past week
  url.searchParams.set("start", "0");

  console.log("[LINKEDIN] GET linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      console.warn(`[LINKEDIN] Error ${res.status}`);
      return [];
    }

    const html = await res.text();

    // Parse individual job cards from the HTML
    const jobCards = html.match(/<li[\s\S]*?<\/li>/g) ?? [];
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

    return jobs;
  } catch (err) {
    console.warn(`[LINKEDIN] Failed: ${err}`);
    return [];
  }
}

// ─── Source 5: Google Search + Jina (two-step crawl) ───────────────────────
// Step 1: Google Search returns listing page URLs
// Step 2: Jina reads listing page → extract individual job URLs
// Step 3: Jina reads each individual URL → full spec

const JINA_SCRAPEABLE_DOMAINS = [
  { domain: "careerjunction.co.za", jobPattern: /job-\d+\.aspx/i, listingPatterns: [/\/jobs\/[a-z0-9-]+$/i, /\/jobs\/[a-z0-9-]+\/[a-z0-9-]+$/i] },
  { domain: "jobmail.co.za", jobPattern: /-id-\d+$/i, listingPatterns: [/\/jobs\/?$/i, /\/jobs\/[a-z0-9-]+\/?$/i] },
  { domain: "pnet.co.za", jobPattern: /--[\w-]+--\d+-inline\.html/i, listingPatterns: [/\/jobs\/[a-z0-9-]+$/i, /\/jobs\/[a-z0-9-]+\?/i] },
  { domain: "za.indeed.com", jobPattern: /\/viewjob\?jk=/i, listingPatterns: [/\/jobs\?/i] },
  { domain: "linkedin.com", jobPattern: /\/jobs\/view\/\d+/i, listingPatterns: [/\/jobs\/search\//i] },
];

export function isListingPage(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const domain = JINA_SCRAPEABLE_DOMAINS.find(d => host === d.domain || host.endsWith(`.${d.domain}`));
    if (!domain) return false;
    return domain.listingPatterns.some(p => p.test(u.pathname + u.search));
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

  for (const { domain } of JINA_SCRAPEABLE_DOMAINS) {
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
    console.log("[SERPAPI GOOGLE] GET", safeUrl);

    try {
      const res = await fetch(fullUrl);
      if (!res.ok) {
        console.warn(`[SERPAPI GOOGLE] site:${domain} failed (${res.status})`);
        continue;
      }
      const data = await res.json();
      const organic = data.organic_results ?? [];
      for (const r of organic) {
        if (!r.link) continue;
        try {
          const resultDomain = new URL(r.link).hostname.replace(/^www\./, "").toLowerCase();
          if (resultDomain === domain || resultDomain.endsWith(`.${domain}`)) {
            allResults.push({
              title: r.title || "",
              link: r.link,
              snippet: r.snippet || "",
              domain: resultDomain,
            });
          }
        } catch {}
      }
    } catch (err) {
      console.warn(`[SERPAPI GOOGLE] site:${domain} error:`, err);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  return allResults;
}

export async function extractJobUrlsFromListingPage(
  listingUrl: string,
  jinaApiKey: string | null
): Promise<string[]> {
  try {
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "X-Return-Format": "markdown",
      "X-Remove-Images": "true",
    };
    if (jinaApiKey) headers["Authorization"] = `Bearer ${jinaApiKey}`;

    const res = await fetch(`https://r.jina.ai/${encodeURIComponent(listingUrl)}`, { headers });
    if (!res.ok) {
      console.warn(`[EXTRACT] Jina failed for listing page: ${res.status}`);
      return [];
    }

    const json = await res.json();
    if (json.code !== 200 || !json.data?.content) return [];

    const content: string = json.data.content;
    const baseHost = new URL(listingUrl).hostname.replace(/^www\./, "").toLowerCase();
    const domain = JINA_SCRAPEABLE_DOMAINS.find(d => baseHost === d.domain || baseHost.endsWith(`.${d.domain}`));
    if (!domain) return [];

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

    console.log(`[EXTRACT] Found ${jobUrls.length} individual job URLs from ${listingUrl}`);
    return jobUrls.slice(0, 8);
  } catch (err) {
    console.warn(`[EXTRACT] Failed: ${err}`);
    return [];
  }
}

export async function scrapeJobPage(
  url: string,
  jinaApiKey: string | null
): Promise<SerpJob | null> {
  try {
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "X-Return-Format": "markdown",
      "X-Remove-Images": "true",
    };
    if (jinaApiKey) headers["Authorization"] = `Bearer ${jinaApiKey}`;

    const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers });
    if (!res.ok) {
      if (jinaApiKey && (res.status === 429 || res.status === 403)) {
        try {
          const err = await res.json();
          if (err.code?.startsWith("RATE_") || err.code?.startsWith("AUTHZ_")) return null;
        } catch {}
      }
      return null;
    }

    const json = await res.json();
    if (json.code !== 200 || !json.data?.content) return null;

    const content: string = json.data.content.trim();
    if (content.length < 300) return null;

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
      console.log(`[SCRAPE] Rejected listing/cookie page: ${url}`);
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
  } catch {
    return null;
  }
}
