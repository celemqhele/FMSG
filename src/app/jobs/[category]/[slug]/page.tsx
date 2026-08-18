import type { Metadata } from "next";
import { jobBoards, getBoardBySlug, findBoardByJobSlug } from "@/data/jobs/categories";
import { JobDetail } from "@/components/jobs/job-detail";

type PageProps = {
  params: Promise<{ category: string; slug: string }>;
};

export function generateStaticParams() {
  return jobBoards.flatMap((board) =>
    board.jobs.map((job) => ({ category: board.slug, slug: job.slug }))
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = findBoardByJobSlug(slug);
  if (!found) return { title: "Job not found | Find Me Some Jobs" };
  return {
    title: `${found.job.title} at ${found.job.company} | Find Me Some Jobs`,
    description: found.job.snippet,
    openGraph: {
      title: `${found.job.title} at ${found.job.company}`,
      description: found.job.snippet,
      type: "website",
    },
  };
}

export default async function JobDetailPage({ params }: PageProps) {
  const { category, slug } = await params;
  const found = findBoardByJobSlug(slug);
  const board = getBoardBySlug(category);

  const jsonLd = found
    ? {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: found.job.title,
        description: found.job.description,
        datePosted: new Date().toISOString().split("T")[0],
        hiringOrganization: {
          "@type": "Organization",
          name: found.job.company,
        },
        jobLocation: {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: found.job.location,
            addressCountry: "ZA",
          },
        },
        employmentType: "FULL_TIME",
        url: found.job.applyUrl,
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <JobDetail
        category={category}
        slug={slug}
        boardName={board?.name ?? found?.board.name ?? null}
        staticJob={
          found
            ? {
                title: found.job.title,
                company: found.job.company,
                location: found.job.location,
                salary: found.job.salary,
                description: found.job.description,
                snippet: found.job.snippet,
                applyUrl: found.job.applyUrl,
                featured: found.job.featured ?? false,
              }
            : null
        }
      />
    </>
  );
}
