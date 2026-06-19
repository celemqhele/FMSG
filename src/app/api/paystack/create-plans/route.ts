import { NextResponse } from "next/server";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const PLANS = [
  { name: "Seeker Monthly", amount: 7900, interval: "monthly", description: "FMSG Seeker Plan - Monthly" },
  { name: "Seeker Annual", amount: 79000, interval: "annually", description: "FMSG Seeker Plan - Annual" },
  { name: "Hunter Monthly", amount: 14900, interval: "monthly", description: "FMSG Hunter Plan - Monthly" },
  { name: "Hunter Annual", amount: 149000, interval: "annually", description: "FMSG Hunter Plan - Annual" },
  { name: "Pro Monthly", amount: 24900, interval: "monthly", description: "FMSG Pro Plan - Monthly" },
  { name: "Pro Annual", amount: 249000, interval: "annually", description: "FMSG Pro Plan - Annual" },
];

const PLAN_ENV_MAP: Record<string, string> = {
  "Seeker Monthly": "PLAN_CODE_SEEKER_MONTHLY",
  "Seeker Annual": "PLAN_CODE_SEEKER_ANNUAL",
  "Hunter Monthly": "PLAN_CODE_HUNTER_MONTHLY",
  "Hunter Annual": "PLAN_CODE_HUNTER_ANNUAL",
  "Pro Monthly": "PLAN_CODE_PRO_MONTHLY",
  "Pro Annual": "PLAN_CODE_PRO_ANNUAL",
};

export async function POST() {
  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  const results: Record<string, string> = {};

  for (const plan of PLANS) {
    // Check if already exists in env
    const envKey = PLAN_ENV_MAP[plan.name];
    if (envKey && process.env[envKey]) {
      results[plan.name] = process.env[envKey]!;
      continue;
    }

    // Create via Paystack API
    try {
      const res = await fetch("https://api.paystack.co/plan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: plan.name,
          amount: plan.amount,
          interval: plan.interval,
          currency: "ZAR",
          description: plan.description,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(`[PAYSTACK] Failed to create plan ${plan.name}: ${err}`);
        continue;
      }

      const data = await res.json();
      if (data.status && data.data?.plan_code) {
        results[plan.name] = data.data.plan_code;
        console.log(`[PAYSTACK] Created plan ${plan.name}: ${data.data.plan_code}`);
      } else {
        console.error(`[PAYSTACK] Unexpected response for ${plan.name}:`, JSON.stringify(data));
      }
    } catch (err) {
      console.error(`[PAYSTACK] Error creating plan ${plan.name}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    plans: results,
    instructions: "Add these plan codes to your environment variables.",
  });
}
