import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLAN_LIMITS, PLAN_TIER_NAMES, calculatePFPrice } from "@/lib/plan-limits";
import { sendPlanUpgraded, sendPlanDowngraded } from "@/lib/email";

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
    return NextResponse.json({ error: "Cannot switch to Free plan. Cancel your subscription instead." }, { status: 400 });
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
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) {
      console.error("[CHANGE_PLAN] DB error:", subErr.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!sub) {
      return NextResponse.json({ error: "No active subscription found. Use the pricing page instead." }, { status: 400 });
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
    const newPfCount = pf_count != null ? pf_count : PLAN_LIMITS[newPlan]?.pf_balance ?? 0;

    const now = new Date();
    const newExpiry = new Date(now);
    const newNextPayment = new Date(now);
    if (billing_cycle === "annual") {
      newExpiry.setFullYear(newExpiry.getFullYear() + 1);
      newNextPayment.setFullYear(newNextPayment.getFullYear() + 1);
    } else {
      newExpiry.setMonth(newExpiry.getMonth() + 1);
      newNextPayment.setMonth(newNextPayment.getMonth() + 1);
    }

    const limits = PLAN_LIMITS[newPlan] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };
    const billingMonths = billing_cycle === "annual" ? 12 : 1;

    if (isUpgrade) {
      // Calculate PF prorated charge for upgrade
      const oldPricePerRun = calculatePFPrice(currentPfRefill);
      const newPricePerRun = calculatePFPrice(newPfCount);
      const oldPfTotalKobo = currentPfRefill * oldPricePerRun * 100 * billingMonths;
      const newPfTotalKobo = newPfCount * newPricePerRun * 100 * billingMonths;
      const pfDiffKobo = Math.round(newPfTotalKobo - oldPfTotalKobo);

      if (pfDiffKobo > 0 && sub.authorization_code) {
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
              amount: pfDiffKobo,
              metadata: { reason: "pf_change_on_upgrade", user_id: user.id },
            }),
          });
          const chargeData = await chargeRes.json();
          if (!chargeRes.ok || !chargeData.status) {
            console.error("[CHANGE_PLAN] PF charge failed:", chargeData);
          }
        } catch (err) {
          console.error("[CHANGE_PLAN] PF charge error:", err);
        }
      }

      // Insert new subscription record
      await supabase.from("subscriptions").insert({
        user_id: user.id,
        plan: newPlan,
        billing_cycle,
        paystack_reference: "CHANGE-" + Date.now(),
        amount: 0, // will be calculated by cron on next charge
        authorization_code: sub.authorization_code,
        customer_code: sub.customer_code,
        email: sub.email,
        start_date: now.toISOString(),
        expiry_date: newExpiry.toISOString(),
        next_payment_date: newNextPayment.toISOString(),
        status: "active",
      });

      // Mark old subscription as changed
      await supabase
        .from("subscriptions")
        .update({ status: "changed" })
        .eq("id", sub.id);

      // Update profile immediately
      await supabase
        .from("profiles")
        .update({
          plan: newPlan.toLowerCase(),
          plan_expiry: newExpiry.toISOString(),
          search_balance: limits.searches,
          cv_generation_balance: limits.cv_gens,
          persistent_finder_balance: newPfCount,
        })
        .eq("id", user.id);

      // Set pf_refill
      await supabase
        .from("profiles")
        .update({ pf_refill: newPfCount })
        .eq("id", user.id);

      sendPlanUpgraded(user.email ?? "", currentPlan, newPlan, `R${(pfDiffKobo / 100).toFixed(2)}`).catch((err) =>
        console.error("[CHANGE_PLAN] Upgrade email failed:", err)
      );

      return NextResponse.json({
        ok: true,
        type: "upgrade",
        plan: newPlan.toLowerCase(),
        pf_charged_kobo: pfDiffKobo > 0 ? pfDiffKobo : 0,
        pf_refill: newPfCount,
      });
    } else {
      // Downgrade: schedule the change — keep current plan until expiry, then switch
      // Cancel current subscription (won't auto-renew)
      await supabase
        .from("subscriptions")
        .update({ status: "cancelled", cancelled_at: now.toISOString() })
        .eq("id", sub.id);

      // Schedule the downgrade in profiles
      await supabase
        .from("profiles")
        .update({ next_plan: newPlan.toLowerCase() })
        .eq("id", user.id);

      if (pf_count != null) {
        await supabase
          .from("profiles")
          .update({ next_pf_refill: pf_count })
          .eq("id", user.id);
      }

      const effectiveDate = sub.expiry_date
        ? new Date(sub.expiry_date).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
        : "the end of your billing period";
      sendPlanDowngraded(user.email ?? "", currentPlan, newPlan, effectiveDate).catch((err) =>
        console.error("[CHANGE_PLAN] Downgrade email failed:", err)
      );

      return NextResponse.json({
        ok: true,
        type: "downgrade",
        plan: newPlan.toLowerCase(),
        message: `Your plan will switch to ${newPlan} when the current billing period ends.`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CHANGE_PLAN] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
