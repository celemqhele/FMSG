import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateIndustryLadder } from "@/lib/career-ladders";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const industry = body?.industry?.trim();
    if (!industry) {
      return NextResponse.json({ error: "industry is required." }, { status: 400 });
    }

    const jobTitles: string[] | undefined = Array.isArray(body?.job_titles)
      ? body.job_titles.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
      : undefined;

    const steps = await generateIndustryLadder(industry, jobTitles);

    return NextResponse.json({
      steps: [
        { step: 1, value: steps.step_1, taxonomy_id: steps.step_1_taxonomy_id },
        { step: 2, value: steps.step_2, taxonomy_id: steps.step_2_taxonomy_id },
        { step: 3, value: steps.step_3, taxonomy_id: steps.step_3_taxonomy_id },
        { step: 4, value: steps.step_4, taxonomy_id: steps.step_4_taxonomy_id },
        { step: 5, value: steps.step_5, taxonomy_id: steps.step_5_taxonomy_id },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
