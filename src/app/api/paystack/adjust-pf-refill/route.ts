import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculatePFPrice, PLAN_LIMITS } from "@/lib/plan-limits";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

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

  const body = await request.json();
  const { pfCount } = body;
  if (pfCount === undefined || pfCount < 0 || pfCount > 25) {
    return NextResponse.json({ error: "Invalid PF count. Must be 0-25." }, { status: 400 });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  try {
    // Get profile for current pf_refill
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("plan, pf_refill")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const currentPfRefill = profile.pf_refill ?? 0;
    if (pfCount === currentPfRefill) {
      return NextResponse.json({ ok: true, message: "No change." });
    }

    const isIncrease = pfCount > currentPfRefill;

    // Get active subscription for billing cycle and authorization
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }

    if (isIncrease) {
      // Calculate prorated charge
      const billingMonths = sub.billing_cycle === "annual" ? 12 : 1;
      const now = new Date();
      const expiry = sub.expiry_date ? new Date(sub.expiry_date) : now;
      const totalMs = expiry.getTime() - (sub.start_date ? new Date(sub.start_date).getTime() : now.getTime());
      const remainingMs = Math.max(0, expiry.getTime() - now.getTime());
      const prorationFactor = totalMs > 0 ? remainingMs / totalMs : 1;

      const oldPricePerRun = calculatePFPrice(currentPfRefill);
      const newPricePerRun = calculatePFPrice(pfCount);
      const oldTotalCost = currentPfRefill * oldPricePerRun * billingMonths;
      const newTotalCost = pfCount * newPricePerRun * billingMonths;
      const differenceKobo = Math.round((newTotalCost - oldTotalCost) * 100 * prorationFactor);

      if (differenceKobo > 0) {
        // Charge the saved authorization code
        const chargeRes = await fetch("https://api.paystack.co/transaction/charge_authorization", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            authorization_code: sub.authorization_code,
            email: sub.email,
            amount: differenceKobo,
            metadata: {
              reason: "pf_refill_increase",
              user_id: user.id,
              old_pf_refill: currentPfRefill,
              new_pf_refill: pfCount,
            },
          }),
        });

        const chargeData = await chargeRes.json();

        if (!chargeRes.ok || !chargeData.status) {
          console.error("[ADJUST_PF] Charge authorization failed:", chargeData);
          return NextResponse.json({
            error: chargeData.message ?? "Failed to charge card. Try updating your payment method.",
          }, { status: 402 });
        }

        // Verify the charge was successful
        if (chargeData.data?.status !== "success") {
          return NextResponse.json({
            error: "Card charge was not successful. Try updating your payment method.",
          }, { status: 402 });
        }
      }

      // Update pf_refill
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ pf_refill: pfCount })
        .eq("id", user.id);

      if (updateErr) {
        return NextResponse.json({ error: "Failed to update PF refill" }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        type: "increase",
        charged_kobo: differenceKobo,
        pf_refill: pfCount,
        message: differenceKobo > 0
          ? `PF refill increased to ${pfCount}. Charged R${(differenceKobo / 100).toFixed(2)} prorated.`
          : `PF refill increased to ${pfCount}. No additional charge.`,
      });
    } else {
      // Decrease: schedule at next billing cycle
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ next_pf_refill: pfCount })
        .eq("id", user.id);

      if (updateErr) {
        return NextResponse.json({ error: "Failed to schedule PF refill change" }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        type: "decrease",
        pf_refill: currentPfRefill,
        next_pf_refill: pfCount,
        message: `PF refill will change from ${currentPfRefill} to ${pfCount} at the start of the next billing cycle.`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADJUST_PF] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
