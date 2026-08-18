"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";

interface StaticJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  snippet: string;
  applyUrl: string;
  featured: boolean;
}

interface StoredJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  applyUrl: string;
  source: string;
}

interface JobDetailProps {
  category: string;
  slug: string;
  boardName: string | null;
  staticJob: StaticJob | null;
}

export function JobDetail({ category, slug, boardName, staticJob }: JobDetailProps) {
  const [job, setJob] = useState<StaticJob | null>(staticJob);
  const [loading, setLoading] = useState(!staticJob);

  useEffect(() => {
    if (staticJob) return;
    try {
      const stored = localStorage.getItem("fmsg-view-job");
      if (stored) {
        const data: StoredJob = JSON.parse(stored);
        setJob({
          title: data.title,
          company: data.company,
          location: data.location,
          salary: data.salary,
          description: data.description,
          snippet: data.description?.slice(0, 200) || "",
          applyUrl: data.applyUrl,
          featured: false,
        });
        localStorage.removeItem("fmsg-view-job");
      }
    } catch {}
    setLoading(false);
  }, [staticJob]);

  useEffect(() => {
    if (job) {
      document.title = `${job.title} at ${job.company} | Find Me Some Jobs`;
    }
  }, [job]);

  if (loading) {
    return (
      <DashboardLayout guest onGuestSignUp={() => {}}>
        <div className="max-w-3xl mx-auto pt-8 px-4">
          <div className="liquid-glass rounded-xl p-8 text-center">
            <p className="text-sm text-white/70">Loading job details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout guest onGuestSignUp={() => {}}>
        <div className="max-w-3xl mx-auto pt-8 px-4">
          <div className="liquid-glass rounded-xl p-8 text-center">
            <p className="text-base font-medium text-white mb-2">Job listing not found</p>
            <p className="text-sm text-white/70 mb-4">
              This job listing may have expired or the link may be incorrect.
            </p>
            <Link
              href={`/jobs/${category}`}
              className="inline-flex items-center gap-2 text-sm text-[var(--color-accent)] hover:underline"
            >
              <ArrowLeft size={14} />
              Back to {boardName || "board"}
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const applyButtons = (
    <div className="flex gap-3">
      <a
        href={job.applyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-[2] flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg transition-colors"
      >
        Apply Now
        <ExternalLink size={14} />
      </a>
    </div>
  );

  return (
    <DashboardLayout guest onGuestSignUp={() => {}}>
      <div className="max-w-3xl mx-auto pt-6 pb-12 px-4 space-y-6">
        <Link
          href={`/jobs/${category}`}
          className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back to {boardName || "board"}
        </Link>

        <div className="liquid-glass rounded-xl p-6 md:p-8 space-y-6">
          {job.featured && (
            <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/40">
              Featured
            </span>
          )}

          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-white mb-2">
              {job.title}
            </h1>
            <p className="text-base text-white/80">
              {job.company}
              {job.location && (
                <>
                  <span className="mx-2">&bull;</span>
                  {job.location}
                </>
              )}
            </p>
            {job.salary && (
              <p className="text-sm text-white/50 mt-1">{job.salary}</p>
            )}
          </div>

          {applyButtons}

          <div className="border-t border-white/10 pt-6">
            <div className="prose prose-invert max-w-none text-sm text-white/80 whitespace-pre-line leading-relaxed">
              {job.description}
            </div>
          </div>

          {applyButtons}
        </div>

        <Link
          href={`/jobs/${category}`}
          className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back to {boardName || "board"}
        </Link>
      </div>
    </DashboardLayout>
  );
}
