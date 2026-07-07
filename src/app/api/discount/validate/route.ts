import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type");
  if (!type) {
    return NextResponse.json({ error: "Missing discount type" }, { status: 400 });
  }

  if (type === "first_order") {
    const { data: existing } = await supabase
      .from("discount_redemptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("discount_type", "50_percent_first_order")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ eligible: false, reason: "already_redeemed" });
    }

    return NextResponse.json({ eligible: true, discount_percent: 50 });
  }

  if (type === "reengagement_40") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.plan !== "free") {
      return NextResponse.json({ eligible: false, reason: "not_on_free_plan" });
    }

    const { data: fiftyOff } = await supabase
      .from("discount_redemptions")
      .select("redeemed_at")
      .eq("user_id", user.id)
      .eq("discount_type", "50_percent_first_order")
      .order("redeemed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!fiftyOff) {
      return NextResponse.json({ eligible: false, reason: "no_fifty_redemption" });
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    if (new Date(fiftyOff.redeemed_at) > ninetyDaysAgo) {
      return NextResponse.json({ eligible: false, reason: "less_than_90_days" });
    }

    const { data: fortyOff } = await supabase
      .from("discount_redemptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("discount_type", "40_percent_reengagement")
      .gt("redeemed_at", fiftyOff.redeemed_at)
      .maybeSingle();

    if (fortyOff) {
      return NextResponse.json({ eligible: false, reason: "already_reengaged" });
    }

    return NextResponse.json({ eligible: true, discount_percent: 40 });
  }

  return NextResponse.json({ eligible: false, reason: "unknown_type" });
}
