import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { guest_history } = body;

  const { data: profile } = await supabase
    .from("profiles")
    .select("search_balance, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const isNewSignup = profile.created_at && new Date(profile.created_at) > fiveMinAgo;

  let newSearchBalance = profile.search_balance ?? 2;
  let migrated = 0;

  if (isNewSignup) {
    newSearchBalance += 1;
    await supabase.from("profiles").update({ search_balance: newSearchBalance }).eq("id", user.id);
  }

  if (Array.isArray(guest_history) && guest_history.length > 0) {
    const rows = [];
    for (const entry of guest_history) {
      if (!Array.isArray(entry.results)) continue;
      for (const job of entry.results) {
        rows.push({
          user_id: user.id,
          job_title: job.job_title ?? "",
          company: job.company ?? "",
          location: job.location ?? "",
          estimated_salary: job.estimated_salary ?? "",
          match_score: job.match_score ?? 0,
          match_summary: job.match_summary ?? "",
          verdict_bullets: job.verdict_bullets ?? null,
          job_url: job.job_url ?? "",
          full_description: job.full_description ?? "",
          full_spec: job.full_description ?? "",
          search_query: entry.query ?? "",
        });
      }
    }

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from("job_results").insert(rows);
      if (!insertErr) {
        migrated = rows.length;
      } else {
        console.error("[ONBOARD] History migration error:", insertErr.message);
      }
    }
  }

  return NextResponse.json({ ok: true, search_balance: newSearchBalance, migrated });
}
