import { notFound, redirect } from "next/navigation";
import { jobBoards, findBoardByJobSlug } from "@/data/jobs/categories";

type PageProps = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function LegacyGuestPage(props: PageProps) {
  const { searchParams } = await props;
  const { k } = await searchParams;
  if (typeof k === "string" && k) {
    const found = findBoardByJobSlug(k);
    if (found) redirect(`/jobs/${found.board.slug}#${found.job.slug}`);
  }
  const fallback = jobBoards.find((b) => b.jobs.length > 0) ?? jobBoards[0];
  if (fallback) redirect(`/jobs/${fallback.slug}`);
  notFound();
}
