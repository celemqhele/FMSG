import { mapLocationToProvince } from "@/lib/location";
import skillsTaxonomy from "@/data/taxonomy/skills.json";
import titlesTaxonomy from "@/data/taxonomy/titles.json";

// ============================================================
// ATS-style deterministic scoring (Phase 1)
// Replaces the AI/LLM scoring pipeline with zero-API matching.
// ============================================================

export interface AtsScoringInput {
  jobTitle: string;
  company: string;
  location: string;
  jobDescription: string;
  jobUrl: string;
  candidateLocation: string;
  candidateIndustry: string;
  candidateTitles: string[];
  cvTexts: { name: string; text: string }[];
  maxAgeDays?: number;
  bannedCompanies?: string[];
}

export interface AtsPillarScores {
  industry: number;
  function: number;
  scale: number;
  tools: number;
  location: number;
}

export interface AtsDynamicRequirement {
  requirement: string;
  mandatory: boolean;
  pillar: "industry" | "function" | "scale" | "tools" | "location";
  met: boolean;
  evidence: string;
}

export interface AtsScoringResult {
  score: number;
  adjustment_note: string | null;
  reason: string;
  estimated_salary: string;
  knockout_fail: boolean;
  suggested_cv_name: string;
  pillar_scores: AtsPillarScores;
  pillar_reasons: Record<string, string>;
  taxes_applied: string[];
  total_questions_asked: number;
  yes_answers: number;
  recruiter_verdict: "Apply" | "Consider" | "Don't apply";
  dynamic_requirements: AtsDynamicRequirement[] | null;
}

// ---------- Taxonomy loading ----------

interface TaxonomyNode {
  aliases: string[];
}

const CANONICAL_SKILLS: { name: string; aliases: string[] }[] = [];
const SKILL_ALIAS_TO_CANONICAL: Map<string, string> = new Map();
const SKILL_IMPLICATIONS: Map<string, string[]> = new Map();

(function initTaxonomy() {
  const raw = skillsTaxonomy as {
    skills: Record<string, Record<string, TaxonomyNode>>;
    implications: Record<string, string[]>;
  };
  for (const category of Object.values(raw.skills)) {
    for (const [canonical, node] of Object.entries(category)) {
      CANONICAL_SKILLS.push({ name: canonical, aliases: [canonical, ...(node.aliases ?? [])] });
      for (const alias of node.aliases ?? []) {
        if (!SKILL_ALIAS_TO_CANONICAL.has(alias.toLowerCase())) {
          SKILL_ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
        }
      }
    }
  }
  for (const [from, implied] of Object.entries(raw.implications)) {
    SKILL_IMPLICATIONS.set(from.toLowerCase(), implied);
  }
})();

const TITLE_MAP: { soc: string; canonical: string; level?: string; aliases: string[] }[] = [];
const TITLE_ALIAS_TO_SOC: Map<string, { soc: string; canonical: string; level?: string }> = new Map();

(function initTitles() {
  const raw = titlesTaxonomy as {
    titleMap: Record<string, { soc: string; canonical: string; level?: string; aliases: string[] }>;
  };
  for (const entry of Object.values(raw.titleMap)) {
    TITLE_MAP.push(entry);
    for (const alias of entry.aliases ?? []) {
      if (!TITLE_ALIAS_TO_SOC.has(alias.toLowerCase())) {
        TITLE_ALIAS_TO_SOC.set(alias.toLowerCase(), { soc: entry.soc, canonical: entry.canonical, level: entry.level });
      }
    }
  }
})();

// ---------- Text helpers ----------

const SAFE_LOCATION_PATTERNS = [
  "remote",
  "work from home",
  "wfh",
  "anywhere",
  "worldwide",
  "global",
  "flexible",
  "hybrid",
  "fully remote",
  "100% remote",
];

