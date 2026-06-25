import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

const PLAN_CODE_MAP: Record<string, string> = {
  Seeker_monthly: process.env.NEXT_PUBLIC_PLAN_CODE_SEEKER_MONTHLY ?? "",
  Seeker_annual: process.env.NEXT_PUBLIC_PLAN_CODE_SEEKER_ANNUAL ?? "",
  Hunter_monthly: process.env.NEXT_PUBLIC_PLAN_CODE_HUNTER_MONTHLY ?? "",
  Hunter_annual: process.env.NEXT_PUBLIC_PLAN_CODE_HUNTER_ANNUAL ?? "",
  Pro_monthly: process.env.NEXT_PUBLIC_PLAN_CODE_PRO_MONTHLY ?? "",
  Pro_annual: process.env.NEXT_PUBLIC_PLAN_CODE_PRO_ANNUAL ?? "",
};

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { plans: PLAN_CODE_MAP },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } }
  );
}
