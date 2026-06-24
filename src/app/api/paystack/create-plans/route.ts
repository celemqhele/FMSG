import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLAN_PRICES, PAYSTACK_PLAN_CODES } from "@/lib/plan-limits";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

const PLAN_DEFS = [
  { name: "Seeker Monthly", key: "Seeker_monthly", interval: "monthly" },
  { name: "Seeker Annual", key: "Seeker_annual", interval: "annually" },
  { name: "Hunter Monthly", key: "Hunter_monthly", interval: "monthly" },
  { name: "Hunter Annual", key: "Hunter_annual", interval: "annually" },
  { name: "Pro Monthly", key: "Pro_monthly", interval: "monthly" },
  { name: "Pro Annual", key: "Pro_annual", interval: "annually" },
];

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
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  const results: Record<string, string> = {};

  for (const def of PLAN_DEFS) {
    const existingCode = PAYSTACK_PLAN_CODES[def.key];
    if (existingCode) {
      results[def.name] = existingCode;
      continue;
    }

    const [planName, cycle] = def.key.split("_") as [string, "monthly" | "annual"];
    const amount = PLAN_PRICES[planName]?.[cycle === "annual" ? "annual" : "monthly"];
    if (!amount) {
      console.error(`[PAYSTACK] No price found for ${def.key}`);
      continue;
    }

    try {
      const res = await fetch("https://api.paystack.co/plan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: def.name,
          amount,
          interval: def.interval,
          currency: "ZAR",
          description: `FMSG ${def.name} Plan`,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(`[PAYSTACK] Failed to create plan ${def.name}: ${err}`);
        continue;
      }

      const data = await res.json();
      if (data.status && data.data?.plan_code) {
        results[def.name] = data.data.plan_code;
        console.log(`[PAYSTACK] Created plan ${def.name}: ${data.data.plan_code}`);
      } else {
        console.error(`[PAYSTACK] Unexpected response for ${def.name}:`, JSON.stringify(data));
      }
    } catch (err) {
      console.error(`[PAYSTACK] Error creating plan ${def.name}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    plans: results,
    instructions: "Add these plan codes to your environment variables.",
  });
}
