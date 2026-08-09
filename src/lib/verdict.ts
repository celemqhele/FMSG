export type ApplicantVerdict = "Apply" | "Consider" | "Don't apply";

const LEGACY_MAP: Record<string, ApplicantVerdict> = {
  HIRE: "Apply",
  INTERVIEW: "Consider",
  REJECT: "Don't apply",
};

export function normalizeVerdict(verdict: string | null | undefined): ApplicantVerdict | null {
  if (!verdict) return null;
  if (verdict === "Apply" || verdict === "Consider" || verdict === "Don't apply") return verdict;
  return LEGACY_MAP[verdict] ?? null;
}

export function verdictBadgeColor(verdict: string | null | undefined): string {
  switch (normalizeVerdict(verdict)) {
    case "Apply": return "bg-green-500/20 text-green-400";
    case "Consider": return "bg-amber-500/20 text-amber-400";
    case "Don't apply": return "bg-red-500/20 text-red-400";
    default: return "bg-gray-500/20 text-gray-400";
  }
}

export function verdictLightColor(verdict: string | null | undefined): string {
  switch (normalizeVerdict(verdict)) {
    case "Apply": return "text-green-400 bg-green-500/10";
    case "Consider": return "text-yellow-400 bg-yellow-500/10";
    case "Don't apply": return "text-red-400 bg-red-500/10";
    default: return "text-gray-400 bg-gray-500/10";
  }
}
