import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logError } from "@/lib/debug";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      console.error("[HISTORY] Save request auth failed:", authErr?.message ?? "no user");
      logError(null, "HISTORY_SAVE_AUTH_FAIL", authErr?.message ?? "no user");
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const { job_title, company, location, estimated_salary, match_score, match_summary, job_url, full_spec, profile_id } = body;

    if (!job_url) {
      return NextResponse.json({ error: "job_url is required." }, { status: 400 });
    }

    console.log(`[HISTORY] Save request: user=${user.id} job="${job_title}" company="${company}" url="${job_url}"`);

    // Check for duplicate save
    const { data: existing } = await supabase
      .from("saved_jobs")
      .select("id")
      .eq("user_id", user.id)
      .eq("job_url", job_url)
      .maybeSingle();

    if (existing) {
      console.log(`[HISTORY] Job already saved: id=${existing.id}`);
      return NextResponse.json({ success: true, id: existing.id, already_saved: true });
    }

    const { data, error } = await supabase
      .from("saved_jobs")
      .insert({
        user_id: user.id,
        profile_id: profile_id ?? null,
        job_title: job_title ?? "",
        company: company ?? "",
        location: location ?? "",
        estimated_salary: estimated_salary ?? null,
        match_score: match_score ?? null,
        match_summary: match_summary ?? "",
        job_url,
        full_spec: full_spec ?? "",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[HISTORY] Failed to save job:", error.message);
      logError(user.id, "HISTORY_SAVE_FAIL", `${job_url}: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[HISTORY] Job saved: id=${data.id} "${job_title}" at "${company}"`);
    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[HISTORY] Unhandled error in save:", msg);
    logError(null, "HISTORY_SAVE_UNCAUGHT", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
