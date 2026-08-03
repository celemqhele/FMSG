"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { SearchPill } from "@/components/dashboard/search-pill";
import { MobileSearchPill } from "@/components/dashboard/mobile/mobile-search-pill";
import { SearchProgress } from "@/components/dashboard/search-progress";
import { MobileSearchProgress } from "@/components/dashboard/mobile/mobile-search-progress";
import { JobResultCard } from "@/components/dashboard/job-result-card";
import { MobileJobCard } from "@/components/dashboard/mobile/mobile-job-card";
import { BoardPrompt } from "./board-prompt";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { readGuestResults, writeGuestResults } from "@/lib/guest-results-cache";
import dynamic from "next/dynamic";
import type { JobBoard, JobCard } from "@/data/jobs/types";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const AuthModal = dynamic(() => import("@/components/auth/auth-modal").then((mod) => mod.AuthModal), { ssr: false });
const MobileAuthSheet = dynamic(() => import("@/components/auth/mobile-auth-sheet").then((mod) => mod.MobileAuthSheet), { ssr: false });

interface BoardJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  applyUrl: string;
  source: string;
}

const MORE_LINES = [
  "Searching JSearch",
  "Searching Google Jobs",
  "Searching Bing Jobs",
  "Searching Ditto",
  "Searching Workday",
  "Compiling results",
];
const PROMPT_DELAY_MS = 3000;
const PROMPT_SEEN_KEY = "fmsg-board-prompt-seen";
const COMPLETE_SEEN_KEY = "fmsg-board-complete-seen";

function storageGet(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function storageSet(key: string) {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // storage unavailable — ignore
  }
}

function toCardProps(job: JobCard) {
  return {
    id: job.slug,
    jobTitle: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    description: job.description,
    jobUrl: job.applyUrl,
  };
}

