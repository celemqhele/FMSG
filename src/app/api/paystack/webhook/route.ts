import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "@/lib/plan-limits";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();

  // Verify webhook signature
  const hash = request.headers.get("x-paystack-signature");
  if (!hash) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const body = await request.text();
  const expectedHash = await createHmac(body, PAYSTACK_SECRET_KEY ?? "");
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
        // Initial or recurring payment succeeded
        const reference = subData.reference;
        const subscription = subData.subscription;
        const metadata = subData.metadata ?? {};
        const paystackSubId = subscription?.subscription_code ?? "";
        const plan = metadata.plan ?? "";
        const billingCycle = metadata.billing_cycle ?? "monthly";
        const email = subData.customer?.email ?? "";
        const authorizationCode = subData.authorization?.authorization_code ?? "";
        const customerCode = subData.customer?.customer_code ?? "";

        if (!paystackSubId && !reference) break;

        // Find existing subscription by paystack reference or subscription code
        const { data: existingSub } = await supabase
          .from("subscriptions")
          .select("id, user_id, plan, expiry_date")
          .or(`paystack_reference.eq.${reference},paystack_subscription_id.eq.${paystackSubId}`)
          .maybeSingle();

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
          await supabase.from("subscriptions").insert({
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

          // Extend user's plan
          await supabase
            .from("profiles")
            .update({
              plan_expiry: newExpiry.toISOString(),
              search_balance: limits.searches,
              cv_generation_balance: limits.cv_gens,
              persistent_finder_balance: limits.pf_balance,
            })
            .eq("id", existingSub.user_id);
        } else if (reference) {
          // First-time payment — find user by email
          const { data: user } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", email)
            .maybeSingle();

          if (user) {
            const now = new Date();
            const expiryDate = new Date(now);
            if (billingCycle === "annual") {
              expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            } else {
              expiryDate.setMonth(expiryDate.getMonth() + 1);
            }

            const limits = PLAN_LIMITS[plan] ?? { searches: 1, cv_gens: 0, pf_balance: 0 };

            await supabase.from("subscriptions").insert({
              user_id: user.id,
              plan,
              billing_cycle: billingCycle,
              paystack_reference: reference,
              paystack_subscription_id: paystackSubId,
              amount: subData.amount,
              authorization_code: authorizationCode,
              customer_code: customerCode,
              email,
              start_date: now.toISOString(),
              expiry_date: expiryDate.toISOString(),
              next_payment_date: subscription?.next_payment_date ?? null,
              status: "active",
            });

            await supabase
              .from("profiles")
              .update({
                plan: plan.toLowerCase(),
                plan_expiry: expiryDate.toISOString(),
                search_balance: limits.searches,
                cv_generation_balance: limits.cv_gens,
                persistent_finder_balance: limits.pf_balance,
              })
              .eq("id", user.id);
          }
        }
        break;
      }

      case "subscription.not_renew": {
        // Payment failed — subscription will not auto-renew
        const paystackSubId = subData.subscription_code ?? subData.subscription?.subscription_code ?? "";
        if (!paystackSubId) break;

        // Mark subscription for grace period
        const { data: existingSub } = await supabase
          .from("subscriptions")
          .select("id, user_id")
          .eq("paystack_subscription_id", paystackSubId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSub) {
          await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("id", existingSub.id);
        }
        break;
      }

      case "subscription.disable": {
        // Subscription cancelled/disabled
        const paystackSubId = subData.subscription_code ?? subData.subscription?.subscription_code ?? "";
        if (!paystackSubId) break;

        const { data: existingSub } = await supabase
          .from("subscriptions")
          .select("id, user_id")
          .eq("paystack_subscription_id", paystackSubId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSub) {
          await supabase
            .from("subscriptions")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", existingSub.id);
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
