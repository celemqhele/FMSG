"use client";

import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowRight, Mail, Upload } from "lucide-react";
import { DashboardLayout, useActiveProfile } from "@/components/dashboard/dashboard-layout";
import { SearchPill } from "@/components/dashboard/search-pill";
import { JobResultCard } from "@/components/dashboard/job-result-card";
import { SearchGuidancePopup } from "@/components/dashboard/search-guidance-popup";
import { PFPromoPopup } from "@/components/dashboard/pf-promo-popup";
import dynamic from "next/dynamic";
const PFPurchaseModal = dynamic(() => import("@/components/dashboard/pf-purchase-modal").then((mod) => mod.PFPurchaseModal), { ssr: false });
const OnboardingForm = dynamic(() => import("@/components/onboarding/onboarding-form").then((mod) => mod.OnboardingForm), { ssr: false });
import { DashboardTabs, type TabId } from "@/components/dashboard/dashboard-tabs";
import { BalanceChips } from "@/components/dashboard/balance-chips";
import { FilterSortBar, type SortMode } from "@/components/dashboard/filter-sort-bar";
import { PlatformFilter, type PlatformId } from "@/components/dashboard/platform-filter";
import { SearchProgress } from "@/components/dashboard/search-progress";
import type { FilteredSummary } from "@/lib/search-stream";
import { SavedJobs } from "@/components/dashboard/saved-jobs";
import { BlockedList } from "@/components/dashboard/blocked-list";
import { RejectedJobs } from "@/components/dashboard/rejected-jobs";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { BlockedAccountPage } from "@/components/dashboard/blocked-account";
import { VerifyEmailBanner } from "@/components/dashboard/verify-email-banner";
import { VerifyCodeModal } from "@/components/dashboard/verify-code-modal";
import { ContinuePopup } from "@/components/dashboard/continue-popup";

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
  suggested_cv?: string;
  created_at?: string;
  knockout_fail?: boolean | null;
  pillar_scores?: { industry: number; function: number; scale: number; tools: number; location: number } | null;
  taxes_applied?: string[] | null;
  total_questions_asked?: number | null;
  yes_answers?: number | null;
  recruiter_verdict?: string | null;
  dynamic_requirements?: { requirement: string; mandatory: boolean; pillar: string; met: boolean; evidence: string }[] | null;
  spec_source?: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "google_search" | null;
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
  suggested_cv?: string;
  knockout_fail?: boolean | null;
  pillar_scores?: { industry: number; function: number; scale: number; tools: number; location: number } | null;
  taxes_applied?: string[] | null;
  total_questions_asked?: number | null;
  yes_answers?: number | null;
  recruiter_verdict?: string | null;
  dynamic_requirements?: { requirement: string; mandatory: boolean; pillar: string; met: boolean; evidence: string }[] | null;
  spec_source?: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "google_search" | null;
}

