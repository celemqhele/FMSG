import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLAN_LIMITS, PLAN_TIER_NAMES, PAYSTACK_PLAN_CODES } from "@/lib/plan-limits";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

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
  const { plan: newPlanRaw, billing_cycle } = body;
  if (!newPlanRaw || !billing_cycle) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const newPlan = newPlanRaw.charAt(0).toUpperCase() + newPlanRaw.slice(1).toLowerCase();
  const newTierIndex = getTierIndex(newPlan);
  if (newTierIndex < 0) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  if (newPlan === "Free") {
    return NextResponse.json({ error: "Cannot switch to Free plan" }, { status: 400 });
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
      // User has no active subscription — handle as new purchase via verify-payment
      return NextResponse.json({ error: "No active subscription found. Use the pricing page instead." }, { status: 400 });
    }

    const currentPlan = sub.plan;
    const currentTierIndex = getTierIndex(currentPlan);
    if (currentTierIndex < 0) {
      return NextResponse.json({ error: "Unknown current plan" }, { status: 400 });
    }

    const paystackSubId = sub.paystack_subscription_id;
    if (!paystackSubId) {
      return NextResponse.json({ error: "No Paystack subscription code found" }, { status: 400 });
    }

    const isUpgrade = newTierIndex > currentTierIndex;
    const newPlanCode = PAYSTACK_PLAN_CODES[`${newPlan}_${billing_cycle}`];
    if (!newPlanCode) {
      return NextResponse.json({ error: "New plan code not configured" }, { status: 500 });
    }

    if (isUpgrade) {
      // Upgrade: immediate prorated charge via manage/plan
      const psRes = await fetch(`https://api.paystack.co/subscription/${paystackSubId}/manage/plan`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: newPlanCode }),
      });

      const psData = await psRes.json();

      if (!psRes.ok || !psData.status) {
        console.error("[CHANGE_PLAN] Paystack error:", psData);
        return NextResponse.json({ error: psData.message ?? "Failed to upgrade plan" }, { status: 402 });
      }

      // Apply the upgrade immediately
      const limits = PLAN_LIMITS[newPlan] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };
      const now = new Date();
      const newExpiry = new Date(now);
      if (billing_cycle === "annual") {
        newExpiry.setFullYear(newExpiry.getFullYear() + 1);
      } else {
        newExpiry.setMonth(newExpiry.getMonth() + 1);
      }

      // Update subscription record
      await supabase.from("subscriptions").insert({
        user_id: user.id,
        plan: newPlan,
        billing_cycle,
        paystack_reference: "CHANGE-" + Date.now(),
        paystack_subscription_id: paystackSubId,
        amount: psData.data?.prorated_amount ?? 0,
        start_date: now.toISOString(),
        expiry_date: newExpiry.toISOString(),
        status: "active",
      });

      // Mark old subscription as changed
      await supabase
        .from("subscriptions")
        .update({ status: "changed" })
        .eq("id", sub.id);

      // Update profile
      await supabase
        .from("profiles")
        .update({
          plan: newPlan.toLowerCase(),
          plan_expiry: newExpiry.toISOString(),
          search_balance: limits.searches,
          cv_generation_balance: limits.cv_gens,
          persistent_finder_balance: limits.pf_balance,
        })
        .eq("id", user.id);

      return NextResponse.json({
        ok: true,
        type: "upgrade",
        plan: newPlan.toLowerCase(),
        prorated_amount: psData.data?.prorated_amount ?? 0,
      });
    } else {
      // Downgrade: cancel current subscription at period end, schedule switch
      const psRes = await fetch(`https://api.paystack.co/subscription/${paystackSubId}/manage/email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: sub.email }),
      });

      const psData = await psRes.json();
      if (!psRes.ok || !psData.status) {
        console.error("[CHANGE_PLAN] Paystack manage/email error:", psData);
        return NextResponse.json({ error: psData.message ?? "Failed to process downgrade" }, { status: 402 });
      }

      // Then cancel at period end
      const cancelRes = await fetch(`https://api.paystack.co/subscription/${paystackSubId}/manage/link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const cancelData = await cancelRes.json();
      if (!cancelRes.ok || !cancelData.status) {
        console.error("[CHANGE_PLAN] Paystack manage/link error:", cancelData);
        return NextResponse.json({ error: cancelData.message ?? "Failed to process downgrade" }, { status: 402 });
      }

      // Cancel subscription at period end
      const disableRes = await fetch(`https://api.paystack.co/subscription/${paystackSubId}/disable`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: paystackSubId, token: cancelData.data?.activation_code ?? "" }),
      });

      const disableData = await disableRes.json();
      if (!disableRes.ok || !disableData.status) {
        console.error("[CHANGE_PLAN] Paystack disable error:", disableData);
        return NextResponse.json({ error: disableData.message ?? "Failed to schedule downgrade" }, { status: 402 });
      }

      // Cancel at period end in our DB
      await supabase
        .from("subscriptions")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", sub.id);

      // Schedule the downgrade in profiles.next_plan
      await supabase
        .from("profiles")
        .update({ next_plan: newPlan.toLowerCase() })
        .eq("id", user.id);

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
