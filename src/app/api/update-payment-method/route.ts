import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  // Generate a Paystack managed page for updating payment method
  try {
    let link = "";

    if (sub.paystack_subscription_id) {
      const res = await fetch("https://api.paystack.co/subscription/manage/link", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription: sub.paystack_subscription_id,
        }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (data.status && data.data?.link) {
        link = data.data.link;
      } else {
        console.error("[UPDATE_PAYMENT] Paystack manage/link failed:", text || "(empty body)");
      }
    }

    // Fallback: use customer code if subscription link failed or missing
    if (!link && sub.customer_code) {
      const custRes = await fetch(`https://api.paystack.co/customer/${sub.customer_code}/payment_method`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const custText = await custRes.text();
      const custData = custText ? JSON.parse(custText) : {};
      if (custData.status && custData.data?.link) {
        link = custData.data.link;
      } else {
        console.error("[UPDATE_PAYMENT] Customer payment_method failed:", custText || "(empty body)");
      }
    }

    if (link) {
      return NextResponse.json({ link });
    }

    const reason = sub.paystack_subscription_id
      ? "Payment provider returned an error."
      : "No subscription code on record.";
    return NextResponse.json({
      error: `Unable to generate update link. ${reason} Try again or contact support.`,
    }, { status: 500 });
  } catch (err) {
    console.error("[UPDATE_PAYMENT] Error:", err);
    return NextResponse.json({ error: "Failed to generate update link. Try again or contact support." }, { status: 500 });
  }
}