const FOREIGN_COUNTRY_PATTERNS = [
  "london",
  "united kingdom",
  "u.k.",
  "uk ",
  "england",
  "scotland",
  "ireland",
  "new york",
  "san francisco",
  "new york",
  "united states",
  "u.s.a",
  "usa",
  "americas",
  "texas",
  "california",
  "toronto",
  "canada",
  "sydney",
  "australia",
  "dubai",
  "abudhabi",
  "abu dhabi",
  "united arab emirates",
  "uae",
  "singapore",
  "hong kong",
  "china",
  "india",
  "germany",
  "france",
  "spain",
  "italy",
  "netherlands",
  "berlin",
  "amsterdam",
  "paris",
  "munich",
  "bengaluru",
  "mumbai",
  "europe",
  "eu only",
  "emea",
  "uk only",
  "us only",
  "remote - us",
  "remote - uk",
  "remote - eu",
  "remote - us only",
  "remote - uk only",
  "remote - eu only",
  "remote in the us",
  "remote in europe",
  "new zealand",
];

const SALARY_PATTERNS = [
  /r\s?(\d{2,3})\s?[,.\s]?(\d{3})(?:\s?(?:per|p\.?a\.?|annum|year|month|pm|monthly))?/gi,
  /(\d{2,3})\s?[,.\s]?(\d{3})\s?[,.\s]?(\d{3})\s?(?:per\s?annum|per\s?year|p\.?a\.?|per\s?month|p\.?m\.?)/gi,
  /\$(\d{2,3})\s?[,.\s]?(\d{3})/gi,
];

function extractSalary(text: string): string {
  const lower = text.toLowerCase();
  const format = (raw: string) => {
    const m = raw.match(/(\d+(?:[.,]\d+)?)\s*(k|m)?/i);
    if (!m) return raw.trim();
    const base = parseFloat(m[1].replace(",", "."));
    const mult = m[2]?.toLowerCase() === "m" ? 1_000_000 : m[2]?.toLowerCase() === "k" ? 1_000 : 1;
    const n = Math.round(base * mult);
    if (!n) return raw.trim();
    return `R${n.toLocaleString("en-ZA")}`;
  };
  const rangeMatch = lower.match(/r\s?([\d.,kmt]{2,})\s*(?:-\s*|to\s*)(r\s?)?([\d.,kmt]{2,})\s*(?:per\s?(?:annum|year|month)|p\.?a\.?|p\.?m\.?)/);
  if (rangeMatch) {
    return `${format(rangeMatch[1])} – ${format(rangeMatch[3])}`;
  }
  for (const pat of SALARY_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      const digits = m[0].replace(/[^\d]/g, "");
      const n = parseInt(digits, 10);
      if (n > 0) return `R${n.toLocaleString("en-ZA")}`;
    }
  }
  return "";
}

const YEAR_RANGE_RE =
  /(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)?\.?\s*(19|20)\d{2}\s*(?:–|-|—|to|until|till)\s*(?:(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)?\.?\s*(19|20)\d{2}|present|current|now)/gi;

const YEARS_STATEMENT_RE = /(\d+(?:\.\d+)?)\+?\s*(?:years|yrs)\s*(?:of\s+)?(?:experience|xp)/gi;

function extractCandidateExperienceYears(cvTexts: { text: string }[]): number | null {
  let totalYears = 0;
  let sawRange = false;
  for (const cv of cvTexts) {
    const text = cv.text;
    YEAR_RANGE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = YEAR_RANGE_RE.exec(text)) !== null) {
      const start = parseInt(m[1] + m[2], 10);
      if (m[4]) {
        // end year present
        const end = parseInt(m[3] + m[4], 10);
        if (end >= start && end <= 2050) {
          totalYears += end - start;
          sawRange = true;
        }
      } else {
        // end is present/current/now
        const end = new Date().getFullYear();
        if (end >= start && start >= 1980) {
          totalYears += end - start;
          sawRange = true;
        }
      }
    }
  }
  if (sawRange) return Math.max(0, Math.round(totalYears * 10) / 10);

  // Fallback: explicit "X years of experience" statements
  let best = 0;
  for (const cv of cvTexts) {
    YEARS_STATEMENT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = YEARS_STATEMENT_RE.exec(cv.text)) !== null) {
      best = Math.max(best, parseFloat(m[1]));
    }
  }
  return best > 0 ? best : null;
}

