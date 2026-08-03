"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Loader2, X } from "lucide-react";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import dynamic from "next/dynamic";
const AuthModal = dynamic(() => import("@/components/auth/auth-modal").then((mod) => mod.AuthModal), { ssr: false });
const MobileAuthSheet = dynamic(() => import("@/components/auth/mobile-auth-sheet").then((mod) => mod.MobileAuthSheet), { ssr: false });
import { useIsMobile } from "@/hooks/use-mobile";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { JobResultCard } from "@/components/dashboard/job-result-card";
import { MobileJobCard } from "@/components/dashboard/mobile/mobile-job-card";
import { getJobPostByKey, type JobPost } from "@/lib/job-posts";
import "@/components/landing/liquid-glass.css";

interface GuestJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  applyUrl: string;
  source: string;
}

function GuestContent() {
  const searchParams = useSearchParams();
  const { endTransition } = useTransition();
  const isMobile = useIsMobile();

  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GuestJob[]>([]);
  const [goldPost, setGoldPost] = useState<JobPost | null>(null);
  const [status, setStatus] = useState<"idle" | "searching" | "done" | "limit" | "error">("idle");
  const [error, setError] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const [completeMounted, setCompleteMounted] = useState(false);
  const autoSearched = useRef(false);

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    const k = searchParams.get("k");
    if (k) {
      const post = getJobPostByKey(k);
      if (post) setGoldPost(post);
    }
  }, [searchParams]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      setIsLoggedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      setIsLoggedIn(!!session);
    });
    return () => { subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (goldPost && !autoSearched.current && status === "idle") {
      autoSearched.current = true;
      setQuery(goldPost.title);
      runSearch(goldPost.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goldPost]);

  useEffect(() => {
    if (showComplete) {
      const timer = setTimeout(() => setCompleteMounted(true), 10);
      return () => clearTimeout(timer);
    }
  }, [showComplete]);

  const runSearch = async (q: string) => {
    if (!q.trim() || status === "searching") return;
    setStatus("searching");
    setError("");
    setResults([]);
    setShowComplete(false);
    setCompleteMounted(false);
    try {
      const res = await fetch("/api/guest-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
      });
      const data = await res.json().catch(() => ({}));
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
      setStatus("done");
      setShowComplete(true);
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  };

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
        jobUrl: goldPost.applyUrl,
      }
    : null;

  const resultCards = results.map((r, i) => ({
    id: `guest-${i}`,
    jobTitle: r.title,
    company: r.company,
    location: r.location,
    salary: r.salary,
    jobUrl: r.applyUrl,
  }));

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar
        onLoginClick={() => openAuth("login")}
        onSignUpClick={() => openAuth("signup")}
        isLoggedIn={isLoggedIn}
      />

      <main className="relative z-10 flex-1 px-4 pt-24 md:pt-28 pb-28">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-2xl md:text-4xl font-semibold tracking-tight text-white leading-tight">
              Search jobs — free, no sign-up
            </h1>
            <p className="mt-2 text-sm md:text-base text-white/70">
              One free search. {goldPost ? "We're also showing the job that brought you here." : "Enter a role to find live openings in South Africa."}
            </p>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); runSearch(query); }}
            className="liquid-glass rounded-2xl flex items-center gap-2 px-3 py-2 mb-6"
          >
            <Search size={18} className="text-white/50 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Software developer, accountant, nurse..."
              className="flex-1 bg-transparent text-sm md:text-base text-white placeholder-white/40 outline-none min-w-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-white/50 hover:text-white transition-colors"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="submit"
              disabled={status === "searching" || !query.trim()}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {status === "searching" ? (
                <><Loader2 size={14} className="animate-spin" /> Searching...</>
              ) : (
                "Search"
              )}
            </button>
          </form>

          {status === "idle" && !goldPost && (
            <div className="liquid-glass rounded-xl p-5 text-center">
              <p className="text-sm text-white/70">Type a job role above and hit Search. You get one free search — no account needed.</p>
            </div>
          )}

          {(status === "searching") && (
            <div className="liquid-glass rounded-xl p-6 flex flex-col items-center gap-3">
              <Loader2 size={20} className="animate-spin text-[var(--color-accent)]" />
              <p className="text-sm text-white/70">Searching live job boards... this can take up to 25 seconds.</p>
            </div>
          )}

          {status === "limit" && (
            <div className="liquid-glass rounded-xl p-5 text-center mb-6">
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
            <div className="liquid-glass rounded-xl p-5 text-center mb-6">
              <p className="text-sm text-red-400 font-medium mb-3">{error}</p>
              <button
                onClick={() => runSearch(query)}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {(status === "done" || status === "limit") && (goldCard || resultCards.length > 0) && (
            <div className="space-y-3">
              <p className="text-xs text-white/50 uppercase tracking-wider">Results</p>
              {goldCard && (
                isMobile ? (
                  <MobileJobCard {...goldCard} matchScore={0} fullDescription="" onDelete={() => {}} guest gold />
                ) : (
                  <JobResultCard {...goldCard} matchScore={0} fullDescription="" onDelete={() => {}} guest gold />
                )
              )}
              {resultCards.map((card) => (
                isMobile ? (
                  <MobileJobCard key={card.id} {...card} matchScore={0} fullDescription="" onDelete={() => {}} guest />
                ) : (
                  <JobResultCard key={card.id} {...card} matchScore={0} fullDescription="" onDelete={() => {}} guest />
                )
              ))}
              {status === "done" && resultCards.length === 0 && !goldCard && (
                <div className="liquid-glass rounded-xl p-5 text-center">
                  <p className="text-sm text-white/70">No jobs found for that search. Try a different role.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

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
