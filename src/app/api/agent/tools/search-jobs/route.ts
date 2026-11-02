import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { searchGoogleJobs } from "@/lib/serpapi";

/**
 * FMSG Agents — job discovery tool.
 *
 * Authenticated bridge between the desktop agent and the same Google Jobs
 * source the website uses. Returns lightweight, normalised postings (title,
 * employer, location, best apply URL, short description) — the agent then opens
 * the real posting in a visible browser and reads it itself.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

interface NormalisedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  postedAt?: string;
  salary?: string;
  description: string;
}

function pickApplyUrl(job: {
  link?: string;
  apply_options?: { link: string; title: string }[];
  job_highlights?: { link?: string };
}): string {
  const options = job.apply_options ?? [];
  const direct = options.find((o) => /company|career|apply/i.test(o.title));
  return (
    direct?.link ||
    options[0]?.link ||
    job.link ||
    job.job_highlights?.link ||
    ""
  );
}

function formatSalary(min?: number, max?: number): string | undefined {
  if (!min && !max) return undefined;
  const fmt = (n: number) =>
    `R${Math.round(n / 1000).toLocaleString("en-ZA")}k`;
  if (min && max) return `${fmt(min)} – ${fmt(max)} p.a.`;
  return `${fmt((min || max)!)} p.a.`;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "")
    .trim();

  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Job search is not configured." },
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(authHeader);

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rl = checkRateLimit(`agent-jobs:${user.id}`, "agent-tools");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many searches at once. Pausing for a moment." },
      { status: 429 }
    );
  }

  let body: { query?: string; location?: string; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const query = (body?.query ?? "").trim().slice(0, 200);
  const location = (body?.location ?? "").trim().slice(0, 120);
  const limit = Math.min(Math.max(body?.limit ?? 20, 1), 40);

  if (query.length < 2) {
    return NextResponse.json({ error: "A search query is required." }, { status: 400 });
  }

  try {
    const results = await searchGoogleJobs({
      q: query,
      location: location || undefined,
      gl: "za",
      hl: "en",
    });

    const seen = new Set<string>();
    const jobs: NormalisedJob[] = [];

    for (const job of results) {
      const url = pickApplyUrl(job);
      if (!url || seen.has(url)) continue;
      seen.add(url);

      jobs.push({
        id: `job_${jobs.length + 1}`,
        title: job.title || "Untitled role",
        company: job.company_name || "Unknown employer",
        location: job.location || location || "South Africa",
        url,
        source: job.via || job.spec_source || "Google Jobs",
        postedAt: job.posted_at,
        salary: formatSalary(job.salary_min, job.salary_max),
        description: (job.description ?? "").slice(0, 1200),
      });

      if (jobs.length >= limit) break;
    }

    return NextResponse.json({ ok: true, query, location, jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[AGENT-JOBS] search failed:", message.slice(0, 200));
    return NextResponse.json(
      { error: "Job search is temporarily unavailable. The agent will retry." },
      { status: 502 }
    );
  }
}
