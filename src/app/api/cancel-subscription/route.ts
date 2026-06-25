import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();

  const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`cancel-sub:${user.id}`);
  if (!rl.allowed) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "Too many requests. Try again later." }, { status: 429 });
  }

  // Get active subscription
  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subErr) {
    return NextResponse.json({ error: "Failed to fetch subscription." }, { status: 500 });
  }

  if (!sub) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
  }

  // Optionally deactivate the authorization on Paystack to prevent unintended charges
  if (PAYSTACK_SECRET_KEY && sub.authorization_code) {
    try {
      await fetch("https://api.paystack.co/customer/authorization/deactivate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ authorization_code: sub.authorization_code }),
      });
      console.log("[CANCEL_SUB] Paystack authorization deactivated");
    } catch (err) {
      console.error("[CANCEL_SUB] Paystack deactivate error:", err);
    }
  }

  // Mark as cancelled in DB — user retains access until expiry_date
  const { error: updateErr } = await supabase
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", sub.id);

  if (updateErr) {
    console.error("[CANCEL_SUB] Failed to update subscription:", updateErr.message);
    return NextResponse.json({ error: "Failed to cancel subscription." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Subscription cancelled. You'll retain access until the current billing period ends." });
}
