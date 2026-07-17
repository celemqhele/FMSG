export interface PlanConfig {
  searches: number;
  cv_gens: number;
  pf_balance: number;
}

export const PLAN_LIMITS: Record<string, PlanConfig> = {
  Free: { searches: 2, cv_gens: 0, pf_balance: 0 },
  Seeker: { searches: 8, cv_gens: 4, pf_balance: 1 },
  Hunter: { searches: 12, cv_gens: 8, pf_balance: 2 },
  Pro: { searches: 15, cv_gens: 15, pf_balance: 4 },
};

export const PLAN_PRICES: Record<string, number> = {
  Seeker: 7900,
  Hunter: 14900,
  Pro: 24900,
};

export const PF_DEFAULT_BY_TIER: Record<string, number> = {
  Seeker: 0,
  Hunter: 0,
  Pro:    0,
};

export const PF_PRICE_BREAKS: { min: number; max?: number; price: number }[] = [
  { min: 1, max: 2, price: 59 },
  { min: 3, max: 5, price: 54 },
  { min: 6, max: 10, price: 49 },
  { min: 11, price: 45 },
];

export function calculatePFPrice(count: number): number {
  if (count <= 0) return 0;
  for (const b of PF_PRICE_BREAKS) {
    if (count >= b.min && (!b.max || count <= b.max)) return b.price;
  }
  return 45;
}

export const PAYSTACK_PLAN_CODES: Record<string, string> = {
  Seeker: process.env.NEXT_PUBLIC_PLAN_CODE_SEEKER ?? "",
  Hunter: process.env.NEXT_PUBLIC_PLAN_CODE_HUNTER ?? "",
  Pro: process.env.NEXT_PUBLIC_PLAN_CODE_PRO ?? "",
};

export function formatPlanPrice(plan: string): string {
  const kobo = PLAN_PRICES[plan] ?? 0;
  return `R${(kobo / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatPFFromPrice(): string {
  const lowest = PF_PRICE_BREAKS[PF_PRICE_BREAKS.length - 1].price;
  return `R${lowest}/run`;
}

export const SEARCH_PRICE_BREAKS: { min: number; max?: number; price: number }[] = [
  { min: 1, max: 2, price: 15 },
  { min: 3, max: 5, price: 13 },
  { min: 6, max: 10, price: 11 },
  { min: 11, price: 9 },
];

export function calculateSearchPrice(count: number): number {
  if (count <= 0) return 0;
  for (const b of SEARCH_PRICE_BREAKS) {
    if (count >= b.min && (!b.max || count <= b.max)) return b.price;
  }
  return 9;
}

export const CV_PRICE_BREAKS: { min: number; max?: number; price: number }[] = [
  { min: 1, max: 2, price: 25 },
  { min: 3, max: 5, price: 22 },
  { min: 6, max: 10, price: 19 },
  { min: 11, price: 16 },
];

export function calculateCVPrice(count: number): number {
  if (count <= 0) return 0;
  for (const b of CV_PRICE_BREAKS) {
    if (count >= b.min && (!b.max || count <= b.max)) return b.price;
  }
  return 16;
}

export const PLAN_TIER_NAMES = ["Free", "Seeker", "Hunter", "Pro"] as const;

export const TIER_FEATURES: Record<string, string[]> = {
  Free: ["2 job searches", "Basic match scoring"],
  Seeker: ["8 job searches", "4 CV generations", "1 PF search round", "Priority AI matching"],
  Hunter: ["12 job searches", "8 CV generations", "2 PF search rounds", "Priority AI matching", "Advanced filtering"],
  Pro: ["15 job searches", "15 CV generations", "4 PF search rounds", "Priority AI matching", "Advanced filtering", "Tailored CV output"],
};

export const TIER_POPULAR: Record<string, boolean> = {
  Free: false,
  Seeker: false,
  Hunter: true,
  Pro: false,
};