function extractRequiredYears(spec: string): number | null {
  const m = spec.match(/(\d+)\+?\s*(?:years|yrs)\s*(?:of\s+)?(?:experience|xp)/i);
  if (m) return parseInt(m[1], 10);
  const m2 = spec.match(/(?:minimum|at least|min\.?)\s*(\d+)\s*(?:years|yrs)/i);
  if (m2) return parseInt(m2[1], 10);
  return null;
}

const DEGREE_PATTERNS = [
  "bachelor",
  "bsc",
  "b.com",
  "bcomm",
  "ba ",
  "b.a.",
  "degree",
  "nqf level 7",
  "nqf 7",
  "diploma",
  "honours",
  "honors",
  "masters",
  "master's",
  "mba",
  "phd",
  "doctorate",
  "tertiary qualification",
  "tertiary education",
];

function hasDegreeInCV(cvTexts: { text: string }[]): boolean {
  const combined = cvTexts.map(c => c.text.toLowerCase()).join(" ");
  return DEGREE_PATTERNS.some((p) => combined.includes(p.toLowerCase()));
}

function specHasDegreeRequirement(spec: string): boolean {
  const lower = spec.toLowerCase();
  const explicit = /(?:degree|qualification|nqf|tertiary)\s*(?:required|requirement|essential|must have|must-have)|bachelor'?s?\s*degree|bsc\s+required|diploma\s+required|masters?\s+degree/i;
  return explicit.test(lower);
}

// ---------- Skill extraction ----------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function findSkillsInText(text: string): Set<string> {
  const found = new Set<string>();
  for (const skill of CANONICAL_SKILLS) {
    for (const alias of skill.aliases) {
      const a = alias.toLowerCase().trim();
      if (a.length < 2) continue;
      const escaped = escapeRegex(a);
      const startsAlphaNum = /^[a-z0-9]/.test(a);
      const leading = startsAlphaNum ? "(^|[^a-z0-9])" : "";
      const trailing = "([^a-z0-9]|$)";
      const re = new RegExp(leading + escaped + trailing, "i");
      if (re.test(text)) {
        found.add(skill.name);
        break;
      }
    }
  }
  return found;
}

function expandWithImplications(skills: Set<string>): Set<string> {
  const expanded = new Set(skills);
  for (const s of Array.from(skills)) {
    const implied = SKILL_IMPLICATIONS.get(s.toLowerCase());
    if (implied) for (const i of implied) expanded.add(i);
  }
  return expanded;
}

// ---------- Title / SOC matching ----------

function mapTitleToSoc(title: string): { soc: string; canonical: string; level?: string } | null {
  const lower = title.trim().toLowerCase();
  if (TITLE_ALIAS_TO_SOC.has(lower)) return TITLE_ALIAS_TO_SOC.get(lower)!;
  for (const entry of TITLE_MAP) {
    for (const alias of entry.aliases) {
      if (lower.includes(alias.toLowerCase()) || alias.toLowerCase().includes(lower)) {
        return { soc: entry.soc, canonical: entry.canonical, level: entry.level };
      }
    }
  }
  return null;
}

function socParent(soc: string): string {
  return soc.slice(0, 7); // e.g. "15-1252.00" â†’ "15-1252"
}

function titleMatchScore(jobTitle: string, candidateTitles: string[]): { score: number; reason: string; jobSoc: string | null } {
  const jobSoc = mapTitleToSoc(jobTitle);
  if (!jobSoc) return { score: 50, reason: "Job title not in taxonomy — neutral title match", jobSoc: null };
  let best = 0;
  for (const ct of candidateTitles) {
    const cs = mapTitleToSoc(ct);
    if (!cs) continue;
    if (cs.soc === jobSoc.soc) { best = 100; break; }
    if (socParent(cs.soc) === socParent(jobSoc.soc)) { best = Math.max(best, 80); }
    else { best = Math.max(best, 50); }
  }
  const reason = best >= 100
    ? `Title maps to ${jobSoc.canonical} (${jobSoc.soc}) — matches your target roles`
    : best >= 80
      ? `Title is in the same family as ${jobSoc.canonical} (${socParent(jobSoc.soc)})`
      : best >= 50
        ? `Title is related to ${jobSoc.canonical} (${jobSoc.soc})`
        : "Title does not match your target roles";
  return { score: best, reason, jobSoc: jobSoc.soc };
}

