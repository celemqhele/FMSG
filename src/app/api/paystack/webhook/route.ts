import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatPlanPrice } from "@/lib/plan-limits";
import {
  sendSubscriptionRenewed,
  sendPaymentFailed,
  sendSubscriptionCancelled,
} from "@/lib/email";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit(`webhook:${ip}`, "webhook");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  // Verify webhook signature
if (!PAYSTACK_SECRET_KEY) {
  return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
}

const hash = request.headers.get("x-paystack-signature");
if (!hash) {
  return NextResponse.json({ error: "Missing signature" }, { status: 401 });
}

const body = await request.text();
const expectedHash = await createHmac(body, PAYSTACK_SECRET_KEY);
  if (hash !== expectedHash) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(`[WEBHOOK] Event: ${event.event}`, JSON.stringify(event.data?.subscription ?? {}));

  const subData = event.data;
  if (!subData) return NextResponse.json({ ok: true });

  try {
    switch (event.event) {
      case "charge.success": {
        // Recurring payment renewal
        const reference = subData.reference;
        const subscription = subData.subscription;
        const paystackSubId = subscription?.subscription_code ?? "";
        const billingCycle = subData.metadata?.billing_cycle ?? "monthly";
        const email = subData.customer?.email ?? "";
        const authorizationCode = subData.authorization?.authorization_code ?? "";
        const customerCode = subData.customer?.customer_code ?? "";

        if (!paystackSubId && !reference) break;

        // Find existing subscription by paystack reference or subscription code
        const { data: existingSub, error: subErr } = await supabase
          .from("subscriptions")
          .select("id, user_id, plan, expiry_date")
          .or(`paystack_reference.eq.${reference},paystack_subscription_id.eq.${paystackSubId}`)
          .maybeSingle();

        if (subErr) {
          console.error("[WEBHOOK] Failed to find subscription:", subErr.message);
          return NextResponse.json({ error: "DB error" }, { status: 500 });
        }

        if (existingSub) {
          // Recurring payment — extend expiry
          const now = new Date();
          const currentExpiry = existingSub.expiry_date ? new Date(existingSub.expiry_date) : now;
          const baseDate = currentExpiry > now ? currentExpiry : now;
          const newExpiry = new Date(baseDate);
          if (billingCycle === "annual") {
            newExpiry.setFullYear(newExpiry.getFullYear() + 1);
          } else {
            newExpiry.setMonth(newExpiry.getMonth() + 1);
          }

          const limits = PLAN_LIMITS[existingSub.plan] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };

          // Insert payment record
          const { error: insertErr } = await supabase.from("subscriptions").insert({
            user_id: existingSub.user_id,
            plan: existingSub.plan,
            billing_cycle: billingCycle,
            paystack_reference: reference,
            paystack_subscription_id: paystackSubId,
            amount: subData.amount,
            authorization_code: authorizationCode,
            customer_code: customerCode,
            email,
            start_date: now.toISOString(),
            expiry_date: newExpiry.toISOString(),
            next_payment_date: subscription?.next_payment_date ?? null,
            status: "active",
          });

          if (insertErr) {
            console.error("[WEBHOOK] Failed to insert payment record:", insertErr.message);
            return NextResponse.json({ error: "DB error" }, { status: 500 });
          }

          // Fetch user's pf_refill (custom PF refill count)
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", existingSub.user_id)
            .single();

          const pfRefill = profile?.pf_refill ?? limits.pf_balance;

          // Extend user's plan
          const { error: updateErr } = await supabase
            .from("profiles")
            .update({
              plan_expiry: newExpiry.toISOString(),
              search_balance: limits.searches,
              cv_generation_balance: limits.cv_gens,
              persistent_finder_balance: pfRefill,
            })
            .eq("id", existingSub.user_id);

          if (updateErr) {
            console.error("[WEBHOOK] Failed to extend profile:", updateErr.message);
            return NextResponse.json({ error: "DB error" }, { status: 500 });
          }

          const planName = existingSub.plan.charAt(0).toUpperCase() + existingSub.plan.slice(1);
          sendSubscriptionRenewed(email, planName, formatPlanPrice(planName, billingCycle)).catch((err) => console.error("[WEBHOOK] Renewal email failed:", err));
        }
        break;
      }

      case "subscription.not_renew": {
        // Payment failed — subscription will not auto-renew
        const paystackSubId = subData.subscription_code ?? subData.subscription?.subscription_code ?? "";
        if (!paystackSubId) break;

        // Mark subscription for grace period
        const { data: existingSub, error: subErr } = await supabase
          .from("subscriptions")
          .select("id, user_id, plan")
          .eq("paystack_subscription_id", paystackSubId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subErr) {
          console.error("[WEBHOOK] Failed to find subscription for not_renew:", subErr.message);
          return NextResponse.json({ error: "DB error" }, { status: 500 });
        }

        if (existingSub) {
          const { error: updateErr } = await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("id", existingSub.id);

          if (updateErr) {
            console.error("[WEBHOOK] Failed to update subscription to past_due:", updateErr.message);
            return NextResponse.json({ error: "DB error" }, { status: 500 });
          }

          const planName = existingSub.plan.charAt(0).toUpperCase() + existingSub.plan.slice(1);
          const customerEmail = subData.customer?.email;
          if (customerEmail) sendPaymentFailed(customerEmail, planName).catch((err) => console.error("[WEBHOOK] Payment failed email error:", err));
        }
        break;
      }

      case "subscription.disable": {
        // Subscription cancelled/disabled — check for scheduled downgrade
        const paystackSubId = subData.subscription_code ?? subData.subscription?.subscription_code ?? "";
        if (!paystackSubId) break;

        const { data: existingSub, error: subErr } = await supabase
          .from("subscriptions")
          .select("id, user_id, plan, expiry_date")
          .eq("paystack_subscription_id", paystackSubId)
          .in("status", ["active", "past_due"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subErr) {
          console.error("[WEBHOOK] Failed to find subscription for disable:", subErr.message);
          return NextResponse.json({ error: "DB error" }, { status: 500 });
        }

        if (existingSub) {
          // Mark subscription as cancelled
          const { error: updateErr } = await supabase
            .from("subscriptions")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", existingSub.id);

          if (updateErr) {
            console.error("[WEBHOOK] Failed to cancel subscription:", updateErr.message);
            return NextResponse.json({ error: "DB error" }, { status: 500 });
          }

          const planName = existingSub.plan.charAt(0).toUpperCase() + existingSub.plan.slice(1);
          const customerEmail = subData.customer?.email;
          if (customerEmail) sendSubscriptionCancelled(customerEmail, planName).catch((err) => console.error("[WEBHOOK] Cancellation email failed:", err));

          // Check if there's a scheduled plan change (downgrade)
          const { data: profile, error: profileErr } = await supabase
              .from("profiles")
              .select("*")
            .eq("id", existingSub.user_id)
            .single();

          if (!profileErr && profile?.next_plan) {
            const nextPlan = profile.next_plan;
            const limits = PLAN_LIMITS[nextPlan.charAt(0).toUpperCase() + nextPlan.slice(1)] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };
            const now = new Date();
            const newExpiry = new Date(now);
            // Set a reasonable initial expiry (1 month from now — user can renew)
            newExpiry.setMonth(newExpiry.getMonth() + 1);

              // Apply the scheduled plan change
              await supabase
                .from("profiles")
                .update({
                  plan: nextPlan,
                  plan_expiry: newExpiry.toISOString(),
                  search_balance: limits.searches,
                  cv_generation_balance: limits.cv_gens,
                  persistent_finder_balance: limits.pf_balance,
                  next_plan: null,
                })
                .eq("id", existingSub.user_id);

              // Apply scheduled PF refill change if present
              if (profile.next_pf_refill != null) {
                await supabase
                  .from("profiles")
                  .update({ pf_refill: profile.next_pf_refill, next_pf_refill: null })
                  .eq("id", existingSub.user_id);
              }

              console.log(`[WEBHOOK] Applied scheduled downgrade for user ${existingSub.user_id} to ${nextPlan}`);
          } else {
            // Check if billing period still has time remaining
            const stillActive = existingSub.expiry_date && new Date(existingSub.expiry_date) > new Date();
            if (stillActive) {
              console.log(`[WEBHOOK] Subscription disabled for user ${existingSub.user_id} but expiry_date (${existingSub.expiry_date}) still in future — deferring Free downgrade.`);
            } else {
              // No remaining time — downgrade to Free
              const freeLimits = PLAN_LIMITS["Free"] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };
              const { error: freeErr } = await supabase
                .from("profiles")
                .update({
                  plan: "free",
                  plan_expiry: null,
                  search_balance: freeLimits.searches,
                  cv_generation_balance: freeLimits.cv_gens,
                  persistent_finder_balance: freeLimits.pf_balance,
                })
                .eq("id", existingSub.user_id);

              if (freeErr) {
                console.error("[WEBHOOK] Failed to downgrade to Free:", freeErr.message);
              } else {
                console.log(`[WEBHOOK] Downgraded user ${existingSub.user_id} to Free (subscription expired).`);
              }
            }
          }
        }
        break;
      }

      case "subscription.create":
      case "invoice.create":
      case "invoice.update":
        // Informational — ignore
        break;
    }
  } catch (err) {
    console.error("[WEBHOOK] Error processing event:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function createHmac(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
