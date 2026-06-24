"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { Footer } from "@/components/layout/footer";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { PLAN_LIMITS, PLAN_PRICES, formatPlanPrice, PLAN_TIER_NAMES } from "@/lib/plan-limits";

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: "Free",
  seeker: "Seeker",
  hunter: "Hunter",
  pro: "Pro",
};

const PLAN_FEATURES: Record<string, string[]> = {
  Free: ["1 job search per month", "Basic match scoring"],
  Seeker: ["10 job searches per month", "5 tailored CVs per month", "Full match scoring", "Banned company filtering", "5 Persistent Finder rounds"],
  Hunter: ["25 job searches per month", "12 tailored CVs per month", "Priority AI processing", "Advanced filtering", "15 Persistent Finder rounds"],
  Pro: ["60 job searches per month", "25 tailored CVs per month", "Fastest AI processing", "All features unlocked", "50 Persistent Finder rounds"],
};

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { endTransition } = useTransition();
  const supabase = createClient();
  const [checking, setChecking] = useState(true);

  const plan = searchParams.get("plan") ?? "free";
  const displayName = PLAN_DISPLAY_NAMES[plan] ?? "Free";
  const limits = PLAN_LIMITS[displayName] ?? PLAN_LIMITS.Free;
  const features = PLAN_FEATURES[displayName] ?? PLAN_FEATURES.Free;

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      if (!res.data?.user) {
        router.push("/");
      } else {
        setChecking(false);
      }
    });
  }, [router, supabase]);

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-white/60" />
      </div>
    );
  }

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar />
      <PageTransitionWrapper>
        <main className="flex-1 pt-24 pb-24 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-success)]/20 mb-6">
              <Sparkles size={32} className="text-[var(--color-success)]" />
            </div>

            <h1 className="text-3xl font-bold text-white">
              Welcome to {displayName}!
            </h1>
            <p className="mt-2 text-sm text-white/50">
              Your plan is active and you&apos;re ready to find your next opportunity.
            </p>

            <div className="mt-8 liquid-glass rounded-xl p-6 text-left">
              <h2 className="text-lg font-semibold text-white mb-4">
                {displayName} Plan — What you get
              </h2>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-3 rounded-lg bg-white/5">
                  <div className="text-2xl font-bold text-white">{limits.searches}</div>
                  <div className="text-xs text-white/50 mt-1">Searches / mo</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-white/5">
                  <div className="text-2xl font-bold text-white">{limits.cv_gens}</div>
                  <div className="text-xs text-white/50 mt-1">CVs / mo</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-white/5">
                  <div className="text-2xl font-bold text-white">{limits.pf_balance}</div>
                  <div className="text-xs text-white/50 mt-1">PF Rounds / mo</div>
                </div>
              </div>

              <ul className="space-y-3">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-white/70">
                    <Check size={18} className="mt-0.5 text-[var(--color-success)] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => router.push("/dashboard")}
              className="mt-8 px-8 py-3 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
            >
              Start Searching
            </button>
          </div>
        </main>
      </PageTransitionWrapper>
      <Footer />
    </>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-white/60" />
      </div>
    }>
      <WelcomeContent />
    </Suspense>
  );
}
