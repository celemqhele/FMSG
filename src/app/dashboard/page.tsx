"use client";

import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowRight } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { SearchPill } from "@/components/dashboard/search-pill";
import { JobResultCard } from "@/components/dashboard/job-result-card";
import dynamic from "next/dynamic";
const PFPurchaseModal = dynamic(() => import("@/components/dashboard/pf-purchase-modal").then((mod) => mod.PFPurchaseModal), { ssr: false });
import { DashboardTabs, type TabId } from "@/components/dashboard/dashboard-tabs";
import { BalanceChips } from "@/components/dashboard/balance-chips";
import { FilterSortBar, type FilterState, type SortMode } from "@/components/dashboard/filter-sort-bar";
import { SearchProgress } from "@/components/dashboard/search-progress";
import type { FilteredSummary } from "@/lib/search-stream";
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
  verdict_bullets?: { industry: string; function: string; competition: string } | null;
  job_url: string;
  full_description: string;
  domain_verified?: boolean;
  domain_unverified_reason?: string;
  suggested_cv?: string;
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
  verdict_bullets?: { industry: string; function: string; competition: string } | null;
  job_url: string;
  full_spec: string;
  domain_verified?: boolean;
  domain_unverified_reason?: string;
  suggested_cv?: string;
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
  const [statusCompleted, setStatusCompleted] = useState<string[]>([]);
  const [statusActive, setStatusActive] = useState("");
  const [filteredSummary, setFilteredSummary] = useState<FilteredSummary | null>(null);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);

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
    setStatusCompleted([]);
    setStatusActive("Searching live job listings");
    setFilteredSummary(null);
    setVideoFast(true);
    setPfActive(!!pfMode);
    setContinuationToken(null);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSearching(false);
      setVideoFast(false);
      return;
    }

    const res = await fetch("/api/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, profile_id: profileId, pf_mode: pfMode }),
    });

    await handleStreamResponse(res);
  }, [setVideoFast]);

  const handleContinue = useCallback(async () => {
    if (!continuationToken) return;

    setSearching(true);
    setVideoFast(true);
    setResultMessage("");

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ continuation: continuationToken }),
    });

    setContinuationToken(null);
    await handleStreamResponse(res);
  }, [continuationToken, setVideoFast]);

  const handleStreamResponse = async (res: Response) => {
    const contentType = res.headers.get("Content-Type") || "";
    if (!contentType.includes("text/plain")) {
      let data: any = {};
      try { data = await res.json(); } catch {}

      if (res.status === 403 && data.code === "LIMIT_001") {
        setShowLimitModal("LIMIT_001");
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        setPfActive(false);
        return;
      }

      if (res.status === 403 && data.code === "LIMIT_003") {
        setShowLimitModal("LIMIT_003");
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        setPfActive(false);
        return;
      }

      if (!res.ok) {
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        setResultMessage(data?.message ?? "Something went wrong. Please try again.");
        return;
      }

      setResults(data.results ?? []);
      setSearching(false);
      setProgress(0);
      setVideoFast(false);
      setPfActive(false);
      if ((data.results?.length ?? 0) === 0 && data.message) {
        setResultMessage(data.message);
      }
      return;
    }

    // Handle streaming response
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamComplete = false;
    let currentStatusActive = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: any;
          try { event = JSON.parse(line); } catch { continue; }

          switch (event.type) {
            case "found_results":
              setStatusCompleted((prev) => [...prev, "Searching live job listings"]);
              currentStatusActive = `Found ${event.count} matching results`;
              setStatusActive(currentStatusActive);
              setProgress(event.progress ?? 20);
              break;

            case "filtered_summary":
              setFilteredSummary({ history: event.history, saved: event.saved, rejected: event.rejected, blocked: event.blocked });
              break;

            case "screening_job":
              setStatusCompleted((prev) => {
                if (prev[prev.length - 1]?.startsWith("Found")) {
                  return [...prev];
                }
                const filtered = prev.filter((s) => !s.startsWith("Screening job"));
                return [...filtered, `Found ${event.total} matching results`];
              });
              currentStatusActive = `Screening job ${event.current} of ${event.total}`;
              setStatusActive(currentStatusActive);
              setProgress(event.progress ?? 40);
              break;

            case "analyzing_job":
              setStatusCompleted((prev) => {
                const filtered = prev.filter((s) => !s.startsWith("Screening job"));
                return [...filtered, `Screening ${event.total} of ${event.total} complete`];
              });
              currentStatusActive = `Analysing fit for: ${event.title} at ${event.company}`;
              setStatusActive(currentStatusActive);
              setProgress(event.progress ?? 70);
              break;

            case "almost_done":
              setStatusCompleted((prev) => {
                const filtered = prev.filter((s) => !s.startsWith("Analysing fit"));
                return [...filtered, currentStatusActive].filter(Boolean);
              });
              currentStatusActive = "Almost done";
              setStatusActive(currentStatusActive);
              setProgress(event.progress ?? 90);
              break;

            case "pf_round":
              setStatusCompleted((prev) => {
                const filtered = prev.filter((s) => !s.startsWith("Persistent Finder round"));
                return [...filtered, `Persistent Finder round ${event.round} of ${event.max}`];
              });
              currentStatusActive = event.query;
              setStatusActive(currentStatusActive);
              setProgress(event.progress ?? 50);
              break;

            case "pause":
              streamComplete = true;
              setStatusCompleted((prev) => {
                const filtered = prev.filter((s) =>
                  !s.startsWith("Analysing fit") &&
                  !s.startsWith("Almost done") &&
                  !s.startsWith("Screening job")
                );
                const lines = [...filtered];
                if (currentStatusActive && !currentStatusActive.startsWith("Almost done")) {
                  lines.push(currentStatusActive);
                }
                return lines;
              });
              setStatusActive("");
              setProgress(event.progress ?? 50);
              setContinuationToken(event.continuation);
              setSearching(false);
              setVideoFast(false);
              break;

            case "partial_complete":
              streamComplete = true;
              setStatusCompleted((prev) => {
                const filtered = prev.filter((s) =>
                  !s.startsWith("Analysing fit") &&
                  !s.startsWith("Almost done") &&
                  !s.startsWith("Screening job")
                );
                const lines = [...filtered];
                if (currentStatusActive && !currentStatusActive.startsWith("Almost done")) {
                  lines.push(currentStatusActive);
                }
                return lines;
              });
              setStatusActive("");
              setProgress(event.progress ?? 55);
              setResults(event.results ?? []);
              setContinuationToken(event.continuation);
              setSearching(false);
              setVideoFast(false);
              setResultMessage(event.message ?? "");
              break;

            case "complete":
              streamComplete = true;
              setProgress(100);
              setStatusCompleted((prev) => {
                const filtered = prev.filter((s) =>
                  !s.startsWith("Analysing fit") &&
                  !s.startsWith("Almost done") &&
                  !s.startsWith("Screening job")
                );
                const lines = [...filtered];
                if (currentStatusActive && !currentStatusActive.startsWith("Almost done")) {
                  lines.push(currentStatusActive);
                }
                return lines;
              });
              setStatusActive("");
              if (event.filtered_summary) {
                setFilteredSummary(event.filtered_summary);
              }
              setTimeout(() => {
                setResults(event.results ?? []);
                setSearching(false);
                setProgress(0);
                setVideoFast(false);
                setPfActive(false);
                setContinuationToken(null);
                if (event.results?.length === 0 && event.message) {
                  setResultMessage(event.message);
                } else if (event.pf_mode && event.pf_rounds) {
                  setResultMessage(`Persistent Finder completed (${event.results?.length ?? 0} results across ${event.pf_rounds} rounds)`);
                }
              }, 500);
              break;

            case "error":
              streamComplete = true;
              setSearching(false);
              setProgress(0);
              setVideoFast(false);
              setPfActive(false);
              setContinuationToken(null);
              setStatusCompleted([]);
              setStatusActive("");
              setResultMessage(event.message ?? "Something went wrong. Please try again.");
              break;
          }
        }
      }

      // Stream ended without complete/error/pause event
      if (!streamComplete) {
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        setPfActive(false);
        setContinuationToken(null);
        setStatusCompleted([]);
        setStatusActive("");
        setResultMessage("Connection lost. Please try again.");
      }
    } catch {
      if (!streamComplete) {
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        setPfActive(false);
        setContinuationToken(null);
        setStatusCompleted([]);
        setStatusActive("");
        setResultMessage("Something went wrong. Please try again.");
      }
    }
  };

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
            <div className="flex flex-wrap justify-center gap-1.5">
              <BalanceChips />
            </div>

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

            {filteredSummary && (
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs">
                <span>⚠</span>
                {filteredSummary.history > 0 && <span>{filteredSummary.history} filtered: already in history</span>}
                {filteredSummary.saved > 0 && <span>{filteredSummary.saved} filtered: already saved</span>}
                {filteredSummary.rejected > 0 && <span>{filteredSummary.rejected} filtered: previously rejected</span>}
                {filteredSummary.blocked > 0 && <span>{filteredSummary.blocked} filtered: blocked</span>}
              </div>
            )}

            {searching && (
              <SearchProgress
                completedLines={statusCompleted}
                activeLine={statusActive}
                progress={progress}
              />
            )}

            {continuationToken && !searching && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="text-xs text-[var(--color-text-secondary)]/70 text-center max-w-md">
                  {results.length > 0
                    ? `${results.length} results found so far. Click to continue AI screening for remaining jobs.`
                    : "Ready to screen jobs with AI analysis? This may take a minute."}
                </p>
                <button
                  onClick={handleContinue}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/25 transition-all text-sm text-white/80"
                  title="Continue search"
                >
                  Continue
                  <ArrowRight size={14} />
                </button>
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
                      matchSummary={r.match_summary}
                      verdictBullets={r.verdict_bullets}
                      jobUrl={r.job_url}
                      fullDescription={r.full_description}
                      domainVerified={r.domain_verified ?? true}
                      domainUnverifiedReason={r.domain_unverified_reason ?? ""}
                      suggestedCvName={r.suggested_cv ?? ""}
                      onDelete={handleDelete}
                    />
                ))}
              </div>
            )}

            {!searching && hasSearched && results.length === 0 && !continuationToken && (
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
                  matchSummary={r.match_summary}
                  verdictBullets={r.verdict_bullets}
                  jobUrl={r.job_url}
                  fullDescription={r.full_spec}
                  domainVerified={r.domain_verified ?? true}
                  domainUnverifiedReason={r.domain_unverified_reason ?? ""}
                  suggestedCvName={r.suggested_cv ?? ""}
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
                ? "You've used all your free searches. Paid users receive priority AI processing. Upgrade your plan to continue searching."
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
