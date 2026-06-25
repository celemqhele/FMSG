"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { Footer } from "@/components/layout/footer";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import dynamic from "next/dynamic";
const AuthModal = dynamic(() => import("@/components/auth/auth-modal").then((mod) => mod.AuthModal), { ssr: false });
import { LiquidGlassCard } from "@/components/landing/liquid-glass-card";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { PLAN_PRICES, PLAN_LIMITS, calculatePFPrice, PF_DEFAULT_BY_TIER, formatPlanPrice, formatPFFromPrice, PAYSTACK_PLAN_CODES, PLAN_TIER_NAMES, TIER_FEATURES, TIER_POPULAR } from "@/lib/plan-limits";
import { PFStepper } from "@/components/pricing/pf-stepper";
import "@/components/landing/liquid-glass.css";

interface Tier {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  searches: number;
  cvGens: number;
  pfBalance: number;
  features: string[];
  popular: boolean;
}

const tiers: Tier[] = PLAN_TIER_NAMES.map((name) => ({
  name,
  monthlyPrice: name === "Free" ? "R0" : formatPlanPrice(name, "monthly"),
  annualPrice: name === "Free" ? "R0" : formatPlanPrice(name, "annual"),
  searches: PLAN_LIMITS[name]?.searches ?? 0,
  cvGens: PLAN_LIMITS[name]?.cv_gens ?? 0,
  pfBalance: PLAN_LIMITS[name]?.pf_balance ?? 0,
  features: TIER_FEATURES[name] ?? [],
  popular: TIER_POPULAR[name] ?? false,
}));

const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

