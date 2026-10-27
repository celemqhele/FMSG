import { createClient } from "@/lib/supabase/client";

/**
 * Legacy (5-rung) profile detection + mandatory bulk upgrade.
 *
 * Until the 2026-10 ladder trim, a search profile stored a 5-step job title
 * ladder and a 5-step industry ladder. Matching now runs on 2 rungs per ladder
 * (main + secondary title; niche + main industry), so a profile that still
 * carries rungs 3-5 is "legacy": nothing reads those columns any more, and
 * saving the profile editor silently drops them.
 *
 * Every account that still has legacy profiles is walked through the upgrade
 * once (it is not optional): each profile keeps its top two titles, gets its
 * industry rungs re-derived by the current 2-rung generator and has the retired
 * columns cleared. The AI call is best-effort — a profile whose call fails keeps
 * the rungs it already had, so the pass can never leave a profile worse off.
 */

/** How many rungs a modern title/industry ladder has. */
export const MAX_LADDER_TITLES = 2;

/** Columns needed to detect and upgrade a legacy profile. */
export const LEGACY_PROFILE_COLUMNS =
  "id, name, job_titles, industry, industry_step_1, industry_step_2, industry_step_3, industry_step_4, industry_step_5, industry_step_1_taxonomy_id, industry_step_2_taxonomy_id";

export interface LegacyLadderProfile {
  id: string;
  name?: string | null;
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
  id: string;
  /** Profile name for the progress/summary UI. */
  name: string;
  /** Titles kept after the upgrade (at most {@link MAX_LADDER_TITLES}). */
  titles: string[];
  /** Titles that were retired by the trim. */
  retiredTitles: string[];
  /** Industry rungs after the upgrade — niche, main industry. */
  rungs: string[];
  /** True when the rungs were re-derived by the AI generator. */
  ladderRebuilt: boolean;
}

export interface LegacyUpgradeProgress {
  /** Profiles finished so far, including the one currently running. */
  done: number;
  total: number;
  /** Name of the profile being upgraded right now. */
  current: string;
}

export interface LegacyBulkResult {
  upgraded: LegacyUpgradeResult[];
  failed: Array<{ id: string; name: string; error: string }>;
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
  return ([3, 4, 5] as const).some((step) => rungValue(profile, step).length > 0);
}

/** Every legacy profile belonging to the signed-in user (empty when signed out). */
export async function fetchLegacyProfiles(): Promise<LegacyLadderProfile[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("search_profiles")
    .select(LEGACY_PROFILE_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at");

  if (error || !Array.isArray(data)) return [];
  return (data as unknown as LegacyLadderProfile[]).filter(isLegacyLadderProfile);
}

interface SuggestedRung {
  value: string;
  taxonomyId: string | null;
}

async function suggestIndustryRungs(industry: string, titles: string[]): Promise<SuggestedRung[] | null> {
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
  const steps: Array<{ value?: unknown; taxonomy_id?: unknown }> = Array.isArray(json?.steps) ? json.steps : [];
  const rungs = steps
    .map((s) => ({
      value: typeof s?.value === "string" ? s.value.trim() : "",
      taxonomyId: typeof s?.taxonomy_id === "string" && s.taxonomy_id ? s.taxonomy_id : null,
    }))
    .filter((r) => r.value);
  return rungs.length > 0 ? rungs : null;
}

/**
 * Rewrite one legacy profile onto the 2-rung ladder.
 *
 * Never fails closed: if the AI ladder call returns nothing, the rungs already
 * on the profile are kept, so the profile always ends up with two usable rungs
 * and no retired columns.
 */
export async function upgradeLegacyProfile(profile: LegacyLadderProfile): Promise<LegacyUpgradeResult> {
  const allTitles = cleanTitles(profile.job_titles);
  const titles = allTitles.slice(0, MAX_LADDER_TITLES);
  const retiredTitles = allTitles.slice(MAX_LADDER_TITLES);
  const name = (profile.name ?? "").trim() || titles[0] || "Profile";

  let rungs: SuggestedRung[] = [
    { value: rungValue(profile, 1), taxonomyId: null },
    { value: rungValue(profile, 2), taxonomyId: null },
  ].filter((r) => r.value);
  let ladderRebuilt = false;

  const industry = (profile.industry ?? "").trim();
  if (industry && titles.length > 0) {
    const suggested = await suggestIndustryRungs(industry, titles).catch(() => null);
    if (suggested && suggested.length > 0) {
      rungs = suggested;
      ladderRebuilt = true;
    }
  }

  const rung1 = rungs[0]?.value ?? "";
  const rung2 = rungs[1]?.value ?? rung1;

  const supabase = createClient();
  const { error } = await supabase
    .from("search_profiles")
    .update({
      job_titles: titles,
      industry_step_1: rung1,
      industry_step_2: rung2,
      industry_step_1_taxonomy_id: rungs[0]?.taxonomyId ?? null,
      industry_step_2_taxonomy_id: rungs[1]?.taxonomyId ?? null,
      // Retired rungs: nulled so the profile reads as modern and the prompt stops.
      industry_step_3: null,
      industry_step_4: null,
      industry_step_5: null,
      industry_step_3_taxonomy_id: null,
      industry_step_4_taxonomy_id: null,
      industry_step_5_taxonomy_id: null,
      industry_ladder_generated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) throw new Error(error.message);

  return { id: profile.id, name, titles, retiredTitles, rungs: [rung1, rung2], ladderRebuilt };
}

/**
 * Upgrade every supplied profile in sequence, reporting progress before each
 * one. A failing profile is recorded and skipped — the rest still run.
 */
export async function upgradeLegacyProfiles(
  profiles: LegacyLadderProfile[],
  onProgress?: (progress: LegacyUpgradeProgress) => void
): Promise<LegacyBulkResult> {
  const upgraded: LegacyUpgradeResult[] = [];
  const failed: LegacyBulkResult["failed"] = [];

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const label = (profile.name ?? "").trim() || cleanTitles(profile.job_titles)[0] || "Profile";
    onProgress?.({ done: i + 1, total: profiles.length, current: label });

    try {
      upgraded.push(await upgradeLegacyProfile(profile));
    } catch (err) {
      failed.push({
        id: profile.id,
        name: label,
        error: err instanceof Error ? err.message : "Upgrade failed.",
      });
    }
  }

  return { upgraded, failed };
}
