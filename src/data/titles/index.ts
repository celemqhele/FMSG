import { TITLE_EXCEPTIONS } from "./exceptions";

// Words that indicate seniority — strip these first
const SENIORITY_WORDS = new Set([
  "Senior", "Snr", "Sr",
  "Lead",
  "Principal",
  "Head",
  "Director",
  "VP",
  "Vice",
  "President",
  "Executive",
  "Chief",
  "Associate",
  "Managing",
  "General",
]);

// Qualifier words — strip these for broadest form
const QUALIFIER_WORDS = new Set([
  "Enterprise",
  "Strategic",
  "Global",
  "Regional",
  "National",
  "Corporate",
  "Key",
  "Major",
  "International",
  "Senior",
  "Snr",
  "Sr",
  "Lead",
  "Principal",
  "Head",
  "Director",
  "VP",
  "Vice",
  "President",
  "Executive",
  "Chief",
  "Associate",
  "Managing",
  "General",
  "Junior",
  "Jr",
  "Trainee",
  "Graduate",
  "Grad",
  "Intern",
  "Assistant",
  "Asst",
]);

function stripWords(title: string, wordsToRemove: Set<string>): string {
  const words = title.split(/\s+/);
  const filtered = words.filter((w) => !wordsToRemove.has(w));
  const result = filtered.join(" ");
  return result || title;
}

export function broadenTitle(title: string): string {
  if (!title) return "";
  const trimmed = title.trim();

  const exception = TITLE_EXCEPTIONS[trimmed];
  if (exception) return exception.broad;

  return stripWords(trimmed, SENIORITY_WORDS);
}

export function broadenTitleMax(title: string): string {
  if (!title) return "";
  const trimmed = title.trim();

  const exception = TITLE_EXCEPTIONS[trimmed];
  if (exception) return exception.broadest;

  return stripWords(trimmed, QUALIFIER_WORDS);
}
