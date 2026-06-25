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

  // Get active subscription with a valid authorization
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

  if (!sub.customer_code && !sub.email) {
    return NextResponse.json({ error: "No payment method on file for this account." }, { status: 400 });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  // Initialize a small transaction to collect new card details.
  // Paystack returns an authorization_url where the user enters their new card.
  // On successful payment, the webhook updates the subscription's authorization_code.
  try {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: sub.email,
        amount: 100, // R1 (minimum charge to tokenize card)
        currency: "ZAR",
        metadata: {
          purpose: "card_update",
          user_id: user.id,
        },
        channels: ["card"],
      }),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};

    if (data.status && data.data?.authorization_url) {
      return NextResponse.json({ link: data.data.authorization_url });
    }

    console.error("[UPDATE_PAYMENT] Initialize failed:", text || "(empty body)");
    return NextResponse.json({
      error: "Unable to generate update link. Payment provider returned an error. Try again or contact support.",
    }, { status: 500 });
  } catch (err) {
    console.error("[UPDATE_PAYMENT] Error:", err);
    return NextResponse.json({ error: "Failed to generate update link. Try again or contact support." }, { status: 500 });
  }
}
