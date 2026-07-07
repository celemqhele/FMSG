import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGoogleJobs, type SerpJob } from "@/lib/serpapi";
import { callAIWithFallback } from "@/lib/gemini";
import { StreamWriter, type SearchEvent } from "@/lib/search-stream";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkVPN } from "@/lib/vpn-detect";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const JINA_API = process.env.JINA_API;

const BLACKLISTED_DOMAINS = [
  "bebee.com", "jobleads.com", "jobleads.co.za", "jobleads.co.uk",
  "jobleads.sg", "jobleads.ae", "jobleads.fr", "jobleads.it",
  "talent.com", "talent.co.za", "talent.co.uk", "talent.ca", "talent.au",
  "joub.co.za",
];

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return null; }
}

function decodeGoogleRedirect(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("google")) {
      for (const param of ["q", "url", "adurl", "dest", "continue", "redirect"]) {
        const val = u.searchParams.get(param);
        if (val && (val.startsWith("http://") || val.startsWith("https://"))) return val;
      }
    }
  } catch {}
  return url;
}

function buildJobUrl(job: { apply_options?: { link: string }[]; job_highlights?: { link?: string }; link?: string; title: string; company_name: string }): string {
  const tryDecode = (u: string) => decodeGoogleRedirect(u);
  if (job.apply_options?.[0]?.link) return tryDecode(job.apply_options[0].link);
  if (job.job_highlights?.link) return tryDecode(job.job_highlights.link);
  if (job.link) return tryDecode(job.link);
  return `https://www.google.com/search?q=${encodeURIComponent(`${job.title} ${job.company_name} apply`)}`;
}

function extractEstimatedSalary(job: any): string {
  return job.detected_extensions?.salary ?? job.salary ?? "";
}

function getIP(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "127.0.0.1";
}

async function fetchJinaPage(url: string): Promise<string> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "X-Return-Format": "markdown",
    "X-Remove-Images": "true",
  };
  if (JINA_API) headers["Authorization"] = `Bearer ${JINA_API}`;

  const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers });
  if (!res.ok) return "";

  try {
    const json = await res.json();
    if (json.code === 200 && json.data?.content) return json.data.content.trim();
  } catch {}
  return "";
}

