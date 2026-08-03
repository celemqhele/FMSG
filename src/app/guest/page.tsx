"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { SearchPill } from "@/components/dashboard/search-pill";
import { MobileSearchPill } from "@/components/dashboard/mobile/mobile-search-pill";
import { SearchProgress } from "@/components/dashboard/search-progress";
import { MobileSearchProgress } from "@/components/dashboard/mobile/mobile-search-progress";
import { JobResultCard } from "@/components/dashboard/job-result-card";
import { MobileJobCard } from "@/components/dashboard/mobile/mobile-job-card";
import { getJobPostByKey } from "@/lib/job-posts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTransition } from "@/components/providers/transition-provider";
import dynamic from "next/dynamic";
const AuthModal = dynamic(() => import("@/components/auth/auth-modal").then((mod) => mod.AuthModal), { ssr: false });
const MobileAuthSheet = dynamic(() => import("@/components/auth/mobile-auth-sheet").then((mod) => mod.MobileAuthSheet), { ssr: false });

interface GuestJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  applyUrl: string;
  source: string;
}

const JOB_POST_LINES = ["Searching Adzuna", "Searching Ditto", "Compiling results"];
const LANDING_LINES = [
  "Searching JSearch",
  "Searching Google Jobs",
  "Searching Bing Jobs",
  "Searching Ditto",
  "Searching Workday",
  "Compiling results",
];

