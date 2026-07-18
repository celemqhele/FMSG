import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { JobPostContent } from "./job-post-content";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface PublicJob {
  id: string;
  slug: string;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  snippet: string;
  paraphrased_description: string;
  apply_url: string;
  source: string;
}

async function getPublicJob(slug: string): Promise<PublicJob | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data } = await supabase
    .from("public_jobs")
    .select("id, slug, job_title, company, location, estimated_salary, snippet, paraphrased_description, apply_url, source")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getPublicJob(slug);
  if (!job) return { title: "Job Not Found - FMSG" };

  const title = `${job.job_title} at ${job.company} - FMSG`;
  const description = job.snippet || `${job.job_title} at ${job.company}. ${job.location}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "FMSG",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function JobPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getPublicJob(slug);
  if (!job) notFound();

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar isLoggedIn={false} />
      <PageTransitionWrapper>
        <main className="flex-1">
          <JobPostContent job={job} />
        </main>
      </PageTransitionWrapper>
      <Footer />
    </>
  );
}
