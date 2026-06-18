import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

const PLAN_LIMITS: Record<string, { searches: number; cv_gens: number }> = {
  Free: { searches: 3, cv_gens: 1 },
  Seeker: { searches: 25, cv_gens: 5 },
  Hunter: { searches: 70, cv_gens: 15 },
  Pro: { searches: 200, cv_gens: -1 },
};

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

  const { reference, plan, billing_cycle } = await request.json();
  if (!reference || !plan || !billing_cycle) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Verify with Paystack
  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  try {
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });

    if (!paystackRes.ok) {
      return NextResponse.json({ error: "Verification failed" }, { status: 402 });
    }

    const paystackData = await paystackRes.json();

    if (paystackData.data.status !== "success") {
      return NextResponse.json({ error: "Payment not successful" }, { status: 402 });
    }

    // Calculate expiry
    const now = new Date();
    const expiryDate = new Date(now);
    if (billing_cycle === "annual") {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    }

    // Insert subscription record
    const { error: subErr } = await supabase.from("subscriptions").insert({
      user_id: user.id,
      plan,
      billing_cycle,
      paystack_reference: reference,
      amount: paystackData.data.amount,
      start_date: now.toISOString(),
      expiry_date: expiryDate.toISOString(),
      status: "active",
    });

    if (subErr) {
      return NextResponse.json({ error: "Failed to record subscription" }, { status: 500 });
    }

    // Update profile
    const limits = PLAN_LIMITS[plan] ?? { searches: 3, cv_gens: 1 };
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        plan: plan.toLowerCase(),
        plan_expiry: expiryDate.toISOString(),
        search_balance: limits.searches,
        cv_generation_balance: limits.cv_gens,
      })
      .eq("id", user.id);

    if (profileErr) {
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, plan: plan.toLowerCase(), balance: limits });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
