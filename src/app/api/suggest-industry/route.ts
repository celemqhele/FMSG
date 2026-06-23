import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SYSTEM_PROMPT = `Based on the given job titles, determine the single most likely industry the candidate works in.

Rules:
- Return one concise word or short phrase (e.g. "Fintech", "Healthcare", "SaaS", "E-commerce", "Construction", "Education", "Logistics").
- Do NOT include the job titles in your response. Just the industry.
- If unclear, use the most specific industry that fits.

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

    const body = await request.json();
    const { job_titles } = body;
    if (!job_titles || !Array.isArray(job_titles) || job_titles.length === 0) {
      return NextResponse.json({ error: "job_titles array required" }, { status: 400 });
    }

    const titles = job_titles.filter((t: string) => t.trim());
    if (titles.length === 0) {
      return NextResponse.json({ error: "At least one job title is required" }, { status: 400 });
    }

    const content = await callAIWithFallback(
      SYSTEM_PROMPT,
      `Job titles: ${JSON.stringify(titles)}`,
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
