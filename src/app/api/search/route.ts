import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs } from "@/lib/serpapi";
import { extractTextFromPDF } from "@/lib/pdf";
import { scoreJobMatch, isJobValid, extractSalary, isDomainVerified } from "@/lib/scorer";

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

    // SerpAPI search — support profile-specific data
    let titles = profile.job_titles ?? [];
    let profileLocation = profile.location ?? "";
    let cvFilePath = profile.cv_file_path ?? "";

    if (profile_id) {
      const { data: searchProfile } = await dataClient
        .from("search_profiles")
        .select("job_titles, location, cv_file_path")
        .eq("id", profile_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (searchProfile) {
        if (searchProfile.job_titles?.length) titles = searchProfile.job_titles;
        if (searchProfile.location) profileLocation = searchProfile.location;
        if (searchProfile.cv_file_path) cvFilePath = searchProfile.cv_file_path;
      }
    }

    function buildSerpParams(title: string) {
      return {
        q: `${title} ${profileLocation}`.trim(),
        location: profileLocation,
        hl: "en" as const,
        gl: "za" as const,
      };
    }

    const randomTitle = titles.length > 0
      ? titles[Math.floor(Math.random() * titles.length)]
      : "";
    const serpParams = randomTitle
      ? buildSerpParams(randomTitle)
      : { q: query || "jobs", hl: "en" as const, gl: "za" as const };

    // Step 1: Log exact SerpAPI query and parameters
    console.log("[SEARCH] SerpAPI query params:", JSON.stringify(serpParams));
    console.log("[SEARCH] SerpAPI random title chosen:", randomTitle);
    console.log("[SEARCH] SerpAPI titles pool:", JSON.stringify(titles));

    let rawJobs: Awaited<ReturnType<typeof searchGoogleJobs>>;
    let activeSerpParams = serpParams;
    try {
      rawJobs = await searchGoogleJobs(serpParams);
      if (rawJobs.length === 0 && titles.length > 1) {
        const otherTitles = titles.filter((t: string) => t !== randomTitle);
        const retryTitle = otherTitles[Math.floor(Math.random() * otherTitles.length)];
        console.log("[SEARCH] Retry with title:", retryTitle);
        activeSerpParams = buildSerpParams(retryTitle);
        rawJobs = await searchGoogleJobs(activeSerpParams);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("[SEARCH] SerpAPI error:", msg);
      return NextResponse.json({ results: [], code: "SERP_ERROR", message: "Search engine temporarily unavailable. Please try again." });
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

    // Score each job
    const outputs: JobRow[] = [];

    for (const job of candidates) {
      const jobUrl = buildJobUrl(job);

      // Step 3: Log isDomainVerified result for each job
      let domain: string;
      try { domain = new URL(jobUrl).hostname; } catch { domain = "invalid-url"; }
      const domainOk = isDomainVerified(jobUrl);
      console.log(`[SEARCH] Domain check for "${job.title}": domain=${domain} verified=${domainOk}`);
      if (!domainOk) {
        continue;
      }

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

      // Step 4: Log isJobValid result and reason
      const specTrimmed = (specText ?? "").trim();
      const validLength = specTrimmed.length >= 300;
      const expiredPattern = /position filled|no longer accepting|closed|expired|this job is no longer/i;
      const isExpired = expiredPattern.test(specTrimmed);
      const jobValid = isJobValid(specTrimmed, job.link);

      let invalidReason = "";
      if (!jobValid) {
        if (!validLength) invalidReason = "description too short (< 300 chars)";
        else if (isExpired) invalidReason = "contains expired/closed keywords";
        else invalidReason = "unknown validation failure";
      }
      console.log(`[SEARCH] Validity check for "${job.title}": valid=${jobValid} desc_length=${specTrimmed.length} is_expired=${isExpired}${invalidReason ? " reason=" + invalidReason : ""}`);
      if (!jobValid) {
        continue;
      }

      // Step 5: Log scoreJobMatch breakdown
      const result = scoreJobMatch(cvText, job.description ?? "", specText, {
        job_titles: titles,
        location: profileLocation ?? "",
      });
      console.log(`[SEARCH] Score for "${job.title}": score=${result.score} summary="${result.match_summary}" salary="${result.estimated_salary}"`);

      if (result.score < 40) {
        console.log(`[SEARCH] Score ${result.score} < 40 threshold — filtered out`);
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

    // Step 6: Log final count after score threshold
    console.log("[SEARCH] Jobs passed score >= 40:", outputs.length);

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

    console.log("[SEARCH] All jobs scored below 40 threshold or were invalid");
    // Step 7: Log zero returned
    console.log("[SEARCH] Final count returned to frontend: 0");
    return NextResponse.json({ results: [], code: "ALL_FILTERED_SCORE", message: "No strong matches found for your profile. Try broadening your criteria." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("[SEARCH] Unhandled error:", msg);
    return NextResponse.json({ results: [], code: "GENERIC_ERROR", message: "Something went wrong. Please try again." });
  }
}
