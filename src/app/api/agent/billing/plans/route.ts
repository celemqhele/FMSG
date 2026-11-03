import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * FMSG Agents — Dedicated desktop bundle & Pay-As-You-Go plan catalogue.
 *
 * Kept strictly separate from the FMSG website's search-only plans:
 * - Pure Pay-As-You-Go: R40 / application (searches included), progressive
 *   charge thresholds R40 -> R100 -> R250 -> R500.
 * - Monthly Subscription Bundles (applications stack indefinitely, fallback
 *   PAYG rate matches the bundle's per-app rate):
 *   - Starter Pack: 10 applications · R349 (R35/app · 12% discount)
 *   - Lite:         25 applications · R749 (R30/app · 25% discount)
 *   - Standard:     60 applications · R1,499 (R25/app · 38% discount)
 *   - Power:       150 applications · R3,299 (R22/app · 45% discount)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

export const AGENT_BUNDLES = [
  {
    name: "Starter",
    displayName: "Starter Pack",
    applications: 10,
    price: 34900,
    priceLabel: "R349",
    perAppZar: 35,
    discountPct: 12,
    graceApps: 1,
    billingCycle: "monthly" as const,
    popular: false,
    limits: { applications: 10, searches: 10, cv_gens: 10, pf_balance: 0 },
    features: [
      "10 automated applications / month",
      "R35 per application (12% off R40)",
      "Job searches & CV tailoring included",
      "Unused applications roll over & stack",
    ],
  },
  {
    name: "Lite",
    displayName: "Lite",
    applications: 25,
    price: 74900,
    priceLabel: "R749",
    perAppZar: 30,
    discountPct: 25,
    graceApps: 2,
    billingCycle: "monthly" as const,
    popular: false,
    limits: { applications: 25, searches: 25, cv_gens: 25, pf_balance: 0 },
    features: [
      "25 automated applications / month",
      "R30 per application (25% off R40)",
      "Job searches & CV tailoring included",
      "Unused applications roll over & stack",
    ],
  },
  {
    name: "Standard",
    displayName: "Standard",
    applications: 60,
    price: 149900,
    priceLabel: "R1,499",
    perAppZar: 25,
    discountPct: 38,
    graceApps: 6,
    billingCycle: "monthly" as const,
    popular: true,
    limits: { applications: 60, searches: 60, cv_gens: 60, pf_balance: 0 },
    features: [
      "60 automated applications / month",
      "R25 per application (38% off R40)",
      "Job searches & CV tailoring included",
      "Unused applications roll over & stack",
    ],
  },
  {
    name: "Power",
    displayName: "Power",
    applications: 150,
    price: 329900,
    priceLabel: "R3,299",
    perAppZar: 22,
    discountPct: 45,
    graceApps: 15,
    billingCycle: "monthly" as const,
    popular: false,
    limits: { applications: 150, searches: 150, cv_gens: 150, pf_balance: 0 },
    features: [
      "150 automated applications / month",
      "R22 per application (45% off R40)",
      "Job searches & CV tailoring included",
      "Unused applications roll over & stack",
    ],
  },
];

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

  return NextResponse.json({
    ok: true,
    welcomeBonusApplications: 5,
    payAsYouGo: {
      baseRateZar: 40,
      thresholdsZar: [40, 100, 250, 500],
      defaultCostCapZar: 0,
    },
    plans: AGENT_BUNDLES,
  });
}
