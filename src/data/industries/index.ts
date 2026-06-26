import { TECH_INDUSTRIES } from "./technology";
import { FINANCE_INDUSTRIES } from "./finance-professional";
import { HEALTHCARE_EDUCATION_INDUSTRIES } from "./healthcare-education";
import { INDUSTRIAL_INDUSTRIES } from "./industrial";
import { MEDIA_SERVICES_INDUSTRIES } from "./media-services";

const INDUSTRY_MAP: Record<string, { broad: string; broadest: string }> = {
  ...TECH_INDUSTRIES,
  ...FINANCE_INDUSTRIES,
  ...HEALTHCARE_EDUCATION_INDUSTRIES,
  ...INDUSTRIAL_INDUSTRIES,
  ...MEDIA_SERVICES_INDUSTRIES,
};

export function broadenIndustry(industry: string, level: 1 | 2): string {
  if (!industry) return "";
  const trimmed = industry.trim();
  const entry = INDUSTRY_MAP[trimmed];
  if (!entry) return trimmed;
  return level === 1 ? entry.broad : entry.broadest;
}
