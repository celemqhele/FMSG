import { callAIWithFallback } from "@/lib/gemini";

// ============================================================
// AI requirements-vs-CV scoring (replaces the deterministic ATS score)
//
// The old weighted-keyword ATS produced false highs: it scored a job 100% on
// the word "operations" while the spec demanded 10 years of experience and the
// CV had 17 months (the `(\d+)years experience` regex missed "10 years'
// experience" with an apostrophe, so experience scored neutral 50 = no penalty).
//
// This module reads each job's stated must-have requirements against the CV in
// one holistic AI pass per chunk. It FAILS OPEN: any rate-limit / parse error
// leaves the job unscored (absent from the returned Map) rather than dropping it.
// ============================================================

export interface AiJobInput {
  /** Stable index used as the match id (index-based, so nothing is lost). */
  index: number;
  title: string;
  company: string;
  location: string;
  postedAt?: string;
  /** Full job spec text. */
  spec: string;
}

export interface AiJobScore {
  /** 0-100 holistic match score. */
  score: number;
  /** 1-2 line justification citing the deciding factor. */
  reason: string;
  /** True when the job is on-site somewhere the candidate clearly is not. */
  locationMismatch: boolean;
  /** True when the posting looks expired / far older than `today`. */
  stale: boolean;
}

export interface AiScoreJobsOptions {
  /** CV + profile text sent once per chunk. */
  candidateText: string;
  /** Explicit current date (YYYY-MM-DD) so the model can judge staleness. */
  today?: string;
  /** Jobs per AI call. 30 keeps each prompt ~30-40K chars (well under Gemini's *  input; the Groq/OpenRouter fallbacks truncate at 15K but are last-resort). */
  chunkSize?: number;
  /** Stop starting new chunks once past this epoch-ms (Vercel budget). */
  deadline?: number;
  /** Correlation id for logs (first 8 chars of searchId). */
  sid?: string;
}

// Requirement-ish signal lines for the deterministic extractor.
const REQ_HEADER =
  /^(requirements|qualifications?|what you(?:'ll| will|ll) need|essential|must[- ]have|minimum|experience|skills|education|about you|we(?:'re| are|'re) looking for|key (?:skills|requirements)|you(?:'ll| will|ll) have|the candidate|role requirements|job requirements)/i;
const REQ_SIGNAL =
  /\b(years?|yrs?|experience|degree|bachelor|master|mba|diploma|certifi|skill|proficien|knowledge|qualif|cleared|registered|matric|nqf|national diploma|hons|honours|doctorate|proven|demonstrat)\b/i;

/**
 * Deterministic requirements/quals grabber. Never calls an LLM. Fail-open: if
 * no requirement lines match (thin / no-header spec) it returns the head of the
 * spec instead of an empty string, so the model still has something to score.
 */
export function extractRequirementsBlock(spec: string, maxChars = 1100): string {
  if (!spec) return "";
  const lines = spec
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const picked: string[] = [];
  let len = 0;
  const push = (l: string): boolean => {
    if (len + l.length + 1 > maxChars) return false;
    picked.push(l);
    len += l.length + 1;
    return true;
  };
  for (const l of lines) {
    if (REQ_HEADER.test(l) || REQ_SIGNAL.test(l)) {
      if (!push(l)) break;
    }
  }
  // Fail-open: nothing matched → head of the spec.
  if (picked.length === 0) return spec.slice(0, maxChars).trim();
  return picked.join("\n");
}

const SYSTEM_PROMPT = `You are an expert technical recruiter scoring South African job postings against ONE candidate's CV.
For EACH job produce a 0-100 match score for how well the candidate's ACTUAL experience, skills, seniority, and location fit the job's stated must-have requirements.
Hard rules:
- A hard gap in a MUST-have requirement (e.g. the job needs 10+ years of experience but the candidate has far less, or a mandatory certification/degree the candidate lacks) must push the score BELOW 40, no matter how many keywords overlap.
- Score 75-100 only for a strong, well-matched role where the candidate plausibly meets the core requirements.
- location_mismatch = true if the job is on-site in a place the candidate is clearly not based and it is not open to remote.
- stale = true only if the posting is obviously expired or far older than the given date.
Return ONLY a JSON array. Each element exactly: {"id":<the job's id number>,"score":<0-100 integer>,"reason":"<max 25 words, cite the deciding factor>","location_mismatch":<true|false>,"stale":<true|false>}. No prose, no code fences.`;