function GuestContent() {
  const searchParams = useSearchParams();
  const { endTransition } = useTransition();
  const isMobile = useIsMobile();

  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");

  const goldPost = (() => {
    const k = searchParams.get("k");
    return k ? getJobPostByKey(k) : null;
  })();

  const [results, setResults] = useState<GuestJob[]>([]);
  const [status, setStatus] = useState<"idle" | "searching" | "done" | "limit" | "error">("idle");
  const [error, setError] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const [completeMounted, setCompleteMounted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const autoSearched = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef("");
  const lastLocationRef = useRef("");

  const activeLines = goldPost ? JOB_POST_LINES : LANDING_LINES;
  const completedLines = status === "done" ? activeLines : activeLines.slice(0, lineIndex);
  const activeLine = status === "done" ? "" : activeLines[lineIndex];

  const runSearch = useCallback(async (q: string, overrideLocation?: string) => {
    if (!q.trim() || status === "searching") return;
    const loc = (overrideLocation ?? "").trim() || undefined;
    lastQueryRef.current = q.trim();
    lastLocationRef.current = loc ?? "";
    setStatus("searching");
    setError("");
    setResults([]);
    setShowComplete(false);
    setCompleteMounted(false);
    setProgress(0);
    setLineIndex(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/guest-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q.trim(),
          location: loc,
          mode: goldPost ? "job-post" : "landing",
        }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (ctrl.signal.aborted) return;
      if (res.status === 403 && data.code === "GUEST_LIMIT") {
        setStatus("limit");
        setError(data.message || "You've already used your free search.");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setError(data.error || "Search failed. Please try again.");
        return;
      }
      setResults(data.results ?? []);
      setProgress(100);
      setStatus("done");
      setShowComplete(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setStatus("error");
      setError("Network error. Please try again.");
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [status, goldPost]);

  const handleSearch = useCallback((q: string, _profileId?: string | null, _pf?: boolean, _date?: number | null, loc?: string) => {
    runSearch(q, loc);
  }, [runSearch]);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setResults([]);
    setProgress(0);
    setLineIndex(0);
  }, []);

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    if (goldPost && !autoSearched.current && status === "idle") {
      autoSearched.current = true;
      runSearch(goldPost.title, goldPost.location);
    }
  }, [goldPost, runSearch, status]);

  useEffect(() => {
    if (status !== "searching") return;
    const totalMs = goldPost ? 25000 : 60000;
    const lines = goldPost ? JOB_POST_LINES : LANDING_LINES;
    const start = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / totalMs);
      setProgress(Math.round(t * 92));
      setLineIndex(Math.min(lines.length - 1, Math.floor(t * lines.length)));
    }, 350);
    return () => clearInterval(timer);
  }, [status, goldPost]);

  useEffect(() => {
    if (showComplete) {
      const timer = setTimeout(() => setCompleteMounted(true), 10);
      return () => clearTimeout(timer);
    }
  }, [showComplete]);

  const openAuth = (tab: "login" | "signup") => {
    setAuthTab(tab);
    setAuthOpen(true);
  };

  const dismissComplete = () => {
    setCompleteMounted(false);
    setTimeout(() => setShowComplete(false), 200);
  };

  const goldCard = goldPost
    ? {
        id: "gold",
        jobTitle: goldPost.title,
        company: goldPost.company,
        location: goldPost.location,
        salary: goldPost.salary,
        description: "",
        jobUrl: goldPost.applyUrl,
      }
    : null;

  const resultCards = results.map((r, i) => ({
    id: `guest-${i}`,
    jobTitle: r.title,
    company: r.company,
    location: r.location,
    salary: r.salary,
    description: r.description,
    jobUrl: r.applyUrl,
  }));

  const renderGoldCard = goldCard && (
    isMobile ? (
      <MobileJobCard {...goldCard} matchScore={0} fullDescription="" onDelete={() => {}} onGenerateCv={() => openAuth("signup")} guest gold />
    ) : (
      <JobResultCard {...goldCard} matchScore={0} fullDescription="" onDelete={() => {}} onGenerateCv={() => openAuth("signup")} guest gold />
    )
  );

  return (
    <>
      <DashboardLayout guest onGuestSignUp={() => openAuth("signup")}>
        <div className={`max-w-4xl mx-auto space-y-6 ${isMobile ? "pt-2" : "pt-8"}`}>
          {!isMobile && (
            <div className="text-center mb-1">
              <p className="text-sm text-white/70">
                {goldPost
                  ? "We're also finding similar live openings near this featured role."
                  : "Try a live search. One search per device, no sign-up."}
              </p>
            </div>
          )}

          {isMobile ? (
            <MobileSearchPill
              onSearch={handleSearch}
              onAbort={handleAbort}
              searching={status === "searching"}
              pfMode={false}
              onPfModeChange={() => {}}
              sortMode="date_newest"
              onSortChange={() => {}}
              platforms={[]}
              onPlatformsChange={() => {}}
              guest
              initialQuery={goldPost?.title}
              initialLocation={goldPost?.location}
            />
          ) : (
            <SearchPill
              onSearch={handleSearch}
              onAbort={handleAbort}
              searching={status === "searching"}
              pfMode={false}
              onPfModeChange={() => {}}
              guest
              initialQuery={goldPost?.title}
              initialLocation={goldPost?.location}
            />
          )}

          {status === "searching" && (
            isMobile ? (
              <MobileSearchProgress completedLines={completedLines} activeLine={activeLine} progress={progress} />
            ) : (
              <SearchProgress completedLines={completedLines} activeLine={activeLine} progress={progress} />
            )
          )}

          {status === "limit" && (
            <div className="liquid-glass rounded-xl p-5 text-center">
              <p className="text-sm text-amber-300 font-medium mb-2">{error}</p>
              <button
                onClick={() => openAuth("signup")}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
              >
                Sign Up for Unlimited Searches
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="liquid-glass rounded-xl p-5 text-center">
              <p className="text-sm text-red-400 font-medium mb-3">{error}</p>
              <button
                onClick={() => runSearch(lastQueryRef.current, lastLocationRef.current)}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {status === "done" && renderGoldCard}

          {status === "done" && resultCards.map((card) => (
            isMobile ? (
              <MobileJobCard key={card.id} {...card} matchScore={0} fullDescription="" onDelete={() => {}} onGenerateCv={() => openAuth("signup")} guest />
            ) : (
              <JobResultCard key={card.id} {...card} matchScore={0} fullDescription="" onDelete={() => {}} onGenerateCv={() => openAuth("signup")} guest />
            )
          ))}

          {status === "done" && resultCards.length === 0 && !goldCard && (
            <div className="liquid-glass rounded-xl p-5 text-center">
              <p className="text-sm text-white/70">No jobs found for that search. Try a different role.</p>
            </div>
          )}
        </div>
      </DashboardLayout>

      {showComplete && (
        <div className="fixed inset-0 z-[300] flex items-end md:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
            style={{ opacity: completeMounted ? 1 : 0 }}
            onClick={dismissComplete}
          />
          <div
            className={`relative w-full max-w-md mx-4 md:mx-auto mb-0 rounded-t-2xl md:rounded-2xl p-6 liquid-glass transition-all duration-200 ${
              completeMounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full md:translate-y-2"
            }`}
          >
            <p className="text-base font-semibold text-white mb-1">You&apos;ve finished your search</p>
            <p className="text-sm text-white/70 mb-5">
              Sign up for unlimited searches, AI matching, CV generation, and more results.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => { dismissComplete(); openAuth("signup"); }}
                className="w-full px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
              >
                Sign Up
              </button>
              <button
                onClick={dismissComplete}
                className="w-full px-5 py-2.5 text-sm font-medium text-white/80 border border-white/20 rounded-full hover:bg-white/5 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {isMobile ? (
        <MobileAuthSheet
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          defaultTab={authTab}
        />
      ) : (
        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          defaultTab={authTab}
        />
      )}
    </>
  );
}

export default function GuestPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-white/80" />
      </div>
    }>
      <GuestContent />
    </Suspense>
  );
}
