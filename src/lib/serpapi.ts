const SERPAPI_KEY = process.env.SERPAPI_API_KEY;

export interface SerpJob {
  title: string;
  company_name: string;
  location: string;
  description?: string;
  link?: string;
  via?: string;
  job_id?: string;
}

export async function searchGoogleJobs(query: string): Promise<SerpJob[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_jobs");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", SERPAPI_KEY!);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SerpAPI search error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.jobs_results ?? [];
}

export async function fetchJobDetails(jobId: string, query: string): Promise<{ description?: string }> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_jobs");
  url.searchParams.set("q", query);
  url.searchParams.set("job_id", jobId);
  url.searchParams.set("api_key", SERPAPI_KEY!);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SerpAPI detail error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data;
}
