import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAI } from "@/lib/gemini";
import { searchGoogleJobs, fetchJobDetails } from "@/lib/serpapi";
import { extractTextFromPDF } from "@/lib/pdf";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function logError(supabase: ReturnType<typeof getSupabase>, userId: string | null, code: string, msg: string) {
  try {
    await supabase.from("error_logs").insert({ user_id: userId, error_code: code, message: msg.slice(0, 500) });
  } catch {
    // Best effort
  }
}

const FIRST_PASS_SYSTEM = `You are a job listing quality auditor. Evaluate each job listing snippet against the candidate profile below.

For each snippet, return a JSON object with "index" (0-based), "pass" (true/false), and "reason" (short explanation).
Return ONLY a valid JSON array, no explanation.`;

const SECOND_PASS_SYSTEM = `You are a senior recruitment specialist and CV analyst. You have the full job specification and the candidate's complete CV. Perform a thorough evaluation.

STEP 1 — LISTING VALIDITY CHECK
Check the full page content and reject if ANY of the following are true:
- The page returns an error, is blank, or says the listing is no longer available
- The apply link or job URL appears broken or redirects to an unrelated page
- The listing has no clear company name, job title, or application instructions
- The domain is not a legitimate job board or company careers page
- The listing is clearly duplicated spam

STEP 2 — CANDIDATE FIT ASSESSMENT
If the listing is valid, compare the candidate CV against the full job specification:
- Does the candidate meet the core requirements?
- Are there critical missing qualifications that cannot be reframed?
- Does the location, job type, and seniority match the candidate's preferences?

STEP 3 — SCORING
If the listing is valid and the candidate has reasonable fit, return:
- match_score: 0-100 (be honest, do not inflate)
- estimated_salary: extract from spec or reason from role seniority and market
- match_summary: 1-2 sentences explaining the match

Return ONLY valid JSON, no explanation:
{
  "valid": true/false,
  "rejection_reason": "",
  "match_score": 0,
  "estimated_salary": "",
  "match_summary": ""
}`;

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
      await logError(supabase, user.id, "SEARCH_001", "No search query provided");
      return NextResponse.json({ error: "SEARCH_001" }, { status: 400 });
    }

    const isAdmin = ADMIN_EMAIL && user.email === ADMIN_EMAIL;

    // Get profile
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      await logError(supabase, user.id, "DB_001", "Profile read failure: " + (profileErr?.message ?? "not found"));
      return NextResponse.json({ error: "DB_001" }, { status: 404 });
    }

    // Balance check
    if (!isAdmin) {
      const balance = profile.search_balance ?? 0;
      if (balance <= 0) {
        return NextResponse.json({ code: "LIMIT_001" }, { status: 403 });
      }
    }

    // Decrement balance
    if (!isAdmin) {
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ search_balance: (profile.search_balance ?? 10) - 1 })
        .eq("id", user.id);

      if (updateErr) {
        await logError(supabase, user.id, "DB_002", "Balance decrement failed: " + updateErr.message);
      }
    }

    // Get banned lists
    const bannedJobs: string[] = [];
    const bannedCompanies: string[] = [];
    if (profile.banned_jobs) bannedJobs.push(...profile.banned_jobs);
    if (profile.banned_companies) bannedCompanies.push(...profile.banned_companies);

    // Step 1: SerpAPI search
    const serpQuery = [query, ...(profile.job_titles ?? [])].slice(0, 3).join(" ");
    let rawJobs: Awaited<ReturnType<typeof searchGoogleJobs>>;
    try {
      rawJobs = await searchGoogleJobs(serpQuery);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logError(supabase, user.id, "SEARCH_002", msg);
      return NextResponse.json({ results: [] });
    }

    if (rawJobs.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Filter banned
    const candidates = rawJobs.filter((j) => {
      if (j.link && bannedJobs.includes(j.link)) return false;
      if (bannedCompanies.includes(j.company_name)) return false;
      return true;
    });

    if (candidates.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Step 2: Load CV text for second pass
    let cvText = "";
    if (profile.cv_file_path) {
      try {
        const { data: fileData, error: fileErr } = await supabase
          .storage
          .from("cv-files")
          .download(profile.cv_file_path);

        if (!fileErr && fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          cvText = await extractTextFromPDF(buffer);
        }
      } catch {
        // CV not available — second pass will proceed with empty CV
      }
    }

    // Step 3: First pass — batched snippet filter
    const profileForFilter = JSON.stringify({
      job_titles: profile.job_titles,
      job_types: profile.job_types,
      location: profile.location,
    });

    interface FirstPassResult {
      index: number;
      pass: boolean;
      reason: string;
    }

    const batchSize = 10;
    const allFirstPassResults: FirstPassResult[] = [];

    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);

      const userText =
        "CANDIDATE PROFILE:\n" + profileForFilter + "\n\nJOB SNIPPETS:\n" +
        batch.map((j, idx) =>
          `${i + idx}. ${j.description ?? `${j.title} at ${j.company_name} in ${j.location}`}\nURL: ${j.link}`
        ).join("\n\n");

      try {
        const raw = await callAI(FIRST_PASS_SYSTEM, userText, { maxOutputTokens: 1000, temperature: 0.1 });
        const jsonStart = raw.indexOf("[");
        const jsonEnd = raw.lastIndexOf("]") + 1;
        if (jsonStart === -1 || jsonEnd === 0) throw new Error("No JSON array in response");
        const parsed: FirstPassResult[] = JSON.parse(raw.slice(jsonStart, jsonEnd));

        for (const r of parsed) {
          allFirstPassResults[i + r.index] = r;
        }
      } catch (err) {
        // Batch AI call failed — include all jobs in this batch anyway, log once
        const msg = err instanceof Error ? err.message : String(err);
        await logError(supabase, user.id, "AI_003", msg);
        for (let j = 0; j < batch.length; j++) {
          allFirstPassResults[i + j] = { index: i + j, pass: true, reason: "AI unavailable" };
        }
      }
    }

    const afterFirstPass = candidates.filter((_, idx) => allFirstPassResults[idx]?.pass !== false);

    if (afterFirstPass.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Step 4: Second pass — full page deep filter
    interface JobOutput {
      job_title: string;
      company: string;
      location: string;
      estimated_salary: string;
      match_score: number;
      match_summary: string;
      job_url: string;
      snippet: string;
      full_description: string;
      search_query: string;
      search_id: string;
    }

    const outputs: JobOutput[] = [];

    for (const job of afterFirstPass) {
      let fullDesc = job.description ?? "";

      // Fetch full page via SerpAPI
      if (job.job_id) {
        try {
          const details = await fetchJobDetails(job.job_id, serpQuery);
          fullDesc = details.description ?? fullDesc;
        } catch {
          await logError(supabase, user.id, "SEARCH_003", `Could not fetch details for ${job.title} at ${job.company_name}`);
          // Fall through with snippet
        }
      }

      // Call AI for deep evaluation
      try {
        const userText =
          "CANDIDATE CV:\n" + (cvText || "No CV available") + "\n\nFULL JOB SPECIFICATION:\n" + fullDesc;
        const raw = await callAI(SECOND_PASS_SYSTEM, userText, { maxOutputTokens: 2000, temperature: 0.1 });

        const jsonStart = raw.indexOf("{");
        const jsonEnd = raw.lastIndexOf("}") + 1;
        if (jsonStart === -1 || jsonEnd === 0) throw new Error("No JSON in response");

        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd));

        if (parsed.valid !== true || (parsed.match_score ?? 0) < 40) {
          continue;
        }

        outputs.push({
          job_title: job.title,
          company: job.company_name,
          location: job.location,
          estimated_salary: parsed.estimated_salary ?? "",
          match_score: parsed.match_score ?? 0,
          match_summary: parsed.match_summary ?? "",
          job_url: job.link ?? "",
          snippet: job.description ?? "",
          full_description: fullDesc,
          search_query: query,
          search_id: searchId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logError(supabase, user.id, "AI_001", `${job.title} at ${job.company_name}: ${msg}`);
        continue;
      }
    }

    // Sort by match_score descending
    outputs.sort((a, b) => b.match_score - a.match_score);

    // Save to job_results
    if (outputs.length > 0) {
      const rows = outputs.map((r) => ({
        user_id: user.id,
        search_id: r.search_id,
        job_title: r.job_title,
        company: r.company,
        location: r.location,
        estimated_salary: r.estimated_salary,
        match_score: r.match_score,
        match_summary: r.match_summary,
        job_url: r.job_url,
        snippet: r.snippet,
        full_description: r.full_description,
        search_query: r.search_query,
      }));

      const { data: saved, error: saveErr } = await supabase
        .from("job_results")
        .insert(rows)
        .select();

      if (saveErr) {
        await logError(supabase, user.id, "DB_002", "Failed to save job results: " + saveErr.message);
      }

      return NextResponse.json({ results: saved ?? outputs });
    }

    return NextResponse.json({ results: [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logError(supabase, null, "SEARCH_001", "Unhandled error: " + msg);
    return NextResponse.json({ results: [] });
  }
}
