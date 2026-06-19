"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { SearchPill } from "@/components/dashboard/search-pill";
import { JobResultCard } from "@/components/dashboard/job-result-card";
import { DashboardTabs, type TabId } from "@/components/dashboard/dashboard-tabs";
import { SavedJobs } from "@/components/dashboard/saved-jobs";
import { BlockedList } from "@/components/dashboard/blocked-list";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { useActiveProfile } from "@/components/dashboard/dashboard-layout";
import { createClient } from "@/lib/supabase/client";

interface JobResult {
  id: string;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  match_summary: string;
  job_url: string;
  full_description: string;
}

interface HistoryResult {
  id: string;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  match_summary: string;
  job_url: string;
  full_spec: string;
}

function SkeletonCard() {
  return (
    <div className="liquid-glass rounded-xl p-6 animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="h-5 w-32 rounded-full bg-white/10" />
        <div className="h-4 w-4 rounded bg-white/10" />
      </div>
      <div className="h-5 w-3/4 rounded bg-white/10 mb-2" />
      <div className="h-4 w-1/2 rounded bg-white/10 mb-1" />
      <div className="h-4 w-1/3 rounded bg-white/10 mb-4" />
      <div className="flex gap-3 pt-2">
        <div className="h-10 flex-1 rounded-full bg-white/10" />
        <div className="h-10 flex-1 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { endTransition } = useTransition();
  const { activeProfileId } = useActiveProfile();
  const [activeTab, setActiveTab] = useState<TabId>("search");
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<JobResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [historyResults, setHistoryResults] = useState<HistoryResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: any } | null }) => {
      if (!data?.user) {
        router.push("/");
      }
      setAuthChecked(true);
    });
  }, [router]);

  useEffect(() => {
    if (activeTab !== "history") return;
    startTransition(() => setHistoryLoading(true));
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: { session: any } }) => {
      if (!data.session) { setHistoryLoading(false); return; }
      const session = data.session;
      supabase
        .from("job_results")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .then(({ data }: { data: any }) => {
          setHistoryResults((data ?? []) as HistoryResult[]);
          setHistoryLoading(false);
        });
    });
  }, [activeTab]);

  const handleSearch = useCallback(async (query: string) => {
    console.log("[DASHBOARD] Search clicked:", { query, activeProfileId, time: new Date().toISOString() });
    setSearching(true);
    setProgress(0);
    setHasSearched(true);
    setResultMessage("");

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
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, profile_id: activeProfileId }),
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
        clearInterval(interval);
        setSearching(false);
        setProgress(0);
        const msg = data?.message ?? "Something went wrong. Please try again.";
        setResultMessage(msg);
        return;
      }

      setProgress(100);
      setTimeout(() => {
        setResults(data.results ?? []);
        setSearching(false);
        setProgress(0);
        if ((data.results?.length ?? 0) === 0 && data.message) {
          setResultMessage(data.message);
        }
      }, 500);
    } catch {
      clearInterval(interval);
      setSearching(false);
      setProgress(0);
      setResultMessage("Something went wrong. Please try again.");
    }
  }, [activeProfileId]);

  const handleDelete = useCallback((id: string) => {
    setResults((prev) => prev.filter((x) => x.id !== id));
  }, []);

  if (!authChecked) return null;

  return (
    <DashboardLayout>
      <PageTransitionWrapper>
      <div className="max-w-4xl mx-auto pt-8 space-y-6">
        <DashboardTabs active={activeTab} onChange={setActiveTab} />

        {activeTab === "search" && (
          <>
            <SearchPill onSearch={handleSearch} searching={searching} activeProfileId={activeProfileId} />

            {searching && (
              <div className="space-y-2">
                <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] text-center">Usually takes 30 seconds</p>
              </div>
            )}

            {searching && (
              <div className="space-y-4">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}

            {!searching && results.length > 0 && (
              <div className="space-y-4">
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
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            {!searching && hasSearched && results.length === 0 && (
              <div className="text-center py-20">
                <p className="text-[var(--color-text-secondary)] text-sm">{resultMessage || "No matching jobs found. Try updating your profile or search again."}</p>
              </div>
            )}

            {!searching && !hasSearched && results.length === 0 && (
              <div className="text-center py-20">
                <p className="text-[var(--color-text-secondary)] text-sm">Search for jobs to get started</p>
              </div>
            )}
          </>
        )}

        {activeTab === "history" && (
          historyLoading ? (
            <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">Loading...</p>
          ) : historyResults.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[var(--color-text-secondary)] text-sm">No search history yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {historyResults.map((r) => (
                <JobResultCard
                  key={r.id}
                  id={r.id}
                  jobTitle={r.job_title}
                  company={r.company}
                  location={r.location}
                  salary={r.estimated_salary}
                  matchScore={r.match_score}
                  jobUrl={r.job_url}
                  fullDescription={r.full_spec}
                  onDelete={(id) => setHistoryResults((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          )
        )}

        {activeTab === "blocked" && <BlockedList />}

        {activeTab === "saved" && <SavedJobs />}
      </div>

      {showLimitModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowLimitModal(null)} />
          <div className="relative liquid-glass border rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4">
            <p className="text-[var(--color-text-primary)] font-semibold">
              {showLimitModal === "LIMIT_001"
                ? "No searches remaining"
                : "No CV generations remaining"}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {showLimitModal === "LIMIT_001"
                ? "You've used all your free searches. Upgrade your plan to continue searching."
                : "You've used all your free CV generations. Upgrade your plan to generate more."}
            </p>
            <button
              onClick={() => { setShowLimitModal(null); router.push("/upgrade"); }}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Upgrade Plan
            </button>
          </div>
        </div>
      )}
      </PageTransitionWrapper>
    </DashboardLayout>
  );
}
