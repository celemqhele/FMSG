"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { SearchPill } from "@/components/dashboard/search-pill";
import { JobResultCard } from "@/components/dashboard/job-result-card";
import { SearchHistory } from "@/components/dashboard/search-history";
import { createClient } from "@/lib/supabase/client";

interface JobResult {
  id: string;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  job_url: string;
  full_description: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<JobResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: any } | null }) => {
      if (!data?.user) {
        router.push("/");
      }
      setAuthChecked(true);
    });
  }, [router]);

  const handleSearch = useCallback(async (query: string) => {
    setSearching(true);
    setProgress(0);

    // Animate progress
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, 85));
    }, 1000);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      clearInterval(interval);
      setSearching(false);
      return;
    }

    try {
      const res = await fetch("/api/search-jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();

      if (res.status === 403 && data.code === "LIMIT_001") {
        setShowLimitModal("LIMIT_001");
        clearInterval(interval);
        setSearching(false);
        setProgress(0);
        return;
      }

      if (!res.ok) {
        console.error("Search error:", data.error);
        clearInterval(interval);
        setSearching(false);
        setProgress(0);
        return;
      }

      setProgress(100);
      setTimeout(() => {
        setResults(data.results ?? []);
        setSearching(false);
        setProgress(0);
      }, 500);
    } catch {
      clearInterval(interval);
      setSearching(false);
      setProgress(0);
    }
  }, []);

  if (!authChecked) return null;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto pt-8 space-y-8">
        <SearchPill onSearch={handleSearch} onToggleHistory={() => setShowHistory(true)} searching={searching} />

        {searching && (
          <div className="space-y-2">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-white/40 text-center">Usually takes 30 seconds</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-white/40">{results.length} results found</p>
            {results.map((r) => (
              <JobResultCard
                key={r.id}
                id={r.id}
                jobTitle={r.job_title}
                company={r.company}
                location={r.location}
                salary={r.estimated_salary}
                matchScore={r.match_score}
                jobUrl={r.job_url}
                fullDescription={r.full_description}
                onDelete={(id) => setResults((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}

        {!searching && results.length === 0 && (
          <div className="text-center py-20">
            <p className="text-white/40 text-sm">Search for jobs to get started</p>
          </div>
        )}
      </div>

      {showLimitModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowLimitModal(null)} />
          <div className="relative bg-[#1C1C1E] border border-white/10 rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4">
            <p className="text-white font-semibold">
              {showLimitModal === "LIMIT_001"
                ? "No searches remaining"
                : "No CV generations remaining"}
            </p>
            <p className="text-sm text-white/60">
              {showLimitModal === "LIMIT_001"
                ? "You've used all your free searches. Upgrade your plan to continue searching."
                : "You've used all your free CV generations. Upgrade your plan to generate more."}
            </p>
            <button
              onClick={() => setShowLimitModal(null)}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Upgrade Plan
            </button>
          </div>
        </div>
      )}

      <SearchHistory open={showHistory} onClose={() => setShowHistory(false)} />
    </DashboardLayout>
  );
}
