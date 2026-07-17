import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs, searchLinkedInJobs, searchJSearch } from "@/lib/serpapi";
import { callAIWithFallback } from "@/lib/gemini";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

async function verifyAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) return false;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user } } = await supabase.auth.getUser(authHeader);
  if (!user || user.email !== ADMIN_EMAIL) return false;
  return true;
}

const HIGH_DEMAND_QUERIES = [
  "general worker",
  "retail sales assistant",
  "warehouse assistant",
  "receptionist",
  "admin clerk",
  "data entry assistant",
  "software developer",
  "accountant",
  "financial advisor",
  "civil engineer",
  "electrician",
];

interface AdminSearchResult {
  title: string;
  company_name: string;
  location: string;
  description: string;
  link: string;
  source: string;
}

const SELECTION_PROMPT = `You are a job market analyst for South Africa.

Given this list of job postings, select the TOP 5 that are most likely to attract high application volumes (200-400+ applications).

Base your selection on:
- Roles that are in high demand across industries (not niche/specialist)
- Well-known companies (people apply to known brands more)
- Entry-to-mid level positions (not senior/lead/director — those get fewer apps)
- Generalist titles over highly specialized ones
- Remote or hybrid roles tend to get more applications
- Roles requiring common skills (not rare certifications)

Return ONLY a JSON array of exactly 5 indices (0-based) from the input list, ordered by expected application volume (highest first).
Example: [2, 0, 4, 1, 3]

Return ONLY the JSON array, nothing else.`;

export async function POST(request: NextRequest) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const queries = HIGH_DEMAND_QUERIES.slice(0, 6);

  const allJobs: AdminSearchResult[] = [];
  const seen = new Set<string>();

  const searchBatch = async (q: string) => {
    const searchQ = `${q} Gauteng`;
    const [google, linkedin, jsearch] = await Promise.all([
      searchGoogleJobs({ q: searchQ, gl: "za", hl: "en" }).catch(() => []),
      searchLinkedInJobs({ q }).catch(() => []),
      searchJSearch({ q: searchQ, gl: "za" }).catch(() => []),
    ]);

    const addResult = (r: AdminSearchResult) => {
      const key = `${r.title.toLowerCase()}|${r.company_name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        allJobs.push(r);
      }
    };

    for (const j of google) {
      addResult({ title: j.title, company_name: j.company_name, location: j.location, description: j.description || "", link: j.link || "", source: "google_jobs" });
    }
    for (const j of linkedin) {
      addResult({ title: j.title, company_name: j.company_name, location: j.location, description: j.description || "", link: j.link || "", source: "linkedin" });
    }
    for (const j of jsearch) {
      addResult({ title: j.title, company_name: j.company_name, location: j.location, description: j.description || "", link: j.link || "", source: "jsearch" });
    }
  };

  await Promise.all(queries.map((q) => searchBatch(q).catch(() => {})));

  if (allJobs.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const jobList = allJobs
    .slice(0, 30)
    .map((j, i) => `[${i}] "${j.title}" at ${j.company_name} — ${j.location || "Gauteng"} (${j.source})`)
    .join("\n");

  try {
    const aiResult = await callAIWithFallback(SELECTION_PROMPT, jobList, "admin-select-top5", { temperature: 0.2, maxOutputTokens: 256 });

    const jsonMatch = aiResult.match(/\[[\d\s,]+\]/);
    if (!jsonMatch) {
      return NextResponse.json({ results: allJobs.slice(0, 5) });
    }

    const indices: number[] = JSON.parse(jsonMatch[0]);
    const selected = indices
      .filter((i) => i >= 0 && i < allJobs.length)
      .slice(0, 5)
      .map((i) => allJobs[i]);

    return NextResponse.json({ results: selected.length > 0 ? selected : allJobs.slice(0, 5) });
  } catch {
    return NextResponse.json({ results: allJobs.slice(0, 5) });
  }
}