// ---------- Location ----------

function isSafeRemote(text: string): boolean {
  const lower = text.toLowerCase();
  return SAFE_LOCATION_PATTERNS.some((p) => lower.includes(p));
}

function isForeign(text: string): boolean {
  const lower = " " + text.toLowerCase().replace(/[^a-z0-9&.-]+/g, " ") + " ";
  return FOREIGN_COUNTRY_PATTERNS.some((p) => lower.includes(p));
}

function scoreLocation(jobLocation: string, candidateLocation: string, spec: string): { score: number; reason: string; taxes: string[] } {
  const combined = `${jobLocation} ${spec}`.toLowerCase();
  if (isSafeRemote(jobLocation.toLowerCase() + " " + spec.toLowerCase())) {
    return { score: 100, reason: "Remote-friendly role — no location restriction", taxes: [] };
  }
  if (isForeign(combined)) {
    return { score: 0, reason: "Role is located outside South Africa", taxes: [] };
  }
  if (!candidateLocation) return { score: 80, reason: "Candidate location unknown — no penalty", taxes: [] };

  const jobLoc = mapLocationToProvince(jobLocation);
  const candLoc = mapLocationToProvince(candidateLocation);
  if (!jobLoc.province || !candLoc.province) return { score: 80, reason: "Location proximity unknown", taxes: [] };

  if (jobLoc.province === candLoc.province) {
    return { score: 100, reason: `Same province (${jobLoc.province})`, taxes: [] };
  }
  return { score: 40, reason: `Different province (job: ${jobLoc.province}, you: ${candLoc.province})`, taxes: ["Location Tax"] };
}

// ---------- Mandatory requirement extraction ----------

const MANDATORY_CERT_RE = [
  /(?:^|\n|[.;!\-])\s*([\w\s\-/]+?(?:license|licence|certificate|certification|registration|permit))\s*[-:]\s*(must have|required|essential|mandatory|a must)\b/gi,
  /\b(must have|must hold|must possess)\s+(?:a\s+|an\s+)?(?:valid\s+|current\s+|active\s+)?([\w\s\-/]+?(?:license|licence|certificate|certification|registration|permit))\b/gi,
  /([\w\s\-/]+?(?:license|licence|certificate|certification|registration|permit))\s+(?:is\s+)?(?:required|essential|mandatory)\b/gi,
];

function extractMandatoryCert(specLower: string): string | null {
  for (const pattern of MANDATORY_CERT_RE) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(specLower)) !== null) {
      const requirement = (pattern === MANDATORY_CERT_RE[0] ? match[1] : match[2] || match[1] || "").trim().toLowerCase();
      if (!requirement || requirement.length < 3) continue;
      const cleaned = requirement.replace(/^(valid|current|active|relevant)\s+/i, "").trim();
      return cleaned;
    }
  }
  return null;
}

const MANDATORY_MARKERS = ["required", "must have", "must-have", "essential", "mandatory", "necessary", "minimum", "you will need", "we require", "you must"];
const PREFERRED_MARKERS = ["preferred", "advantageous", "nice to have", "nice-to-have", "desirable", "ideal", "bonus", "plus", "would be great"];

function classifyRequirement(phrase: string): boolean {
  const lower = phrase.toLowerCase();
  return MANDATORY_MARKERS.some((m) => lower.includes(m));
}

