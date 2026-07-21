// New API route: /api/get-job-results/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const jobId = request.nextUrl.searchParams.get("job_id");

  if (!jobId) {
    return NextResponse.json({ error: "No job_id provided" }, { status: 400 });
  }

  const { data: job, error: jobErr } = await supabase
    .from("job_extractions")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
