import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callGemini } from "@/lib/gemini";
import { searchGoogleJobs, fetchJobDetails } from "@/lib/serpapi";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

const QUALIFY_PROMPT = `You are a job matching assistant. Given a user's profile and a job snippet, determine if the job is a good fit. Return ONLY valid JSON: { "qualified": boolean }. Consider job title, company, location, and required skills. Be strict — only qualify if there's a clear match.`;

const SCORE_PROMPT = `You are a job matching assistant. Given a user's full CV and a complete job description, evaluate the match. Return ONLY valid JSON: { "match_score": number (0-100), "estimated_salary": string }. Be accurate and honest. Consider skills alignment, experience level, industry, and location.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { query } = await request.json();
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Search query required." }, { status: 400 });
    }

    const isAdmin = ADMIN_EMAIL && user.email === ADMIN_EMAIL;

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    // Balance check
    if (!isAdmin) {
      const balance = profile.search_balance ?? 0;
      if (balance <= 0) {
        return NextResponse.json({ error: "LIMIT_001", code: "LIMIT_001" }, { status: 403 });
      }
    }

    // Decrement balance
    if (!isAdmin) {
      await supabase
        .from("profiles")
        .update({ search_balance: (profile.search_balance ?? 10) - 1 })
        .eq("id", user.id);
    }

    // Step 1: SerpAPI search
    const serpQuery = [query, ...(profile.job_titles ?? [])].slice(0, 3).join(" ");
    const jobs = await searchGoogleJobs(serpQuery);

    if (jobs.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Step 2: Filter banned
    const bannedJobs = profile.banned_jobs ?? [];
    const bannedCompanies = profile.banned_companies ?? [];
    const filtered = jobs.filter((j) => {
      if (j.link && bannedJobs.includes(j.link)) return false;
      if (bannedCompanies.includes(j.company_name)) return false;
      return true;
    });

    // Step 3: Gemini first pass — qualify
    const profileSummary = JSON.stringify({
      job_titles: profile.job_titles,
      job_types: profile.job_types,
      location: profile.location,
      skills: profile.skills,
    });

    const qualified: typeof filtered = [];
    for (const job of filtered) {
      try {
        const snippet = job.description ?? `${job.title} at ${job.company_name} in ${job.location}`;
        const result = await callGemini(QUALIFY_PROMPT, `Profile: ${profileSummary}\n\nJob: ${snippet}`);
        const cleaned = result.slice(result.indexOf("{"), result.lastIndexOf("}") + 1);
        const parsed = JSON.parse(cleaned);
        if (parsed.qualified) {
          qualified.push(job);
        }
      } catch {
        // If qualification fails, include the job anyway
        qualified.push(job);
      }
    }

    // Step 4: Fetch full details + Gemini second pass
    interface JobResult {
      job_title: string;
      company: string;
      location: string;
      estimated_salary: string;
      match_score: number;
      job_url: string;
      snippet: string;
      full_description: string;
      search_query: string;
    }

    const results: JobResult[] = [];
    for (const job of qualified) {
      let fullDesc = job.description ?? "";
      try {
        if (job.job_id) {
          const details = await fetchJobDetails(job.job_id, serpQuery);
          fullDesc = details.description ?? fullDesc;
        }
      } catch {
        // Use what we have
      }

      // Second pass
      let matchScore = 0;
      let estimatedSalary = "";
      try {
        const scoreInput = `User CV: ${profileSummary}\n\nJob: ${fullDesc || `${job.title} at ${job.company_name}`}`;
        const scoreResult = await callGemini(SCORE_PROMPT, scoreInput);
        const cleaned = scoreResult.slice(scoreResult.indexOf("{"), scoreResult.lastIndexOf("}") + 1);
        const parsed = JSON.parse(cleaned);
        matchScore = parsed.match_score ?? 0;
        estimatedSalary = parsed.estimated_salary ?? "";
      } catch {
        matchScore = 50;
      }

      results.push({
        job_title: job.title,
        company: job.company_name,
        location: job.location,
        estimated_salary: estimatedSalary,
        match_score: matchScore,
        job_url: job.link ?? "",
        snippet: job.description ?? "",
        full_description: fullDesc,
        search_query: query,
      });
    }

    // Sort by match_score descending
    results.sort((a, b) => b.match_score - a.match_score);

    // Save to job_results
    const rows = results.map((r) => ({
      user_id: user.id,
      search_query: r.search_query,
      job_title: r.job_title,
      company: r.company,
      location: r.location,
      estimated_salary: r.estimated_salary,
      match_score: r.match_score,
      job_url: r.job_url,
      snippet: r.snippet,
      full_description: r.full_description,
    }));

    const { data: saved, error: saveErr } = await supabase
      .from("job_results")
      .insert(rows)
      .select();

    if (saveErr) {
      console.error("Failed to save job results:", saveErr.message);
    }

    return NextResponse.json({ results: saved ?? results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Search jobs error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