interface Balances {
  search: number;
  cv: number;
  pf: number;
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
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<"prompt" | "form" | "done">("prompt");
  const [onboardingMounted, setOnboardingMounted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [accountStatus, setAccountStatus] = useState<string>("active");
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [balances, setBalances] = useState<Balances>({ search: 0, cv: 0, pf: 0 });
  const [plan, setPlan] = useState("free");
  const [pauseMessage, setPauseMessage] = useState("");
  const { activeProfileId } = useActiveProfile();
  const [showGuidance, setShowGuidance] = useState(false);
  const [showPfPromo, setShowPfPromo] = useState(false);
  const [pfPromoChecked, setPfPromoChecked] = useState(false);
  const [referralJob, setReferralJob] = useState<{ slug: string; company: string; job_title: string; apply_url: string } | null>(null);
  const [pfMode, setPfMode] = useState(false);
  const referralAutoSearchDone = useRef(false);

  useEffect(() => { endTransition(); }, [endTransition]);

  // Refresh balances from profile when triggered by search completion or CV/PF operations
  const refreshBalances = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("search_balance, cv_generation_balance, persistent_finder_balance, plan")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      setBalances({
        search: data.search_balance ?? 0,
        cv: data.cv_generation_balance ?? 0,
        pf: data.persistent_finder_balance ?? 0,
      });
      setPlan(data.plan ?? "free");
    }
  }, []);

  useEffect(() => {
    if (!searching && hasSearched) {
      refreshBalances();
    }
  }, [searching, hasSearched, refreshBalances]);

  useEffect(() => {
    const handler = () => refreshBalances();
    window.addEventListener("refresh-balances", handler);
    return () => window.removeEventListener("refresh-balances", handler);
  }, [refreshBalances]);

  // Load balances on mount so chips are visible before first search
  useEffect(() => {
    if (authChecked) refreshBalances();
  }, [authChecked, refreshBalances]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: { session: any } | null }) => {
      if (!data?.session) {
        router.push("/");
        return;
      }
      setAuthChecked(true);
      setUserEmail(data.session.user?.email ?? "");
      supabase
        .from("profiles")
        .select("onboarding_completed, account_status, email_verified")
        .maybeSingle()
        .then(({ data: profile }: { data: any }) => {
          if (!profile) {
            setNeedsOnboarding(true);
            requestAnimationFrame(() => setOnboardingMounted(true));
          } else {
            if (profile.account_status) setAccountStatus(profile.account_status);
            setEmailVerified(profile.email_verified ?? false);
          }
          setProfileChecked(true);
        });
    });

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "LIMIT_002") setShowLimitModal("LIMIT_002");
    };
    window.addEventListener("show-limit-modal", handler);
    return () => window.removeEventListener("show-limit-modal", handler);
  }, [router]);

  // Check for referral job from localStorage (set by /jobs/[slug] page)
  useEffect(() => {
    const stored = localStorage.getItem("fmsg_referral");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setReferralJob(parsed);
        localStorage.removeItem("fmsg_referral");
      } catch {}
    }
  }, []);

  // Auto-trigger referral search after profile is loaded and user is onboarded
  useEffect(() => {
    if (!profileChecked || needsOnboarding || referralAutoSearchDone.current || searching) return;
    const stored = localStorage.getItem("fmsg_referral");
    if (!stored) return;
    let parsed: { slug?: string; company?: string; job_title?: string; apply_url?: string } | null = null;
    try { parsed = JSON.parse(stored); } catch {}
    if (parsed?.job_title) {
      referralAutoSearchDone.current = true;
      localStorage.removeItem("fmsg_referral");
      setReferralJob(parsed as any);
      handleSearch(parsed.job_title, activeProfileId, undefined, undefined, parsed.apply_url);
    }
  }, [profileChecked, needsOnboarding, searching, activeProfileId]);

  // Show search guidance popup for first-time users after onboarding
  useEffect(() => {
    if (!profileChecked) return;
    const guided = localStorage.getItem("fmsg_guided_search_shown");
    if (!guided && !needsOnboarding) {
      const timer = setTimeout(() => setShowGuidance(true), 500);
      return () => clearTimeout(timer);
    }
  }, [profileChecked, needsOnboarding]);

  // Check if PF promo should be shown (session-based, after first search completes)
  useEffect(() => {
    if (pfPromoChecked) return;
    if (!searching && hasSearched && results.length > 0) {
      const pfShown = sessionStorage.getItem("fmsg_pf_promo_shown");
      if (pfShown) {
        setShowPfPromo(true);
      }
      setPfPromoChecked(true);
    }
  }, [searching, hasSearched, results.length, pfPromoChecked]);

  useEffect(() => {
    if (showLimitModal) {
      requestAnimationFrame(() => setLimitModalMounted(true));
    } else {
      setLimitModalMounted(false);
    }
  }, [showLimitModal]);

  useEffect(() => {
    if (activeTab !== "history") return;
    if (!activeProfileId) { setHistoryResults([]); setHistoryLoading(false); return; }
    startTransition(() => setHistoryLoading(true));
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: { session: any } }) => {
      if (!data.session) { setHistoryLoading(false); return; }
      const session = data.session;
      supabase
        .from("job_results")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("profile_id", activeProfileId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .then(({ data }: { data: any }) => {
          setHistoryResults((data ?? []) as HistoryResult[]);
          setHistoryLoading(false);
        });
    });
  }, [activeTab, activeProfileId]);

  const [pfActive, setPfActive] = useState(false);

  // Sort state
  const [sortMode, setSortMode] = useState<SortMode>("date_newest");

  // Platform filter state
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(["all"]);

  const sortedResults = useMemo(() => {
    const sorted = [...results].sort((a, b) => {
      switch (sortMode) {
        case "date_oldest":
          return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
        case "score_highest":
          return b.match_score - a.match_score;
        case "score_lowest":
          return a.match_score - b.match_score;
        case "date_newest":
        default:
          return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      }
    });
    return sorted;
  }, [results, sortMode]);

  const handleSearch = useCallback(async (query: string, profileId?: string | null, pfMode?: boolean, dateFilterDays?: number | null, referralUrl?: string) => {
    console.log("[DASHBOARD] Search clicked:", { query, profileId, pfMode, dateFilterDays, referralUrl, time: new Date().toISOString() });
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

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, profile_id: profileId, pf_mode: pfMode, date_filter_days: dateFilterDays ?? null, platforms: selectedPlatforms.includes("all") ? null : selectedPlatforms, referral_url: referralUrl ?? null }),
        signal: abortRef.current.signal,
      });

      await handleStreamResponse(res);
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") throw err;
    }
  }, [setVideoFast]);

  const handleContinue = useCallback(async () => {
    if (!continuationToken) return;

    setSearching(true);
    setVideoFast(true);
    setResultMessage("");

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ continuation: continuationToken }),
        signal: abortRef.current.signal,
      });

      setContinuationToken(null);
      await handleStreamResponse(res);
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") throw err;
    }
  }, [continuationToken, setVideoFast]);

  const handleAbort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setSearching(false);
    setProgress(0);
    setVideoFast(false);
    setPfActive(false);
    setContinuationToken(null);
    setStatusCompleted([]);
    setStatusActive("");
    setResultMessage("");
  }, []);

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

      if (res.status === 403 && data.code === "ACCOUNT_BLOCKED") {
        setAccountStatus("blocked");
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        setPfActive(false);
        return;
      }

      if (res.status === 403 && data.code === "EMAIL_NOT_VERIFIED") {
        setSearching(false);
        setProgress(0);
        setVideoFast(false);
        setPfActive(false);
        setResultMessage("Please verify your email before searching.");
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
              if (event.balances) {
                setBalances(event.balances);
                setPlan(event.plan ?? "free");
              }
              setPauseMessage(event.message ?? "");
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
              if (event.balances) {
                setBalances(event.balances);
                setPlan(event.plan ?? "free");
              }
              setPauseMessage(event.message ?? "");
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
              if (event.balances) {
                setBalances(event.balances);
                setPlan(event.plan ?? "free");
              }
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
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
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

  if (!authChecked) {
    return (
      <div className="max-w-4xl mx-auto pt-8 space-y-6 px-6">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="h-8 w-20 rounded-lg bg-white/10 animate-pulse" />
          <div className="h-8 w-20 rounded-lg bg-white/10 animate-pulse" />
          <div className="h-8 w-20 rounded-lg bg-white/10 animate-pulse" />
          <div className="h-8 w-20 rounded-lg bg-white/10 animate-pulse" />
          <div className="h-8 w-20 rounded-lg bg-white/10 animate-pulse" />
        </div>
        <div className="w-full max-w-2xl mx-auto">
          <div className="h-14 rounded-full bg-white/10 animate-pulse" />
        </div>
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <PageTransitionWrapper>
      <div className="max-w-4xl mx-auto pt-8 space-y-6">
        {accountStatus === "blocked" ? (
          <BlockedAccountPage />
        ) : (
          <>
            {emailVerified === false && authChecked && (
              <VerifyEmailBanner onOpenModal={() => setShowVerifyModal(true)} />
            )}
            <DashboardTabs active={activeTab} onChange={setActiveTab} />

        {activeTab === "search" && (
          <>
            <SearchPill onSearch={handleSearch} onAbort={handleAbort} searching={searching} pfMode={pfMode} onPfModeChange={setPfMode} referralQuery={referralJob?.job_title} />
            <div className="flex flex-wrap justify-center gap-1.5">
              <BalanceChips balances={balances} plan={plan} />
            </div>

            <div className="sticky top-0 z-10 -mt-4 backdrop-blur-xl py-2 space-y-2">
              <div className="flex items-center justify-center">
                <FilterSortBar
                  sort={sortMode}
                  onSortChange={setSortMode}
                />
              </div>
              <PlatformFilter
                selected={selectedPlatforms}
                onChange={setSelectedPlatforms}
              />
            </div>

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

            <ContinuePopup
              isOpen={!!continuationToken && !searching}
              message={pauseMessage || (results.length > 0
                ? `${results.length} results found so far. Continue AI screening for remaining jobs?`
                : "Ready to screen jobs with AI analysis? This may take a minute.")}
              onContinue={handleContinue}
              onCancel={() => setContinuationToken(null)}
            />

            {!searching && results.length > 0 && (
              <div className="space-y-4">
                {sortedResults.map((r) => (
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
                      suggestedCvName={r.suggested_cv ?? ""}
                      knockoutFail={r.knockout_fail}
                      pillarScores={r.pillar_scores}
                      taxesApplied={r.taxes_applied}
                      totalQuestionsAsked={r.total_questions_asked}
                      yesAnswers={r.yes_answers}
                      recruiterVerdict={r.recruiter_verdict}
                      dynamicRequirements={r.dynamic_requirements}
                      specSource={r.spec_source}
                      onDelete={handleDelete}
                    />
                ))}
              </div>
            )}

            {!searching && hasSearched && results.length > 0 && !showPfPromo && !pfActive && balances.pf === 0 && plan === "free" && (
              <PFPromoPopup
                isOpen={true}
                onEnable={() => {
                  sessionStorage.setItem("fmsg_pf_promo_shown", "true");
                  setShowPfPromo(true);
                  setPfMode(true);
                }}
                onDismiss={() => {
                  sessionStorage.setItem("fmsg_pf_promo_shown", "true");
                  setShowPfPromo(true);
                }}
              />
            )}

            {!searching && hasSearched && results.length === 0 && !continuationToken && (
              <div className="text-center py-20">
                <p className="text-[var(--color-text-secondary)] text-sm">{resultMessage || "No matching jobs found. Try updating your profile or search again."}</p>
              </div>
            )}

            {!searching && hasSearched && results.length > 0 && plan === "free" && balances.search === 0 && (
              <div className="liquid-glass rounded-xl p-5 text-center space-y-3">
                <p className="text-sm text-white/90 font-medium">
                  First purchase? Get <span className="text-[var(--color-accent)] font-bold">85% off Seeker</span> / <span className="text-[var(--color-accent)] font-bold">60% off Hunter & Pro</span>
                </p>
                <p className="text-xs text-white/60">One-time discount, never repeated</p>
                <button
                  onClick={() => router.push("/upgrade?discount=first_order_85")}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
                >
                  Claim Discount
                </button>
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
                  suggestedCvName={r.suggested_cv ?? ""}
                  knockoutFail={r.knockout_fail}
                  pillarScores={r.pillar_scores}
                  taxesApplied={r.taxes_applied}
                  totalQuestionsAsked={r.total_questions_asked}
                  yesAnswers={r.yes_answers}
                  recruiterVerdict={r.recruiter_verdict}
                  dynamicRequirements={r.dynamic_requirements}
                  specSource={r.spec_source}
                  onDelete={(id) => setHistoryResults((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          )
        )}

        {activeTab === "blocked" && <BlockedList />}

        {activeTab === "saved" && <SavedJobs />}

        {activeTab === "rejected" && <RejectedJobs />}
              </>
            )}
      </div>

      {showLimitModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-300" style={{ opacity: limitModalMounted ? 1 : 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowLimitModal(null)} />
          <div className="relative">
            <button
              onClick={() => setShowLimitModal(null)}
              className="absolute -top-4 -right-4 z-10 p-1.5 bg-red-800 rounded-full text-white/80 hover:text-white hover:bg-red-900 transition-colors shadow-lg"
            >
              <X size={20} />
            </button>
            <div
              className="bg-[var(--color-error)] rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4 transition-all duration-300 ease-out shadow-2xl"
              style={{ opacity: limitModalMounted ? 1 : 0, transform: limitModalMounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}
            >
              <p className="text-white font-semibold">
                {showLimitModal === "LIMIT_001"
                  ? "No searches remaining"
                  : showLimitModal === "LIMIT_002"
                  ? "No CV generations remaining"
                  : showLimitModal === "LIMIT_003"
                  ? "No Persistent Finder rounds remaining"
                  : "No remaining credits"}
              </p>
              <p className="text-sm text-white/90">
                {showLimitModal === "LIMIT_001"
                  ? "You've used all your searches. Top up to continue searching."
                  : showLimitModal === "LIMIT_002"
                  ? "You've used all your CV generations. Top up to generate more."
                  : showLimitModal === "LIMIT_003"
                  ? "You've seen what FMSG can do, now unlock the full experience with Persistent Finder."
                  : "You've run out of credits. Top up to continue."}
              </p>
              {showLimitModal === "LIMIT_003" && (
                <p className="text-xs text-white/70 font-medium">
                  85% off Seeker / 60% off Hunter & Pro, first purchase only
                </p>
              )}
              {showLimitModal === "LIMIT_001" && plan === "free" && (
                <p className="text-xs text-white/70 font-medium">
                  First purchase? Get 85% off Seeker / 60% off Hunter & Pro
                </p>
              )}
              {showLimitModal === "LIMIT_002" && plan === "free" && (
                <p className="text-xs text-white/70 font-medium">
                  First purchase? Get 85% off Seeker / 60% off Hunter & Pro
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => {
                    setShowLimitModal(null);
                    if (showLimitModal === "LIMIT_003" || (showLimitModal === "LIMIT_001" && plan === "free") || (showLimitModal === "LIMIT_002" && plan === "free")) {
                      router.push("/upgrade?discount=first_order_85");
                    } else {
                      router.push("/upgrade");
                    }
                  }}
                  className="px-5 py-2.5 text-sm font-semibold text-[var(--color-error)] bg-white rounded-full hover:bg-white/90 transition-colors"
                >
                  Top Up
                </button>
                {showLimitModal === "LIMIT_003" && (
                  <button
                    onClick={() => { setShowLimitModal(null); setPfModalOpen(true); }}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-transparent border border-white/50 rounded-full hover:bg-white/20 transition-colors"
                  >
                    Buy PF Credits
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <PFPurchaseModal isOpen={pfModalOpen} onClose={() => setPfModalOpen(false)} />

      <VerifyCodeModal
        isOpen={showVerifyModal}
        email={userEmail}
        onClose={() => setShowVerifyModal(false)}
        onVerified={() => { setEmailVerified(true); window.dispatchEvent(new Event("refresh-balances")); }}
      />

      {needsOnboarding && onboardingMounted && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm transition-opacity duration-500"
          style={{ opacity: onboardingStep === "done" ? 1 : 1 }}
        >
          <div
            className="w-full max-w-lg mx-4 rounded-2xl bg-white shadow-2xl overflow-hidden transition-all duration-500 ease-out"
          >
            <div className="relative z-10 px-6 py-6 max-h-[80vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {onboardingStep === "prompt" && (
                <div className="flex flex-col items-center gap-5 py-8">
                  <div className="w-16 h-16 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center">
                    <Upload size={28} className="text-[var(--color-accent)]" />
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-semibold text-gray-900">Set Up Your Account</h2>
                    <p className="text-sm text-gray-500 max-w-xs">
                      Upload your CV and let AI fill in your profile details automatically.
                    </p>
                  </div>
                  <button
                    onClick={() => setOnboardingStep("form")}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
                  >
                    Set up account
                  </button>
                </div>
              )}

              {onboardingStep === "form" && (
                <OnboardingForm
                  onOnboarded={() => setOnboardingStep("done")}
                />
              )}

              {onboardingStep === "done" && (
                <div className="flex flex-col items-center gap-5 py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-semibold text-gray-900">Account set up!</h2>
                    <p className="text-sm text-gray-500">Your profile is ready to go.</p>
                  </div>
                  <button
                    onClick={() => { setNeedsOnboarding(false); setOnboardingMounted(false); window.location.reload(); }}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
                  >
                    Go to Dashboard
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </PageTransitionWrapper>

      <SearchGuidancePopup
        isOpen={showGuidance}
        onDismiss={() => {
          localStorage.setItem("fmsg_guided_search_shown", "true");
          setShowGuidance(false);
          if (referralJob) {
            handleSearch(referralJob.job_title, activeProfileId, undefined, undefined, referralJob.apply_url);
          } else if (activeProfileId) {
            const supabase = createClient();
            supabase.from("search_profiles").select("job_titles").eq("id", activeProfileId).maybeSingle()
              .then(({ data }: { data: any }) => {
                const titles: string[] = data?.job_titles ?? [];
                if (titles.length > 0) {
                  handleSearch(titles[0], activeProfileId);
                }
              });
          }
        }}
      />

    </DashboardLayout>
  );
}
