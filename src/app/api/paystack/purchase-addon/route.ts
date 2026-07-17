import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendPFReceipt, sendSearchReceipt, sendCVReceipt } from "@/lib/email";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

type AddonType = "searches" | "cv_gens" | "pf";

const BALANCE_COLUMNS: Record<AddonType, string> = {
  searches: "search_balance",
  cv_gens: "cv_generation_balance",
  pf: "persistent_finder_balance",
};

const RECEIPT_LABELS: Record<AddonType, string> = {
  searches: "searches",
  cv_gens: "CV generations",
  pf: "Persistent Finder runs",
};

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

  const rl = checkRateLimit(`addon-purchase:${user.id}`);
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
    const addonType = txData.metadata?.addon_type as AddonType | undefined;
    const addonCount = txData.metadata?.addon_count;

    if (!addonType || !["searches", "cv_gens", "pf"].includes(addonType)) {
      return NextResponse.json({ error: "Invalid addon type in metadata" }, { status: 400 });
    }
    if (!addonCount || typeof addonCount !== "number" || addonCount <= 0) {
      return NextResponse.json({ error: "Invalid addon count in metadata" }, { status: 400 });
    }

    const balanceColumn = BALANCE_COLUMNS[addonType];

    const { data: profile, error: fetchErr } = await supabase
      .from("profiles")
      .select(balanceColumn)
      .eq("id", user.id)
      .single();

    if (fetchErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const currentBalance = (profile[balanceColumn as keyof typeof profile] as number) ?? 0;
    const newBalance = currentBalance + addonCount;

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ [balanceColumn]: newBalance })
      .eq("id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 });
    }

    const amountPaid = (txData.amount ?? 0) / 100;
    const amountStr = `R${amountPaid}`;
    const label = RECEIPT_LABELS[addonType];

    if (addonType === "pf") {
      sendPFReceipt(user.email ?? "", addonCount, amountStr).catch((err) => console.error("[PURCHASE_ADDON] PF email failed:", err));
    } else if (addonType === "searches") {
      sendSearchReceipt(user.email ?? "", addonCount, amountStr).catch((err) => console.error("[PURCHASE_ADDON] Search email failed:", err));
    } else if (addonType === "cv_gens") {
      sendCVReceipt(user.email ?? "", addonCount, amountStr).catch((err) => console.error("[PURCHASE_ADDON] CV email failed:", err));
    }

    return NextResponse.json({ ok: true, [balanceColumn]: newBalance, added: addonCount, addon_type: addonType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
