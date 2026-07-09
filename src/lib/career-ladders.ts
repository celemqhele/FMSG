import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";
import { debugLog } from "@/lib/debug";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export interface IndustryLadderSteps {
  step_1: string;
  step_1_taxonomy_id: string | null;
  step_2: string;
  step_2_taxonomy_id: string | null;
  step_3: string;
  step_3_taxonomy_id: string | null;
  step_4: string;
  step_4_taxonomy_id: string | null;
  step_5: string;
  step_5_taxonomy_id: string | null;
}

export interface TitleLadders {
  title_ladders: Record<string, string[]>;
  cv_label: string;
}

// ─── Prompt A: Seed industry taxonomy ────────────────────────────────────

const PROMPT_SEED_TAXONOMY = `You are building a global industry taxonomy for a job matching system.
Generate a comprehensive 4-level hierarchical taxonomy.

Rules:
- Level 0 = broadest economic sectors
- Level 1 = sub-sectors
- Level 2 = industry niches
- Level 3 = hyper-niche (most specific)
- Every node at depth 1-3 must have a parent at depth-1 that is a genuine
  broader category. No fictional or crossover paths.
- This is about INDUSTRIES (where employers operate), NOT job titles.
  "Cybersecurity" is an industry. "Penetration Tester" is a title — do not
  include titles.

Cover these major sectors at minimum: Financial Services, Technology,
Healthcare, Manufacturing, Energy & Utilities, Retail & E-commerce,
Education, Government & Public Sector, Transportation & Logistics,
Media & Entertainment, Agriculture & Food, Legal Services, Real Estate,
Hospitality & Tourism, Telecommunications, Construction & Engineering,
Insurance, Mining & Resources, Pharmaceuticals, Automotive,
Aerospace & Defence.

Return a flat JSON array where each node has:
- name (string): the industry name
- parent (string | null): exact name of the parent node, null for depth 0
- depth (number): 0-3

Return ONLY valid JSON, no markdown, no code fences.`;

export async function seedIndustryTaxonomy(): Promise<{ inserted: number }> {
  const supabase = getSupabase();
  const raw = await callAIWithFallback(PROMPT_SEED_TAXONOMY, "", "seed industry taxonomy", {
    responseMimeType: "application/json",
    temperature: 0.3,
  });

  const cleaned = raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1);
  const nodes: { name: string; parent: string | null; depth: number }[] = JSON.parse(cleaned);

  const nameToId = new Map<string, string>();

  for (let depth = 0; depth <= 3; depth++) {
    const batch = nodes.filter((n) => n.depth === depth);
    for (const node of batch) {
      const parentId = node.parent ? nameToId.get(node.parent) ?? null : null;
      const { data } = await supabase
        .from("industry_taxonomy")
        .insert({ name: node.name, parent_id: parentId, depth: node.depth })
        .select("id")
        .single();
      if (data) nameToId.set(node.name, data.id);
    }
  }

  debugLog(`[TAXONOMY] Seeded ${nodes.length} nodes into industry_taxonomy`);
  return { inserted: nodes.length };
}

// ─── Taxonomy subtree fetcher ────────────────────────────────────────────

async function getTaxonomyBranch(industry: string): Promise<{ id: string; name: string; parent_id: string | null; depth: number }[]> {
  const supabase = getSupabase();

  const { data: match } = await supabase
    .from("industry_taxonomy")
    .select("id, name, parent_id, depth")
    .ilike("name", `%${industry}%`)
    .limit(1)
    .maybeSingle();

  if (!match) {
    const { data: all } = await supabase.from("industry_taxonomy").select("*").limit(1);
    if (!all?.length) return [];
    const { data: branch } = await supabase.from("industry_taxonomy").select("*");
    return branch ?? [];
  }

  let rootId = match.id;
  let currentNode: { parent_id: string | null } | null = match;
  while (currentNode?.parent_id) {
    rootId = currentNode.parent_id;
    const { data: parent } = await supabase
      .from("industry_taxonomy")
      .select("id, parent_id")
      .eq("id", rootId)
      .maybeSingle();
    currentNode = parent ?? null;
  }

  const idsToFetch = new Set<string>([rootId]);
  let toExplore = [rootId];
  while (toExplore.length > 0) {
    const next = toExplore.pop()!;
    const { data: children } = await supabase
      .from("industry_taxonomy")
      .select("id")
      .eq("parent_id", next);
    for (const child of children ?? []) {
      if (!idsToFetch.has(child.id)) {
        idsToFetch.add(child.id);
        toExplore.push(child.id);
      }
    }
  }

  const { data: branch } = await supabase
    .from("industry_taxonomy")
    .select("*")
    .in("id", Array.from(idsToFetch));

  return branch ?? [];
}

// ─── Prompt B: Generate profile industry ladder ──────────────────────────