function buildDynamicRequirements(opts: {
  spec: string;
  requiredSkills: Set<string>;
  matchedSkills: Set<string>;
  requiredYears: number | null;
  candidateYears: number | null;
  degreeRequired: boolean;
  candidateHasDegree: boolean;
  jobTitle: string;
  jobSoc: string | null;
  locationScore: number;
  locationReason: string;
  remote: boolean;
}): AtsDynamicRequirement[] {
  const reqs: AtsDynamicRequirement[] = [];
  for (const skill of Array.from(opts.requiredSkills)) {
    const met = opts.matchedSkills.has(skill);
    const isMandatory = classifyRequirement(opts.spec);
    reqs.push({
      requirement: `Experience with ${skill}`,
      mandatory: isMandatory,
      pillar: "tools",
      met,
      evidence: met ? "Skill found in CV" : "Skill not found in CV",
    });
  }
  if (opts.requiredYears !== null) {
    const met = opts.candidateYears !== null && opts.candidateYears >= opts.requiredYears;
    reqs.push({
      requirement: `${opts.requiredYears}+ years of experience`,
      mandatory: true,
      pillar: "scale",
      met,
      evidence: met ? `CV shows ~${opts.candidateYears} years` : `CV shows ${opts.candidateYears ?? "unknown"} years`,
    });
  }
  if (opts.degreeRequired) {
    reqs.push({
      requirement: "Tertiary qualification (explicitly required)",
      mandatory: true,
      pillar: "industry",
      met: opts.candidateHasDegree,
      evidence: opts.candidateHasDegree ? "Tertiary qualification found in CV" : "No tertiary qualification found in CV",
    });
  }
  if (!opts.remote && opts.locationScore < 100) {
    reqs.push({
      requirement: `Located in ${opts.locationReason}`,
      mandatory: true,
      pillar: "location",
      met: opts.locationScore >= 60,
      evidence: opts.locationScore >= 60 ? "Location compatible" : "Location mismatch",
    });
  }
  return reqs;
}

// ---------- Main entry ----------

