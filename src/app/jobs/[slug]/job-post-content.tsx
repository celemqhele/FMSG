"use client";

import { useState, useCallback } from "react";
import { Search, ExternalLink } from "lucide-react";
import { AuthModal } from "@/components/auth/auth-modal";
import { MobileAuthSheet } from "@/components/auth/mobile-auth-sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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
  const isMobile = useIsMobile();
  const router = useRouter();

  const storeReferral = useCallback(() => {
    localStorage.setItem(
      "fmsg_referral",
      JSON.stringify({
        slug: job.slug,
        company: job.company,
        job_title: job.job_title,
        apply_url: job.apply_url,
      })
    );
  }, [job]);

  const handleFindMore = useCallback(async () => {
    storeReferral();
    startTransition();
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setTimeout(() => {
        endTransition();
        router.push("/dashboard");
      }, 800);
    } else {
      setAuthTab("signup");
      setAuthOpen(true);
      setTimeout(endTransition, 800);
    }
  }, [storeReferral, startTransition, endTransition, router]);

  const handleClose = useCallback(() => {
    setAuthOpen(false);
    endTransition();
  }, [endTransition]);

  const sourceLabel = (() => {
    const s = (job.source || "").toLowerCase();
    if (s.includes("linkedin")) return "LinkedIn";
    if (s.includes("indeed")) return "Indeed";
    if (s.includes("pnet") || s.includes("careerjunction")) return "PNet";
    if (s === "google_jobs" || s.includes("google")) return "Google Jobs";
    if (s === "jsearch") return "LinkedIn";
    if (s.includes("glassdoor")) return "Glassdoor";
    return job.source || "the original listing";
  })();

  const hasExternalUrl = job.apply_url && (job.apply_url.startsWith("http://") || job.apply_url.startsWith("https://"));

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
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-gray-900 bg-white hover:bg-white/90 rounded-full transition-colors"
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
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-gray-900 bg-white hover:bg-white/90 rounded-full transition-colors"
          >
            <Search size={16} />
            Find more jobs like this
          </button>
          {hasExternalUrl && (
            <a
              href={job.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { e.stopPropagation(); window.open(job.apply_url, "_blank", "noopener,noreferrer"); e.preventDefault(); }}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-medium text-white/80 border border-white/20 hover:bg-white/10 rounded-full transition-colors"
            >
              Apply on {sourceLabel}
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>

      {isMobile ? (
        <MobileAuthSheet isOpen={authOpen} onClose={handleClose} defaultTab={authTab} />
      ) : (
        <AuthModal isOpen={authOpen} onClose={handleClose} defaultTab={authTab} />
      )}
    </div>
  );
}
