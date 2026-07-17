"use client";

import { useState, useCallback } from "react";
import { ExternalLink, Search } from "lucide-react";
import { AuthModal } from "@/components/auth/auth-modal";
import { useTransition } from "@/components/providers/transition-provider";

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

export function JobPostContent({ job }: { job: PublicJob }) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const { startTransition, endTransition } = useTransition();

  const handleFindMore = useCallback(() => {
    localStorage.setItem(
      "fmsg_referral",
      JSON.stringify({
        slug: job.slug,
        company: job.company,
        job_title: job.job_title,
        apply_url: job.apply_url,
      })
    );
    startTransition();
    setAuthTab("signup");
    setAuthOpen(true);
    setTimeout(endTransition, 800);
  }, [job, startTransition, endTransition]);

  const handleClose = useCallback(() => {
    setAuthOpen(false);
    endTransition();
  }, [endTransition]);

  const sourceLabel = job.source || "external listing";

  return (
    <div className="max-w-3xl mx-auto px-4 pt-32 pb-24">
      <div className="liquid-glass rounded-2xl p-8 md:p-10 space-y-8">
        <div className="space-y-2">
          <p className="text-sm text-white/50 uppercase tracking-wide">{job.company}</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white">{job.job_title}</h1>
          <div className="flex flex-wrap gap-3 text-sm text-white/60">
            {job.location && <span>{job.location}</span>}
            {job.estimated_salary && <span>{job.estimated_salary}</span>}
            <span className="text-white/40">via {sourceLabel}</span>
          </div>
        </div>

        <button
          onClick={handleFindMore}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
        >
          <Search size={16} />
          Find more jobs like this
        </button>

        <div className="prose prose-invert max-w-none text-white/80 text-sm leading-relaxed whitespace-pre-line">
          {job.paraphrased_description}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleFindMore}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
          >
            <Search size={16} />
            Find more jobs like this
          </button>
          <a
            href={job.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-medium text-white/80 border border-white/20 hover:bg-white/10 rounded-full transition-colors"
          >
            Apply on {sourceLabel}
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <AuthModal isOpen={authOpen} onClose={handleClose} defaultTab={authTab} />
    </div>
  );
}
