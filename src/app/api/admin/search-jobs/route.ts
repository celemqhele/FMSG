import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs, searchLinkedInJobs, searchJSearch, scrapeJobPage, extractJobUrlsFromListingPage } from "@/lib/serpapi";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
const JINA_KEY = process.env.JINA_API || null;

const ADMIN_SEARCH_DOMAINS = ["pnet.co.za", "linkedin.com", "za.indeed.com", "careerjunction.co.za"];

async function verifyAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) return false;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user } } = await supabase.auth.getUser(authHeader);
  if (!user || user.email !== ADMIN_EMAIL) return false;
  return true;
}

interface AdminSearchResult {
  title: string;
  company_name: string;
  location: string;
  description: string;
  link: string;
  source: string;
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const query = body.query;
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const searchQuery = `${query} Gauteng`;

  const [googleJobs, linkedinJobs, jsearchJobs] = await Promise.all([
    searchGoogleJobs({ q: searchQuery, gl: "za", hl: "en" }).catch(() => []),
    searchLinkedInJobs({ q: query }).catch(() => []),
    searchJSearch({ q: searchQuery, gl: "za" }).catch(() => []),
  ]);

  const seen = new Set<string>();
  const results: AdminSearchResult[] = [];

  function addResult(r: AdminSearchResult) {
    const key = `${r.title.toLowerCase()}|${r.company_name.toLowerCase()}`;
    if (!seen.has(key) && results.length < 20) {
      seen.add(key);
      results.push(r);
    }
  }

  for (const j of googleJobs) {
    addResult({
      title: j.title,
      company_name: j.company_name,
      location: j.location,
      description: j.description || "",
      link: j.link || "",
      source: "google_jobs",
    });
  }

  for (const j of linkedinJobs) {
    addResult({
      title: j.title,
      company_name: j.company_name,
      location: j.location,
      description: j.description || "",
      link: j.link || "",
      source: "linkedin",
    });
  }

  for (const j of jsearchJobs) {
    addResult({
      title: j.title,
      company_name: j.company_name,
      location: j.location,
      description: j.description || "",
      link: j.link || "",
      source: "jsearch",
    });
  }

  return NextResponse.json({ results: results.slice(0, 10) });
}