function sanitiseForJson(s: string | undefined | null): string {
  return (s ?? "").replace(/["\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
}

function isBlacklistedByDomain(url: string): boolean {
  const domain = extractDomain(url);
  if (!domain) return false;
  return BLACKLISTED_DOMAINS.some(d => {
    return domain === d || domain.endsWith("." + d);
  });
}

async function scoreJob(
  stream: StreamWriter,
  job: any,
  query: string,
  index: number,
  total: number,
): Promise<any> {
  const url = buildJobUrl(job);
  const title = sanitiseForJson(job.title);
  const company = sanitiseForJson(job.company_name);
  const location = sanitiseForJson(job.location);
  const salary = extractEstimatedSalary(job);

  stream.send({ type: "analyzing_job", title, company, current: index + 1, total, progress: 40 + Math.round((index / Math.max(total, 1)) * 40) });

  let fullSpec = "";
  try {
    const jinaContent = await fetchJinaPage(url);
    fullSpec = jinaContent.slice(0, 6000);
  } catch {}

  let scoreResult = { score: 50, summary: "", verdict_bullets: null as any, knockout_fail: null as boolean | null, pillar_scores: null as any, taxes_applied: [] as string[], total_questions_asked: null as number | null, yes_answers: null as number | null, recruiter_verdict: null as string | null };

  try {
    const prompt = `You are an AI job matcher. Evaluate this job listing against a candidate searching for: "${query}".

Job Title: ${title}
Company: ${company}
Location: ${location}
Salary: ${salary}

Full Job Description:
${fullSpec || "(no description available)"}

Return a JSON object with:
{
  "score": number (0-100, how well this job matches the search query),
  "summary": "1-2 sentence summary of why this job matches",
  "knockout_fail": boolean or null (true if job clearly doesn't match the query at all),
  "pillar_scores": { "industry": number 0-100, "function": number 0-100, "scale": number 0-100, "tools": number 0-100, "location": number 0-100 },
  "taxes_applied": [],
  "total_questions_asked": 5,
  "yes_answers": 3,
  "recruiter_verdict": "short verdict string",
  "verdict_bullets": { "industry": "industry fit summary", "function": "function fit summary", "competition": "competition note" }
}`;

    const raw = await callAIWithFallback(
      "You are a professional job matching AI. Be honest and accurate. Return valid JSON only.",
      prompt,
      "guest-scoring",
      { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 2048 },
    );

    const parsed = JSON.parse(raw);
    scoreResult = {
      score: typeof parsed.score === "number" ? parsed.score : 50,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      verdict_bullets: parsed.verdict_bullets ?? null,
      knockout_fail: typeof parsed.knockout_fail === "boolean" ? parsed.knockout_fail : null,
      pillar_scores: parsed.pillar_scores ?? null,
      taxes_applied: Array.isArray(parsed.taxes_applied) ? parsed.taxes_applied : [],
      total_questions_asked: typeof parsed.total_questions_asked === "number" ? parsed.total_questions_asked : null,
      yes_answers: typeof parsed.yes_answers === "number" ? parsed.yes_answers : null,
      recruiter_verdict: typeof parsed.recruiter_verdict === "string" ? parsed.recruiter_verdict : null,
    };
  } catch (err) {
    console.error("[GUEST] AI scoring failed:", err);
  }

  return {
    id: crypto.randomUUID(),
    job_title: title,
    company,
    location,
    estimated_salary: salary,
    match_score: scoreResult.score,
    match_summary: scoreResult.summary,
    verdict_bullets: scoreResult.verdict_bullets,
    job_url: url,
    full_description: fullSpec,
    knock_out_fail: scoreResult.knockout_fail,
    pillar_scores: scoreResult.pillar_scores,
    taxes_applied: scoreResult.taxes_applied,
    total_questions_asked: scoreResult.total_questions_asked,
    yes_answers: scoreResult.yes_answers,
    recruiter_verdict: scoreResult.recruiter_verdict,
  };
}

export async function POST(request: NextRequest) {
  const ip = getIP(request);

  const { allowed, remaining } = checkRateLimit(`guest-search:${ip}`, "guest_search");
  if (!allowed) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "One free search per day. Try again tomorrow." }, { status: 429 });
  }

  const vpn = await checkVPN(ip);
  if (vpn.isSuspicious) {
    return NextResponse.json({ code: "VPN_DETECTED", message: "VPN or proxy detected. Disable it to use the free search." }, { status: 403 });
  }

  let cookieId = request.cookies.get("fmsg-guest")?.value;
  if (!cookieId) {
    cookieId = crypto.randomUUID();
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: existing } = await supabase
    .from("guest_searches")
    .select("id")
    .or(`ip.eq.${ip},cookie_id.eq.${cookieId}`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const headers = new Headers();
    headers.set("Set-Cookie", `fmsg-guest=${cookieId}; Path=/; Max-Age=86400; SameSite=Lax`);
    return NextResponse.json({ code: "GUEST_LIMIT", free_search_used: true, message: "You've used your free search. Sign up for more." }, { status: 403, headers });
  }

  const body = await request.json();
  const { query } = body;
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 });
  }

  const q = query.trim();

  const stream = new ReadableStream({
    async start(controller) {
      const writer = new StreamWriter(controller);

      try {
        writer.send({ type: "found_results", count: 0, progress: 10 });

        let rawJobs: SerpJob[] = [];
        try {
          rawJobs = await searchGoogleJobs({ q, hl: "en", gl: "za" });
        } catch (err) {
          console.error("[GUEST] SerpAPI error:", err);
          writer.send({ type: "error", code: "SEARCH_FAILED", message: "Search service unavailable. Try again later.", progress: 0 });
          writer.close();
          return;
        }

        if (!rawJobs || rawJobs.length === 0) {
          writer.send({ type: "complete", results: [], progress: 100, message: "No jobs found for your search. Try a different query." });
          writer.close();
          await supabase.from("guest_searches").insert({ ip, cookie_id: cookieId });
          return;
        }

        const filtered = rawJobs.filter((j: any) => {
          const url = buildJobUrl(j);
          return !isBlacklistedByDomain(url);
        });

        writer.send({ type: "found_results", count: filtered.length, progress: 20 });

        const MAX_JOBS = 10;
        const toScore = filtered.slice(0, MAX_JOBS);

        for (let i = 0; i < toScore.length; i++) {
          writer.send({ type: "screening_job", current: i + 1, total: toScore.length, progress: 30 + Math.round((i / toScore.length) * 15) });
        }

        const scored: any[] = [];
        for (let i = 0; i < toScore.length; i++) {
          const result = await scoreJob(writer, toScore[i], q, i, toScore.length);
          scored.push(result);
        }

        scored.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
        const top3 = scored.slice(0, 3);

        writer.send({ type: "almost_done", progress: 95 });

        await supabase.from("guest_searches").insert({ ip, cookie_id: cookieId });

        writer.send({ type: "complete", results: top3, progress: 100 });
        writer.close();
      } catch (err) {
        console.error("[GUEST] Stream error:", err);
        try { writer.send({ type: "error", code: "INTERNAL", message: "Something went wrong. Please try again.", progress: 0 }); } catch {}
        writer.close();
      }
    },
  });

  const headers = new Headers();
  headers.set("Content-Type", "text/plain");
  headers.set("Set-Cookie", `fmsg-guest=${cookieId}; Path=/; Max-Age=86400; SameSite=Lax`);

  return new Response(stream, { headers });
}
