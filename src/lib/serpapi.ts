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
  apply_options?: ApplyOption[];
  job_highlights?: { link?: string };
}

interface SerpParams {
  q: string;
  location?: string;
  hl?: string;
  gl?: string;
}

export async function searchGoogleJobs(params: SerpParams): Promise<SerpJob[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_jobs");
  url.searchParams.set("q", params.q);
  url.searchParams.set("api_key", SERPAPI_KEY!);
  if (params.location) url.searchParams.set("location", params.location);
  if (params.hl) url.searchParams.set("hl", params.hl);
  if (params.gl) url.searchParams.set("gl", params.gl);

  const fullUrl = url.toString();
  console.log("[SERPAPI] GET", fullUrl);

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
  console.log("[SERPAPI] GET", fullUrl);

  const res = await fetch(fullUrl);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SerpAPI detail error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data;
}
