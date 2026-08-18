import type { Metadata } from "next";
import { jobBoards } from "@/data/jobs/categories";
import { GlobalJobsBoard } from "@/components/jobs/global-jobs-board";

export const metadata: Metadata = {
  title: "All Job Cards | Find Me Some Jobs",
  description: "Every curated job card across all sectors on Find Me Some Jobs.",
  openGraph: {
    title: "All Job Cards | Find Me Some Jobs",
    description: "Every curated job card across all sectors on Find Me Some Jobs.",
    type: "website",
  },
};

export default function GlobalJobsPage() {
  return <GlobalJobsBoard boards={jobBoards} />;
}
