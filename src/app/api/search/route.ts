import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs } from "@/lib/serpapi";
import { extractTextFromPDF } from "@/lib/pdf";
import { callGemini } from "@/lib/gemini";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
const JINA_API_KEY = process.env.JINA_API_KEY;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  return { id: r.id ?? crypto.randomUUID(), ...r, full_description: r.full_spec ?? "" };
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

    const { query, profile_id } = await request.json();
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "SEARCH_001" }, { status: 400 });
    }

    console.log("[SEARCH] ========================");
    console.log("[SEARCH] Search started at:", new Date().toISOString());
    console.log("[SEARCH] Query:", query);
    console.log("[SEARCH] Profile ID:", profile_id ?? "none");

    const isAdmin = ADMIN_EMAIL && user.email === ADMIN_EMAIL;

    // Create an authenticated anon client for all data queries (service-role key may not match this instance)
    const dataClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${authHeader}` } },
        auth: { persistSession: false },
      }
    );

    // Get profile
    console.log("[SEARCH] Profile query user_id:", user.id);
    let profile: any;
    let profileErr: any;
    ({ data: profile, error: profileErr } = await dataClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle());

    if (profileErr) {
      console.log("[SEARCH] Profile query error:", profileErr?.message ?? "unknown");
    }
    if (!profile) {
      console.log("[SEARCH] No profile row exists for user", user.id);
      return NextResponse.json({ error: "PROFILE_NOT_FOUND", message: "Please set up your profile before searching." }, { status: 404 });
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

    // Banned lists
    const bannedJobs: string[] = [];
    const bannedCompanies: string[] = [];
    if (profile.banned_jobs) bannedJobs.push(...profile.banned_jobs);
    if (profile.banned_companies) bannedCompanies.push(...profile.banned_companies);

    // Get search-specific data ONLY from the selected search_profile, never from the main profile
    let titles: string[] = [];
    let profileLocation = "";
    let cvFilePath = "";

    if (profile_id) {
      const { data: searchProfile } = await dataClient
        .from("search_profiles")
        .select("job_titles, location, cv_file_path")
        .eq("id", profile_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (searchProfile?.job_titles?.length) {
        titles = searchProfile.job_titles;
        profileLocation = searchProfile.location ?? "";
        cvFilePath = searchProfile.cv_file_path ?? "";
      } else {
        console.log("[SEARCH] search_profile not found or has no job_titles for id:", profile_id);
      }
    }

    // Use the frontend's query directly for SerpAPI
    if (!query || query === "jobs") {
      console.log("[SEARCH] No meaningful query — cannot search");
      return NextResponse.json({ results: [], code: "NO_QUERY", message: "Add job titles to your search profile first." });
    }

    // Sanitise location: SerpAPI's Google Jobs endpoint only accepts real geographic
    // locations (city, country). Strip non-geographic descriptors like "Remote" and
    // fall back to the country implied by gl (za).
    function sanitiseLocation(raw: string): string | undefined {
      if (!raw) return undefined;
      // Remove "Remote", "Hybrid", "On-site", "Online" and similar non-geographic tokens
      const stripped = raw.replace(/\b(Remote|Hybrid|On-site|Online|Work from home|WFH|Flexible|Anywhere)\b/gi, "").trim();
      // Clean up separators left behind (e.g. "Remote / UK-based" -> " / UK-based" -> "UK-based")
      const cleaned = stripped.replace(/^[\s,;/-]+|[\s,;/-]+$/g, "").replace(/[\s,;/-]+/g, " ");
      if (!cleaned || cleaned.length < 2) return undefined;
      return cleaned;
    }

    const sanitisedLocation = sanitiseLocation(profileLocation);

    const buildSerpParams = (location?: string) => ({
      q: query,
      location: location,
      hl: "en" as const,
      gl: "za" as const,
    });

    const serpParams = buildSerpParams(sanitisedLocation);

    console.log("[SEARCH] SerpAPI query params:", JSON.stringify(serpParams));
    console.log("[SEARCH] SerpAPI titles for scoring:", JSON.stringify(titles));

    let rawJobs: Awaited<ReturnType<typeof searchGoogleJobs>>;
    try {
      rawJobs = await searchGoogleJobs(serpParams);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("[SEARCH] SerpAPI error:", msg);
      // If SerpAPI rejected the location (400 error), retry without location
      if (msg.includes("(400)")) {
        console.log("[SEARCH] SerpAPI rejected location — retrying with gl-only (no location param)");
        console.log("[SEARCH] Rejected location value was:", JSON.stringify(sanitisedLocation));
        try {
          rawJobs = await searchGoogleJobs(buildSerpParams(undefined));
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          console.log("[SEARCH] SerpAPI retry also failed:", retryMsg);
          return NextResponse.json({ results: [], code: "SERP_ERROR", message: "Search engine temporarily unavailable. Please try again." });
        }
      } else {
        return NextResponse.json({ results: [], code: "SERP_ERROR", message: "Search engine temporarily unavailable. Please try again." });
      }
    }

    // Step 2: Log raw count + full title + company + snippet of ALL results
    console.log("[SEARCH] SerpAPI raw count:", rawJobs.length);
    rawJobs.forEach((job, idx) => {
      const snippet = (job.description ?? "").slice(0, 200);
      console.log(`[SEARCH] Raw job #${idx}: title="${job.title}" company="${job.company_name}" location="${job.location}" description_snippet="${snippet}"`);
    });

    if (rawJobs.length === 0) {
      console.log("[SEARCH] SerpAPI returned zero results — no jobs match the query");
      return NextResponse.json({ results: [], code: "NO_RESULTS_SERP", message: "No jobs found matching your profile. Try different job titles or locations." });
    }

    // Filter banned
    const candidates = rawJobs.filter((j) => {
      const url = buildJobUrl(j);
      if (url && bannedJobs.includes(url)) return false;
      if (bannedCompanies.includes(j.company_name)) return false;
      return true;
    });

    console.log("[SEARCH] After banned filter:", candidates.length);
    for (let i = 0; i < Math.min(2, candidates.length); i++) {
      console.log(`[SEARCH] Job ${i} apply_options:`, JSON.stringify(candidates[i].apply_options));
    }

    if (candidates.length === 0) {
      console.log("[SEARCH] All results filtered by banned companies/jobs");
      return NextResponse.json({ results: [], code: "ALL_FILTERED_BANNED", message: "All matching jobs were blocked by your banned companies or job list." });
    }

    // Load CV text
    let cvText = "";
    if (cvFilePath) {
      try {
        const { data: fileData } = await dataClient
          .storage
          .from("cv-files")
          .download(cvFilePath);

        if (fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          cvText = await extractTextFromPDF(buffer);
        }
      } catch {
        // CV unavailable
      }
    }

    console.log("[SEARCH] CV text length:", cvText.length);

    // Fetch full specs via Jina AI for all candidates, store in a parallel map
    const jobUrls = new Map<number, string>();
    const jobFullSpecs = new Map<number, string>();

    for (let i = 0; i < candidates.length; i++) {
      const job = candidates[i];
      const jobUrl = buildJobUrl(job);
      jobUrls.set(i, jobUrl);
      let specText = job.description ?? "";
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
      jobFullSpecs.set(i, specText || job.description || "");
    }

    // Build profile context for Gemini
    const profileContext = JSON.stringify({
      job_titles: titles,
      location: profileLocation || null,
      cv_text: cvText ? cvText.slice(0, 5000) : "No CV provided",
    });

    // Pass 1: Batch all jobs in one Gemini call for initial screening
    console.log("[SEARCH] Pass 1 — batch screening", candidates.length, "jobs via Gemini");

    const batchInput = candidates.map((j, i) => ({
      index: i,
      job_title: j.title,
      company: j.company_name,
      location: j.location,
      description_snippet: (j.description ?? "").slice(0, 1500),
      url: jobUrls.get(i) || "",
    }));

    const batchSystemPrompt = `You are a recruiter screening job matches for a candidate. 
Your task: evaluate each job against the candidate's profile and CV.

Rules:
- Reject jobs not in South Africa or the candidate's preferred location.
- Reject expired, filled, or closed positions.
- Judge genuine fit — read the CV and job description carefully. Consider transferable skills, relevant experience, and realistic qualification. A candidate CAN be a fit even if their job title doesn't exactly match the job title.
- Return ONLY a JSON array of objects. No markdown, no explanation, no code fences.

Each object in the array must have this exact schema:
{
  "index": number,
  "score": number (0-100, where 70+ is strong match, 40-69 is possible, below 40 is poor),
  "is_valid": boolean,
  "reason": string (brief explanation of fit or rejection),
  "estimated_salary": string (extracted salary if found, otherwise "")
}

Return the array in the same order as the input jobs.`;

    let batchResults: { index: number; score: number; is_valid: boolean; reason: string; estimated_salary: string }[] = [];

    try {
      const raw = await callGemini(
        batchSystemPrompt,
        `Candidate Profile:\n${profileContext}\n\nJobs:\n${JSON.stringify(batchInput, null, 2)}`,
        { responseMimeType: "application/json", temperature: 0.1 }
      );
      batchResults = JSON.parse(raw);
      console.log("[SEARCH] Pass 1 batch results:", JSON.stringify(batchResults));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("[SEARCH] Pass 1 Gemini error:", msg);
      return NextResponse.json({ results: [], code: "AI_ERROR", message: "AI screening failed. Please try again." });
    }

    // Keep only jobs that pass the initial screen
    const screenedIndices = new Set<number>();
    for (const r of batchResults) {
      if (r.is_valid && r.score >= 40) {
        screenedIndices.add(r.index);
      }
    }

    const screened = candidates.filter((_, i) => screenedIndices.has(i));
    console.log("[SEARCH] Pass 1 survivors:", screened.length);

    // Pass 2: Sequential deep analysis with 6s delay
    const outputs: JobRow[] = [];

    for (let i = 0; i < screened.length; i++) {
      const job = screened[i];
      const originalIndex = candidates.indexOf(job);
      const batchResult = batchResults.find((r) => r.index === originalIndex);
      const jobUrl = jobUrls.get(originalIndex) || buildJobUrl(job);
      const fullSpec = jobFullSpecs.get(originalIndex) || job.description || "";

      if (i > 0) await sleep(6000);

      console.log(`[SEARCH] Pass 2 — deep analysis #${i}: "${job.title}"`);

      const deepSystemPrompt = `You are a senior recruiter doing a deep-fit analysis. 
You have the candidate's full CV text and profile. You have a full job specification.
Determine whether this candidate is a genuine match for this role.

Rules:
- The job MUST be in South Africa or the candidate's preferred location. Reject if not.
- Reject if the position is expired, filled, or no longer accepting applications.
- Judge like a human recruiter: consider transferable skills, relevant experience, career trajectory, and realistic qualification. Pivot cases ARE valid — a candidate CAN be right for a role even if their past job titles don't match.
- Do NOT use keyword matching. Reason about the candidate's actual experience vs what the job requires.
- In match_summary, explain your reasoning in plain language — reference specifics from the CV and job spec.

Return ONLY valid JSON with this exact schema (no markdown, no code fences):
{
  "score": number (0-100),
  "match_summary": string (detailed reasoning referencing CV and job spec),
  "estimated_salary": string (extracted salary or ""),
  "is_valid": boolean
}`;

      try {
        const raw = await callGemini(
          deepSystemPrompt,
          `Candidate Profile:\n${profileContext}\n\nFull Job Specification:\n${fullSpec.slice(0, 8000)}\n\nJob Title: ${job.title}\nCompany: ${job.company_name}\nLocation: ${job.location}`,
          { responseMimeType: "application/json", temperature: 0.1 }
        );
        const deepResult = JSON.parse(raw);
        console.log(`[SEARCH] Pass 2 result for "${job.title}":`, JSON.stringify(deepResult));

        if (!deepResult.is_valid || deepResult.score < 40) {
          console.log(`[SEARCH] Pass 2 — filtered out: "${job.title}" (score=${deepResult.score})`);
          continue;
        }

        outputs.push({
          user_id: user.id,
          search_id: searchId,
          job_title: job.title,
          company: job.company_name,
          location: job.location,
          estimated_salary: deepResult.estimated_salary || batchResult?.estimated_salary || "",
          match_score: deepResult.score,
          match_summary: deepResult.match_summary || batchResult?.reason || "",
          job_url: jobUrl,
          full_spec: fullSpec,
          search_query: query,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[SEARCH] Pass 2 Gemini error for "${job.title}":`, msg);
        // Fallback: use pass 1 result
        if (batchResult && batchResult.is_valid && batchResult.score >= 40) {
          outputs.push({
            user_id: user.id,
            search_id: searchId,
            job_title: job.title,
            company: job.company_name,
            location: job.location,
            estimated_salary: batchResult.estimated_salary || "",
            match_score: batchResult.score,
            match_summary: batchResult.reason || "",
            job_url: jobUrl,
            full_spec: fullSpec,
            search_query: query,
          });
        }
      }
    }

    // Sort by score descending
    outputs.sort((a, b) => b.match_score - a.match_score);

    console.log("[SEARCH] Final results after Gemini analysis:", outputs.length);

    // Deduct balance only after successful search
    if (!isAdmin) {
      try {
        await dataClient
          .from("profiles")
          .update({ search_balance: (profile.search_balance ?? 3) - 1 })
          .eq("id", user.id);
      } catch {
        // Best effort
      }
    }

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

      const { data: saved, error: saveErr } = await dataClient
        .from("job_results")
        .insert(rows)
        .select("id, job_title, company, location, estimated_salary, match_score, match_summary, job_url, full_spec");

      if (saveErr) {
        console.log("[SEARCH] DB save error:", saveErr.message);
        // Step 7: Log final count returned (fallback — return from memory)
        console.log("[SEARCH] Final count returned to frontend (from memory):", outputs.length);
        return NextResponse.json({ results: outputs.map(normalize) });
      }

      // Step 7: Log final count returned (from DB)
      console.log("[SEARCH] Final count returned to frontend (from DB):", (saved ?? outputs).length);
      return NextResponse.json({ results: (saved ?? outputs).map(normalize) });
    }

    console.log("[SEARCH] All jobs filtered out by Gemini analysis");
    console.log("[SEARCH] Final count returned to frontend: 0");
    return NextResponse.json({ results: [], code: "ALL_FILTERED_AI", message: "No strong matches found for your profile. Try broadening your criteria." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("[SEARCH] Unhandled error:", msg);
    return NextResponse.json({ results: [], code: "GENERIC_ERROR", message: "Something went wrong. Please try again." });
  }
}
