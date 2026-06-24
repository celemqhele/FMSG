"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { XCircle, ShieldBan } from "lucide-react";

interface DeletedJob {
  id: string;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  job_url: string;
  full_spec: string;
  domain_verified?: boolean;
  domain_unverified_reason?: string;
}

interface SystemRejected {
  id: string;
  job_title: string;
  company: string;
  location: string;
  job_url: string;
  reason: string;
  snippet: string;
  passed_domain_filter: boolean;
  passed_banned_filter: boolean;
  passed_pass1: boolean;
  passed_pass2: boolean;
}

type Tab = "user" | "system";

function ReasonBadge({ reason }: { reason: string }) {
  let label = reason;
  let color = "bg-gray-500/20 text-gray-400";
  if (reason.startsWith("blacklisted_domain") || reason.startsWith("blacklisted_via")) {
    label = "Blocked domain";
    color = "bg-red-500/20 text-red-400";
  } else if (reason.startsWith("banned_company") || reason.startsWith("banned_job")) {
    label = "Banned company/job";
    color = "bg-red-500/20 text-red-400";
  } else if (reason.startsWith("ai_pass2")) {
    label = "AI rejected (deep)";
    color = "bg-orange-500/20 text-orange-400";
  } else if (reason.startsWith("ai_pass2_fallback")) {
    label = "AI rejected (analysis failed)";
    color = "bg-orange-500/20 text-orange-400";
  } else if (reason.startsWith("ai_pass1")) {
    label = "AI rejected (screening)";
    color = "bg-yellow-500/20 text-yellow-400";
  }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{label}</span>;
}

export function RejectedJobs() {
  const [tab, setTab] = useState<Tab>("user");
  const [jobs, setJobs] = useState<DeletedJob[]>([]);
  const [systemRejected, setSystemRejected] = useState<SystemRejected[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession()
      .then(({ data }: { data: any }) => {
        const session = data?.session;
        if (!session) { setLoading(false); return; }
        Promise.all([
          supabase
            .from("job_results")
            .select("*")
            .eq("user_id", session.user.id)
            .eq("is_deleted", true)
            .order("created_at", { ascending: false }),
          supabase
            .from("rejected_jobs")
            .select("*")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false })
            .limit(50),
        ]).then(([userRes, systemRes]) => {
          setJobs((userRes.data ?? []) as DeletedJob[]);
          setSystemRejected((systemRes.data ?? []) as SystemRejected[]);
          setLoading(false);
        }).catch((err: Error) => {
          console.error("Failed to load rejected jobs:", err.message);
          setLoading(false);
        });
      })
      .catch((err: Error) => {
        console.error("Failed to get session:", err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">Loading...</p>;
  }

  const hasUser = jobs.length > 0;
  const hasSystem = systemRejected.length > 0;

  if (!hasUser && !hasSystem) {
    return (
      <div className="text-center py-12">
        <XCircle size={32} className="mx-auto mb-2 text-[var(--color-text-secondary)] opacity-40" />
        <p className="text-sm text-[var(--color-text-secondary)]">No rejected jobs yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10 max-w-xs mx-auto">
        <button
          onClick={() => setTab("user")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === "user"
              ? "bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          Manually rejected ({jobs.length})
        </button>
        <button
          onClick={() => setTab("system")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === "system"
              ? "bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          System filtered ({systemRejected.length})
        </button>
      </div>

      {tab === "user" && (
        hasUser ? (
          <div className="space-y-4">
            {jobs.map((j) => (
              <div key={j.id} className="liquid-glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{j.job_title}</p>
                  {j.match_score > 0 && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      j.match_score >= 80 ? "bg-green-500/20 text-green-400" :
                      j.match_score >= 60 ? "bg-amber-500/20 text-amber-400" :
                      "bg-red-500/20 text-red-400"
                    }`}>{j.match_score}%</span>
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-secondary)]">{j.company}{j.location ? <> &bull; {j.location}</> : ""}</p>
                {j.estimated_salary && <p className="text-xs text-[var(--color-text-secondary)]/60 mt-0.5">{j.estimated_salary}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-[var(--color-text-secondary)] py-8">No manually rejected jobs.</p>
        )
      )}

      {tab === "system" && (
        hasSystem ? (
          <div className="space-y-3">
            {systemRejected.map((j) => (
              <div key={j.id} className="liquid-glass rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{j.job_title}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] truncate">{j.company}{j.location ? <> &bull; {j.location}</> : ""}</p>
                  {j.snippet && <p className="text-xs text-[var(--color-text-secondary)]/60 mt-1 line-clamp-2">{j.snippet}</p>}
                </div>
                <div className="shrink-0">
                  <ReasonBadge reason={j.reason} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-[var(--color-text-secondary)] py-8">No system-filtered jobs yet.</p>
        )
      )}
    </div>
  );
}
