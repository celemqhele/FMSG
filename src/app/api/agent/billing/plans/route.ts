import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  PLAN_LIMITS,
  PLAN_PRICES,
  PLAN_TIER_NAMES,
  TIER_FEATURES,
  TIER_POPULAR,
} from "@/lib/plan-limits";

/**
 * FMSG Agents — plan catalogue for the in-app billing screen.
 *
 * Prices and allowances come from the same source the website uses, so the
 * desktop upgrade sheet can never drift from the paid plans.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

export async function GET(request: NextRequest) {
  const authHeader = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "")
    .trim();

  if (authHeader && SUPABASE_URL && SUPABASE_ANON_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader);
    if (user) {
      const rl = checkRateLimit(`agent-plans:${user.id}`, "agent-billing");
      if (!rl.allowed) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429 });
      }
    }
  }

  const plans = PLAN_TIER_NAMES.filter((name) => name !== "Free").map((name) => ({
    name,
    price: PLAN_PRICES[name] ?? 0,
    priceLabel: `R${((PLAN_PRICES[name] ?? 0) / 100).toLocaleString("en-ZA")}`,
    billingCycle: "once" as const,
    limits: PLAN_LIMITS[name] ?? { searches: 0, cv_gens: 0, pf_balance: 0 },
    features: TIER_FEATURES[name] ?? [],
    popular: TIER_POPULAR[name] ?? false,
  }));

  const free = {
    name: "Free",
    price: 0,
    priceLabel: "R0",
    limits: PLAN_LIMITS.Free,
    features: TIER_FEATURES.Free,
  };

  return NextResponse.json({ ok: true, free, plans });
}
