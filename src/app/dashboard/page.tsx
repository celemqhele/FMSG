"use client";

import { useState, useEffect, useCallback, useMemo, startTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { SearchPill } from "@/components/dashboard/search-pill";
import { JobResultCard } from "@/components/dashboard/job-result-card";
import { PFPurchaseModal } from "@/components/dashboard/pf-purchase-modal";
import { DashboardTabs, type TabId } from "@/components/dashboard/dashboard-tabs";
import { FilterSortBar, type FilterState, type SortMode } from "@/components/dashboard/filter-sort-bar";
import { SavedJobs } from "@/components/dashboard/saved-jobs";
import { BlockedList } from "@/components/dashboard/blocked-list";
import { RejectedJobs } from "@/components/dashboard/rejected-jobs";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
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
  domain_verified?: boolean;
  domain_unverified_reason?: string;
  created_at?: string;
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
  domain_verified?: boolean;
  domain_unverified_reason?: string;
}

function SkeletonCard({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="liquid-glass rounded-xl p-6 animate-pulse opacity-0" style={style}>
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
  const { endTransition, setVideoFast } = useTransition();
  const [activeTab, setActiveTab] = useState<TabId>("search");
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<JobResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [historyResults, setHistoryResults] = useState<HistoryResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState<string | null>(null);
  const [limitModalMounted, setLimitModalMounted] = useState(false);
  const [pfModalOpen, setPfModalOpen] = useState(false);
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

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "LIMIT_002") setShowLimitModal("LIMIT_002");
    };
    window.addEventListener("show-limit-modal", handler);
    return () => window.removeEventListener("show-limit-modal", handler);
  }, [router]);

  useEffect(() => {
    if (showLimitModal) {
      requestAnimationFrame(() => setLimitModalMounted(true));
    } else {
      setLimitModalMounted(false);
    }
  }, [showLimitModal]);

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

  const [pfActive, setPfActive] = useState(false);

  // Filter + sort state
  const [filterState, setFilterState] = useState<FilterState>({
    trusted: true, untrusted: true, scoreHigh: true, scoreMid: true, scoreLow: true,
  });
  const [sortMode, setSortMode] = useState<SortMode>("score");

  const filteredResults = useMemo(() => {
    let filtered = results.filter((r) => {
      if (!filterState.trusted && r.domain_verified) return false;
      if (!filterState.untrusted && !r.domain_verified) return false;
      const s = r.match_score;
      if (!filterState.scoreHigh && s >= 80) return false;
      if (!filterState.scoreMid && s >= 40 && s < 80) return false;
      if (!filterState.scoreLow && s < 40) return false;
      return true;
    });

    filtered.sort((a, b) => {
      switch (sortMode) {
        case "date_newest":
          return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
        case "date_oldest":
          return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
        case "score":
        default:
          return (b.match_score ?? 0) - (a.match_score ?? 0);
      }
    });

    return filtered;
  }, [results, filterState, sortMode]);

  const handleSearch = useCallback(async (query: string, profileId?: string | null, pfMode?: boolean) => {
    console.log("[DASHBOARD] Search clicked:", { query, profileId, pfMode, time: new Date().toISOString() });
    setSearching(true);
    setProgress(0);
    setHasSearched(true);
    setResultMessage("");
    setVideoFast(true);
    setPfActive(!!pfMode);

    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, pfMode ? 90 : 85));
    }, 1000);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      clearInterval(interval);
      setSearching(false);
      setVideoFast(false);
      return;
    }

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, profile_id: profileId, pf_mode: pfMode }),
      });

      const data = await res.json();

      if (res.status === 403 && data.code === "LIMIT_001") {
        setShowLimitModal("LIMIT_001");
        clearInterval(interval);
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        setPfActive(false);
        return;
      }

      if (res.status === 403 && data.code === "LIMIT_003") {
        setShowLimitModal("LIMIT_003");
        clearInterval(interval);
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        setPfActive(false);
        return;
      }

      if (!res.ok) {
        clearInterval(interval);
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        const msg = data?.message ?? "Something went wrong. Please try again.";
        setResultMessage(msg);
        return;
      }

      setProgress(100);
      setTimeout(() => {
        setResults(data.results ?? []);
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        setPfActive(false);
        if ((data.results?.length ?? 0) === 0 && data.message) {
          setResultMessage(data.message);
        } else if (data.pf_mode && data.pf_rounds) {
          setResultMessage(`Persistent Finder completed — ${data.results?.length ?? 0} results across ${data.pf_rounds} rounds`);
        }
      }, 500);
    } catch {
      clearInterval(interval);
      setSearching(false);
      setProgress(0);
      setVideoFast(false);
      setResultMessage("Something went wrong. Please try again.");
    }
  }, [setVideoFast]); // profileId passed from SearchPill is always the active profile

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
            <SearchPill onSearch={handleSearch} searching={searching} />

            {hasSearched && (
              <div className="flex items-center justify-center">
                <FilterSortBar
                  filter={filterState}
                  sort={sortMode}
                  onFilterChange={setFilterState}
                  onSortChange={setSortMode}
                />
              </div>
            )}

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
              <div className="space-y-4 [&>*]:animate-[enter_0.35s_ease-out_forwards]">
                <SkeletonCard />
                <SkeletonCard style={{ animationDelay: "0.1s" }} />
                <SkeletonCard style={{ animationDelay: "0.2s" }} />
              </div>
            )}

            {!searching && results.length > 0 && (
              <div className="space-y-4">
                {filteredResults.map((r) => (
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
                      domainVerified={r.domain_verified ?? true}
                      domainUnverifiedReason={r.domain_unverified_reason ?? ""}
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
                  domainVerified={r.domain_verified ?? true}
                  domainUnverifiedReason={r.domain_unverified_reason ?? ""}
                  onDelete={(id) => setHistoryResults((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          )
        )}

        {activeTab === "blocked" && <BlockedList />}

        {activeTab === "saved" && <SavedJobs />}

        {activeTab === "rejected" && <RejectedJobs />}
      </div>

      {showLimitModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-300" style={{ opacity: limitModalMounted ? 1 : 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowLimitModal(null)} />
          <div
            className="relative liquid-glass border rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4 transition-all duration-300 ease-out"
            style={{ opacity: limitModalMounted ? 1 : 0, transform: limitModalMounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}
          >
            <button
              onClick={() => setShowLimitModal(null)}
              className="absolute top-3 right-3 p-1 text-white/40 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
            <p className="text-[var(--color-error)] font-semibold">
              {showLimitModal === "LIMIT_001"
                ? "No searches remaining"
                : showLimitModal === "LIMIT_002"
                ? "No CV generations remaining"
                : showLimitModal === "LIMIT_003"
                ? "No Persistent Finder rounds remaining"
                : "No remaining credits"}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {showLimitModal === "LIMIT_001"
                ? "You've used all your free searches. Upgrade your plan to continue searching."
                : showLimitModal === "LIMIT_002"
                ? "You've used all your CV generations. Upgrade your plan to generate more."
                : showLimitModal === "LIMIT_003"
                ? "You've used all your Persistent Finder rounds. Upgrade your plan or buy more PF credits."
                : "You've run out of credits. Upgrade your plan."}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => { setShowLimitModal(null); router.push("/upgrade"); }}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Upgrade Plan
              </button>
              {showLimitModal === "LIMIT_003" && (
                <button
                  onClick={() => { setShowLimitModal(null); setPfModalOpen(true); }}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-white/10 border border-white/20 rounded-full hover:bg-white/20 transition-colors"
                >
                  Buy PF Credits
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <PFPurchaseModal isOpen={pfModalOpen} onClose={() => setPfModalOpen(false)} />
      </PageTransitionWrapper>
    </DashboardLayout>
  );
}
