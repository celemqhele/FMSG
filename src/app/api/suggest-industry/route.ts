import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SYSTEM_PROMPT = `Determine the single most likely industry the candidate works in by reading their CV.

CRITICAL: Industry is where the candidate's EMPLOYERS/COMPANIES operate, not what their job title or tools suggest.
- "Customer Success Manager" at a datacenter company (Vertiv) = Critical Digital Infrastructure, NOT SaaS.
- "Digital marketer" at Superbalist = E-commerce, NOT SaaS.
- "Backend engineer" at a bank = FinTech, NOT Cloud Services.
Look at the actual business of the companies listed in the work history.

Rules:
- Return one concise label (e.g. "Fintech", "Healthcare", "E-commerce", "Construction", "Education", "Critical Digital Infrastructure", "Manufacturing", "Telecommunications", "Logistics").
- Do NOT include job titles or company names in your response. Just the industry.
- If the CV is ambiguous or has no clear employer context, use job titles as a secondary hint but still prefer employer context.

Return ONLY valid JSON (no markdown, no code fences):
{ "industry": string }`;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = checkRateLimit(`suggest-industry:${user.id}`, "general");
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await request.json();
    const { cv_text, job_titles } = body;

    let userContent: string;
    if (cv_text && typeof cv_text === "string" && cv_text.trim()) {
      userContent = `CV text:\n${cv_text.slice(0, 8000)}`;
    } else if (job_titles && Array.isArray(job_titles) && job_titles.length > 0) {
      const titles = job_titles.filter((t: string) => t.trim());
      if (titles.length === 0) {
        return NextResponse.json({ error: "At least one job title is required when no CV text provided" }, { status: 400 });
      }
      userContent = `Job titles (no CV text available; infer industry from titles as best you can): ${JSON.stringify(titles)}`;
    } else {
      return NextResponse.json({ error: "cv_text (string) or job_titles (array) required" }, { status: 400 });
    }

    const content = await callAIWithFallback(
      SYSTEM_PROMPT,
      userContent,
      "suggest industry",
      { responseMimeType: "application/json", temperature: 0.3 }
    );

    const cleaned = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({ industry: (parsed.industry ?? "").trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Suggest industry error:", msg);
    return NextResponse.json({ industry: "" });
  }
}
