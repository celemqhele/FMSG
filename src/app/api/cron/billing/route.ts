import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { sendSubscriptionRenewed, sendPaymentFailed } from "@/lib/email";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;
const CRON_SECRET = process.env.CRON_SECRET || "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (CRON_SECRET && authHeader !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  const supabase = getSupabase();
  const now = new Date();
  const results: Array<{ user_id: string; plan: string; status: string; error?: string }> = [];

  // Find subscriptions due for renewal
  const { data: dueSubs, error: fetchErr } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("status", "active")
    .lte("next_payment_date", now.toISOString())
    .neq("authorization_code", "")
    .not("authorization_code", "is", null)
    .order("next_payment_date", { ascending: true })
    .limit(50);

  if (fetchErr) {
    console.error("[CRON_BILLING] Fetch error:", fetchErr.message);
    return NextResponse.json({ error: "DB fetch failed" }, { status: 500 });
  }

  if (!dueSubs || dueSubs.length === 0) {
    return NextResponse.json({ ok: true, message: "No subscriptions due", charged: 0 });
  }

  console.log(`[CRON_BILLING] Processing ${dueSubs.length} due subscriptions`);

  for (const sub of dueSubs) {
    if (!sub.email || !sub.authorization_code) continue;

    // Calculate amount: stored amount minus any card update credit
    const credit = sub.update_card_credit ?? 0;
    const chargeAmount = Math.max(0, (sub.amount ?? 0) - credit);

    if (chargeAmount <= 0) {
      if (credit > 0) {
        await supabase.from("subscriptions").update({ update_card_credit: 0 }).eq("id", sub.id);
      }
      continue;
    }

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
          metadata: {
            billing_cycle: sub.billing_cycle,
            plan: sub.plan,
            user_id: sub.user_id,
          },
        }),
      });

      const chargeData = await chargeRes.json();

      if (chargeRes.ok && chargeData.status && chargeData.data?.status === "success") {
        // Successful charge — extend subscription
        const newExpiry = new Date(now);
        const newNextPayment = new Date(now);
        if (sub.billing_cycle === "annual") {
          newExpiry.setFullYear(newExpiry.getFullYear() + 1);
          newNextPayment.setFullYear(newNextPayment.getFullYear() + 1);
        } else {
          newExpiry.setMonth(newExpiry.getMonth() + 1);
          newNextPayment.setMonth(newNextPayment.getMonth() + 1);
        }

        const limits = PLAN_LIMITS[sub.plan] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };

        // Update authorization code (may have changed)
        const newAuthCode = chargeData.data?.authorization?.authorization_code ?? sub.authorization_code;

        // Insert payment record
        await supabase.from("subscriptions").insert({
          user_id: sub.user_id,
          plan: sub.plan,
          billing_cycle: sub.billing_cycle,
          paystack_reference: chargeData.data.reference,
          amount: chargeAmount,
          authorization_code: newAuthCode,
          customer_code: sub.customer_code,
          email: sub.email,
          start_date: now.toISOString(),
          expiry_date: newExpiry.toISOString(),
          next_payment_date: newNextPayment.toISOString(),
          status: "active",
        });

        // Update the current subscription with new auth code and reset failure count
        await supabase
          .from("subscriptions")
          .update({
            authorization_code: newAuthCode,
            expiry_date: newExpiry.toISOString(),
            next_payment_date: newNextPayment.toISOString(),
            failed_charge_count: 0,
            update_card_credit: 0,
          })
          .eq("id", sub.id);

        // Refresh profile balances
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sub.user_id)
          .single();

        const pfRefill = profile?.pf_refill ?? limits.pf_balance;

        await supabase
          .from("profiles")
          .update({
            plan_expiry: newExpiry.toISOString(),
            search_balance: limits.searches,
            cv_generation_balance: limits.cv_gens,
            persistent_finder_balance: pfRefill,
          })
          .eq("id", sub.user_id);

        const planName = sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1);
        sendSubscriptionRenewed(sub.email, planName, `R${(chargeAmount / 100).toFixed(2)}`).catch((err) =>
          console.error("[CRON_BILLING] Renewal email failed:", err)
        );

        results.push({ user_id: sub.user_id, plan: sub.plan, status: "charged" });
      } else {
        // Charge failed
        const newFailCount = (sub.failed_charge_count ?? 0) + 1;
        const pastDue = newFailCount >= 3;

        await supabase
          .from("subscriptions")
          .update({
            failed_charge_count: newFailCount,
            status: pastDue ? "past_due" : "active",
          })
          .eq("id", sub.id);

        const planName = sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1);
        sendPaymentFailed(sub.email, planName).catch((err) =>
          console.error("[CRON_BILLING] Failed email error:", err)
        );

        results.push({
          user_id: sub.user_id,
          plan: sub.plan,
          status: pastDue ? "past_due" : "retrying",
          error: `Charge failed (attempt ${newFailCount})`,
        });

        console.error(`[CRON_BILLING] Charge failed for ${sub.user_id}:`, chargeData.message ?? "unknown error");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[CRON_BILLING] Error charging ${sub.user_id}:`, msg);
      results.push({ user_id: sub.user_id, plan: sub.plan, status: "error", error: msg });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
