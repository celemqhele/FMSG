export interface PlanConfig {
  searches: number;
  cv_gens: number;
  pf_balance: number;
}

export const PLAN_LIMITS: Record<string, PlanConfig> = {
  Free: { searches: 3, cv_gens: 1, pf_balance: 0 },
  Seeker: { searches: 25, cv_gens: 5, pf_balance: 5 },
  Hunter: { searches: 70, cv_gens: 15, pf_balance: 15 },
  Pro: { searches: 200, cv_gens: -1, pf_balance: 50 },
};

export const PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  Seeker: { monthly: 7900, annual: 79000 },
  Hunter: { monthly: 14900, annual: 149000 },
  Pro: { monthly: 24900, annual: 249000 },
};

export const PAYSTACK_PLAN_CODES: Record<string, string> = {
  Seeker_monthly: process.env.PLAN_CODE_SEEKER_MONTHLY ?? "",
  Seeker_annual: process.env.PLAN_CODE_SEEKER_ANNUAL ?? "",
  Hunter_monthly: process.env.PLAN_CODE_HUNTER_MONTHLY ?? "",
  Hunter_annual: process.env.PLAN_CODE_HUNTER_ANNUAL ?? "",
  Pro_monthly: process.env.PLAN_CODE_PRO_MONTHLY ?? "",
  Pro_annual: process.env.PLAN_CODE_PRO_ANNUAL ?? "",
};
