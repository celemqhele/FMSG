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

  const rl = checkRateLimit(`pf-purchase:${user.id}`);
  if (!rl.allowed) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "Too many requests. Try again later." }, { status: 429 });
  }

  const { reference } = await request.json();
  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  try {
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });

    if (!paystackRes.ok) {
      return NextResponse.json({ error: "Verification failed" }, { status: 402 });
    }

    const paystackData = await paystackRes.json();
    if (paystackData.data.status !== "success") {
      return NextResponse.json({ error: "Payment not successful" }, { status: 402 });
    }

    const txData = paystackData.data;

    // Read PF runs from Paystack transaction metadata
    const runs = txData.metadata?.pf_runs;
    if (!runs || typeof runs !== "number" || runs <= 0) {
      return NextResponse.json({ error: "Invalid PF runs in metadata" }, { status: 400 });
    }

    // Add runs to user's PF balance
    const { data: profile, error: fetchErr } = await supabase
      .from("profiles")
      .select("persistent_finder_balance")
      .eq("id", user.id)
      .single();

    if (fetchErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const newBalance = (profile.persistent_finder_balance ?? 0) + runs;

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ persistent_finder_balance: newBalance })
      .eq("id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, pf_balance: newBalance, added: runs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
