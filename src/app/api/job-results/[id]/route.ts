import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    // Get the job result to know which company/job URL to ban
    const { data: job, error: jobErr } = await supabase
      .from("job_results")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: jobErr?.message || "Job result not found." }, { status: jobErr ? 500 : 404 });
    }

    if (body.ban_company) {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("banned_companies")
        .eq("id", user.id)
        .single();

      if (profErr) {
        return NextResponse.json({ error: "Failed to fetch profile." }, { status: 500 });
      }

      const existing = prof?.banned_companies ?? [];
      if (!existing.includes(job.company)) {
        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ banned_companies: [...existing, job.company] })
          .eq("id", user.id);

        if (updateErr) {
          return NextResponse.json({ error: "Failed to ban company." }, { status: 500 });
        }
      }
    }

    if (body.ban_job) {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("banned_jobs")
        .eq("id", user.id)
        .single();

      if (profErr) {
        return NextResponse.json({ error: "Failed to fetch profile." }, { status: 500 });
      }

      const existing = prof?.banned_jobs ?? [];
      if (!existing.includes(job.job_url)) {
        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ banned_jobs: [...existing, job.job_url] })
          .eq("id", user.id);

        if (updateErr) {
          return NextResponse.json({ error: "Failed to ban job." }, { status: 500 });
        }
      }
    }

    // Mark as deleted
    const { error: deleteErr } = await supabase
      .from("job_results")
      .update({ is_deleted: true })
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteErr) {
      return NextResponse.json({ error: "Failed to mark job as deleted." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
