import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLAN_LIMITS, PLAN_TIER_NAMES, PLAN_PRICES, calculatePFPrice } from "@/lib/plan-limits";
import { sendPlanUpgraded } from "@/lib/email";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function getTierIndex(plan: string): number {
  const idx = PLAN_TIER_NAMES.findIndex((t) => t.toLowerCase() === plan.toLowerCase());
  return idx >= 0 ? idx : -1;
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

  const body = await request.json();
  const { plan: newPlanRaw, billing_cycle, pf_count } = body;
  if (!newPlanRaw || !billing_cycle) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const newPlan = newPlanRaw.charAt(0).toUpperCase() + newPlanRaw.slice(1).toLowerCase();
  const newTierIndex = getTierIndex(newPlan);
  if (newTierIndex < 0) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  if (newPlan === "Free") {
    return NextResponse.json({ error: "Cannot switch to Free package." }, { status: 400 });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  try {
    // Get the user's current active subscription
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .or("status.eq.active,and(status.eq.cancelled,expiry_date.gt.now())")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) {
      console.error("[CHANGE_PLAN] DB error:", subErr.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!sub) {
      return NextResponse.json({ error: "No active package found. Use the pricing page instead." }, { status: 400 });
    }

    const currentPlan = sub.plan;
    const currentTierIndex = getTierIndex(currentPlan);
    if (currentTierIndex < 0) {
      return NextResponse.json({ error: "Unknown current plan" }, { status: 400 });
    }

    const isUpgrade = newTierIndex > currentTierIndex;

    // Get user's profile for current pf_refill
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    const currentPfRefill = profile?.pf_refill ?? 0;
    const rawPfCount = pf_count != null ? pf_count : PLAN_LIMITS[newPlan]?.pf_balance ?? 0;
    const newPfCount = Math.min(Math.max(0, Math.floor(Number(rawPfCount) || 0)), 25);

    const now = new Date();
    const newExpiry = new Date(now);
    newExpiry.setMonth(newExpiry.getMonth() + 1);

    const limits = PLAN_LIMITS[newPlan] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };

    if (isUpgrade) {
      // Calculate prorated upgrade charge
      const oldPricePerRun = calculatePFPrice(currentPfRefill);
      const newPricePerRun = calculatePFPrice(newPfCount);
      const billingMonths = 1;
      const oldPfTotalKobo = currentPfRefill * oldPricePerRun * 100 * billingMonths;
      const newPfTotalKobo = newPfCount * newPricePerRun * 100 * billingMonths;

      const oldBaseKobo = PLAN_PRICES[currentPlan] ?? 0;
      const newBaseKobo = PLAN_PRICES[newPlan] ?? 0;
      const newFullAmount = newBaseKobo + newPfTotalKobo;

      let chargeAmount = newFullAmount; // default: full new price

      // Prorate only when billing cycle stays the same
      if (sub.billing_cycle === billing_cycle && sub.start_date) {
        const msPerDay = 1000 * 60 * 60 * 24;
        const nowMs = now.getTime();
        const startMs = new Date(sub.start_date).getTime();
        const expiryMs = new Date(sub.expiry_date).getTime();
        const totalDays = Math.max(1, Math.ceil((expiryMs - startMs) / msPerDay));
        const daysRemaining = Math.max(1, Math.ceil((expiryMs - nowMs) / msPerDay));

        const baseDiffKobo = Math.round((newBaseKobo - oldBaseKobo) * daysRemaining / totalDays);
        const pfDiffKobo = Math.round((newPfTotalKobo - oldPfTotalKobo) * daysRemaining / totalDays);
        chargeAmount = Math.max(0, baseDiffKobo + pfDiffKobo);
      }

      let charged = 0;
      if (chargeAmount > 0 && sub.authorization_code) {
        try {
          const chargeRes = await fetch("https://api.paystack.co/transaction/charge_authorization", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              authorization_code: sub.authorization_code,
              email: sub.email,
              amount: chargeAmount,
              metadata: { reason: "plan_upgrade", user_id: user.id },
            }),
          });
          const chargeData = await chargeRes.json();
          if (chargeRes.ok && chargeData.status) {
            charged = chargeAmount;
          } else {
            console.error("[CHANGE_PLAN] Upgrade charge failed:", chargeData);
            return NextResponse.json({ error: "Payment for upgrade failed. Please try again or contact support." }, { status: 402 });
          }
        } catch (err) {
          console.error("[CHANGE_PLAN] Upgrade charge error:", err);
          return NextResponse.json({ error: "Payment for upgrade failed. Please try again." }, { status: 500 });
        }
      }

      // Insert new subscription record with the full recurring amount
      await supabase.from("subscriptions").insert({
        user_id: user.id,
        plan: newPlan,
        billing_cycle,
        paystack_reference: "CHANGE-" + Date.now(),
        amount: newFullAmount,
        authorization_code: sub.authorization_code,
        customer_code: sub.customer_code,
        email: sub.email,
        start_date: now.toISOString(),
        expiry_date: newExpiry.toISOString(),
        status: "active",
      });

      // Mark old subscription as changed
      await supabase
        .from("subscriptions")
        .update({ status: "changed" })
        .eq("id", sub.id);

      // Update profile immediately (stack balances)
      await supabase
        .from("profiles")
        .update({
          plan: newPlan.toLowerCase(),
          plan_expiry: newExpiry.toISOString(),
        })
        .eq("id", user.id);

      await supabase.rpc("stack_plan_balances", {
        p_user_id: user.id,
        p_searches: limits.searches,
        p_cv_gens: limits.cv_gens,
        p_pf: newPfCount,
      });

      // Set pf_refill
      await supabase
        .from("profiles")
        .update({ pf_refill: newPfCount })
        .eq("id", user.id);

      sendPlanUpgraded(user.email ?? "", currentPlan, newPlan, `R${(charged / 100).toFixed(2)}`).catch((err) =>
        console.error("[CHANGE_PLAN] Upgrade email failed:", err)
      );

      return NextResponse.json({
        ok: true,
        type: "upgrade",
        plan: newPlan.toLowerCase(),
        charged_kobo: charged,
        new_amount_kobo: newFullAmount,
        pf_refill: newPfCount,
      });
    } else {
      // Stack: apply new plan credits immediately, no scheduling
      const now = new Date();
      const newExpiry = new Date(now);
      newExpiry.setMonth(newExpiry.getMonth() + 1);

      await supabase
        .from("profiles")
        .update({ plan: newPlan.toLowerCase(), plan_expiry: newExpiry.toISOString() })
        .eq("id", user.id);

      await supabase.rpc("stack_plan_balances", {
        p_user_id: user.id,
        p_searches: limits.searches,
        p_cv_gens: limits.cv_gens,
        p_pf: newPfCount,
      });

      await supabase
        .from("profiles")
        .update({ pf_refill: newPfCount, next_plan: null, next_pf_refill: null })
        .eq("id", user.id);

      sendPlanUpgraded(user.email ?? "", currentPlan, newPlan, `R${((PLAN_PRICES[newPlan] ?? 0) / 100).toFixed(2)}`).catch((err) =>
        console.error("[CHANGE_PLAN] Plan change email failed:", err)
      );

      return NextResponse.json({
        ok: true,
        type: "upgrade",
        plan: newPlan.toLowerCase(),
        message: `${newPlan} credits stacked onto your account.`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CHANGE_PLAN] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
