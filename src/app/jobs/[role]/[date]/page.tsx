import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getJobPost } from "@/lib/job-posts";

type PageProps = { params: Promise<{ role: string; date: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { role, date } = await params;
  const { k } = await searchParams;
  const post = getJobPost(role, date, typeof k === "string" ? k : "");
  if (!post) return { title: "Job not found | Find Me Some Jobs" };
  return {
    title: `${post.title} at ${post.company} | Find Me Some Jobs`,
    description: post.snippet,
    openGraph: {
      title: `${post.title} at ${post.company}`,
      description: post.snippet,
      type: "website",
    },
  };
}

export default async function JobPostPage(props: PageProps) {
  const { role, date } = await props.params;
  const { k } = await props.searchParams;
  const post = getJobPost(role, date, typeof k === "string" ? k : "");
  if (!post) notFound();
  redirect(`/guest?k=${encodeURIComponent(post.key)}`);
}
