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

export async function generateIndustryLadder(industry: string, jobTitles?: string[]): Promise<IndustryLadderSteps> {
  if (!industry?.trim()) {
    return {
      step_1: "", step_1_taxonomy_id: null, step_2: "", step_2_taxonomy_id: null,
      step_3: "", step_3_taxonomy_id: null, step_4: "", step_4_taxonomy_id: null,
      step_5: "", step_5_taxonomy_id: null,
    };
  }

  const branch = await getTaxonomyBranch(industry.trim());
  const hasTaxonomy = branch.length > 0;

  const branchJson = hasTaxonomy
    ? branch.map((n) => `  ${n.id} | depth=${n.depth} | ${n.name}`).join("\n")
    : "";

  const titlesContext = jobTitles?.filter(Boolean).length
    ? `\n\nCANDIDATE'S JOB TITLES (from most specific to broadest): ${jobTitles.filter(Boolean).join(" → ")}`
    : "";

  const systemPrompt = hasTaxonomy
    ? `You are a career matching specialist. Given a candidate's job function and
a constrained industry taxonomy, build a 5-step industry broadening ladder.

CRITICAL RULE: The ladder must anchor on the CANDIDATE'S SKILL SET AND JOB FUNCTION,
NOT the employer's operating industry. A React/Node developer's ladder is
Web Development → Software Development → IT → Technology → Digital Economy —
even if they work at a logistics company. A developer at a bank builds software,
so their ladder is Software Development → IT → Technology, NOT Banking → Financial Services.
An accountant at a tech company builds their ladder from Accounting → Finance → Business,
NOT Technology.

RULES:
- Step 1 = the candidate's actual functional niche (e.g., "Web Development", "Financial Accounting", "Digital Marketing")
- Step 2 = one level broader in the FUNCTION domain (e.g., "Software Development", "Accounting & Finance", "Marketing")
- Step 3 = next level broader
- Step 4 = next level broader
- Step 5 = the broadest economic sector the FUNCTION belongs to
- Use the employer's industry ONLY as a tiebreaker when the function is genuinely ambiguous.
- For industry-agnostic roles (developers, accountants, marketers, analysts), the function ALWAYS dominates.

TAXONOMY (only the branch containing the candidate's industry):
ID | depth | name
${branchJson}

TASK:
1. Identify the candidate's CORE FUNCTION from their job titles (e.g., "Software Development", "Financial Accounting", "Digital Marketing").
2. Find the closest taxonomy node to that FUNCTION (not the employer's industry).
3. Walk upward through each parent to depth 0.
4. Build a 5-step ladder.
5. If the taxonomy path has fewer than 5 nodes, pad by repeating step 5.
6. For each step, include the taxonomy_id (UUID) if one exists, otherwise null.

The ladder MUST stay within the taxonomy branch — never cross sectors.
If the candidate's function doesn't map cleanly to the taxonomy, use the closest
functional category and broaden from there.

Return ONLY valid JSON:
{
  "steps": [
    { "step": 1, "value": "...", "taxonomy_id": "uuid-or-null" },
    { "step": 2, "value": "...", "taxonomy_id": "uuid-or-null" },
    { "step": 3, "value": "...", "taxonomy_id": "uuid-or-null" },
    { "step": 4, "value": "...", "taxonomy_id": "uuid-or-null" },
    { "step": 5, "value": "...", "taxonomy_id": "uuid-or-null" }
  ]
}`
    : `You are a career matching specialist. Given a candidate's job function and
employer industry, build a 5-step industry broadening ladder using your
knowledge of real-world industry hierarchies.

CRITICAL RULE: Anchor the ladder on the CANDIDATE'S SKILL SET AND JOB FUNCTION,
NOT the employer's operating industry. A React/Node developer at a logistics
company broadens through: Web Development → Software Development → IT → Technology
→ Digital Economy. NOT Logistics Technology → Supply Chain → Transportation.
An accountant at a tech company broadens through: Financial Accounting → Accounting
→ Finance → Business → Professional Services. NOT Technology → Software → IT.

RULES:
- step 1 = the candidate's most specific functional niche
- step 2 = one level broader in the function domain
- step 3 = next level broader
- step 4 = next level broader
- step 5 = the broadest economic sector this function belongs to
- Each step must be a genuine, real-world industry category.
- Use the employer's industry ONLY as a tiebreaker when the function is ambiguous.
- For industry-agnostic roles (developers, accountants, marketers, analysts), function ALWAYS dominates.

Example: Developer at a logistics company with titles "Software Developer → Backend Developer"
→ ["Software Development", "Information Technology", "Technology", "Technology & Digital", "Technology & Digital"]
NOT ["Logistics Technology", "Supply Chain Software", "Logistics", "Transportation", "Industrial Goods"]

Example: Accountant at a retail company
→ ["Financial Accounting", "Accounting & Finance", "Financial Services", "Business Services", "Business Services"]
NOT ["Retail Finance", "Retail", "Consumer Goods", "Retail & Consumer Goods", "Consumer Goods"]

Example: Digital marketer at an e-commerce company
→ ["Digital Marketing", "Marketing & Advertising", "Media & Marketing", "Media & Entertainment", "Media & Entertainment"]
NOT ["E-commerce Marketing", "E-commerce", "Online Retail", "Retail", "Consumer Goods"]

Example: "Private Wealth Banking"
→ ["Private Wealth Banking", "Wealth Management", "Banking", "Financial Services", "Financial Services"]
Example: "Pharmaceuticals"
→ ["Pharmaceutical R&D", "Pharmaceuticals", "Healthcare Products", "Healthcare", "Healthcare"]

Return ONLY valid JSON:
{
  "steps": [
    { "step": 1, "value": "Pharmaceutical R&D", "taxonomy_id": null },
    { "step": 2, "value": "Pharmaceuticals", "taxonomy_id": null },
    { "step": 3, "value": "Healthcare Products", "taxonomy_id": null },
    { "step": 4, "value": "Healthcare", "taxonomy_id": null },
    { "step": 5, "value": "Healthcare", "taxonomy_id": null }
  ]
}`;

  const userContent = `Candidate's employer industry: "${industry.trim()}"${titlesContext}`;

  try {
    const raw = await callAIWithFallback(systemPrompt, userContent, "generate industry ladder", {
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

    return result;
  } catch (err) {
    const step = industry.trim();
    return {
      step_1: step, step_1_taxonomy_id: null, step_2: step, step_2_taxonomy_id: null,
      step_3: step, step_3_taxonomy_id: null, step_4: step, step_4_taxonomy_id: null,
      step_5: step, step_5_taxonomy_id: null,
    };
  }
}

// ─── Upsert industry ladder directly on search_profiles ──────────────────

export async function upsertIndustryLadder(searchProfileId: string, steps: IndustryLadderSteps): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("search_profiles")
    .update({
      industry_step_1: steps.step_1, industry_step_1_taxonomy_id: steps.step_1_taxonomy_id,
      industry_step_2: steps.step_2, industry_step_2_taxonomy_id: steps.step_2_taxonomy_id,
      industry_step_3: steps.step_3, industry_step_3_taxonomy_id: steps.step_3_taxonomy_id,
      industry_step_4: steps.step_4, industry_step_4_taxonomy_id: steps.step_4_taxonomy_id,
      industry_step_5: steps.step_5, industry_step_5_taxonomy_id: steps.step_5_taxonomy_id,
      industry_ladder_generated_at: new Date().toISOString(),
      needs_reanalysis: false,
      last_analysed_at: new Date().toISOString(),
    })
    .eq("id", searchProfileId);
  if (error) {
    debugLog(`[LADDER] Failed to upsert industry ladder: ${error.message}`);
    throw error;
  }
}

// ─── Read taxonomy for UI dropdowns ──────────────────────────────────────

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
