import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { PLAN_LIMITS, PLAN_PRICES } from "@/lib/plan-limits";

/**
 * FMSG Agents — start a card checkout from inside the desktop app.
 *
 * Creates a Paystack transaction server-side (the secret key never leaves the
 * server), returns the hosted checkout URL, and tags the payment with the
 * signed-in user and the plan they picked. The desktop app opens that URL in
 * the user's own browser, then polls `agent/billing/verify` until Paystack
 * confirms — so no card details ever touch the app.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";
const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;
const WEB_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://findmesomejobs.co.za";

const PURCHASABLE = new Set(["Seeker", "Hunter", "Pro"]);

export async function POST(request: NextRequest) {
  const authHeader = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "")
    .trim();

  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Billing is not configured." },
      { status: 500 }
    );
  }
  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json(
      { error: "Card payments are not available right now." },
      { status: 503 }
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

  const rl = checkRateLimit(`agent-checkout:${user.id}`, "agent-billing");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Please wait a moment." },
      { status: 429 }
    );
  }

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const plan = (body?.plan ?? "").trim();
  if (!PURCHASABLE.has(plan)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const amount = PLAN_PRICES[plan];
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Plan price is unavailable." }, { status: 500 });
  }

  if (!user.email) {
    return NextResponse.json(
      { error: "Your account needs an email address before checkout." },
      { status: 400 }
    );
  }

  const reference = `FMSG-AG-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;

  try {
    const paystackRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount,
          currency: "ZAR",
          reference,
          channels: ["card"],
          callback_url: `${WEB_BASE_URL}/payment/success?reference=${reference}`,
          metadata: {
            user_id: user.id,
            plan,
            billing_cycle: "once",
            pf_count: PLAN_LIMITS[plan]?.pf_balance ?? 0,
            source: "fmsg_agents",
          },
        }),
      }
    );

    const data = await paystackRes.json();
    if (!paystackRes.ok || !data?.data?.authorization_url) {
      console.error(
        "[AGENT-CHECKOUT] Paystack initialize failed:",
        JSON.stringify(data).slice(0, 300)
      );
      return NextResponse.json(
        { error: "Could not open the payment page. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      plan,
      reference: data.data.reference || reference,
      authorizationUrl: data.data.authorization_url,
      amount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[AGENT-CHECKOUT] error:", message.slice(0, 200));
    return NextResponse.json(
      { error: "Could not reach the payment provider. Please try again." },
      { status: 502 }
    );
  }
}
