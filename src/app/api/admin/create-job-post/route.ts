import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scrapeJobPage } from "@/lib/serpapi";
import { callAIWithFallback } from "@/lib/gemini";
import { validateScrapeUrlWithDns } from "@/lib/url-validation";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

const PARAPHRASE_PROMPT = `You are a job posting editor for a South African job matching platform.

Reformat this job listing into the structure below. Be concise and professional.
If salary is not mentioned, use "Market-related salary based on company size and industry benchmarks."

STRUCTURE:

[Company] is looking for a [Role] for their [Team/Department if mentioned].

[2-3 sentence paragraph describing the role's impact and day-to-day responsibilities.]

Requirements
- [List every mandatory requirement from the original spec, one per line]

Preferences
- [List nice-to-have/preferred qualifications, one per line]

Salary
[Salary package if mentioned, otherwise market range fallback]

RULES:
- Do NOT fabricate requirements not in the original spec
- If a section is missing info in the original, write "Details will be shared during the interview process"
- Use clear, plain English — no jargon
- Keep bullet points concise (one line each)`;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

async function verifyAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) return false;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user } } = await supabase.auth.getUser(authHeader);
  if (!user || user.email !== ADMIN_EMAIL) return false;
  return true;
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  if (body.action === "publish" && body.job) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const job = body.job;
    const slug = slugify(`${job.company}-${job.job_title}`);

    const { error } = await supabase.from("public_jobs").insert({
      slug,
      job_title: job.job_title,
      company: job.company,
      location: job.location || "",
      estimated_salary: job.estimated_salary || "",
      snippet: job.snippet || "",
      full_description: job.full_description || "",
      paraphrased_description: job.paraphrased_description || "",
      apply_url: job.apply_url,
      source: job.source || "",
      is_active: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ slug, url: `/jobs/${slug}` });
  }

  if (body.url) {
    const urlCheck = await validateScrapeUrlWithDns(body.url);
    if (!urlCheck.ok) {
      return NextResponse.json({ error: `Invalid URL: ${urlCheck.reason}` }, { status: 422 });
    }

    const jinaKey = process.env.JINA_API || null;
    const scraped = await scrapeJobPage(body.url, jinaKey);

    if (!scraped) {
      return NextResponse.json({ error: "Failed to scrape job page. The URL may be invalid or the page could not be read." }, { status: 422 });
    }

    const aiResult = await callAIWithFallback(
      PARAPHRASE_PROMPT,
      scraped.description || "",
      "paraphrase-job-post",
      { temperature: 0.3, maxOutputTokens: 2048 }
    );

    const sourceHost = (() => {
      try { return new URL(body.url).hostname.replace(/^www\./, ""); } catch { return ""; }
    })();

    return NextResponse.json({
      job_title: scraped.title || "",
      company: scraped.company_name || "",
      location: scraped.location || "",
      estimated_salary: "",
      snippet: (scraped.description || "").slice(0, 200),
      full_description: scraped.description || "",
      paraphrased_description: aiResult,
      apply_url: body.url,
      source: sourceHost,
    });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
