import { createClient } from "@/lib/supabase/client";

/**
 * Legacy (5-rung) profile detection + one-click upgrade.
 *
 * Until the 2026-10 ladder trim, a search profile stored a 5-step job title
 * ladder and a 5-step industry ladder. Matching now runs on 2 rungs per ladder
 * (main + secondary title; niche + main industry), so a profile that still
 * carries rungs 3-5 is "legacy": nothing reads those columns any more, and
 * saving the profile editor silently drops them.
 *
 * `upgradeLegacyProfile` is the repair path behind the dashboard prompt: keep
 * the top two titles, re-derive the industry rungs with the current 2-rung
 * generator (existing rungs are the fallback when the AI call fails), and null
 * the retired columns so the prompt never comes back.
 */

/** How many rungs a modern title/industry ladder has. */
export const MAX_LADDER_TITLES = 2;

/** Industry ladder rungs retired by the 2-rung trim (columns left in the DB). */
const RETIRED_INDUSTRY_STEPS = [3, 4, 5] as const;

/** A dismissed prompt stays quiet for a week, then offers the upgrade again. */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const SNOOZE_PREFIX = "fmsg_legacy_ladder_snoozed:";

export interface LegacyLadderProfile {
  id: string;
  job_titles?: string[] | null;
  industry?: string | null;
  industry_step_1?: string | null;
  industry_step_2?: string | null;
  industry_step_3?: string | null;
  industry_step_4?: string | null;
  industry_step_5?: string | null;
}

export type LegacyUpgradeStatus = "idle" | "working" | "done" | "error";

export interface LegacyUpgradeResult {
  /** Titles kept after the upgrade (at most {@link MAX_LADDER_TITLES}). */
  titles: string[];
  /** Titles that were retired by the trim. */
  retiredTitles: string[];
  /** Industry rungs after the upgrade — niche, main industry. */
  rungs: string[];
  /** True when the rungs were re-derived by the AI generator. */
  ladderRebuilt: boolean;
}

function cleanTitles(titles: string[] | null | undefined): string[] {
  if (!Array.isArray(titles)) return [];
  return titles.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean);
}

function rungValue(profile: LegacyLadderProfile, step: 1 | 2 | 3 | 4 | 5): string {
  const value = profile[`industry_step_${step}` as keyof LegacyLadderProfile];
  return typeof value === "string" ? value.trim() : "";
}

/** Titles the profile carries beyond the modern 2-rung ladder. */
export function surplusTitles(profile: LegacyLadderProfile | null | undefined): string[] {
  return cleanTitles(profile?.job_titles).slice(MAX_LADDER_TITLES);
}

/** True when a profile still carries the retired 5-rung ladder data. */
export function isLegacyLadderProfile(profile: LegacyLadderProfile | null | undefined): boolean {
  if (!profile) return false;
  if (cleanTitles(profile.job_titles).length > MAX_LADDER_TITLES) return true;
  return RETIRED_INDUSTRY_STEPS.some((step) => rungValue(profile, step).length > 0);
}

/** True when the user dismissed the prompt for this profile within the snooze window. */
export function isLegacyLadderSnoozed(profileId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SNOOZE_PREFIX + profileId);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** Silence the prompt for this profile for one week. */
export function snoozeLegacyLadder(profileId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNOOZE_PREFIX + profileId, String(Date.now()));
  } catch {
    // Storage disabled (private mode) — the prompt simply shows again next load.
  }
}

async function suggestIndustryRungs(industry: string, titles: string[]): Promise<string[] | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const res = await fetch("/api/suggest-industry-ladder", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ industry, job_titles: titles }),
  });
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  const steps: Array<{ value?: unknown }> = Array.isArray(json?.steps) ? json.steps : [];
  const values = steps.map((s) => (typeof s?.value === "string" ? s.value.trim() : "")).filter(Boolean);
  return values.length > 0 ? values : null;
}

/**
 * Rewrite a legacy profile onto the 2-rung ladder.
 *
 * Never fails closed: if the AI ladder call returns nothing, the rungs already
 * on the profile are kept, so the profile always ends up with two usable rungs
 * and no retired columns.
 */
export async function upgradeLegacyProfile(profile: LegacyLadderProfile): Promise<LegacyUpgradeResult> {
  const allTitles = cleanTitles(profile.job_titles);
  const titles = allTitles.slice(0, MAX_LADDER_TITLES);
  const retiredTitles = allTitles.slice(MAX_LADDER_TITLES);

  let rungs = [rungValue(profile, 1), rungValue(profile, 2)].filter(Boolean);
  let ladderRebuilt = false;

  const industry = (profile.industry ?? "").trim();
  if (industry && titles.length > 0) {
    const suggested = await suggestIndustryRungs(industry, titles).catch(() => null);
    if (suggested && suggested.length > 0) {
      rungs = suggested;
      ladderRebuilt = true;
    }
  }

  const rung1 = rungs[0] ?? "";
  const rung2 = rungs[1] ?? rung1;

  const supabase = createClient();
  const { error } = await supabase
    .from("search_profiles")
    .update({
      job_titles: titles,
      industry_step_1: rung1,
      industry_step_2: rung2,
      // Retired rungs: nulled so the profile reads as modern and the prompt stops.
      industry_step_3: null,
      industry_step_4: null,
      industry_step_5: null,
      industry_ladder_generated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) throw new Error(error.message);

  return { titles, retiredTitles, rungs: [rung1, rung2], ladderRebuilt };
}
