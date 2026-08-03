import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, Sparkles } from "lucide-react";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { TransitionLink } from "@/components/ui/transition-link";
import { getJobPost } from "@/lib/job-posts";
import "@/components/landing/liquid-glass.css";

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

async function JobPostContent({ params, searchParams }: PageProps) {
  const { role, date } = await params;
  const { k } = await searchParams;
  const post = getJobPost(role, date, typeof k === "string" ? k : "");
  if (!post) notFound();

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar />
      <main className="relative z-10 flex-1 px-4 pt-24 md:pt-28 pb-24">
        <div className="max-w-2xl mx-auto">
          <div className="liquid-glass rounded-2xl p-6 md:p-8">
            <span className="inline-block mb-4 text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/40">
              Featured Opportunity
            </span>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white leading-tight">
              {post.title}
            </h1>
            <p className="mt-2 text-base text-white/80">
              {post.company}
              {post.location && <> <span className="mx-1 text-white/40">&bull;</span> {post.location}</>}
            </p>
            {post.salary && (
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{post.salary}</p>
            )}

            <div className="mt-6 pt-6 border-t border-white/[0.08]">
              <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">{post.paraphrase}</p>
            </div>

            {post.snippet && (
              <div className="mt-5 pt-5 border-t border-white/[0.08]">
                <p className="text-sm text-white/60 leading-relaxed whitespace-pre-line">{post.snippet}</p>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3">
              <a
                href={post.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
              >
                Apply Now
                <ExternalLink size={14} />
              </a>
              <TransitionLink
                href={`/guest?k=${encodeURIComponent(post.key)}`}
                className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-white/80 border border-white/20 rounded-full hover:bg-white/5 transition-colors"
              >
                <Sparkles size={14} />
                Find More Jobs Like This
              </TransitionLink>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function JobPostPage(props: PageProps) {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <p className="text-white/80 text-sm">Loading...</p>
      </div>
    }>
      <JobPostContent {...props} />
    </Suspense>
  );
}
