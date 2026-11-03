import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { PLAN_LIMITS, PLAN_PRICES } from "@/lib/plan-limits";

/**
 * FMSG Agents — confirm a card checkout started from the desktop app.
 *
 * Polled by the app after it opens Paystack in the system browser. Safe to call
 * repeatedly: it first looks for an existing subscription row for the same
 * Paystack reference, so a network retry can never stack a second plan on the
 * account. Crediting is delegated to the website's /api/verify-payment route so
 * desktop and web purchases share one source of truth.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;

const AGENT_PLAN_PRICES: Record<string, number> = {
  Starter: 34900,
  Lite: 74900,
  Standard: 149900,
  Power: 329900,
  Seeker: PLAN_PRICES.Seeker ?? 9900,
  Hunter: PLAN_PRICES.Hunter ?? 24900,
  Pro: PLAN_PRICES.Pro ?? 49900,
};

const PURCHASABLE = new Set([
  "Starter",
  "Lite",
  "Standard",
  "Power",
  "Seeker",
  "Hunter",
  "Pro",
]);

export async function POST(request: NextRequest) {
  const authHeader = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "")
    .trim();

  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !PAYSTACK_SECRET_KEY) {
    return NextResponse.json(
      { error: "Billing is not configured." },
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(authHeader);

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rl = checkRateLimit(`agent-verify:${user.id}`, "agent-billing");
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, pending: true, error: "Checking too often." },
      { status: 429 }
    );
  }

  let body: { reference?: string; plan?: string; billing_cycle?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const reference = (body?.reference ?? "").trim().slice(0, 120);
  const plan = (body?.plan ?? "").trim();
  const billingCycle = body?.billing_cycle === "annual" ? "annual" : "once";

  if (!reference || !PURCHASABLE.has(plan)) {
    return NextResponse.json(
      { error: "Missing payment reference." },
      { status: 400 }
    );
  }

  try {
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );

    if (!paystackRes.ok) {
      return NextResponse.json(
        { ok: false, pending: true, message: "Payment is still processing." },
        { status: 202 }
      );
    }

    const paystackData = await paystackRes.json();
    const status = paystackData?.data?.status;

    if (status !== "success") {
      return NextResponse.json(
        {
          ok: false,
          pending: status !== "failed" && status !== "reversed",
          status: status ?? "unknown",
          message:
            status === "abandoned"
              ? "Checkout was closed before payment completed."
              : "Payment is still processing.",
        },
        { status: 202 }
      );
    }

    const paidAmount = paystackData?.data?.amount ?? 0;
    const metadataUserId = paystackData?.data?.metadata?.user_id;
    if (metadataUserId && metadataUserId !== user.id) {
      return NextResponse.json(
        { error: "This payment belongs to a different account." },
        { status: 403 }
      );
    }
    if (paidAmount < (AGENT_PLAN_PRICES[plan] ?? 0)) {
      return NextResponse.json(
        { error: "The paid amount does not match this plan." },
        { status: 402 }
      );
    }

    // Idempotency: one plan credit per Paystack reference.
    if (SERVICE_KEY) {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: existing } = await admin
        .from("subscriptions")
        .select("id, plan, status")
        .eq("user_id", user.id)
        .eq("paystack_reference", reference)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({
          ok: true,
          alreadyApplied: true,
          plan: String(existing.plan ?? plan).toLowerCase(),
          limits: PLAN_LIMITS[plan],
        });
      }
    }

    const verifyUrl = new URL("/api/verify-payment", request.url);
    const verifyRes = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authHeader}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reference, plan, billing_cycle: billingCycle }),
    });

    const verifyJson = await verifyRes.json().catch(() => ({}));

    if (!verifyRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          pending: verifyRes.status === 402,
          error:
            (verifyJson as { error?: string })?.error ||
            "Payment confirmed but the plan could not be activated.",
        },
        { status: verifyRes.status }
      );
    }

    return NextResponse.json({
      ok: true,
      plan: plan.toLowerCase(),
      limits: (verifyJson as { balance?: unknown })?.balance ?? PLAN_LIMITS[plan],
      amount: paidAmount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[AGENT-VERIFY] error:", message.slice(0, 200));
    return NextResponse.json(
      { ok: false, pending: true, message: "Could not confirm the payment yet." },
      { status: 202 }
    );
  }
}
