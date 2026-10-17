import { callAIWithFallback } from "@/lib/gemini";
import { buildLadderFromProfileLocation, LocationLadder } from "@/lib/location";

/**
 * AI-generated location broadening ladder (city → region → country → continent),
 * mirroring the industry ladder pattern (career-ladders.ts). Generated ONCE at
 * profile save time; all search-time matching against it is deterministic
 * (see location.ts jobMatchesScope).
 */

export interface LocationLadderSteps {
  step_1: string; // city / metro
  step_2: string; // province / state / region
  step_3: string; // country
  step_4: string; // continent
}

export function ladderStepsToLadder(steps: LocationLadderSteps): LocationLadder {
  return {
    city: steps.step_1 || "",
    region: steps.step_2 || "",
    country: steps.step_3 || "",
    continent: steps.step_4 || "",
  };
}

export async function generateLocationLadder(location: string): Promise<LocationLadderSteps> {
  if (!location?.trim()) {
    return { step_1: "", step_2: "", step_3: "", step_4: "" };
  }

  const systemPrompt = `You are a geographic hierarchy specialist. Given a candidate's
preferred work location, build a 4-step location broadening ladder.

RULES:
- Step 1 = the city/metro the candidate lives in (e.g., "Johannesburg", "Madrid", "Cape Town")
- Step 2 = the province/state/region/county containing that city (e.g., "Gauteng",
  "Community of Madrid", "Western Cape"). For countries with no first-level regions
  (e.g., Qatar), repeat the country name.
- Step 3 = the country (e.g., "South Africa", "Spain")
- Step 4 = the continent (e.g., "Africa", "Europe")
- EVERY step must be exactly ONE place name. Never join two places with "and", "/",
  or a comma. Use "Western Cape" — NOT "Western Cape Province".
- Use official short names: "United Kingdom" not "Great Britain"; "United States" not "USA".
- If a level cannot be determined with confidence, return "" for that step (never guess).

Example: "Sandton, Johannesburg"
→ ["Johannesburg", "Gauteng", "South Africa", "Africa"]

Example: "Madrid"
→ ["Madrid", "Community of Madrid", "Spain", "Europe"]

Return ONLY valid JSON:
{
  "steps": [
    { "step": 1, "value": "Johannesburg" },
    { "step": 2, "value": "Gauteng" },
    { "step": 3, "value": "South Africa" },
    { "step": 4, "value": "Africa" }
  ]
}`;

  const userContent = `Candidate's preferred work location: "${location.trim()}"`;

  try {
    const raw = await callAIWithFallback(systemPrompt, userContent, "generate location ladder", {
      responseMimeType: "application/json",
      temperature: 0.2,
    });
    const cleaned = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const data = JSON.parse(cleaned);
    const steps = data.steps ?? [];

    const result: LocationLadderSteps = { step_1: "", step_2: "", step_3: "", step_4: "" };
    for (const s of steps) {
      const idx = s.step;
      if (idx >= 1 && idx <= 4 && typeof s.value === "string") {
        result[`step_${idx}` as keyof LocationLadderSteps] = s.value.trim();
      }
    }

    // Sanity: an unresolvable location (e.g. "Remote") must not produce a junk ladder
    if (!result.step_1 && !result.step_3) {
      return buildLadderStepsFromStatic(location);
    }
    return result;
  } catch (err) {
    console.warn(`[LOCATION-LADDER] AI failed for "${location}":`, err);
    return buildLadderStepsFromStatic(location);
  }
}

/** Deterministic fallback (no AI): derive whatever the static mapper can resolve. */
function buildLadderStepsFromStatic(location: string): LocationLadderSteps {
  const ladder = buildLadderFromProfileLocation(location);
  return {
    step_1: ladder.city,
    step_2: ladder.region,
    step_3: ladder.country,
    step_4: ladder.continent,
  };
}
