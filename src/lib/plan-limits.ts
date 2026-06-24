export interface PlanConfig {
  searches: number;
  cv_gens: number;
  pf_balance: number;
}

export const PLAN_LIMITS: Record<string, PlanConfig> = {
  Free: { searches: 1, cv_gens: 0, pf_balance: 0 },
  Seeker: { searches: 10, cv_gens: 5, pf_balance: 5 },
  Hunter: { searches: 25, cv_gens: 12, pf_balance: 15 },
  Pro: { searches: 60, cv_gens: 25, pf_balance: 50 },
};

export const PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  Seeker: { monthly: 9900, annual: 99000 },
  Hunter: { monthly: 19900, annual: 199000 },
  Pro: { monthly: 34900, annual: 349000 },
};

export const PF_DEFAULT_BY_TIER: Record<string, number> = {
  Seeker: 1,
  Hunter: 3,
  Pro: 6,
};

export const PF_PRICE_BREAKS = [
  { min: 1, max: 2, price: 59 },
  { min: 3, max: 5, price: 54 },
  { min: 6, max: 10, price: 49 },
  { min: 11, max: 25, price: 45 },
] as const;

export function calculatePFPrice(count: number): number {
  if (count <= 0) return 0;
  for (const b of PF_PRICE_BREAKS) {
    if (count >= b.min && count <= b.max) return b.price;
  }
  return 45;
}

export const PAYSTACK_PLAN_CODES: Record<string, string> = {
  Seeker_monthly: process.env.PLAN_CODE_SEEKER_MONTHLY ?? "",
  Seeker_annual: process.env.PLAN_CODE_SEEKER_ANNUAL ?? "",
  Hunter_monthly: process.env.PLAN_CODE_HUNTER_MONTHLY ?? "",
  Hunter_annual: process.env.PLAN_CODE_HUNTER_ANNUAL ?? "",
  Pro_monthly: process.env.PLAN_CODE_PRO_MONTHLY ?? "",
  Pro_annual: process.env.PLAN_CODE_PRO_ANNUAL ?? "",
};

export function formatPlanPrice(plan: string, cycle: "monthly" | "annual"): string {
  const kobo = PLAN_PRICES[plan]?.[cycle] ?? 0;
  return `R${(kobo / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatPFFromPrice(): string {
  const lowest = PF_PRICE_BREAKS[PF_PRICE_BREAKS.length - 1].price;
  return `R${lowest}/run`;
}

export const PLAN_TIER_NAMES = ["Free", "Seeker", "Hunter", "Pro"] as const;
