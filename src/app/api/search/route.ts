import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs } from "@/lib/serpapi";
import { extractTextFromPDF } from "@/lib/pdf";
import { scoreJobMatch, isJobValid, extractSalary } from "@/lib/scorer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
const JINA_API_KEY = process.env.JINA_API_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

interface JobRow {
  user_id: string;
  search_id: string;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  match_summary: string;
  job_url: string;
  full_spec: string;
  search_query: string;
}

function normalize(r: any) {
  return { ...r, full_description: r.full_spec ?? "" };
}

function buildJobUrl(job: {
  apply_options?: { link: string; title: string }[];
  job_highlights?: { link?: string };
  link?: string;
  title: string;
  company_name: string;
}): string {
  if (job.apply_options?.[0]?.link) return job.apply_options[0].link;
  if (job.job_highlights?.link) return job.job_highlights.link;
  if (job.link) return job.link;
  return `https://www.google.com/search?q=${encodeURIComponent(`${job.title} ${job.company_name} apply`)}`;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const searchId = crypto.randomUUID();

  try {
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { query } = await request.json();
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "SEARCH_001" }, { status: 400 });
    }

    console.log("[SEARCH] Query:", query);

    const isAdmin = ADMIN_EMAIL && user.email === ADMIN_EMAIL;

    // Get profile
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "DB_001" }, { status: 404 });
    }

    console.log("[SEARCH] Profile:", JSON.stringify({
      job_titles: profile.job_titles,
      job_types: profile.job_types,
      location: profile.location,
      cv_file_path: profile.cv_file_path,
      search_balance: profile.search_balance,
    }));

    // Balance
    if (!isAdmin) {
      const balance = profile.search_balance ?? 0;
      if (balance <= 0) {
        return NextResponse.json({ code: "LIMIT_001" }, { status: 403 });
      }
    }

    if (!isAdmin) {
      try {
        await supabase
          .from("profiles")
          .update({ search_balance: (profile.search_balance ?? 10) - 1 })
          .eq("id", user.id);
      } catch {
        // Best effort
      }
    }

    // Banned lists
    const bannedJobs: string[] = [];
    const bannedCompanies: string[] = [];
    if (profile.banned_jobs) bannedJobs.push(...profile.banned_jobs);
    if (profile.banned_companies) bannedCompanies.push(...profile.banned_companies);

    // SerpAPI search
    const titles = profile.job_titles ?? [];
    const profileLocation = profile.location ?? "";

    function buildSerpParams(title: string) {
      return {
        q: `${title} ${profileLocation}`.trim(),
        location: profileLocation,
        hl: "en" as const,
        gl: "za" as const,
      };
    }

    const serpParams = titles.length > 0
      ? buildSerpParams(titles[0])
      : { q: query || "jobs", hl: "en" as const, gl: "za" as const };

    let rawJobs: Awaited<ReturnType<typeof searchGoogleJobs>>;
    let activeSerpParams = serpParams;
    try {
      rawJobs = await searchGoogleJobs(serpParams);
      if (rawJobs.length === 0 && titles.length > 1) {
        console.log("[SEARCH] Retry with second title:", titles[1]);
        activeSerpParams = buildSerpParams(titles[1]);
        rawJobs = await searchGoogleJobs(activeSerpParams);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("[SEARCH] SerpAPI error:", msg);
      return NextResponse.json({ results: [] });
    }

    console.log("[SEARCH] SerpAPI results:", rawJobs.length);

    if (rawJobs.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Filter banned
    const candidates = rawJobs.filter((j) => {
      if (j.link && bannedJobs.includes(j.link)) return false;
      if (bannedCompanies.includes(j.company_name)) return false;
      return true;
    });

    console.log("[SEARCH] After banned filter:", candidates.length);
    for (let i = 0; i < Math.min(2, candidates.length); i++) {
      console.log(`[SEARCH] Job ${i} apply_options:`, JSON.stringify(candidates[i].apply_options));
    }

    if (candidates.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Load CV text
    let cvText = "";
    if (profile.cv_file_path) {
      try {
        const { data: fileData } = await supabase
          .storage
          .from("cv-files")
          .download(profile.cv_file_path);

        if (fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          cvText = await extractTextFromPDF(buffer);
        }
      } catch {
        // CV unavailable
      }
    }

    console.log("[SEARCH] CV text length:", cvText.length);

    // Score each job
    const outputs: JobRow[] = [];

    for (const job of candidates) {
      const jobUrl = buildJobUrl(job);
      let specText = job.description ?? "";

      // Fetch full page via Jina AI reader
      if (jobUrl) {
        try {
          const headers: Record<string, string> = {};
          if (JINA_API_KEY) headers["Authorization"] = `Bearer ${JINA_API_KEY}`;
          const jinaRes = await fetch(`https://r.jina.ai/${encodeURIComponent(jobUrl)}`, { headers });
          if (jinaRes.ok) {
            specText = await jinaRes.text();
            console.log(`[SEARCH] Jina fetched ${specText.length} chars for "${job.title}"`);
          }
        } catch {
          console.log(`[SEARCH] Jina fetch failed for "${job.title}"`);
        }
      }

      specText = specText || job.description || "";

      // Validate
      if (!isJobValid(specText, job.link)) {
        console.log(`[SEARCH] Invalid job: "${job.title}" at ${job.company_name}`);
        continue;
      }

      // Score
      const result = scoreJobMatch(cvText, job.description ?? "", specText, {
        job_titles: profile.job_titles ?? [],
        location: profile.location ?? "",
      });

      if (result.score < 40) {
        console.log(`[SEARCH] Score ${result.score} < 40 for "${job.title}"`);
        continue;
      }

      outputs.push({
        user_id: user.id,
        search_id: searchId,
        job_title: job.title,
        company: job.company_name,
        location: job.location,
        estimated_salary: result.estimated_salary,
        match_score: result.score,
        match_summary: result.match_summary,
        job_url: jobUrl,
        full_spec: specText,
        search_query: query,
      });
    }

    // Sort by score descending
    outputs.sort((a, b) => b.match_score - a.match_score);

    console.log("[SEARCH] Final results:", outputs.length);

    // Save to job_results
    if (outputs.length > 0) {
      const rows = outputs.map((r) => ({
        user_id: r.user_id,
        search_id: r.search_id,
        job_title: r.job_title,
        company: r.company,
        location: r.location,
        estimated_salary: r.estimated_salary,
        match_score: r.match_score,
        match_summary: r.match_summary,
        job_url: r.job_url,
        full_spec: r.full_spec,
        search_query: r.search_query,
      }));

      const { data: saved, error: saveErr } = await supabase
        .from("job_results")
        .insert(rows)
        .select("id, job_title, company, location, estimated_salary, match_score, match_summary, job_url, full_spec");

      if (saveErr) {
        console.log("[SEARCH] DB save error:", saveErr.message);
        return NextResponse.json({ results: outputs.map(normalize) });
      }

      return NextResponse.json({ results: (saved ?? outputs).map(normalize) });
    }

    return NextResponse.json({ results: [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("[SEARCH] Unhandled error:", msg);
    return NextResponse.json({ results: [] });
  }
}
