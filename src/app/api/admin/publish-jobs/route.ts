import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";

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
  const jobs = body.jobs;

  if (!Array.isArray(jobs) || jobs.length === 0) {
    return NextResponse.json({ error: "Missing jobs array" }, { status: 400 });
  }

  if (jobs.length > 5) {
    return NextResponse.json({ error: "Maximum 5 jobs per batch" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const published: { slug: string; url: string; title: string }[] = [];

  for (const job of jobs) {
    try {
      const description = job.description || job.full_description || "";
      if (!description || description.length < 100) {
        continue;
      }

      const paraphrased = await callAIWithFallback(
        PARAPHRASE_PROMPT,
        description,
        `paraphrase-batch-${job.title}`,
        { temperature: 0.3, maxOutputTokens: 2048 }
      );

      const slug = slugify(`${job.company_name || job.company || "unknown"}-${job.title || job.job_title || "job"}`);

      const { error } = await supabase.from("public_jobs").insert({
        slug,
        job_title: job.title || job.job_title || "",
        company: job.company_name || job.company || "Unknown",
        location: job.location || "",
        estimated_salary: "",
        snippet: description.slice(0, 200),
        full_description: description,
        paraphrased_description: paraphrased,
        apply_url: job.link || job.apply_url || "",
        source: job.source || "",
        is_active: true,
      });

      if (!error) {
        published.push({
          slug,
          url: `/jobs/${slug}`,
          title: job.title || job.job_title || "",
        });
      }
    } catch (err) {
      console.error(`[PUBLISH-JOBS] Failed to process "${job.title}":`, err);
    }
  }

  return NextResponse.json({ published });
}