export async function generateIndustryLadder(industry: string, options?: { cvText?: string }): Promise<IndustryLadderSteps> {
  if (!industry?.trim()) {
    return {
      step_1: "", step_1_taxonomy_id: null, step_2: "", step_2_taxonomy_id: null,
      step_3: "", step_3_taxonomy_id: null, step_4: "", step_4_taxonomy_id: null,
      step_5: "", step_5_taxonomy_id: null,
    };
  }

  const branch = await getTaxonomyBranch(industry.trim());
  if (branch.length === 0) {
    debugLog(`[LADDER] No taxonomy match for industry "${industry}", returning flat ladder`);
    const step = industry.trim();
    return {
      step_1: step, step_1_taxonomy_id: null, step_2: step, step_2_taxonomy_id: null,
      step_3: step, step_3_taxonomy_id: null, step_4: step, step_4_taxonomy_id: null,
      step_5: step, step_5_taxonomy_id: null,
    };
  }

  const branchJson = branch.map((n) => `  ${n.id} | depth=${n.depth} | ${n.name}`).join("\n");

  const systemPrompt = `You are a career matching specialist. Given a candidate's specific industry
and a constrained industry taxonomy, build a 5-step industry ladder.

TAXONOMY (only the branch containing the candidate's industry):
ID | depth | name
${branchJson}

TASK:
1. Find the closest matching taxonomy node to the candidate's industry.
2. Walk upward through each parent to depth 0.
3. Build a 5-step ladder:
   - step 1 = the hyper-niche (deepest taxonomy match, depth 3 if available)
   - step 2 = one level broader (parent)
   - step 3 = next level broader
   - step 4 = next level broader
   - step 5 = the depth-0 broad economic sector
4. If the taxonomy path has fewer than 5 nodes, pad by repeating step 5
   at the remaining positions.
5. If the taxonomy path has more than 5 nodes, keep the most specific and most
   broad and select intermediate steps that best distribute the broadening evenly.
6. For each step, include the taxonomy_id (UUID) of the matched taxonomy node if one
   exists, otherwise set taxonomy_id to null.

The ladder MUST stay within the taxonomy branch — never cross into an
unrelated sector (e.g. Pharmaceuticals must not ladder into Technology).

Return ONLY valid JSON:
{
  "steps": [
    { "step": 1, "value": "...", "taxonomy_id": "uuid-or-null" },
    { "step": 2, "value": "...", "taxonomy_id": "uuid-or-null" },
    { "step": 3, "value": "...", "taxonomy_id": "uuid-or-null" },
    { "step": 4, "value": "...", "taxonomy_id": "uuid-or-null" },
    { "step": 5, "value": "...", "taxonomy_id": "uuid-or-null" }
  ]
}`;

  try {
    const raw = await callAIWithFallback(systemPrompt, `Candidate's industry: "${industry.trim()}"`, "generate industry ladder", {
      responseMimeType: "application/json",
      temperature: 0.3,
    });
    const cleaned = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const data = JSON.parse(cleaned);
    const steps = data.steps ?? [];

    const result: IndustryLadderSteps = {
      step_1: "", step_1_taxonomy_id: null, step_2: "", step_2_taxonomy_id: null,
      step_3: "", step_3_taxonomy_id: null, step_4: "", step_4_taxonomy_id: null,
      step_5: "", step_5_taxonomy_id: null,
    };

    for (const s of steps) {
      const idx = s.step;
      if (idx >= 1 && idx <= 5) {
        const key = `step_${idx}` as keyof IndustryLadderSteps;
        const tidKey = `step_${idx}_taxonomy_id` as keyof IndustryLadderSteps;
        result[key] = s.value ?? "";
        (result as any)[tidKey] = s.taxonomy_id ?? null;
      }
    }

    debugLog(`[LADDER] Generated industry ladder: ${[result.step_1, result.step_2, result.step_3, result.step_4, result.step_5].filter(Boolean).join(" > ")}`);
    return result;
  } catch (err) {
    debugLog(`[LADDER] Industry ladder generation failed: ${err instanceof Error ? err.message : String(err)}`);
    const step = industry.trim();
    return {
      step_1: step, step_1_taxonomy_id: null, step_2: step, step_2_taxonomy_id: null,
      step_3: step, step_3_taxonomy_id: null, step_4: step, step_4_taxonomy_id: null,
      step_5: step, step_5_taxonomy_id: null,
    };
  }
}

// ─── Prompt C: Generate title ladders per CV ─────────────────────────────

