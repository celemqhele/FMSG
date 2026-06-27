/**
 * Direct AI test — simulates a search for Sipho Ndlovu (E-commerce Digital Marketing)
 * Runs the unified scoring prompt against 4 sample job specs and logs everything.
 *
 * Usage: npx tsx --env-file=.env.local src/test-ai.ts
 */

import { callAIWithFallback, lastAITier } from "./lib/gemini";

const CANDIDATE_INDUSTRY = "E-commerce / Retail";

interface TestJob {
  title: string;
  company: string;
  location: string;
  spec: string; // full job description
}

const TEST_JOBS: TestJob[] = [
  {
    title: "E-Commerce Content Specialist",
    company: "Ares Holdings",
    location: "Cape Town",
    spec: `Retail company seeking E-Commerce Content Specialist responsible for content strategy, blog, website, email and social media. Requires 2-5 years digital content experience, SEO, CMS (Shopify), email marketing (Klaviyo), Google Analytics, paid media knowledge. B2C digital marketing experience advantageous. Relevant diploma advantageous. Based in Cape Town.`,
  },
  {
    title: "Lead E-commerce Social Media Manager",
    company: "Placements24",
    location: "Cape Town",
    spec: `Online retail client seeking Lead E-commerce Social Media Manager. Requires 5+ years social media management with e-commerce focus. Must have expertise in paid social campaigns (Facebook, Instagram, TikTok), analytics, social media management suites (Sprinklr, Adobe Social). Bachelor's degree in Marketing required. Based in Cape Town.`,
  },
  {
    title: "Digital Marketing Manager",
    company: "FinTech Startup",
    location: "Johannesburg",
    spec: `FinTech payments company seeking Digital Marketing Manager. Must have 5+ years B2B SaaS marketing experience, HubSpot, Salesforce Marketing Cloud. Experience with financial services content and compliance-aware marketing. Based in Johannesburg, hybrid.`,
  },
  {
    title: "Senior SEO Specialist",
    company: "Takealot",
    location: "Cape Town",
    spec: `E-commerce leader seeking Senior SEO Specialist. Requires 4+ years technical SEO experience, expertise in Ahrefs/SEMrush, experience with large e-commerce sites (1M+ pages). Must have experience with JavaScript SEO, Core Web Vitals, and programmatic SEO. Based in Cape Town.`,
  },
];

const CANDIDATE_CV = `Digital Marketing Manager with 6+ years experience in B2C e-commerce and retail at Superbalist, Takealot, Woolworths.
Skills: Google Ads, Meta Ads, SEO (Ahrefs, SEMrush), email marketing (Klaviyo, Mailchimp), Google Analytics 4, Looker Studio, SQL, Figma.
Managed R8M annual digital budgets, scaled ROAS from 2.1x to 4.3x, grew organic traffic 180% YoY.
Education: BCom Marketing Management, University of Cape Town.
Certifications: Google Ads Search, Meta Certified Media Buying Professional.
Location: Cape Town.`;

// Replicate the unified batch prompt (simplified — key rules only)
const SYSTEM_PROMPT = `You are a strict Recruitment Auditor AI. Score each job against the candidate's profile.

CANDIDATE INDUSTRY: ${CANDIDATE_INDUSTRY}

SUB-VERTICAL ID: E-commerce Digital Marketing (NOT SaaS, NOT FinTech — candidate's employers are Superbalist, Takealot, Woolworths, all retail/e-commerce).

PILLARS (0-100): Industry(25%), Function(30%), Scale(20%), Tools(15%), Location(10%).
INDUSTRY: Same=70-95, Adjacent=40-65, Different=0-30. Identify from employers (Superbalist/Takealot = E-commerce), NOT tools.
FUNCTION: Role type transferability. Language/tool skills belong in Tools pillar.
PILLAR-REASONS: Must reference CV specifics — employer names, skills, numbers. Bad: "company operates in e-commerce." Good: "worked at Superbalist and Takealot, both e-commerce."
PILLAR-FINAL CHECK: Does (I×0.25+F×0.30+S×0.20+T×0.15+L×0.10)×0.95−taxes = final score? If >5 pt gap, fix both.
KNOCKOUT (score=25): mandatory degree, license, language, or vertical tenure unmet. Skip for "advantageous" degrees.
TAXES: Hopper(-15), Overqualified(-10), Vague Achievement(-10), No Degree(-10 only when REQUIRED), Salary Mismatch(-10).
FINAL = weighted_pillars × 0.95 - taxes. Cap 0-95.
VERDICT: >=75 HIRE | >=60 INTERVIEW | <60 REJECT.
SELF-VERIFY: Pillar reasons must be specific. Pillar math must equal final score. Adjust by ±5-10 if needed, set adjustment_note.
Location: same city=100, same province=70, different province=30, different country=0.

Return ONLY a JSON array. No markdown.
Each object: { "index": number, "score": number (0-95), "adjustment_note": string|null, "reason": string, "estimated_salary": string, "knockout_fail": boolean, "suggested_cv_name": string, "pillar_scores": { "industry": number, "function": number, "scale": number, "tools": number, "location": number }, "pillar_reasons": { "industry": "plain English", "function": "plain English", "scale": "plain English", "tools": "plain English", "location": "plain English" }, "taxes_applied": [string], "total_questions_asked": number, "yes_answers": number, "recruiter_verdict": "HIRE"|"INTERVIEW"|"REJECT" }`;

