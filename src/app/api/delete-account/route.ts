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
  const { data: profile } = await supabase.from("profiles").select("cv_file_path").eq("id", userId).single();
  if (profile?.cv_file_path) {
    await supabase.storage.from("cv-files").remove([profile.cv_file_path]);
  }

  // 2. Delete from all tables
  const tables = ["profiles", "job_results", "subscriptions", "error_logs"];
  for (const table of tables) {
    await supabase.from(table).delete().eq("user_id", userId);
  }

  // 3. Delete auth user (admin API)
  const { error: deleteErr } = await supabase.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