export async function generateTitleLadders(
  titles: string[],
  cvText: string,
  existingLabels: string[] = [],
): Promise<TitleLadders> {
  const titlesStr = JSON.stringify(titles);
  const existingLabelsStr = existingLabels.length > 0
    ? `\nEXISTING CV LABELS for this profile: ${JSON.stringify(existingLabels)}\nThe cv_label you generate should differentiate this CV from the existing ones.`
    : "";

  const systemPrompt = `You are a career expansion specialist. Given a CV's content and the job
titles the candidate is targeting, generate an expanding career ladder for
each title.

RULES:
- For EACH title, generate a 5-step ladder where [0] is the most specific
  (the candidate's exact title or closest match), and [4] is the most
  generic function-level description of that role.
- Each step must be a real, searchable job board title.
- Each step must share overlapping skills with the previous step.
- Adjacent roles broaden naturally — don't jump across unrelated functions.
- The ladder reflects what the candidate COULD do, based on their actual
  CV content and skills.${existingLabelsStr}

Example:
Title: "Penetration Tester" (CV shows cybersecurity skills)
Ladder: ["Penetration Tester", "Cybersecurity Analyst",
         "IT Security Specialist", "IT Administrator",
         "Technology Professional"]

Title: "React Developer" (CV shows frontend skills)
Ladder: ["React Developer", "Frontend Developer", "Full Stack Developer",
         "Software Developer", "IT Professional"]

Return ONLY valid JSON:
{
  "title_ladders": {
    "Penetration Tester": ["Penetration Tester", "Cybersecurity Analyst", "IT Security Specialist", "IT Administrator", "Technology Professional"],
    "React Developer": ["React Developer", "Frontend Developer", "Full Stack Developer", "Software Developer", "IT Professional"]
  },
  "cv_label": "Cybersecurity angle"
}`;

  try {
    const raw = await callAIWithFallback(
      systemPrompt,
      `CV TEXT:\n${cvText.slice(0, 15000)}\n\nJOB TITLES:\n${titlesStr}`,
      "generate title ladders",
      { responseMimeType: "application/json", temperature: 0.4 },
    );
    const cleaned = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const data = JSON.parse(cleaned);
    debugLog(`[LADDER] Generated title ladders for ${Object.keys(data.title_ladders ?? {}).length} titles, label: "${data.cv_label}"`);
    return {
      title_ladders: data.title_ladders ?? {},
      cv_label: data.cv_label ?? "CV",
    };
  } catch (err) {
    debugLog(`[LADDER] Title ladder generation failed: ${err instanceof Error ? err.message : String(err)}`);
    const fallback: Record<string, string[]> = {};
    for (const title of titles) {
      fallback[title] = [title, title, title, title, title];
    }
    return { title_ladders: fallback, cv_label: "CV" };
  }
}

// ─── Upsert industry ladder to DB ────────────────────────────────────────

export async function upsertIndustryLadder(userId: string, steps: IndustryLadderSteps): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("profile_industry_ladder")
    .upsert({
      user_id: userId,
      step_1: steps.step_1, step_1_taxonomy_id: steps.step_1_taxonomy_id,
      step_2: steps.step_2, step_2_taxonomy_id: steps.step_2_taxonomy_id,
      step_3: steps.step_3, step_3_taxonomy_id: steps.step_3_taxonomy_id,
      step_4: steps.step_4, step_4_taxonomy_id: steps.step_4_taxonomy_id,
      step_5: steps.step_5, step_5_taxonomy_id: steps.step_5_taxonomy_id,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (error) {
    debugLog(`[LADDER] Failed to upsert industry ladder: ${error.message}`);
    throw error;
  }
}

// ─── Read cached ladders for PF search ───────────────────────────────────

export async function readCachedLadders(userId: string, profileId: string): Promise<{
  industryChain: string[];
  titleLaddersByCv: Array<{ label: string; title_ladders: Record<string, string[]> }>;
} | null> {
  const supabase = getSupabase();

  const { data: ladder } = await supabase
    .from("profile_industry_ladder")
    .select("step_1, step_2, step_3, step_4, step_5")
    .eq("user_id", userId)
    .maybeSingle();

  const industryChain = ladder
    ? [ladder.step_1, ladder.step_2, ladder.step_3, ladder.step_4, ladder.step_5]
    : null;

  const { data: searchProfile } = await supabase
    .from("search_profiles")
    .select("cv_variations")
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();

  const cvVariations: Array<{
    label?: string;
    title_ladders?: Record<string, string[]>;
    title_ladder?: string[];
    file_path: string;
  }> = (searchProfile as any)?.cv_variations ?? [];

  const titleLaddersByCv = cvVariations
    .map((cv) => {
      if (cv.title_ladders && typeof cv.title_ladders === "object") {
        return { label: cv.label ?? "CV", title_ladders: cv.title_ladders };
      }
      if (cv.title_ladder && Array.isArray(cv.title_ladder) && cv.title_ladder.length > 0) {
        const singles: Record<string, string[]> = {};
        singles[cv.label ?? "CV"] = cv.title_ladder;
        return { label: cv.label ?? "CV", title_ladders: singles };
      }
      return null;
    })
    .filter((cv): cv is { label: string; title_ladders: Record<string, string[]> } => cv !== null);

  if (!industryChain && titleLaddersByCv.length === 0) return null;

  return { industryChain: industryChain ?? [], titleLaddersByCv };
}

// ─── Read taxonomy rows for UI dropdowns ─────────────────────────────────

export async function getTaxonomyForBranch(industry: string): Promise<
  { id: string; name: string; depth: number; parent_id: string | null }[]
> {
  return getTaxonomyBranch(industry);
}

export async function getAllTaxonomy(): Promise<
  { id: string; name: string; depth: number; parent_id: string | null }[]
> {
  const supabase = getSupabase();
  const { data } = await supabase.from("industry_taxonomy").select("*").order("depth", { ascending: true });
  return data ?? [];
}
