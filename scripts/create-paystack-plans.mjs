// Run: node scripts/create-paystack-plans.mjs
// Requires PAYSTACK_SECRET_KEY env var set

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
if (!PAYSTACK_SECRET_KEY) {
  console.error("Set PAYSTACK_SECRET_KEY first (e.g. $env:PAYSTACK_SECRET_KEY='sk_...')");
  process.exit(1);
}

const PLANS = [
  { name: "Seeker Monthly", amount: 7900, interval: "monthly", key: "PLAN_CODE_SEEKER_MONTHLY" },
  { name: "Seeker Annual", amount: 79000, interval: "annually", key: "PLAN_CODE_SEEKER_ANNUAL" },
  { name: "Hunter Monthly", amount: 14900, interval: "monthly", key: "PLAN_CODE_HUNTER_MONTHLY" },
  { name: "Hunter Annual", amount: 149000, interval: "annually", key: "PLAN_CODE_HUNTER_ANNUAL" },
  { name: "Pro Monthly", amount: 24900, interval: "monthly", key: "PLAN_CODE_PRO_MONTHLY" },
  { name: "Pro Annual", amount: 249000, interval: "annually", key: "PLAN_CODE_PRO_ANNUAL" },
];

async function main() {
  for (const plan of PLANS) {
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
          description: `FMSG ${plan.name}`,
        }),
      });
      const data = await res.json();
      if (data.status && data.data?.plan_code) {
        console.log(`${plan.key}=${data.data.plan_code}`);
      } else {
        console.error(`Failed: ${plan.name}`, JSON.stringify(data));
      }
    } catch (err) {
      console.error(`Error: ${plan.name}`, err.message);
    }
  }
}

main();
