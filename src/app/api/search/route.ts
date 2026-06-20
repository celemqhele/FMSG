import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs } from "@/lib/serpapi";
import { extractTextFromPDF } from "@/lib/pdf";
import { callAIWithFallback, lastAITier } from "@/lib/gemini";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const JINA_API_KEY = process.env.JINA_API_KEY;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Domain trust tiers ---

const HIGH_TRUST_DOMAINS = [
  'linkedin.com',
  'indeed.co.za',
  'indeed.com',
];

const STANDARD_TRUST_DOMAINS = [
  'careers24.com',
  'pnet.co.za',
];

const SHORT_SPEC_THRESHOLD = 500;

const RECRUITMENT_KEYWORDS = [
  'recruitment', 'recruiter', 'staffing', 'talent ', 'talent-',
  'placement', 'personnel', 'employment agency', 'manpower',
  'recruit', 'staffing solutions',
];

const BLOCKED_ATS_TRACKERS = [
  '#J-18808-Ljbffr',
];

const RECRUITMENT_SPEC_PATTERNS = [
  /is seeking\s+(a|an)\s+/i,
  /are looking for\s+(a|an)\s+/i,
  /on behalf of\s+(a|an\s+)?(client|company|organisation|organization)/i,
];

const BLACKLISTED_DOMAINS = [
  'bebee.com',
  'jobleads.com',
  'jobleads.co.za',
  'jobleads.co.uk',
  'jobleads.sg',
  'jobleads.ae',
  'jobleads.fr',
  'jobleads.it',
];

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function parsePostedAt(posted?: string): number | null {
  if (!posted) return null;
  const val = posted.toLowerCase().replace(/^a[n]?\s+/, "1 ").replace(/^just posted$/, "0 days ago").replace(/\+/, "");
  const num = parseInt(val.match(/\d+/)?.[0] ?? "", 10);
  if (isNaN(num)) return null;
  const ms = val.includes("month") ? num * 30 : val.includes("week") ? num * 7 : val.includes("year") ? num * 365 : num;
  return Date.now() - ms * 24 * 60 * 60 * 1000;
}

const EXPIRED_PATTERNS = [
  "no longer accepting applications",
  "no longer accepting",
  "this position has been filled",
  "position has been filled",
  "job has been closed",
  "this job has been closed",
  "this job posting has been closed",
  "is no longer available",
  "position is no longer available",
  "this position is no longer",
  "we are no longer accepting",
  "application deadline has passed",
  "deadline has passed",
  "this posting is expired",
  "job expired",
  "this job is expired",
  "position is closed",
  "this position is closed",
  "this job posting is expired",
  "job posting is no longer active",
  "position has been cancelled",
  "has been cancelled",
  "no longer hiring for this",
  "not currently accepting applications",
  "is no longer accepting new applications",
];

function isExpired(text: string): boolean {
  const lower = text.toLowerCase();
  return EXPIRED_PATTERNS.some((p) => lower.includes(p));
}

function isDomainVerified(url: string, postedAt?: string): { verified: boolean; reason?: string } {
  const domain = extractDomain(url);
  if (!domain) return { verified: false, reason: "no_domain" };

  if (BLACKLISTED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { verified: false, reason: "blacklisted_domain" };
  }

  if (HIGH_TRUST_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    if (postedAt) {
      const posted = new Date(postedAt).getTime();
      const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
      if (isNaN(posted) || posted < cutoff) {
        return { verified: false, reason: "stale_high_trust" };
      }
    }
    return { verified: true };
  }

  if (STANDARD_TRUST_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    if (postedAt) {
      const posted = new Date(postedAt).getTime();
      const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
      if (isNaN(posted) || posted < cutoff) {
        return { verified: false, reason: "stale_standard_trust" };
      }
    }
    return { verified: true };
  }

  return { verified: false, reason: "untrusted_domain" };
}

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
  domain_verified: boolean;
  domain_unverified_reason: string;
  posted_at: string;
  posted_at_ms: number;
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

