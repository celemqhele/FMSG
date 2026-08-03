import type { JobBoard, JobCard } from "./types";
import { financeJobs } from "./finance";
import { lifeSciencesJobs } from "./life-sciences";

export const jobBoards: JobBoard[] = [
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
