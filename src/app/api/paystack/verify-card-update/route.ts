import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;

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

  const rl = checkRateLimit(`verify-card-update:${user.id}`);
  if (!rl.allowed) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "Too many requests. Try again later." }, { status: 429 });
  }

  const body = await request.json();
  const { reference } = body;
  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  try {
    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });

    if (!psRes.ok) {
      return NextResponse.json({ error: "Verification failed" }, { status: 402 });
    }

    const psData = await psRes.json();

    if (psData.data.status !== "success") {
      return NextResponse.json({ error: "Payment not successful" }, { status: 402 });
    }

    const authorizationCode = psData.data.authorization?.authorization_code ?? "";
    const chargedAmount = psData.data.amount ?? 100;

    if (!authorizationCode) {
      return NextResponse.json({ error: "No authorization code returned. Card may not support tokenization." }, { status: 400 });
    }

    // Update active subscription with new authorization_code and credit
    const { data: activeSub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeSub) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }

    await supabase
      .from("subscriptions")
      .update({
        authorization_code: authorizationCode,
        update_card_credit: chargedAmount,
      })
      .eq("id", activeSub.id);

    return NextResponse.json({ ok: true, message: "Card updated successfully." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