async function searchRound(
  query: string,
  profileLocation: string,
  titles: string[],
  cvText: string,
  user: any,
  profile: any,
  authHeader: string,
  dataClient: any,
  searchId: string,
  bannedJobs: string[],
  bannedCompanies: string[],
  pfRound?: number
): Promise<{ results: JobRow[]; queryUsed: string }> {
  console.log(`[PF] Round query: "${query}" (location: "${profileLocation}")`);
  console.log(`[PF] lastAITier before searchRound: ${lastAITier}`);

  function sanitiseLocation(raw: string): string | undefined {
    if (!raw) return undefined;
    const stripped = raw.replace(/\b(Remote|Hybrid|On-site|Online|Work from home|WFH|Flexible|Anywhere)\b/gi, "").trim();
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

  let rawJobs: Awaited<ReturnType<typeof searchGoogleJobs>>;
  try {
    rawJobs = await searchGoogleJobs(serpParams);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("(400)")) {
      try {
        rawJobs = await searchGoogleJobs(buildSerpParams(undefined));
      } catch {
        return { results: [], queryUsed: query };
      }
    } else {
      return { results: [], queryUsed: query };
    }
  }

  if (!rawJobs || rawJobs.length === 0) {
    return { results: [], queryUsed: query };
  }

  // Domain verification
  for (const j of rawJobs) {
    const url = buildJobUrl(j);
    const postedStr = (j as any).detected_extensions?.posted_at ?? (j as any).posted_at ?? "";
    const result = isDomainVerified(url, postedStr);
    (j as any)._domainVerified = result.verified;
    (j as any)._domainReason = result.verified ? "" : (result.reason ?? "untrusted_domain");
    (j as any)._postedAt = postedStr;
    (j as any)._postedAtMs = parsePostedAt(postedStr) ?? 0;
  }

  // Blacklist hard-remove
  rawJobs = rawJobs.filter((j) => {
    const url = buildJobUrl(j);
    const domain = extractDomain(url);
    return !BLACKLISTED_DOMAINS.some((d) => domain === d || domain?.endsWith(`.${d}`));
  });

  // Banned filter
  rawJobs = rawJobs.filter((j) => {
    const url = buildJobUrl(j);
    if (url && bannedJobs.includes(url)) return false;
    if (bannedCompanies.includes(j.company_name)) return false;
    return true;
  });

  // Expired snippet check
  rawJobs = rawJobs.filter((j) => {
    if (j.description && isExpired(j.description)) return false;
    return true;
  });

  if (rawJobs.length === 0) return { results: [], queryUsed: query };

  // Jina fetch
  let jobUrls = new Map<number, string>();
  let jobFullSpecs = new Map<number, string>();

  for (let i = 0; i < rawJobs.length; i++) {
    const job = rawJobs[i];
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
        }
      } catch {
        // Jina failed
      }
    }
    jobFullSpecs.set(i, specText || job.description || "");
    if (specText && isExpired(specText)) {
      (job as any)._expired = true;
    }
  }

  const preFilterUrls = new Map(jobUrls);
  const preFilterSpecs = new Map(jobFullSpecs);
  rawJobs = rawJobs.filter((j) => !(j as any)._expired);
  jobUrls = new Map(rawJobs.map((j, i) => [i, buildJobUrl(j)] as const));
  const newJobFullSpecs = new Map<number, string>();
  for (let i = 0; i < rawJobs.length; i++) {
    const url = jobUrls.get(i) ?? "";
    const origEntry = [...preFilterSpecs.entries()].find(([origIdx]) => preFilterUrls.get(origIdx) === url);
    newJobFullSpecs.set(i, origEntry?.[1] ?? rawJobs[i].description ?? "");
  }
  jobFullSpecs = newJobFullSpecs;

  // Recruitment agency + short spec filter
  {
    const filtered: typeof rawJobs = [];
    const filteredSpecs = new Map<number, string>();
    const filteredUrls = new Map<number, string>();
    rawJobs.forEach((j, i) => {
      const spec = jobFullSpecs.get(i) ?? "";
      if (BLOCKED_ATS_TRACKERS.some(t => spec.includes(t))) return;
      if (spec.length >= SHORT_SPEC_THRESHOLD) {
        const newIdx = filtered.length;
        filtered.push(j);
        filteredSpecs.set(newIdx, spec);
        filteredUrls.set(newIdx, buildJobUrl(j));
        return;
      }
      const companyLower = (j.company_name ?? "").toLowerCase();
      const isRecruitmentAgency = RECRUITMENT_KEYWORDS.some(kw => companyLower.includes(kw))
        || RECRUITMENT_SPEC_PATTERNS.some(p => p.test(spec.slice(0, 500)));
      if (!isRecruitmentAgency) {
        const newIdx = filtered.length;
        filtered.push(j);
        filteredSpecs.set(newIdx, spec);
        filteredUrls.set(newIdx, buildJobUrl(j));
      }
    });
    rawJobs = filtered;
    jobFullSpecs = filteredSpecs;
    jobUrls = filteredUrls;
  }

  if (rawJobs.length === 0) return { results: [], queryUsed: query };

  // Build profile context
  const profileContext = JSON.stringify({
    job_titles: titles,
    location: profileLocation || null,
    cv_text: cvText ? cvText.slice(0, 5000) : "No CV provided",
  });

  const sanitiseForJson = (s: string | undefined | null): string =>
    (s ?? "").replace(/["\n\r\t]/g, " ").replace(/\s+/g, " ").trim();

  // Pass 1 batch
  const batchInput = rawJobs.map((j, i) => ({
    index: i,
    job_title: sanitiseForJson(j.title),
    company: sanitiseForJson(j.company_name),
    location: sanitiseForJson(j.location),
    description_snippet: sanitiseForJson((j.description ?? "").slice(0, 1500)),
    url: jobUrls.get(i) || "",
  }));

  const batchSystemPrompt = `You are a recruiter screening job matches for a candidate. 
Evaluate each job against the candidate's profile and CV.
Rules:
- Reject jobs not in South Africa or the candidate's preferred location.
- Reject expired, filled, or closed positions.
- Judge genuine fit — read the CV and job description carefully.
- Return ONLY a JSON array of objects. No markdown, no explanation, no code fences.
Each object: { "index": number, "score": number (0-100), "is_valid": boolean, "reason": string, "estimated_salary": string }`;

  let batchResults: { index: number; score: number; is_valid: boolean; reason: string; estimated_salary: string }[] = [];

  let rawPass1 = "";
  try {
    console.log(`[PF] Starting Pass 1 batch (${rawJobs.length} jobs)`);
    rawPass1 = await callAIWithFallback(
      batchSystemPrompt,
      `Candidate Profile:\n${profileContext}\n\nJobs:\n${JSON.stringify(batchInput, null, 2)}`,
      `search pass 1${pfRound ? ` (PF round ${pfRound})` : ""}`,
      { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 8192 }
    );
    batchResults = JSON.parse(rawPass1);
    console.log(`[PF] Pass 1 batch succeeded via ${lastAITier}`);
  } catch {
    console.log(`[PF] Pass 1 batch failed, falling back to individual (${rawJobs.length} jobs)`);
    for (let i = 0; i < rawJobs.length; i++) {
      const job = rawJobs[i];
      if (i > 0) await sleep(6000);
      const singlePrompt = `You are a recruiter screening a single job match.
Return ONLY valid JSON (no markdown, no code fences):
{ "score": number (0-100), "is_valid": boolean, "reason": string, "estimated_salary": string }`;
      try {
        const rawSingle = await callAIWithFallback(
          singlePrompt,
          `Candidate Profile:\n${profileContext}\n\nJob:\n${JSON.stringify(batchInput[i], null, 2)}`,
          `search pass 1 individual${pfRound ? ` (PF round ${pfRound})` : ""}`,
          { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1024 }
        );
        const parsed = JSON.parse(rawSingle);
        batchResults.push({ index: i, ...parsed });
      } catch {
        batchResults.push({ index: i, score: 30, is_valid: false, reason: "Screening unavailable", estimated_salary: "" });
      }
    }
  }

  // Pass 2
  console.log(`[PF] Starting Pass 2 deep analysis (${rawJobs.length} jobs)`);
  const outputs: JobRow[] = [];
  for (let i = 0; i < rawJobs.length; i++) {
    const job = rawJobs[i];
    const batchResult = batchResults.find((r) => r.index === i);
    const jobUrl = jobUrls.get(i) || buildJobUrl(job);
    const fullSpec = jobFullSpecs.get(i) || job.description || "";

    if (i > 0) await sleep(6000);

    const deepSystemPrompt = `You are a senior recruiter doing a deep-fit analysis.
You have the candidate's full CV text and profile. You have a full job specification.
Rules:
- The job MUST be in South Africa or the candidate's preferred location. Reject if not.
- Reject if the position is expired, filled, or no longer accepting applications.
- Judge like a human recruiter. Consider transferable skills and career trajectory.
- Do NOT use keyword matching.
- In match_summary, reference specifics from the CV and job spec.

Return ONLY valid JSON with this exact schema (no markdown, no code fences):
{
  "score": number (0-100),
  "match_summary": string,
  "estimated_salary": string,
  "is_valid": boolean
}`;

    try {
      const raw = await callAIWithFallback(
        deepSystemPrompt,
        `Candidate Profile:\n${profileContext}\n\nFull Job Specification:\n${fullSpec.slice(0, 8000)}\n\nJob Title: ${job.title}\nCompany: ${job.company_name}\nLocation: ${job.location}`,
        `search pass 2${pfRound ? ` (PF round ${pfRound})` : ""}: ${job.title} at ${job.company_name}`,
        { responseMimeType: "application/json", temperature: 0.1 }
      );
      const deepResult = JSON.parse(raw);

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
        domain_verified: (job as any)._domainVerified ?? true,
        domain_unverified_reason: (job as any)._domainReason ?? "",
        posted_at: (job as any)._postedAt ?? "",
        posted_at_ms: (job as any)._postedAtMs ?? 0,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[AI] Pass 2 failed for "${job.title}" at ${job.company_name}: ${errMsg.slice(0, 150)}`);
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
          domain_verified: (job as any)._domainVerified ?? true,
          domain_unverified_reason: (job as any)._domainReason ?? "",
          posted_at: (job as any)._postedAt ?? "",
          posted_at_ms: (job as any)._postedAtMs ?? 0,
        });
      }
    }
  }

  return { results: outputs, queryUsed: query };
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

    const body = await request.json();
    const { query, profile_id, pf_mode } = body;
    if (!query && !pf_mode) {
      return NextResponse.json({ error: "SEARCH_001" }, { status: 400 });
    }

    console.log(`[SEARCH] Search started at: ${new Date().toISOString()}`);
    console.log(`[SEARCH] Query: ${query ?? "(pf_mode)"}, PF mode: ${pf_mode}, Profile: ${profile_id}`);

    const userEmail = user.email ?? "";

    // Create data client
    const dataClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${authHeader}` } },
        auth: { persistSession: false },
      }
    );

    // Get profile
    const { data: profile, error: profileErr } = await dataClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND", message: "Please set up your profile before searching." }, { status: 404 });
    }

    const isAdmin = (profile.is_admin ?? false) || (ADMIN_EMAIL && user.email === ADMIN_EMAIL);

    // Balance check
    if (!isAdmin) {
      const searchBalance = profile.search_balance ?? 0;
      if (searchBalance <= 0) {
        return NextResponse.json({ code: "LIMIT_001" }, { status: 403 });
      }

      if (pf_mode) {
        const pfBalance = profile.persistent_finder_balance ?? 0;
        if (pfBalance <= 0) {
          return NextResponse.json({ code: "LIMIT_003", message: "No Persistent Finder rounds remaining. Upgrade your plan." }, { status: 403 });
        }
      }
    }

    // Banned lists
    const bannedJobs: string[] = profile.banned_jobs ?? [];
    const bannedCompanies: string[] = profile.banned_companies ?? [];

    // Get search profile data
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
      }
    }

    if (titles.length === 0) {
      return NextResponse.json({ results: [], code: "NO_TITLES", message: "Add job titles to your search profile first." });
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

    console.log(`[SEARCH] CV text length: ${cvText.length}, titles: ${titles.length}`);

    if (!pf_mode) {
      // === NORMAL SINGLE SEARCH ===
      console.log(`[SEARCH] Non-PF mode, picking random title`);
      const pick = titles[Math.floor(Math.random() * titles.length)] ?? "";
      const searchQuery = [pick, profileLocation].filter(Boolean).join(" in ");
      
      if (!searchQuery || searchQuery === "jobs") {
        return NextResponse.json({ results: [], code: "NO_QUERY", message: "Add job titles to your search profile first." });
      }

      const { results: outputs } = await searchRound(
        searchQuery, profileLocation, titles, cvText,
        user, profile, authHeader, dataClient, searchId,
        bannedJobs, bannedCompanies
      );

      // Sort
      outputs.sort((a, b) => {
        if (a.domain_verified !== b.domain_verified) return a.domain_verified ? -1 : 1;
        return b.posted_at_ms - a.posted_at_ms;
      });

      // Deduct balance
      if (!isAdmin) {
        try {
          await dataClient.from("profiles").update({ search_balance: (profile.search_balance ?? 3) - 1 }).eq("id", user.id);
        } catch {}
      }

      // Save & return
      if (outputs.length > 0) {
        const rows = outputs.map((r) => ({
          user_id: r.user_id,
          search_id: r.search_id,
          profile_id: profile_id ?? null,
          job_title: r.job_title,
          company: r.company,
          location: r.location,
          estimated_salary: r.estimated_salary,
          match_score: r.match_score,
          match_summary: r.match_summary,
          job_url: r.job_url,
          full_spec: r.full_spec,
          search_query: r.search_query,
          domain_verified: r.domain_verified,
          domain_unverified_reason: r.domain_unverified_reason,
          posted_at: r.posted_at,
        }));

        const { data: saved } = await dataClient.from("job_results").insert(rows).select("id, job_title, company, location, estimated_salary, match_score, match_summary, job_url, full_spec, domain_verified, domain_unverified_reason, posted_at, created_at");
        return NextResponse.json({ results: (saved ?? outputs).map(normalize) });
      }

      return NextResponse.json({ results: [], code: "ALL_FILTERED_AI", message: "No strong matches found. Try broadening your criteria." });
    }

    // === PERSISTENT FINDER MODE ===
    const MAX_ROUNDS = 8;
    const PHASE1_ROUNDS = 4;
    const STOP_THRESHOLD_PHASE1 = 80;
    const STOP_THRESHOLD_PHASE2 = 40;
    const STOP_COUNT = 5;

    let allResults: JobRow[] = [];
    const seenUrls = new Set<string>();
    let remainingTitles = [...titles];
    let aiVariations: string[] = [];
    let pfRound = 0;
    let pfAborted = false;

    // Shuffle titles
    for (let i = remainingTitles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingTitles[i], remainingTitles[j]] = [remainingTitles[j], remainingTitles[i]];
    }

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const phase = round < PHASE1_ROUNDS ? 1 : 2;
      const threshold = phase === 1 ? STOP_THRESHOLD_PHASE1 : STOP_THRESHOLD_PHASE2;

      let roundQuery: string;

      if (phase === 1) {
        // Use original titles
        if (round >= remainingTitles.length) {
          // No more original titles — move to phase 2 early
          if (aiVariations.length === 0) {
            // Generate AI variations
            try {
              const variationPrompt = `You are a job search strategist. Generate 4 different job title variations based on the candidate's profile and original titles. Each variation should be a realistic job search query that could return different results. Return ONLY a JSON array of strings. No markdown, no explanation.`;
              const variationResult = await callAIWithFallback(
                variationPrompt,
                `Original job titles: ${JSON.stringify(titles)}\nCandidate location: ${profileLocation}\nCV summary: ${(cvText || "No CV").slice(0, 1000)}`,
                "PF title variation gen",
                { responseMimeType: "application/json", temperature: 0.7 }
              );
              aiVariations = JSON.parse(variationResult);
              if (!Array.isArray(aiVariations) || aiVariations.length === 0) {
                aiVariations = titles.slice(0, 4); // fallback
              }
            } catch {
              aiVariations = titles.slice(0, 4); // fallback on error
            }
          }
          if (round < remainingTitles.length + aiVariations.length) {
            roundQuery = remainingTitles[round] ?? aiVariations[0];
          } else {
            break;
          }
        } else {
          roundQuery = remainingTitles[round];
        }
      } else {
        // Use AI variations
        if (aiVariations.length === 0) {
          // Generate AI variations
          try {
            const variationPrompt = `You are a job search strategist. Generate 4 different job title variations based on the candidate's profile and original titles. Each variation should be a realistic job search query that could return different results. Return ONLY a JSON array of strings. No markdown, no explanation.`;
            const variationResult = await callAIWithFallback(
              variationPrompt,
              `Original job titles: ${JSON.stringify(titles)}\nCandidate location: ${profileLocation}\nCV summary: ${(cvText || "No CV").slice(0, 1000)}`,
              "PF title variation gen",
              { responseMimeType: "application/json", temperature: 0.7 }
            );
            aiVariations = JSON.parse(variationResult);
            if (!Array.isArray(aiVariations) || aiVariations.length === 0) {
              aiVariations = titles.slice(0, 4);
            }
          } catch {
            aiVariations = titles.slice(0, 4);
          }
        }
        const varIdx = round - PHASE1_ROUNDS;
        if (varIdx < aiVariations.length) {
          roundQuery = aiVariations[varIdx];
        } else {
          break;
        }
      }

      const fullQuery = [roundQuery, profileLocation].filter(Boolean).join(" in ");
      pfRound = round + 1;

      console.log(`[PF] Round ${pfRound}/${MAX_ROUNDS} (Phase ${phase}, threshold ${threshold}): "${fullQuery}"`);

      // Slow down when on the last available AI tier
      if (lastAITier === "openrouter") {
        console.log("[PF] On OpenRouter tier — using 12s delay between rounds");
        await sleep(12000);
      }

      let roundResults: JobRow[];
      try {
        const result = await searchRound(
          fullQuery, profileLocation, titles, cvText,
          user, profile, authHeader, dataClient, searchId,
          bannedJobs, bannedCompanies, pfRound
        );
        roundResults = result.results;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`[PF] Round ${pfRound} failed — error: ${errMsg}`);
        pfAborted = true;
        break;
      }

      // Deduplicate
      for (const r of roundResults) {
        if (!seenUrls.has(r.job_url)) {
          seenUrls.add(r.job_url);
          allResults.push(r);
        }
      }

      console.log(`[PF] Round ${pfRound} results: ${roundResults.length} (total unique: ${allResults.length})`);

      // Check stop condition
      const highScoreCount = allResults.filter((r) => r.match_score >= threshold).length;
      if (highScoreCount >= STOP_COUNT) {
        console.log(`[PF] Stopping early — ${highScoreCount} jobs with score >= ${threshold} (round ${pfRound})`);
        break;
      }
    }

    // Sort final results
    allResults.sort((a, b) => {
      if (a.domain_verified !== b.domain_verified) return a.domain_verified ? -1 : 1;
      return b.posted_at_ms - a.posted_at_ms;
    });

    console.log(`[PF] Total unique results: ${allResults.length}`);

    // Deduct balance (1 search + 1 PF)
    if (!isAdmin) {
      try {
        await dataClient.from("profiles").update({
          search_balance: (profile.search_balance ?? 3) - 1,
          persistent_finder_balance: (profile.persistent_finder_balance ?? 0) - 1,
        }).eq("id", user.id);
      } catch {}
    }

    // Save & return
    if (allResults.length > 0) {
      const rows = allResults.map((r) => ({
        user_id: r.user_id,
        search_id: r.search_id,
        profile_id: profile_id ?? null,
        job_title: r.job_title,
        company: r.company,
        location: r.location,
        estimated_salary: r.estimated_salary,
        match_score: r.match_score,
        match_summary: r.match_summary,
        job_url: r.job_url,
        full_spec: r.full_spec,
        search_query: r.search_query,
        domain_verified: r.domain_verified,
        domain_unverified_reason: r.domain_unverified_reason,
        posted_at: r.posted_at,
      }));

      const { data: saved } = await dataClient.from("job_results").insert(rows).select("id, job_title, company, location, estimated_salary, match_score, match_summary, job_url, full_spec, domain_verified, domain_unverified_reason, posted_at, created_at");
      const pfMessage = pfAborted
        ? `Search stopped early due to high demand — showing ${allResults.length} result${allResults.length === 1 ? "" : "s"} found so far`
        : undefined;
      return NextResponse.json({
        results: (saved ?? allResults).map(normalize),
        pf_mode: true,
        pf_rounds: pfRound,
        ...(pfMessage ? { message: pfMessage } : {}),
      });
    }

    const noResultsMessage = pfAborted
      ? "Search stopped early due to high demand — no results were found. Try again later."
      : "Persistent Finder completed but found no matches. Try different profile keywords.";
    return NextResponse.json({ results: [], code: "PF_NO_RESULTS", message: noResultsMessage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("[SEARCH] Unhandled error:", msg);
    return NextResponse.json({ results: [], code: "GENERIC_ERROR", message: "Something went wrong. Please try again." });
  }
}
