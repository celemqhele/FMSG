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

    // Try job_results first, then saved_jobs
    let { data: job, error: jobErr } = await supabase
      .from("job_results")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    let isSavedJob = false;
    let useBodyFallback = false;
    if (!job) {
      // Try saved_jobs
      const { data: savedJob, error: savedErr } = await supabase
        .from("saved_jobs")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (savedJob) {
        // Found in saved_jobs — remove it from saved list
        await supabase.from("saved_jobs").delete().eq("id", id).eq("user_id", user.id);

        // Try to find corresponding job_results entry by URL for deeper banning
        const { data: matchingJob } = await supabase
          .from("job_results")
          .select("*")
          .eq("job_url", savedJob.job_url)
          .eq("user_id", user.id)
          .maybeSingle();

        if (matchingJob) {
          job = matchingJob;
        } else {
          // Build a minimal job-like object from saved_jobs data
          job = {
            company: savedJob.company,
            job_url: savedJob.job_url,
            job_title: savedJob.job_title,
          };
        }
        isSavedJob = true;
      } else if (body.job_url || body.company) {
        // UUID not in DB — use job_url / company from request body for ban actions
        job = {
          company: body.company || "Unknown",
          job_url: body.job_url || "",
          job_title: "",
        };
        useBodyFallback = true;
      } else if (savedErr) {
        return NextResponse.json({ error: savedErr.message }, { status: 500 });
      } else {
        return NextResponse.json({ error: "Job not found." }, { status: 404 });
      }
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

    // Mark job_results as deleted (if it exists as a job_results entry)
    if (!isSavedJob) {
      if (useBodyFallback) {
        // Try finding the row by job_url since UUID didn't match
        const { data: urlMatch } = await supabase
          .from("job_results")
          .select("id")
          .eq("job_url", body.job_url)
          .eq("user_id", user.id)
          .maybeSingle();
        if (urlMatch) {
          const { error: deleteErr } = await supabase
            .from("job_results")
            .update({ is_deleted: true })
            .eq("id", urlMatch.id)
            .eq("user_id", user.id);
          if (deleteErr) {
            console.error("Failed to mark job as deleted by URL:", deleteErr.message);
          }
        }
      } else {
        const { error: deleteErr } = await supabase
          .from("job_results")
          .update({ is_deleted: true })
          .eq("id", id)
          .eq("user_id", user.id);

        if (deleteErr) {
          return NextResponse.json({ error: "Failed to mark job as deleted." }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
