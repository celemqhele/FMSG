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
  spec_source?: "google_jobs" | "google_search";
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

// ─── Source B: Google Search + Jina Reader for SA job boards ──────────────

const SCRAPEABLE_DOMAINS = [
  "pnet.co.za",
  "careerjunction.co.za",
  "jobmail.co.za",
  "careers24.com",
  "indeed.co.za",
  "indeed.com",
  "jobvine.co.za",
  "recruitmymom.co.za",
  "executiveplacements.com",
  "smartprocurement.co.za",
];

const SKIP_DOMAINS = [
  "linkedin.com",
  "glassdoor.com",
  "facebook.com",
  "instagram.com",
];

export function isJobPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    if (SKIP_DOMAINS.some((d) => host.endsWith(d))) return false;

    if (!SCRAPEABLE_DOMAINS.some((d) => host.endsWith(d))) return false;

    const path = u.pathname.toLowerCase();
    if (path === "/" || path === "/jobs" || path === "/jobs/") return false;
    if (path.includes("/search") || path.includes("/results")) return false;
    if (u.searchParams.has("q") && !path.includes("/view")) return false;

    return true;
  } catch {
    return false;
  }
}

export async function searchGooglePages(params: SerpParams): Promise<{ title: string; link: string; snippet: string; domain: string }[]> {
  const siteQueries = SCRAPEABLE_DOMAINS.map((d) => `site:${d}`);

  const batchSize = 3;
  const allResults: { title: string; link: string; snippet: string; domain: string }[] = [];

  for (let i = 0; i < siteQueries.length; i += batchSize) {
    const batch = siteQueries.slice(i, i + batchSize);
    const siteQuery = batch.join(" OR ");
    const query = `${params.q} (${siteQuery})`;

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
        console.warn(`[SERPAPI GOOGLE] Batch ${i / batchSize + 1} failed (${res.status})`);
        continue;
      }
      const data = await res.json();
      const organic = data.organic_results ?? [];
      for (const r of organic) {
        if (!r.link) continue;
        try {
          const domain = new URL(r.link).hostname.replace(/^www\./, "").toLowerCase();
          allResults.push({
            title: r.title || "",
            link: r.link,
            snippet: r.snippet || "",
            domain,
          });
        } catch {}
      }
    } catch (err) {
      console.warn(`[SERPAPI GOOGLE] Batch ${i / batchSize + 1} error:`, err);
    }

    if (i + batchSize < siteQueries.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return allResults;
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
