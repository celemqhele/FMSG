import type { JobBoard, JobCard } from "./types";
import { commercialJobs } from "./commercial";
import { financeJobs } from "./finance";
import { lifeSciencesJobs } from "./life-sciences";
import { logisticsJobs } from "./logistics";
import { ngoJobs } from "./ngo";
import { technologyJobs } from "./technology";

export const jobBoards: JobBoard[] = [
  {
    slug: "commercial",
    name: "Commercial",
    tagline: "Sales, marketing and brand roles at South Africa's leading consumer-goods teams.",
    search: { title: "Telesales", location: "Johannesburg, South Africa" },
    jobs: commercialJobs,
  },
  {
    slug: "finance",
    name: "Finance",
    tagline: "Finance roles hand-picked from top South African employers.",
    search: { title: "Finance", location: "Johannesburg, South Africa" },
    jobs: financeJobs,
  },
  {
    slug: "life-sciences",
    name: "Life Sciences",
    tagline: "Pre-vetted life-science roles at leading global manufacturers.",
    search: { title: "Country Manager", location: "Johannesburg, South Africa" },
    jobs: lifeSciencesJobs,
  },
  {
    slug: "logistics",
    name: "Logistics",
    tagline: "Transport, freight and heavy-lift project roles from leading global logistics operators.",
    search: { title: "Projects Engineer", location: "Kempton Park, South Africa" },
    jobs: logisticsJobs,
  },
  {
    slug: "technology",
    name: "Technology",
    tagline: "IT, software and engineering roles from South Africa's leading employers.",
    search: { title: "Problem Manager", location: "Johannesburg, South Africa" },
    jobs: technologyJobs,
  },
  {
    slug: "ngo",
    name: "Non-profit & NGOs",
    tagline: "Impact-driven roles at South Africa's leading development and non-profit organisations.",
    search: { title: "Partnerships", location: "Pretoria, South Africa" },
    jobs: ngoJobs,
  },
];

export function getBoardBySlug(slug: string): JobBoard | null {
  return jobBoards.find((b) => b.slug === slug) ?? null;
}

export function findBoardByJobSlug(jobSlug: string): { board: JobBoard; job: JobCard } | null {
  for (const board of jobBoards) {
    const job = board.jobs.find((j) => j.slug === jobSlug);
    if (job) return { board, job };
  }
  return null;
}
