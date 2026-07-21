import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logError } from "@/lib/debug";
import { checkRateLimit } from "@/lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      console.error("[HISTORY] Hide request missing Authorization header");
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) {
      console.error("[HISTORY] Hide request auth failed:", authErr?.message ?? "no user");
      logError(null, "HISTORY_AUTH_FAIL", authErr?.message ?? "no user");
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const rl = checkRateLimit(`job-results:${user.id}`, "job-results");
    if (!rl.allowed) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: `Too many requests. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.` },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const profileId = body.profile_id ?? null;
    console.log(`[HISTORY] Hide request: user=${user.id} job_id=${id} ban_job=${!!body.ban_job} ban_company=${!!body.ban_company}`);

    // Try job_results first, then saved_jobs
    let query = supabase
      .from("job_results")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id);
    if (profileId) query = query.eq("profile_id", profileId);
    let { data: job, error: jobErr } = await query.maybeSingle();

    if (jobErr) {
      console.error("[HISTORY] Job lookup error in job_results:", jobErr.message);
    }

    let isSavedJob = false;
    let useBodyFallback = false;
    if (!job) {
      // Try saved_jobs
      let savedQuery = supabase
        .from("saved_jobs")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id);
      if (profileId) savedQuery = savedQuery.eq("profile_id", profileId);
      const { data: savedJob, error: savedErr } = await savedQuery.maybeSingle();

      if (savedErr) {
        console.error("[HISTORY] Job lookup error in saved_jobs:", savedErr.message);
      }

      if (savedJob) {
        console.log(`[HISTORY] Job found in saved_jobs: "${savedJob.job_title}" at "${savedJob.company}"`);
        // Found in saved_jobs — remove it from saved list
        let deleteQuery = supabase.from("saved_jobs").delete().eq("id", id).eq("user_id", user.id);
        if (profileId) deleteQuery = deleteQuery.eq("profile_id", profileId);
        const { error: delSavedErr } = await deleteQuery;
        if (delSavedErr) {
          console.error("[HISTORY] Failed to delete from saved_jobs:", delSavedErr.message);
          logError(user.id, "HISTORY_DEL_SAVED_FAIL", delSavedErr.message);
        }

        // Try to find corresponding job_results entry by URL for deeper banning
        let matchingQuery = supabase
          .from("job_results")
          .select("*")
          .eq("job_url", savedJob.job_url)
          .eq("user_id", user.id);
        if (profileId) matchingQuery = matchingQuery.eq("profile_id", profileId);
        const { data: matchingJob } = await matchingQuery.maybeSingle();

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
        console.log(`[HISTORY] Job not in DB, using body fallback: company="${body.company}" url="${body.job_url}"`);
        // UUID not in DB — use job_url / company from request body for ban actions
        job = {
          company: body.company || "Unknown",
          job_url: body.job_url || "",
          job_title: "",
        };
        useBodyFallback = true;
      } else {
        console.error("[HISTORY] Job not found in job_results or saved_jobs, id:", id);
        if (savedErr) {
          return NextResponse.json({ error: savedErr.message }, { status: 500 });
        }
        return NextResponse.json({ error: "Job not found." }, { status: 404 });
      }
    } else {
      console.log(`[HISTORY] Job found in job_results: "${job.job_title}" at "${job.company}"`);
    }

    if (body.ban_company) {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("banned_companies")
        .eq("id", user.id)
        .single();

      if (profErr) {
        console.error("[HISTORY] Failed to fetch profile for ban_company:", profErr.message);
        logError(user.id, "HISTORY_BAN_COMPANY_FETCH_FAIL", profErr.message);
        return NextResponse.json({ error: "Failed to fetch profile." }, { status: 500 });
      }

      const existing = prof?.banned_companies ?? [];
      if (!existing.includes(job.company)) {
        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ banned_companies: [...existing, job.company] })
          .eq("id", user.id);

        if (updateErr) {
          console.error("[HISTORY] Failed to ban company:", job.company, updateErr.message);
          logError(user.id, "HISTORY_BAN_COMPANY_FAIL", `${job.company}: ${updateErr.message}`);
          return NextResponse.json({ error: "Failed to ban company." }, { status: 500 });
        }
        console.log(`[HISTORY] Banned company: "${job.company}"`);
      }
    }

    if (body.ban_job) {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("banned_jobs")
        .eq("id", user.id)
        .single();

      if (profErr) {
        console.error("[HISTORY] Failed to fetch profile for ban_job:", profErr.message);
        logError(user.id, "HISTORY_BAN_JOB_FETCH_FAIL", profErr.message);
        return NextResponse.json({ error: "Failed to fetch profile." }, { status: 500 });
      }

      const existing = prof?.banned_jobs ?? [];
      if (!existing.includes(job.job_url)) {
        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ banned_jobs: [...existing, job.job_url] })
          .eq("id", user.id);

        if (updateErr) {
          console.error("[HISTORY] Failed to ban job:", job.job_url, updateErr.message);
          logError(user.id, "HISTORY_BAN_JOB_FAIL", `${job.job_url}: ${updateErr.message}`);
          return NextResponse.json({ error: "Failed to ban job." }, { status: 500 });
        }
        console.log(`[HISTORY] Banned job URL: "${job.job_url}"`);
      }
    }

    // Mark job_results as deleted (if it exists as a job_results entry)
    if (!isSavedJob) {
      if (useBodyFallback) {
        // Try finding the row by job_url since UUID didn't match
        let urlQuery = supabase
          .from("job_results")
          .select("id")
          .eq("job_url", body.job_url)
          .eq("user_id", user.id);
        if (profileId) urlQuery = urlQuery.eq("profile_id", profileId);
        const { data: urlMatch } = await urlQuery.maybeSingle();
        if (urlMatch) {
          let deleteQuery = supabase
            .from("job_results")
            .update({ is_deleted: true })
            .eq("id", urlMatch.id)
            .eq("user_id", user.id);
          if (profileId) deleteQuery = deleteQuery.eq("profile_id", profileId);
          const { error: deleteErr } = await deleteQuery;
          if (deleteErr) {
            console.error("[HISTORY] Failed to soft-delete job by URL:", deleteErr.message);
            logError(user.id, "HISTORY_SOFT_DEL_URL_FAIL", deleteErr.message);
          }
        }
      } else {
        let deleteQuery = supabase
          .from("job_results")
          .update({ is_deleted: true })
          .eq("id", id)
          .eq("user_id", user.id);
        if (profileId) deleteQuery = deleteQuery.eq("profile_id", profileId);
        const { error: deleteErr } = await deleteQuery;

        if (deleteErr) {
          console.error("[HISTORY] Failed to soft-delete job:", deleteErr.message);
          logError(user.id, "HISTORY_SOFT_DEL_FAIL", deleteErr.message);
          return NextResponse.json({ error: "Failed to mark job as deleted." }, { status: 500 });
        }
      }
    }

    console.log(`[HISTORY] Hide complete: job_id=${id} source=${isSavedJob ? "saved_jobs" : useBodyFallback ? "body_fallback" : "job_results"}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[HISTORY] Unhandled error in DELETE:", msg);
    logError(null, "HISTORY_DELETE_UNCAUGHT", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
