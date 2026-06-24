import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();

  const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // 1. Delete CV file from Storage
  const { data: profile, error: profErr } = await supabase.from("profiles").select("cv_file_path").eq("id", userId).single();
  if (profErr) {
    return NextResponse.json({ error: "Failed to fetch profile." }, { status: 500 });
  }
  if (profile?.cv_file_path) {
    const { error: storageErr } = await supabase.storage.from("cv-files").remove([profile.cv_file_path]);
    if (storageErr) {
      console.error("[DELETE-ACCOUNT] Failed to remove CV file:", storageErr.message);
    }
  }

  // 2. Delete from all tables
  const tables = ["profiles", "job_results", "subscriptions", "error_logs", "saved_jobs", "search_profiles", "rejected_jobs"];
  for (const table of tables) {
    const { error: delErr } = await supabase.from(table).delete().eq("user_id", userId);
    if (delErr) {
      console.error(`[DELETE-ACCOUNT] Failed to delete from ${table}:`, delErr.message);
    }
  }

  // 3. Delete auth user (admin API)
  const { error: deleteErr } = await supabase.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
