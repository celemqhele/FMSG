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

  console.log(`[WEBHOOK] Event: ${event.event}`);

  const subData = event.data;
  if (!subData) return NextResponse.json({ ok: true });

  try {
    switch (event.event) {
      case "charge.success": {
        const reference = subData.reference;
        const email = subData.customer?.email ?? "";
        const authorizationCode = subData.authorization?.authorization_code ?? "";
        const customerCode = subData.customer?.customer_code ?? "";
        const metadata = subData.metadata ?? {};

        if (!reference) break;

        // Card update flow: user changed their card, update the authorization_code
        if (metadata.purpose === "card_update" && metadata.user_id && authorizationCode) {
          const { data: activeSub } = await supabase
            .from("subscriptions")
            .select("id")
            .eq("user_id", metadata.user_id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeSub) {
            await supabase
              .from("subscriptions")
              .update({
                authorization_code: authorizationCode,
                update_card_credit: subData.amount ?? 100,
              })
              .eq("id", activeSub.id);
            console.log(`[WEBHOOK] Updated authorization_code for user ${metadata.user_id}`);
          }
          break;
        }

        // Normal recurring charge: find subscription by authorization_code or customer_code
        let existingSub = null;
        if (authorizationCode) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("id, user_id, plan, expiry_date")
            .eq("authorization_code", authorizationCode)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          existingSub = sub;
        }

        if (!existingSub && customerCode) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("id, user_id, plan, expiry_date")
            .eq("customer_code", customerCode)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          existingSub = sub;
        }

        if (existingSub) {
          const billingCycle = metadata.billing_cycle ?? "monthly";
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
          await supabase.from("subscriptions").insert({
            user_id: existingSub.user_id,
            plan: existingSub.plan,
            billing_cycle: billingCycle,
            paystack_reference: reference,
            amount: subData.amount,
            authorization_code: authorizationCode,
            customer_code: customerCode,
            email,
            start_date: now.toISOString(),
            expiry_date: newExpiry.toISOString(),
            status: "active",
          });

          // Fetch user's pf_refill
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", existingSub.user_id)
            .single();

          const pfRefill = profile?.pf_refill ?? limits.pf_balance;

          // Extend user's plan
          await supabase
            .from("profiles")
            .update({
              plan_expiry: newExpiry.toISOString(),
              search_balance: limits.searches,
              cv_generation_balance: limits.cv_gens,
              persistent_finder_balance: pfRefill,
            })
            .eq("id", existingSub.user_id);

          // Also update the subscription record
          await supabase
            .from("subscriptions")
            .update({
              authorization_code: authorizationCode || undefined,
              expiry_date: newExpiry.toISOString(),
              failed_charge_count: 0,
            })
            .eq("id", existingSub.id);

          const planName = existingSub.plan.charAt(0).toUpperCase() + existingSub.plan.slice(1);
          sendSubscriptionRenewed(email, planName, formatPlanPrice(planName, billingCycle)).catch((err) =>
            console.error("[WEBHOOK] Renewal email failed:", err)
          );
        }
        break;
      }

      case "subscription.disable": {
        // Subscription cancelled on Paystack side — handle scheduled downgrade
        const customerEmail = subData.customer?.email;
        const customerCode = subData.customer?.customer_code;

        if (!customerEmail && !customerCode) break;

        // Find active subscription for this customer
        let query = supabase.from("subscriptions").select("id, user_id, plan, expiry_date").in("status", ["active", "past_due"]);
        if (customerCode) {
          query = query.eq("customer_code", customerCode);
        } else if (customerEmail) {
          query = query.eq("email", customerEmail);
        }
        const { data: existingSub } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();

        if (existingSub) {
          await supabase
            .from("subscriptions")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", existingSub.id);

          const planName = existingSub.plan.charAt(0).toUpperCase() + existingSub.plan.slice(1);
          if (customerEmail) sendSubscriptionCancelled(customerEmail, planName).catch((err) =>
            console.error("[WEBHOOK] Cancellation email failed:", err)
          );

          // Check for scheduled plan change
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", existingSub.user_id)
            .single();

          if (profile?.next_plan) {
            const nextPlan = profile.next_plan;
            const limits = PLAN_LIMITS[nextPlan.charAt(0).toUpperCase() + nextPlan.slice(1)] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };
            const now = new Date();
            const newExpiry = new Date(now);
            newExpiry.setMonth(newExpiry.getMonth() + 1);

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

            if (profile.next_pf_refill != null) {
              await supabase
                .from("profiles")
                .update({ pf_refill: profile.next_pf_refill, next_pf_refill: null })
                .eq("id", existingSub.user_id);
            }

            console.log(`[WEBHOOK] Applied scheduled downgrade for user ${existingSub.user_id} to ${nextPlan}`);
          } else {
            const stillActive = existingSub.expiry_date && new Date(existingSub.expiry_date) > new Date();
            if (!stillActive) {
              const freeLimits = PLAN_LIMITS["Free"] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };
              await supabase
                .from("profiles")
                .update({
                  plan: "free",
                  plan_expiry: null,
                  search_balance: freeLimits.searches,
                  cv_generation_balance: freeLimits.cv_gens,
                  persistent_finder_balance: freeLimits.pf_balance,
                })
                .eq("id", existingSub.user_id);
              console.log(`[WEBHOOK] Downgraded user ${existingSub.user_id} to Free`);
            }
          }
        }
        break;
      }

      case "invoice.create":
      case "invoice.update":
      case "subscription.create":
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
