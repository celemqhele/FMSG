import { notFound, redirect } from "next/navigation";
import { findBoardByJobSlug } from "@/data/jobs/categories";

type PageProps = { params: Promise<{ role: string; date: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function LegacyJobPostPage(props: PageProps) {
  const { searchParams } = await props;
  const { k } = await searchParams;
  if (typeof k !== "string" || !k) notFound();
  const found = findBoardByJobSlug(k);
  if (!found) notFound();
  redirect(`/jobs/${found.board.slug}#${found.job.slug}`);
}