function buildUserPrompt(chunk: AiJobInput[], candidateText: string, today: string): string {
  const cv = candidateText.slice(0, 3000);
  const jobs = chunk
    .map((j) => {
      const req = extractRequirementsBlock(j.spec);
      return `[${j.index}] Title: ${j.title} | Company: ${j.company} | Location: ${j.location}${j.postedAt ? ` | Posted: ${j.postedAt}` : ""}\nRequirements:\n${req}`;
    })
    .join("\n\n");
  return `TODAY'S DATE: ${today}\n\nCANDIDATE (CV + profile):\n${cv}\n\nJOBS TO SCORE (score every one):\n${jobs}`;
}

/** Score one chunk in a single AI call. Index-based matching; throws on parse failure (caller fail-opens). */
async function scoreChunk(
  chunk: AiJobInput[],
  candidateText: string,
  today: string,
): Promise<Map<number, AiJobScore>> {
  const out = new Map<number, AiJobScore>();
  const userText = buildUserPrompt(chunk, candidateText, today);
  const raw = await callAIWithFallback(SYSTEM_PROMPT, userText, `ai-score-${chunk.length}`, {
    responseMimeType: "application/json",
    maxOutputTokens: 4096,
  });

  // Lenient parse: strip fences, take the outermost array.
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  const jsonStr = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const arr: unknown[] = JSON.parse(jsonStr);
  if (!Array.isArray(arr)) throw new Error("ai-scoring: model did not return an array");

  for (const item of arr as Record<string, unknown>[]) {
    const idx = Number(item.id);
    if (!Number.isFinite(idx)) continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(item.score) || 0)));
    out.set(idx, {
      score,
      reason: String(item.reason ?? "").slice(0, 180),
      locationMismatch: item.location_mismatch === true,
      stale: item.stale === true,
    });
  }
  return out;
}

/**
 * Score jobs against the CV in chunked AI calls. Returns a Map keyed by the
 * job's `index`. Jobs absent from the Map were not scored (fail-open) — the
 * caller keeps them with an "unscored" sentinel rather than dropping them.
 */
export async function scoreJobsWithAI(
  jobs: AiJobInput[],
  opts: AiScoreJobsOptions,
): Promise<Map<number, AiJobScore>> {
  const result = new Map<number, AiJobScore>();
  if (jobs.length === 0) return result;

  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const sid = opts.sid ? ` sid=${opts.sid}` : "";
  const chunkSize = Math.max(1, Math.min(opts.chunkSize ?? 30, 50));
  const chunks: AiJobInput[][] = [];
  for (let i = 0; i < jobs.length; i += chunkSize) chunks.push(jobs.slice(i, i + chunkSize));

  let done = 0;
  for (let c = 0; c < chunks.length; c++) {
    if (opts.deadline && Date.now() > opts.deadline) {
      console.warn(
        `[AI-SCORING]${sid} deadline hit after ${done}/${jobs.length} — remaining jobs unscored (fail-open)`,
      );
      break;
    }
    try {
      const m = await scoreChunk(chunks[c], opts.candidateText, today);
      for (const [k, v] of m) result.set(k, v);
    } catch (err) {
      console.warn(
        `[AI-SCORING]${sid} chunk ${c + 1}/${chunks.length} failed (fail-open): ${(err as Error)?.message?.slice(0, 120)}`,
      );
    }
    done += chunks[c].length;
    console.log(`[AI-SCORING]${sid} chunk ${c + 1}/${chunks.length}: ${done}/${jobs.length} jobs attempted, ${result.size} scored`);
  }

  console.log(`[AI-SCORING]${sid} done: ${result.size}/${jobs.length} jobs scored via AI`);
  return result;
}
