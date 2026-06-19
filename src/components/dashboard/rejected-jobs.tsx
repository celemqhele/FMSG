"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { XCircle } from "lucide-react";

interface RejectedJob {
  id: string;
  job_title: string;
  company: string;
  location: string;
  snippet: string;
  reason: string;
  job_url: string;
  passed_domain_filter: boolean;
  passed_banned_filter: boolean;
  passed_pass1: boolean;
  passed_pass2: boolean;
  search_query: string;
  created_at: string;
}

const stageLabel: Record<string, string> = {
  no_domain: "No domain found",
  blacklisted_domain: "Blocked source",
  stale_high_trust: "Listing too old",
  stale_standard_trust: "Listing too old",
  untrusted_domain: "Untrusted source",
  banned_company: "Blocked company",
  banned_job: "Blocked job",
};

export function RejectedJobs() {
  const [jobs, setJobs] = useState<RejectedJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: any }) => {
      const session = data?.session;
      if (!session) { setLoading(false); return; }
      supabase
        .from("rejected_jobs")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .then(({ data }: { data: any }) => {
          setJobs((data ?? []) as RejectedJob[]);
          setLoading(false);
        });
    });
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">Loading...</p>;
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <XCircle size={32} className="mx-auto mb-2 text-[var(--color-text-secondary)] opacity-40" />
        <p className="text-sm text-[var(--color-text-secondary)]">No rejected jobs yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((j) => {
        const stage = stageLabel[j.reason] || j.reason;
        return (
          <div key={j.id} className="liquid-glass rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{j.job_title}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {j.company}
                  {j.location && <> &bull; {j.location}</>}
                </p>
                {j.snippet && (
                  <p className="text-xs text-[var(--color-text-secondary)]/60 mt-1.5 line-clamp-2">{j.snippet}</p>
                )}
              </div>
              <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                {stage}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
