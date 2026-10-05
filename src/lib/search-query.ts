// ─── Industry query normalisation ──────────────────────────────────────────
//
// Industry labels routinely arrive compound ("Banking & Financial Services",
// "Credit Risk & Recoveries"). Space-joining a compound into a search query
// turns it into an implicit AND — Google must then find every token in the
// posting — which silently drops jobs that match only one half.
//
// Two policies, applied at different points:
//
//   GENERATION (toSingleConcept) — every industry label and every rung of the
//   ladder is stored as ONE searchable concept. "Banking & Financial Services"
//   becomes "Banking". Enforced in career-ladders.ts and suggest-industry.
//
//   READ (buildIndustryQuery) — safety net for ladders already stored in the
//   database before the generation rule existed. A legacy compound value is
//   OR-ed into alternatives rather than AND-ed, so it still finds what its
//   halves would have found. Never fires on newly generated data.

/**
 * Single-token industries safe to search on their own. Deliberately an
 * allowlist: anything not listed is dropped when it appears alone, because
 * bare modifiers like "digital" or "business" match almost every posting and
 * destroy precision.
 */
const SINGLE_TOKEN_INDUSTRIES = new Set([
  "banking", "technology", "accounting", "finance", "media", "marketing",
  "advertising", "entertainment", "retail", "insurance", "healthcare",
  "pharmaceuticals", "construction", "education", "telecommunications",
  "telecoms", "logistics", "hospitality", "mining", "agriculture", "energy",
  "utilities", "aerospace", "automotive", "textiles", "chemicals", "property",
  "defence", "defense", "software", "biotech", "tourism", "transport",
]);

const SEPARATOR_RE = /\s*(?:&|\/|\||,|;|\band\b|\bor\b)\s*/i;

function normalisePart(part: string): string {
  return part
    .replace(/[^a-z0-9&+ -]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a compound label into parts. Returns [normalised] when there is nothing
 * to split. Splits BEFORE normalising — normalisePart strips , / | ; , so
 * normalising first would delete those separators instead of splitting on them.
 */
function splitCompound(raw: string): string[] {
  if (!raw.trim()) return [];

  const parts = raw.split(SEPARATOR_RE).map(normalisePart).filter(Boolean);
  return parts.length > 1 ? parts : [normalisePart(raw)];
}

/** A part is viable alone if it is multi-token, or an allowlisted single token. */
function isViableTerm(part: string): boolean {
  const words = part.split(" ").filter(Boolean);
  if (words.length >= 2) return true;
  return SINGLE_TOKEN_INDUSTRIES.has(words[0]?.toLowerCase() ?? "");
}

function quoteTerm(term: string): string {
  return /\s/.test(term) ? `"${term}"` : term;
}

/** Split a compound industry label into individually searchable alternatives. */
export function expandAlternatives(raw: string): string[] {
  const parts = splitCompound(raw);
  if (parts.length <= 1) return parts;

  const kept = parts.filter(isViableTerm);

  // Nothing survived — the compound is one indivisible concept (e.g.
  // "Research and Development"). Keep it whole rather than widening to noise:
  // OR-ing the halves would search bare "Development", which matches almost
  // every posting. Must agree with toSingleConcept, which keeps it whole too.
  if (kept.length === 0) return [normalisePart(raw)];

  return Array.from(new Set(kept));
}

/**
 * Build the query fragment for an industry term. Legacy compound values are
 * OR-ed; a single concept is emitted bare or quoted.
 */
export function buildIndustryQuery(industry: string): string {
  const alts = expandAlternatives(industry);
  if (alts.length === 0) return "";
  if (alts.length === 1) return quoteTerm(alts[0]);
  return `(${alts.map(quoteTerm).join(" OR ")})`;
}

/**
 * Collapse a compound industry label to ONE concept, per the rule that every
 * generated industry and every ladder rung is a single searchable concept —
 * never "Banking & Financial Services", just "Banking".
 *
 * Takes the part BEFORE the first separator. Observed pattern: the leading
 * segment is the actual term and whatever follows the separator is either a
 * broader restatement or a sub-niche of it, so the leading segment is always
 * the better single label.
 *
 * Guard: if no segment could stand alone on its own (e.g. "Research and
 * Development", where "and" is part of the name), the compound is kept whole
 * rather than truncated into something meaningless.
 */
export function toSingleConcept(raw: string): string {
  const parts = splitCompound(raw);
  if (parts.length <= 1) return parts[0] ?? "";

  return parts.some(isViableTerm) ? parts[0] : normalisePart(raw);
}