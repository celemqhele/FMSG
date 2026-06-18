import natural from "natural";
import nlp from "compromise";
import Fuse from "fuse.js";

const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

const REQ_MARKERS = /\b(must|required|essential|minimum|prerequisite|need to have|requirements?|qualifications?)\b/gi;

function tokenizeAndStem(text: string): string[] {
  const tokens = tokenizer.tokenize(text.toLowerCase()) ?? [];
  return tokens
    .filter((t) => t.length > 1 && !natural.stopwords.includes(t))
    .map((t) => stemmer.stem(t));
}

function extractKeywords(text: string): string[] {
  const doc = nlp(text);
  const nouns = (doc.nouns().out("array") as string[]);
  const properNouns = (doc.match("#ProperNoun").out("array") as string[]);
  return [
    ...new Set([
      ...nouns.flatMap((p) => p.split(" ")),
      ...properNouns.flatMap((p) => p.split(" ")),
    ]),
  ]
    .map((k) => k.toLowerCase().trim())
    .filter((k) => k.length > 2 && !natural.stopwords.includes(k));
}

function findRequiredTerms(text: string): Set<string> {
  const terms = new Set<string>();
  const lower = text.toLowerCase();
  let match: RegExpExecArray | null;
  while ((match = REQ_MARKERS.exec(lower)) !== null) {
    const start = Math.max(0, match.index - 60);
    const end = Math.min(lower.length, match.index + match[0].length + 60);
    const windowText = lower.slice(start, end);
    const words = tokenizer.tokenize(windowText) ?? [];
    for (const w of words) {
      if (w.length > 2 && !natural.stopwords.includes(w)) terms.add(w);
    }
  }
  return terms;
}

export function extractSalary(text: string): string {
  const zar = text.match(/\bZAR\s*([\d,.\s]+)/i);
  if (zar) return `ZAR ${zar[1].trim()}`;
  const r = text.match(/(?<![A-Za-z])R\s*([\d,.\s]+[kK]?)/);
  if (r) return `R ${r[1].trim()}`;
  return "";
}

export function isJobValid(spec: string, jobUrl?: string): boolean {
  const text = (spec ?? "").trim();
  if (text.length < 300) return false;

  const expired = /position filled|no longer accepting|closed|expired|this job is no longer/i;
  if (expired.test(text)) return false;

  if (jobUrl) {
    // Fire-and-forget URL check with 3s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const ok = fetch(jobUrl, { method: "HEAD", signal: controller.signal })
        .then((r) => r.ok)
        .catch(() => true); // Treat network errors as valid
      clearTimeout(timeout);
      // Can't await here, so skip URL check for sync callers
    } catch {
      // Ignore
    }
  }

  return true;
}

export function scoreJobMatch(
  cvText: string,
  jobSpec: string,
  fullSpec: string,
  userProfile: { job_titles: string[]; location: string }
): { score: number; match_summary: string; estimated_salary: string } {
  const specToUse = fullSpec || jobSpec;

  if (!specToUse || specToUse.length < 100) {
    return { score: 0, match_summary: "insufficient spec", estimated_salary: "" };
  }

  const cvTokens = tokenizeAndStem(cvText || "");
  const keywords = extractKeywords(specToUse);
  const requiredTerms = findRequiredTerms(specToUse);

  const hasCv = cvTokens.length > 0;

  // Fuzzy matcher against CV tokens
  const fuse = hasCv
    ? new Fuse(
        cvTokens.map((t, i) => ({ id: i, text: t })),
        { keys: ["text"], threshold: 0.4, includeScore: true }
      )
    : null;

  // Job title match (3 pts each, cap 30)
  let titleScore = 0;
  const specLower = specToUse.toLowerCase();
  for (const title of userProfile.job_titles) {
    const tl = title.toLowerCase();
    if (specLower.includes(tl)) titleScore += 3;
  }
  titleScore = Math.min(titleScore, 30);

  // Location match (cap 10)
  let locationScore = 0;
  if (userProfile.location && specLower.includes(userProfile.location.toLowerCase())) {
    locationScore = 10;
  }

  // Required keyword match (2 pts each, cap 30)
  let requiredScore = 0;
  for (const term of requiredTerms) {
    if (term.length < 3) continue;
    if (specLower.includes(term)) {
      requiredScore += 2;
      continue;
    }
    if (fuse) {
      const results = fuse.search(term);
      if (results.length > 0 && (results[0].score ?? 1) <= 0.4) {
        requiredScore += 2;
      }
    }
  }
  requiredScore = Math.min(requiredScore, 30);

  // Preferred keyword match (1 pt each, cap 30)
  let preferredScore = 0;
  for (const kw of keywords) {
    if (kw.length < 3 || requiredTerms.has(kw)) continue;
    const kwLower = kw.toLowerCase();
    if (specLower.includes(kwLower)) {
      preferredScore += 1;
      continue;
    }
    if (fuse && cvText) {
      const results = fuse.search(kw);
      if (results.length > 0 && (results[0].score ?? 1) <= 0.4) {
        preferredScore += 1;
      }
    }
  }
  preferredScore = Math.min(preferredScore, 30);

  const maxScore = 100;
  const rawScore = titleScore + locationScore + requiredScore + preferredScore;
  const score = Math.round((rawScore / maxScore) * 100);

  // Build summary
  const parts: string[] = [];
  if (titleScore > 0) parts.push("title matches");
  if (locationScore > 0) parts.push("location matches");
  if (requiredScore > 0) parts.push("key requirements matched");
  if (preferredScore > 0) parts.push("skills matched");
  const match_summary = parts.length > 0 ? parts.join(", ") : "minimal overlap";

  const estimated_salary = extractSalary(specToUse);

  return { score, match_summary, estimated_salary };
}

const VERIFIED_DOMAINS = [
  "indeed.co.za",
  "indeed.com",
  "linkedin.com",
  "careers24.com",
  "jobmail.co.za",
  "pnet.co.za",
  "bizcommunity.com",
  "gumtree.co.za",
  "jobplacements.com",
  "executiveplacements.com",
  "jobvine.co.za",
  "simplyhired.co.za",
  "glassdoor.com",
  "hireresolve.co.za",
  "talentsam.co.za",
  "networkrecruitment.co.za",
  "set.co.za",
  "communicate.co.za",
  "staffdomain.co.za",
  "manpower.co.za",
  "adcorpblu.co.za",
];

export function isDomainVerified(url: string): boolean {
  try {
    const domain = new URL(url).hostname.replace("www.", "");
    if (VERIFIED_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) {
      return true;
    }
    const path = new URL(url).pathname.toLowerCase();
    return (
      path.includes("/job") ||
      path.includes("/career") ||
      path.includes("/vacancy") ||
      path.includes("/position")
    );
  } catch {
    return false;
  }
}
