import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { jobBoards, getBoardBySlug } from "@/data/jobs/categories";
import { JobsBoard } from "@/components/jobs/jobs-board";

type PageProps = { params: Promise<{ category: string }> };

export function generateStaticParams() {
  return jobBoards.map((board) => ({ category: board.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const board = getBoardBySlug(category);
  if (!board) return { title: "Job board not found | Find Me Some Jobs" };
  return {
    title: `${board.name} Jobs in South Africa | Find Me Some Jobs`,
    description: board.tagline,
    openGraph: {
      title: `${board.name} Jobs in South Africa`,
      description: board.tagline,
      type: "website",
    },
  };
}

export default async function JobBoardPage(props: PageProps) {
  const { category } = await props.params;
  const board = getBoardBySlug(category);
  if (!board) notFound();
  return <JobsBoard board={board} />;
}
