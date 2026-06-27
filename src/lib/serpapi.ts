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