export function JobsBoard({ board }: { board: JobBoard }) {
  const { endTransition } = useTransition();
  const isMobile = useIsMobile();
  const router = useRouter();

  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");

  const [results, setResults] = useState<BoardJob[]>([]);
  const [status, setStatus] = useState<"idle" | "searching" | "done" | "limit" | "error">("idle");
  const [error, setError] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [cvPromptOpen, setCvPromptOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef("");
  const lastLocationRef = useRef("");

  const openAuth = useCallback((tab: "login" | "signup") => {
    setAuthTab(tab);
    setAuthOpen(true);
  }, []);

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    if (storageGet(PROMPT_SEEN_KEY)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: { session: { user: { id: string } } | null } | null }) => {
      if (cancelled || data?.session) return;
      timer = setTimeout(() => {
        setPromptOpen(true);
        storageSet(PROMPT_SEEN_KEY);
      }, PROMPT_DELAY_MS);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session && readGuestResults().length > 0) {
        router.replace("/dashboard?tab=saved");
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const runSearch = useCallback(async (q: string, overrideLocation?: string) => {
    if (!q.trim() || status === "searching") return;
    const loc = (overrideLocation ?? "").trim() || undefined;
    lastQueryRef.current = q.trim();
    lastLocationRef.current = loc ?? "";
    setStatus("searching");
    setError("");
    setResults([]);
    setProgress(0);
    setLineIndex(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/guest-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim(), location: loc, mode: "landing" }),
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
      if (Array.isArray(data.results) && data.results.length > 0) {
        writeGuestResults(
          (data.results as BoardJob[]).map((r) => ({
            title: r.title,
            company: r.company,
            location: r.location,
            salary: r.salary,
            description: r.description,
            applyUrl: r.applyUrl,
          }))
        );
      }
      if (!storageGet(COMPLETE_SEEN_KEY)) {
        setCompletionOpen(true);
        storageSet(COMPLETE_SEEN_KEY);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setStatus("error");
      setError("Network error. Please try again.");
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [status]);

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

  useEffect(() => {
    if (status !== "searching") return;
    const totalMs = 60000;
    const start = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / totalMs);
      setProgress(Math.round(t * 92));
      setLineIndex(Math.min(MORE_LINES.length - 1, Math.floor(t * MORE_LINES.length)));
    }, 350);
    return () => clearInterval(timer);
  }, [status]);

  const completedLines = status === "done" ? MORE_LINES : MORE_LINES.slice(0, lineIndex);
  const activeLine = status === "done" ? "" : MORE_LINES[lineIndex];

  const renderCard = (props: ReturnType<typeof toCardProps>, extra?: { gold?: boolean }) =>
    isMobile ? (
      <MobileJobCard
        {...props}
        matchScore={0}
        fullDescription=""
        onDelete={() => {}}
        onGenerateCv={() => setCvPromptOpen(true)}
        guest
        gold={extra?.gold}
      />
    ) : (
      <JobResultCard
        {...props}
        matchScore={0}
        fullDescription=""
        onDelete={() => {}}
        onGenerateCv={() => setCvPromptOpen(true)}
        guest
        gold={extra?.gold}
      />
    );

  const resultCards = results.map((r, i) => ({
    id: `more-${i}`,
    jobTitle: r.title,
    company: r.company,
    location: r.location,
    salary: r.salary,
    description: r.description,
    jobUrl: r.applyUrl,
  }));

  return (
    <>
      <DashboardLayout guest onGuestSignUp={() => openAuth("signup")}>
        <div className={`max-w-4xl mx-auto space-y-6 ${isMobile ? "pt-2" : "pt-8"}`}>
          <div className={isMobile ? "space-y-0.5" : "text-center mb-1"}>
            <h1 className="text-base md:text-lg font-semibold text-white">
              {board.name} Jobs in South Africa
            </h1>
            <p className="text-sm text-white/70">{board.tagline}</p>
          </div>

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
              initialQuery={board.search.title}
              initialLocation={board.search.location}
            />
          ) : (
            <SearchPill
              onSearch={handleSearch}
              onAbort={handleAbort}
              searching={status === "searching"}
              pfMode={false}
              onPfModeChange={() => {}}
              guest
              initialQuery={board.search.title}
              initialLocation={board.search.location}
            />
          )}

          {board.jobs.length > 0 ? (
            board.jobs.map((job) => (
              <div key={job.slug}>
                {renderCard(toCardProps(job), { gold: job.featured })}
              </div>
            ))
          ) : (
            <div className="liquid-glass rounded-xl p-5 text-center">
              <p className="text-sm text-white/70">
                More {board.name.toLowerCase()} roles coming soon.
              </p>
            </div>
          )}

          {(status === "searching" || status === "done" || status === "limit" || status === "error") && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-white/90">More jobs like this</h2>
                {status === "searching" && (
                  <span className="text-xs text-white/50">You can keep browsing the jobs above</span>
                )}
              </div>

              {status === "searching" &&
                (isMobile ? (
                  <MobileSearchProgress completedLines={completedLines} activeLine={activeLine} progress={progress} />
                ) : (
                  <SearchProgress completedLines={completedLines} activeLine={activeLine} progress={progress} />
                ))}

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

              {status === "done" &&
                resultCards.map((card) => <div key={card.id}>{renderCard(card)}</div>)}

              {status === "done" && resultCards.length === 0 && (
                <div className="liquid-glass rounded-xl p-5 text-center">
                  <p className="text-sm text-white/70">No extra jobs found for that search right now.</p>
                </div>
              )}
            </div>
          )}

          {status !== "searching" && (
            <div className="liquid-glass rounded-xl p-5">
              <p className="text-sm font-medium text-white mb-1">You&apos;re viewing a preview.</p>
              <p className="text-sm text-white/70 mb-4">
                Sign in to unlock all matching jobs, unlimited searches, AI matching, and CV generation.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => openAuth("signup")}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
                >
                  Sign Up
                </button>
                <button
                  onClick={() => openAuth("login")}
                  className="px-5 py-2.5 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                >
                  Log In
                </button>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>

      <BoardPrompt
        open={promptOpen}
        title="Would you like to see more jobs like this?"
        subtitle="We'll search live openings near these roles across all job boards. It takes about a minute."
        primaryLabel="Yes"
        secondaryLabel="Later"
        onPrimary={() => {
          setPromptOpen(false);
          runSearch(board.search.title, board.search.location);
        }}
        onSecondary={() => setPromptOpen(false)}
      />

      <BoardPrompt
        open={completionOpen}
        title="You've finished your search"
        subtitle="Sign up for unlimited searches, AI matching, CV generation, and more results."
        primaryLabel="Sign Up"
        secondaryLabel="Later"
        onPrimary={() => {
          setCompletionOpen(false);
          openAuth("signup");
        }}
        onSecondary={() => setCompletionOpen(false)}
      />

      <BoardPrompt
        open={cvPromptOpen}
        title="Generate your CV"
        subtitle="Generating a CV requires you to log in or sign up."
        primaryLabel="Sign Up"
        secondaryLabel="Log In"
        onPrimary={() => {
          setCvPromptOpen(false);
          openAuth("signup");
        }}
        onSecondary={() => {
          setCvPromptOpen(false);
          openAuth("login");
        }}
      />

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
