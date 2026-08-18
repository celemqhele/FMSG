import type { MetadataRoute } from "next";
import { jobBoards } from "@/data/jobs/categories";

const BASE_URL = "https://findmesomejobs.co.za";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    { url: BASE_URL, changeFrequency: "weekly" as const, priority: 1.0 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${BASE_URL}/pricing`, changeFrequency: "weekly" as const, priority: 0.8 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "monthly" as const, priority: 0.5 },
    { url: `${BASE_URL}/terms`, changeFrequency: "monthly" as const, priority: 0.5 },
  ];

  const boardPages = jobBoards.map((board) => ({
    url: `${BASE_URL}/jobs/${board.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const jobPages = jobBoards.flatMap((board) =>
    board.jobs.map((job) => ({
      url: `${BASE_URL}/jobs/${board.slug}/${job.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))
  );

  return [...staticPages, ...boardPages, ...jobPages];
}
