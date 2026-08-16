import type { JobCard } from "../types";
import { sanlamJuniorPortfolioManager } from "./sanlam-junior-portfolio-manager";
import { premierFmcgAdministratorPayroll } from "./premier-fmcg-administrator-payroll";
import { absaBuildingClaimsAssessor } from "./absa-building-claims-assessor";
import { fnbComplianceSpecialist } from "./fnb-compliance-specialist";

export const financeJobs: JobCard[] = [
  sanlamJuniorPortfolioManager,
  premierFmcgAdministratorPayroll,
  absaBuildingClaimsAssessor,
  fnbComplianceSpecialist,
];
