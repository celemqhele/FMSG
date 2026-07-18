import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const DISCOUNT_CONFIG: Record<string, { percent: number; type: string }> = {
  first_order_85: { percent: 85, type: "first_order_85" },
  reengagement_40: { percent: 40, type: "reengagement_40" },
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) {
    return NextResponse.json({ eligible: false }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
  if (authErr || !user) {
    return NextResponse.json({ eligible: false }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type");
  if (!type || !DISCOUNT_CONFIG[type]) {
    return NextResponse.json({ eligible: false }, { status: 400 });
  }

  const config = DISCOUNT_CONFIG[type];

  if (config.type === "first_order_85") {
    const { data: existing, error: redeemErr } = await supabase
      .from("discount_redemptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("discount_type", "first_order_85")
      .limit(1);

    if (redeemErr) {
      console.error("[DISCOUNT] discount_redemptions query failed:", redeemErr.message);
      return NextResponse.json({ eligible: false, reason: "validation_error" });
    }

    if (existing && existing.length > 0) {
      return NextResponse.json({ eligible: false, reason: "already_redeemed" });
    }

    const { data: subs, error: subErr } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (subErr) {
      console.error("[DISCOUNT] subscriptions query failed:", subErr.message);
      return NextResponse.json({ eligible: false, reason: "validation_error" });
    }

    if (subs && subs.length > 0) {
      return NextResponse.json({ eligible: false, reason: "existing_subscription" });
    }

    return NextResponse.json({ eligible: true, discount_percent: config.percent });
  }

  if (config.type === "reengagement_40") {
    const { data: existing, error: redeemErr } = await supabase
      .from("discount_redemptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("discount_type", "reengagement_40")
      .limit(1);

    if (redeemErr) {
      console.error("[DISCOUNT] discount_redemptions query failed:", redeemErr.message);
      return NextResponse.json({ eligible: false, reason: "validation_error" });
    }

    if (existing && existing.length > 0) {
      return NextResponse.json({ eligible: false, reason: "already_redeemed" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("updated_at")
      .eq("id", user.id)
      .single();

    if (profile?.updated_at) {
      const lastActive = new Date(profile.updated_at);
      const now = new Date();
      const daysSince = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 90) {
        return NextResponse.json({ eligible: false, reason: "not_inactive_enough" });
      }
    }

    return NextResponse.json({ eligible: true, discount_percent: config.percent });
  }

  return NextResponse.json({ eligible: false });
}