const USER_TEXT = `Candidate Profile:
${CANDIDATE_CV}

Jobs:
${JSON.stringify(TEST_JOBS.map((j, i) => ({
  index: i,
  job_title: j.title,
  company: j.company,
  location: j.location,
  description: j.spec,
})), null, 2)}`;

async function main() {
  console.log("=".repeat(60));
  console.log("DIRECT AI TEST — Sipho Ndlovu (E-commerce Digital Marketing)");
  console.log("=".repeat(60));
  console.log(`Jobs: ${TEST_JOBS.length}`);
  console.log(`Industry: ${CANDIDATE_INDUSTRY}`);
  console.log("");

  const start = Date.now();

  try {
    const raw = await callAIWithFallback(
      SYSTEM_PROMPT,
      USER_TEXT,
      "test-sipho",
      { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 16384 }
    );

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[OK] AI responded via ${lastAITier} in ${elapsed}s`);
    console.log("");
    console.log("--- RAW AI RESPONSE ---");
    console.log(raw.slice(0, 500));
    console.log("---");
    console.log("");

    const parsed = JSON.parse(raw);
    const results = Array.isArray(parsed) ? parsed : Object.values(parsed).find(v => Array.isArray(v)) ?? [];

    if (results.length === 0) {
      console.log("[FAIL] No results in response. Raw response may be truncated or malformed.");
      console.log("Full raw response (last 500 chars):", raw.slice(-500));
      return;
    }

    console.log(`Results: ${results.length} jobs scored`);
    console.log("");

    for (const r of results) {
      const job = TEST_JOBS[r.index];
      console.log(`${"-".repeat(40)}`);
      console.log(`Job ${r.index + 1}: ${job.title} @ ${job.company}`);
      console.log(`  Score: ${r.score} | Verdict: ${r.recruiter_verdict} | Industry: ${job.location}`);
      console.log(`  Knockout: ${r.knockout_fail}`);
      console.log(`  Adjusted: ${r.adjustment_note ?? "none"}`);
      console.log(`  Pillars: I=${r.pillar_scores?.industry} F=${r.pillar_scores?.function} S=${r.pillar_scores?.scale} T=${r.pillar_scores?.tools} L=${r.pillar_scores?.location}`);
      console.log(`  Taxes: ${(r.taxes_applied as string[])?.join(", ") || "none"}`);
      console.log(`  Q: ${r.yes_answers}/${r.total_questions_asked}`);
      console.log(`  Suggested CV: ${r.suggested_cv_name}`);
      console.log("");
      console.log(`  Reasons:`);
      if (r.pillar_reasons) {
        for (const [k, v] of Object.entries(r.pillar_reasons as Record<string, string>)) {
          console.log(`    ${k}: ${v}`);
        }
      }
      console.log(`  Summary: ${r.reason}`);
    }
  } catch (err: any) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[FAIL] AI call failed after ${elapsed}s`);
    console.log(`  Error: ${err?.message ?? String(err)}`);
    if (err?.stack) {
      console.log(`  Stack: ${err.stack.split("\n").slice(0, 3).join("\n")}`);
    }
  }
}

main().catch(console.error);