export function scoreMatch(input: AtsScoringInput): AtsScoringResult {
  const spec = input.jobDescription ?? "";
  const cvAll = input.cvTexts ?? [];
  const cvLower = cvAll.map(c => c.text).join(" ").toLowerCase();
  const specLower = spec.toLowerCase();
  const jobTitle = input.jobTitle ?? "";
  const company = input.company ?? "";
  const jobUrl = input.jobUrl ?? "";

  const taxes: string[] = [];

  // ---- 0. Hard gates ----
  const blacklisted = ["jobleads", "getwork", "jobrapido", "trabajo.org", "learn4good"];
  const urlLower = jobUrl.toLowerCase();
  for (const bl of blacklisted) {
    if (urlLower.includes(bl)) {
      return {
        score: 0, adjustment_note: null, reason: `Job is from a blacklisted aggregator domain (${bl})`,
        estimated_salary: "", knockout_fail: true, suggested_cv_name: "",
        pillar_scores: { industry: 0, function: 0, scale: 0, tools: 0, location: 0 },
        pillar_reasons: {}, taxes_applied: [], total_questions_asked: 0, yes_answers: 0,
        recruiter_verdict: "Don't apply", dynamic_requirements: null,
      };
    }
  }
  if (input.bannedCompanies?.some((c) => company.toLowerCase().includes(c.toLowerCase()))) {
    return {
      score: 0, adjustment_note: null, reason: `Company is on the candidate's banned list (${company})`,
      estimated_salary: "", knockout_fail: true, suggested_cv_name: "",
      pillar_scores: { industry: 0, function: 0, scale: 0, tools: 0, location: 0 },
      pillar_reasons: {}, taxes_applied: [], total_questions_asked: 0, yes_answers: 0,
      recruiter_verdict: "Don't apply", dynamic_requirements: null,
    };
  }

  const remote = isSafeRemote((input.location ?? "") + " " + spec);
  const foreign = isForeign((input.location ?? "") + " " + spec);
  if (!remote && foreign) {
    return {
      score: 0, adjustment_note: null, reason: "Job is not hiring in the candidate's location (outside South Africa)",
      estimated_salary: "", knockout_fail: true, suggested_cv_name: "",
      pillar_scores: { industry: 0, function: 0, scale: 0, tools: 0, location: 0 },
      pillar_reasons: {}, taxes_applied: [], total_questions_asked: 0, yes_answers: 0,
      recruiter_verdict: "Don't apply", dynamic_requirements: null,
    };
  }

  // Date gate (lenient — no date = pass)
  if (input.maxAgeDays) {
    const posted = specLower.match(/(?:posted|active|listed)\s+(?:(\d+)\s+(day|week|month|year)s?\s+ago|on\s+([\w\s,]+))/i);
    if (posted) {
      const num = parseInt(posted[1] ?? "1", 10);
      const unit = posted[2]?.toLowerCase() ?? "";
      const days = unit === "year" ? num * 365 : unit === "month" ? num * 30 : unit === "week" ? num * 7 : num;
      if (days > input.maxAgeDays) {
        return {
          score: 0, adjustment_note: null, reason: `Posted ${num} ${unit}(s) ago — outside ${input.maxAgeDays}-day filter`,
          estimated_salary: "", knockout_fail: true, suggested_cv_name: "",
          pillar_scores: { industry: 0, function: 0, scale: 0, tools: 0, location: 0 },
          pillar_reasons: {}, taxes_applied: [], total_questions_asked: 0, yes_answers: 0,
          recruiter_verdict: "Don't apply", dynamic_requirements: null,
        };
      }
    }
  }

  // Mandatory license/certificate gate (e.g. pharmacist, engineer, teacher roles)
  const mandatoryCert = extractMandatoryCert(specLower);
  if (mandatoryCert && !cvLower.includes(mandatoryCert)) {
    return {
      score: 25, adjustment_note: `${mandatoryCert} is mandatory but absent from CV`, knockout_fail: true,
      reason: `Mandatory requirement not met: ${mandatoryCert} is required but missing from the CV`,
      estimated_salary: "", suggested_cv_name: "",
      pillar_scores: { industry: 50, function: 50, scale: 50, tools: 0, location: 50 },
      pillar_reasons: { tools: `Mandatory ${mandatoryCert} not found in CV` },
      taxes_applied: [], total_questions_asked: 1, yes_answers: 0,
      recruiter_verdict: "Don't apply", dynamic_requirements: [{
        requirement: `Valid ${mandatoryCert}`, mandatory: true, pillar: "tools", met: false, evidence: `${mandatoryCert} not found in CV`,
      }],
    };
  }

  // ---- 1. Tools / skill coverage (50%) ----
  const specSkillsRaw = findSkillsInText(spec);
  const requiredSkills = expandWithImplications(specSkillsRaw);
  const cvSkillsRaw = findSkillsInText(cvLower);
  const cvSkills = expandWithImplications(cvSkillsRaw);

  let matchedCount = 0;
  let matchedSkills = new Set<string>();
  if (requiredSkills.size > 0) {
    for (const s of requiredSkills) {
      if (cvSkills.has(s)) { matchedCount++; matchedSkills.add(s); }
    }
  }
  const toolsScore = requiredSkills.size > 0
    ? Math.round((matchedCount / requiredSkills.size) * 100)
    : 50;
  const toolsReason = requiredSkills.size === 0
    ? "No specific skills listed in job spec — neutral score"
    : `Matched ${matchedCount} of ${requiredSkills.size} required skills (${Math.round((matchedCount / requiredSkills.size) * 100)}%)`;

  // ---- 2. Experience / scale (20%) ----
  const requiredYears = extractRequiredYears(spec);
  const candidateYears = extractCandidateExperienceYears(cvAll);
  let scaleScore = 50;
  if (requiredYears !== null && candidateYears !== null) {
    scaleScore = candidateYears >= requiredYears
      ? Math.min(100, Math.round((candidateYears / requiredYears) * 100))
      : Math.max(0, Math.round((candidateYears / requiredYears) * 100));
    if (scaleScore > 100) { scaleScore = 100; taxes.push("Overqualified"); }
  } else if (requiredYears !== null && candidateYears === null) {
    scaleScore = 40; // could not verify — slight penalty, no knock
  }
  const scaleReason = requiredYears === null
    ? "No explicit experience requirement found"
    : candidateYears === null
      ? `Job wants ${requiredYears}+ years but CV years could not be verified`
      : candidateYears >= requiredYears
        ? `${candidateYears}+ years meets the ${requiredYears}+ year requirement`
        : `${candidateYears} years falls short of the ${requiredYears}+ year requirement`;

  // ---- 3. Title / function (15%) ----
  const { score: functionScore, reason: functionReason, jobSoc } = titleMatchScore(jobTitle, input.candidateTitles ?? []);

  // ---- 4. Location (10%) ----
  const { score: locationScore, reason: locationReason, taxes: locTaxes } = scoreLocation(input.location ?? "", input.candidateLocation ?? "", spec);
  taxes.push(...locTaxes);

  // ---- 5. Education / industry (5%) ----
  const degreeRequired = specHasDegreeRequirement(spec);
  const candidateHasDegree = hasDegreeInCV(cvAll);
  let industryScore = 100;
  let industryReason = "No explicit qualification requirement — neutral";
  if (degreeRequired && !candidateHasDegree) {
    industryScore = 30;
    taxes.push("No Degree Tax");
    industryReason = "Job explicitly requires a tertiary qualification but none was found in the CV";
  } else if (degreeRequired && candidateHasDegree) {
    industryReason = "Tertiary qualification requirement met";
  }

  // ---- 6. Core weighted score ----
  const core =
    toolsScore * 0.50 +
    scaleScore * 0.20 +
    functionScore * 0.15 +
    locationScore * 0.10 +
    industryScore * 0.05;

  // ---- 7. Taxes & knockout ----
  const mandatoryMissing = requiredSkills.size > 0 && matchedCount === 0;
  let finalScore = Math.round(core);
  let knockout = mandatoryMissing;
  if (finalScore > 95) finalScore = 95;
  for (const t of taxes) {
    finalScore -= t === "Location Tax" ? 30 : t === "Overqualified" ? 10 : t === "No Degree Tax" ? 10 : 0;
  }
  finalScore = Math.max(0, finalScore);
  if (knockout) finalScore = Math.min(finalScore, 25);

  const verdict: "Apply" | "Consider" | "Don't apply" = finalScore >= 75 ? "Apply" : finalScore >= 60 ? "Consider" : "Don't apply";

  const salary = extractSalary(spec);
  const suggestedCv = pickBestCv(cvAll, requiredSkills);

  const pillarScores: AtsPillarScores = {
    industry: industryScore,
    function: functionScore,
    scale: scaleScore,
    tools: toolsScore,
    location: locationScore,
  };
  const pillarReasons = {
    industry: industryReason,
    function: functionReason,
    scale: scaleReason,
    tools: toolsReason,
    location: locationReason,
  };

  const dynamicRequirements = buildDynamicRequirements({
    spec, requiredSkills, matchedSkills,
    requiredYears, candidateYears,
    degreeRequired, candidateHasDegree,
    jobTitle, jobSoc,
    locationScore, locationReason,
    remote,
  });

  const summaryLines: string[] = [];
  summaryLines.push(`Skills: ${toolsReason}`);
  summaryLines.push(`Experience: ${scaleReason}`);
  if (degreeRequired && !candidateHasDegree) summaryLines.push(`• ${industryReason}`);
  if (locTaxes.length > 0) summaryLines.push(`• ${locationReason}`);
  if (mandatoryMissing) summaryLines.push("• No required skills matched — knocked out");
  summaryLines.push(`Verdict: ${verdict}`);

  return {
    score: finalScore,
    adjustment_note: knockout ? "Knocked out: no required skills present in CV" : null,
    reason: summaryLines.join("\n"),
    estimated_salary: salary,
    knockout_fail: knockout,
    suggested_cv_name: suggestedCv,
    pillar_scores: pillarScores,
    pillar_reasons: pillarReasons,
    taxes_applied: taxes,
    total_questions_asked: dynamicRequirements.length,
    yes_answers: dynamicRequirements.filter((d) => d.met).length,
    recruiter_verdict: verdict,
    dynamic_requirements: dynamicRequirements,
  };
}

function pickBestCv(cvAll: { name: string; text: string }[], requiredSkills: Set<string>): string {
  if (cvAll.length === 0) return "";
  if (requiredSkills.size === 0) return cvAll[0]?.name ?? "";
  let best = cvAll[0]?.name ?? "";
  let bestCount = -1;
  for (const cv of cvAll) {
    const skills = findSkillsInText(cv.text.toLowerCase());
    let count = 0;
    for (const s of requiredSkills) if (skills.has(s)) count++;
    if (count > bestCount) { bestCount = count; best = cv.name; }
  }
  return best;
}
