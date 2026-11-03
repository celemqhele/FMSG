/**
 * FMSG Agents — Unified South African (`en-ZA`) Formatting & Data Truth Layer (P1A.1)
 *
 * Eliminates conflicting date, currency, location, profile-name, and usage-ratio
 * formats across Home, Run, Applications, Review, Profiles, Billing, and Settings.
 */

export function formatDateZA(
  input?: string | number | Date | null,
  fallback = 'Recent'
): string {
  if (!input) return fallback;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatShortDayDateZA(input: Date): {
  weekday: string;
  dayMonth: string;
  fullLabel: string;
} {
  const weekday = new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
  }).format(input);
  const dayMonth = new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
  }).format(input);
  return {
    weekday,
    dayMonth,
    fullLabel: `${weekday}, ${dayMonth}`,
  };
}

export function formatDateTimeZA(
  input?: string | number | Date | null,
  fallback = 'Never'
): string {
  if (!input) return fallback;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return fallback;
  const datePart = new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
  const timePart = new Intl.DateTimeFormat('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${datePart}, ${timePart}`;
}

export function formatZar(
  amountZar: number,
  options?: { perApplication?: boolean }
): string {
  const clean = Math.max(0, Math.round(Number(amountZar) || 0));
  const formatted =
    clean >= 1000
      ? `R${clean.toLocaleString('en-ZA').replace(/,/g, ' ')}`
      : `R${clean}`;
  if (options?.perApplication) {
    return `${formatted} per application`;
  }
  return formatted;
}

/**
 * Strips accidental trailing numeric array indices (e.g. "Nomkhosi Mpungose 1" -> "Nomkhosi Mpungose")
 * while preserving meaningful names.
 */
export function formatProfileName(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'Search Profile';
  const trimmed = name.trim();
  if (!trimmed) return 'Search Profile';
  const stripped = trimmed.replace(/\s+\d+$/, '').trim();
  return stripped || trimmed;
}

/**
 * Normalizes South African location strings so "Gauteng South Africa" or
 * "Pretoria South Africa" become grammatical ("Gauteng, South Africa").
 */
export function formatLocationZA(
  location?: string | null,
  fallback = 'South Africa'
): string {
  if (!location || typeof location !== 'string') return fallback;
  const trimmed = location.trim();
  if (!trimmed || trimmed.toUpperCase() === 'SA') return fallback;

  // Replace missing comma before "South Africa"
  const fixedCountry = trimmed.replace(
    /([^,\s])\s+(South Africa)$/i,
    '$1, $2'
  );
  // Normalize spacing around commas
  return fixedCountry
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

export interface AllowanceUsageTruth {
  used: number;
  included: number;
  includedUsed: number;
  remainingIncluded: number;
  overageCount: number;
  isOverage: boolean;
  ringPercent: number;
  ringCenterTop: string;
  ringCenterBottom: string;
  summaryLine: string;
  badgeText: string;
}

/**
 * Computes non-contradictory usage metrics so the UI never displays
 * "100% used" and "6 / 5" simultaneously (HM-01, BL-02).
 */
export function computeAllowanceUsage(
  usedCount: number,
  includedAllowance: number
): AllowanceUsageTruth {
  const used = Math.max(0, Math.floor(usedCount || 0));
  const included = Math.max(0, Math.floor(includedAllowance || 0));

  if (included <= 0) {
    return {
      used,
      included: 0,
      includedUsed: 0,
      remainingIncluded: 0,
      overageCount: used,
      isOverage: false,
      ringPercent: 0,
      ringCenterTop: `${used}`,
      ringCenterBottom: 'tracked',
      summaryLine: `${used} application${used === 1 ? '' : 's'} tracked`,
      badgeText: 'Pay-As-You-Go',
    };
  }

  const includedUsed = Math.min(used, included);
  const remainingIncluded = Math.max(0, included - used);
  const overageCount = Math.max(0, used - included);
  const isOverage = overageCount > 0;
  const ringPercent = Math.min(100, Math.round((includedUsed / included) * 100));

  return {
    used,
    included,
    includedUsed,
    remainingIncluded,
    overageCount,
    isOverage,
    ringPercent,
    ringCenterTop: `${includedUsed} / ${included}`,
    ringCenterBottom: isOverage ? `+${overageCount} extra` : 'included',
    summaryLine: isOverage
      ? `${included} of ${included} included used · +${overageCount} on Pay-As-You-Go`
      : `${includedUsed} of ${included} included used (${remainingIncluded} remaining)`,
    badgeText: isOverage
      ? `Allowance full · +${overageCount} extra`
      : `${remainingIncluded} remaining`,
  };
}