export default function PricingPage() {
  const router = useRouter();
  const { endTransition } = useTransition();
  const supabase = createClient();

  const [annual, setAnnual] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const [processing, setProcessing] = useState<string | null>(null);
  const [paystackReady, setPaystackReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<{ name: string; cycle: string } | null>(null);
  const [successToast, setSuccessToast] = useState(false);
  const [pfCounts, setPfCounts] = useState<Record<string, number>>({});

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      if (res.data?.user) {
        setLoggedIn(true);
        router.push("/upgrade");
      }
    });
  }, [supabase, router]);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).PaystackPop) {
      setPaystackReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setPaystackReady(true);
    document.body.appendChild(script);
  }, []);

  // Handle redirect back from auth with pending plan
  useEffect(() => {
    if (loggedIn && pendingPlan) {
      const p = pendingPlan;
      setPendingPlan(null);
      startPayment(p.name, p.cycle);
    }
  }, [loggedIn, pendingPlan]);

  const handleAuthSuccess = useCallback(() => {
    setAuthOpen(false);
    // Re-check logged in state
    supabase.auth.getUser().then((res: any) => {
      if (res.data?.user) {
        setLoggedIn(true);
      }
    });
  }, [supabase]);

  const handleClose = useCallback(() => {
    setAuthOpen(false);
    setPendingPlan(null);
  }, []);

  const startPayment = async (planName: string, cycle: string) => {
    if (planName === "Free") return;
    setProcessing(planName);

    if (!PAYSTACK_PUBLIC_KEY) {
      alert("Payment system not configured.");
      setProcessing(null);
      return;
    }

    if (!paystackReady || !(window as any).PaystackPop) {
      alert("Payment system loading. Please try again.");
      setProcessing(null);
      return;
    }

    const baseKobo = cycle === "annual" ? PLAN_PRICES[planName].annual : PLAN_PRICES[planName].monthly;
    const extraPf = pfCounts[planName] ?? PF_DEFAULT_BY_TIER[planName] ?? 0;
    const pfPriceZar = calculatePFPrice(extraPf || 1);
    const billingMonths = cycle === "annual" ? 12 : 1;
    const pfKobo = extraPf * pfPriceZar * 100 * billingMonths;
    const amount = baseKobo + pfKobo;
    const totalPf = (PLAN_LIMITS[planName]?.pf_balance ?? 0) + extraPf;
    const sRes = await supabase.auth.getSession();
    const session = sRes.data.session;
    const email = session?.user?.email;
    if (!email) { setProcessing(null); return; }

    const handler = (window as any).PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email,
      amount,
      currency: "ZAR",
      ref: "FMSG-" + Date.now(),
      plan: "",
      metadata: { plan: planName, billing_cycle: cycle, pf_count: totalPf },
      callback: function (response: { reference: string }) {
        fetch("/api/verify-payment", {
          method: "POST",
          headers: { Authorization: `Bearer ${session!.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ reference: response.reference, plan: planName, billing_cycle: cycle }),
        }).then((verifyRes) => {
          if (verifyRes.ok) {
            setProcessing(null);
            setSuccessToast(true);
            setTimeout(() => { setSuccessToast(false); router.push("/welcome?plan=" + planName.toLowerCase()); }, 2000);
          } else {
            setProcessing(null);
            alert("Payment verification failed. Please contact support.");
          }
        }).catch(() => {
          setProcessing(null);
          alert("Payment verification failed. Please contact support.");
        });
      },
      onClose: () => setProcessing(null),
    });

    handler.openIframe();
  };

  const handleSubscribe = async (tier: Tier) => {
    if (tier.name === "Free") {
      if (loggedIn) {
        router.push("/dashboard");
      } else {
        setAuthTab("signup");
        setAuthOpen(true);
      }
      return;
    }

    const cycle = annual ? "annual" : "monthly";

    if (!loggedIn) {
      setPendingPlan({ name: tier.name, cycle });
      setAuthTab("signup");
      setAuthOpen(true);
      return;
    }

    await startPayment(tier.name, cycle);
  };

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar
        onLoginClick={() => { setAuthTab("login"); setAuthOpen(true); }}
        onSignUpClick={() => { setAuthTab("signup"); setAuthOpen(true); }}
      />
      <PageTransitionWrapper>
        <main className="flex-1 pt-24 pb-24 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold text-white">Find the right plan</h1>
              <p className="mt-2 text-sm text-white/70">All plans include AI-powered job matching. Upgrade anytime.</p>
              <div className="mt-6 inline-flex items-center gap-1 p-1 rounded-full bg-white/10 border border-white/10">
                <button onClick={() => setAnnual(false)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${!annual ? "bg-white/15 text-white shadow-[var(--shadow-sm)]" : "text-white/80 hover:text-white"}`}>Monthly</button>
                <button onClick={() => setAnnual(true)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${annual ? "bg-white/15 text-white shadow-[var(--shadow-sm)]" : "text-white/80 hover:text-white"}`}>Annual <span className="text-[var(--color-success)]">Save 2 months</span></button>
              </div>
            </div>

            <div className="mb-8 liquid-glass rounded-xl p-5 text-center">
              <p className="text-sm font-semibold text-white">Persistent Finder - from R45/run</p>
              <p className="mt-1 text-xs text-white/70">Multi-round AI search that finds jobs other engines miss. Set the number of search rounds below.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-4 md:gap-4">
              {tiers.map((tier) => {
                const pfCount = pfCounts[tier.name] ?? PF_DEFAULT_BY_TIER[tier.name] ?? 0;
                const pricePerRun = calculatePFPrice(pfCount);
                const pfTotal = pfCount * pricePerRun * (annual ? 12 : 1);
                const basePrice = annual ? tier.annualPrice : tier.monthlyPrice;
                const baseKobo = annual ? PLAN_PRICES[tier.name]?.annual : PLAN_PRICES[tier.name]?.monthly;
                const grandTotalKobo = baseKobo + pfTotal * 100;
                const grandTotal = (grandTotalKobo / 100).toLocaleString("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 0 });

                return (
                <LiquidGlassCard
                  key={tier.name}
                  variant="surface"
                  className={`relative flex flex-col p-6 ${tier.popular ? "border-[var(--color-accent)]" : ""}`}
                >
                  {tier.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold text-white bg-[var(--color-accent)] rounded-full z-10">Most popular</span>
                  )}
                  <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white">{tier.name === "Free" ? "R0" : grandTotal}</span>
                    <span className="ml-1 text-sm text-white/70">/{annual ? "year" : "month"}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-white/60">
                    <span>{basePrice}/{annual ? "yr" : "mo"}</span>
                    {pfCount > 0 && (
                      <>
                        <span>+</span>
                        <span>R{(pfTotal).toLocaleString("en-ZA", { minimumFractionDigits: 0 })} PF</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 text-sm text-white/70">
                    {tier.searches} searches / {tier.cvGens} CVs{/* / {tier.pfBalance} PF runs */}
                  </div>
                  {tier.name !== "Free" && (
                    <div className="mt-3">
                      <PFStepper
                        planName={tier.name}
                        value={pfCount}
                        onChange={(v) => setPfCounts((prev) => ({ ...prev, [tier.name]: v }))}
                        annual={annual}
                      />
                    </div>
                  )}
                  <ul className="mt-3 flex-1 flex flex-col gap-3">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-white/80">
                        <Check size={16} className="mt-0.5 text-[var(--color-success)] shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleSubscribe(tier)}
                    disabled={processing === tier.name}
                    className={`mt-4 w-full px-5 py-2.5 text-sm font-medium rounded-full transition-colors flex items-center justify-center gap-2 ${
                      tier.name === "Free"
                        ? "border border-white/20 text-white hover:bg-white/10"
                        : "text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                    }`}
                  >
                    {processing === tier.name ? (
                      <><Loader2 size={14} className="animate-spin" /> Processing...</>
                    ) : tier.name === "Free" ? (
                      loggedIn ? "Go to Dashboard" : "Get Started"
                    ) : (
                      `Subscribe to ${tier.name}`
                    )}
                  </button>
                </LiquidGlassCard>
                );
              })}
            </div>
          </div>
        </main>
      </PageTransitionWrapper>
      <Footer />

      <AuthModal
        isOpen={authOpen}
        onClose={handleClose}
        defaultTab={authTab}
      />

      {successToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-full bg-green-600 text-white text-sm font-medium shadow-lg animate-[auth-screen-in_300ms_ease-out]">
          Payment successful! Redirecting to dashboard...
        </div>
      )}
    </>
  );
}
