import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { callAIWithFallback } from "@/lib/gemini";
import { toSingleConcept } from "@/lib/search-query";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * Two-rung industry ladder: the candidate's functional niche, then the main
 * industry that function belongs to. Persistent Finder runs one search per
 * rung (rounds 1-2) and then repeats both titles with the industry removed
 * (rounds 3-4), so a near-duplicate middle rung would add nothing.
 */
interface IndustryLadderSteps {
  step_1: string;
  step_1_taxonomy_id: string | null;
  step_2: string;
  step_2_taxonomy_id: string | null;
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
a constrained industry taxonomy, build a 2-step industry ladder.

CRITICAL RULE: The ladder must anchor on the CANDIDATE'S SKILL SET AND JOB FUNCTION,
NOT the employer's operating industry. A React/Node developer's ladder is
Web Development → Technology — even if they work at a logistics company. A developer
at a bank builds software, so their ladder is Software Development → Technology,
NOT Banking → Financial Services. An accountant at a tech company builds their
ladder from Accounting → Financial Services, NOT Technology.

RULES:
- Step 1 = the candidate's actual functional niche (e.g. "Web Development", "Financial Accounting", "Digital Marketing")
- Step 2 = the MAIN INDUSTRY that function belongs to — the broadest node on the
  path that still describes the work (e.g. "Technology", "Financial Services", "Marketing").
  It must be meaningfully broader than step 1, never a near-duplicate of it.
- EVERY step must be exactly ONE industry concept. Never join two concepts with "&", "and", "/", or a comma.
  Use "Financial Services" — NOT "Banking & Financial Services". Use "Technology" — NOT "Technology & Digital".
- Use the employer's industry ONLY as a tiebreaker when the function is genuinely ambiguous.
- For industry-agnostic roles (developers, accountants, marketers, analysts), the function ALWAYS dominates.

TAXONOMY (only the branch containing the candidate's industry):
ID | depth | name
${branchJson}

TASK:
1. Identify the candidate's CORE FUNCTION from their job titles (e.g., "Software Development", "Financial Accounting", "Digital Marketing").
2. Find the closest taxonomy node to that FUNCTION (not the employer's industry).
3. Walk upward through each parent toward depth 0.
4. Step 1 = the closest node to the function. Step 2 = the broadest node on that
   path (the root / depth-0 sector), so the two rungs actually differ in breadth.
5. If the path has only one distinct node, repeat it for step 2.
6. For each step, include the taxonomy_id (UUID) if one exists, otherwise null.

The ladder MUST stay within the taxonomy branch — never cross sectors.
If the candidate's function doesn't map cleanly to the taxonomy, use the closest
functional category and broaden from there.

Return ONLY valid JSON:
{
  "steps": [
    { "step": 1, "value": "...", "taxonomy_id": "uuid-or-null" },
    { "step": 2, "value": "...", "taxonomy_id": "uuid-or-null" }
  ]
}`
    : `You are a career matching specialist. Given a candidate's job function and
employer industry, build a 2-step industry ladder using your knowledge of
real-world industry hierarchies.

CRITICAL RULE: Anchor the ladder on the CANDIDATE'S SKILL SET AND JOB FUNCTION,
NOT the employer's operating industry. A React/Node developer at a logistics
company broadens through: Web Development → Technology. NOT Logistics Technology
→ Supply Chain. An accountant at a tech company broadens through:
Financial Accounting → Financial Services. NOT Technology → Software.

RULES:
- step 1 = the candidate's most specific functional niche
- step 2 = the MAIN INDUSTRY that function belongs to — one or two levels broader,
  the broadest real-world label that still describes the work. It must be
  meaningfully broader than step 1, never a near-duplicate of it.
- Each step must be a genuine, real-world industry category.
- EVERY step must be exactly ONE industry concept. Never join two concepts with "&", "and", "/", or a comma.
  Use "Financial Services" — NOT "Banking & Financial Services". Use "Technology" — NOT "Technology & Digital".
- Use the employer's industry ONLY as a tiebreaker when the function is ambiguous.
- For industry-agnostic roles (developers, accountants, marketers, analysts), function ALWAYS dominates.

Example: Developer at a logistics company with titles "Software Developer → Backend Developer"
→ ["Software Development", "Technology"]
NOT ["Logistics Technology", "Transportation"]

Example: Accountant at a retail company
→ ["Financial Accounting", "Financial Services"]
NOT ["Retail Finance", "Consumer Goods"]

Example: Digital marketer at an e-commerce company
→ ["Digital Marketing", "Marketing"]
NOT ["E-commerce Marketing", "Retail"]

Example: "Private Wealth Banking"
→ ["Private Wealth Banking", "Financial Services"]
Example: "Pharmaceuticals"
→ ["Pharmaceutical R&D", "Healthcare"]

Return ONLY valid JSON:
{
  "steps": [
    { "step": 1, "value": "Pharmaceutical R&D", "taxonomy_id": null },
    { "step": 2, "value": "Healthcare", "taxonomy_id": null }
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
    };

    for (const s of steps) {
      const idx = s.step;
      if (idx >= 1 && idx <= 2) {
        const key = `step_${idx}` as keyof IndustryLadderSteps;
        const tidKey = `step_${idx}_taxonomy_id` as keyof IndustryLadderSteps;
        // The prompt asks for one concept per rung, but compound labels still slip through.
        // Collapse them here so a stored rung is always individually searchable.
        const raw = typeof s.value === "string" ? s.value : "";
        const value = toSingleConcept(raw);
        if (value !== raw.trim()) {
          console.warn(`[LADDER] Collapsed compound step ${idx}: "${raw}" → "${value}"`);
        }
        result[key] = value;
        (result as any)[tidKey] = s.taxonomy_id ?? null;
      }
    }

    return result;
  } catch (err) {
    const step = toSingleConcept(industry) || industry.trim();
    return {
      step_1: step, step_1_taxonomy_id: null, step_2: step, step_2_taxonomy_id: null,
    };
  }
}
