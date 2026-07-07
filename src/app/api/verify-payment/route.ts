import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatPlanPrice } from "@/lib/plan-limits";
import { sendSubscriptionConfirmation } from "@/lib/email";

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

  const rl = checkRateLimit(`verify-payment:${user.id}`);
  if (!rl.allowed) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "Too many requests. Try again later." }, { status: 429 });
  }

  const body = await request.json();
  const { reference, plan, billing_cycle } = body;
  if (!reference || !plan || !billing_cycle) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

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

    const txData = paystackData.data;
    const authorizationCode = txData.authorization?.authorization_code ?? "";
    const customerCode = txData.customer?.customer_code ?? "";
    const email = txData.customer?.email ?? "";

    if (!authorizationCode) {
      return NextResponse.json({ error: "No authorization code returned. Ensure card payment was used (not bank transfer)." }, { status: 400 });
    }

    // Calculate expiry
    const now = new Date();
    const expiryDate = new Date(now);
    let nextPaymentDate: Date | null = null;
    if (billing_cycle === "annual") {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      nextPaymentDate = new Date(expiryDate);
    } else if (billing_cycle === "once") {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      nextPaymentDate = null;
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      nextPaymentDate = new Date(expiryDate);
    }

    const limits = PLAN_LIMITS[plan] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };

    // Insert subscription record
    const { error: subErr } = await supabase.from("subscriptions").insert({
      user_id: user.id,
      plan,
      billing_cycle,
      paystack_reference: reference,
      amount: txData.amount,
      authorization_code: authorizationCode,
      customer_code: customerCode,
      email,
      start_date: now.toISOString(),
      expiry_date: expiryDate.toISOString(),
      next_payment_date: nextPaymentDate?.toISOString() ?? null,
      status: "active",
    });

    if (subErr) {
      console.error("[VERIFY] Subscription insert error:", subErr.message);
      return NextResponse.json({ error: "Failed to record subscription" }, { status: 500 });
    }

    // Determine pf_balance — metadata.pf_count is total PF (base + extra)
    const metadataPf = txData.metadata?.pf_count;
    const pfCount = (metadataPf != null && metadataPf > 0) ? metadataPf : limits.pf_balance;

    // Update profile (stack balances)
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        plan: plan.toLowerCase(),
        plan_expiry: expiryDate.toISOString(),
      })
      .eq("id", user.id);

    if (profileErr) {
      console.error("[VERIFY] Profile update error:", profileErr.message);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    const { error: stackErr } = await supabase.rpc("stack_plan_balances", {
      p_user_id: user.id,
      p_searches: limits.searches,
      p_cv_gens: limits.cv_gens,
      p_pf: pfCount,
    });

    if (stackErr) {
      console.error("[VERIFY] stack_plan_balances failed:", stackErr);
    }

    // Set pf_refill separately (column may not exist yet — not fatal)
    const { error: pfRefillErr } = await supabase
      .from("profiles")
      .update({ pf_refill: pfCount })
      .eq("id", user.id);

    if (pfRefillErr) {
      console.warn("[VERIFY] pf_refill column missing (safe to ignore):", pfRefillErr.message);
    }

    sendSubscriptionConfirmation(email, plan, billing_cycle, formatPlanPrice(plan)).catch((err) => console.error("[VERIFY] Email failed:", err));

    const discountCode = txData.metadata?.discount_code;
    if (discountCode) {
      const percent = discountCode === "FIRST_ORDER_50" ? 50 : discountCode === "REENGAGEMENT_40" ? 40 : null;
      if (percent) {
        await supabase.from("discount_redemptions").insert({
          user_id: user.id,
          discount_type: percent === 50 ? "50_percent_first_order" : "40_percent_reengagement",
          discount_percent: percent,
          paystack_reference: reference,
          plan_purchased: plan,
        });
      }
    }

    return NextResponse.json({ ok: true, plan: plan.toLowerCase(), balance: limits });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
