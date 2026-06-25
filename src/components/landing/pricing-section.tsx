"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { LiquidGlassCard } from "./liquid-glass-card";
import { useTransition } from "@/components/providers/transition-provider";
import dynamic from "next/dynamic";
const AuthModal = dynamic(() => import("@/components/auth/auth-modal").then((mod) => mod.AuthModal), { ssr: false });
import { createClient } from "@/lib/supabase/client";
import { PLAN_LIMITS, PLAN_PRICES, calculatePFPrice, PF_DEFAULT_BY_TIER, formatPlanPrice, PLAN_TIER_NAMES, TIER_FEATURES, TIER_POPULAR } from "@/lib/plan-limits";
import { PFStepper } from "@/components/pricing/pf-stepper";

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

interface PricingCardProps {
  tier: Tier;
  pfCount: number;
  onPFChange: (v: number) => void;
  annual: boolean;
  processing: string | null;
  loggedIn: boolean;
  onSubscribe: (tier: Tier) => void;
}

function PricingCard({ tier, pfCount, onPFChange, annual, processing, loggedIn, onSubscribe }: PricingCardProps) {
  const pricePerRun = calculatePFPrice(pfCount);
  const pfTotal = pfCount * pricePerRun * (annual ? 12 : 1);
  const basePrice = annual ? tier.annualPrice : tier.monthlyPrice;
  const baseKobo = annual ? PLAN_PRICES[tier.name]?.annual : PLAN_PRICES[tier.name]?.monthly;
  const grandTotalKobo = (baseKobo ?? 0) + pfTotal * 100;
  const grandTotal = (grandTotalKobo / 100).toLocaleString("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 0 });

  return (
    <LiquidGlassCard
      variant="surface"
      className={`relative flex flex-col p-6 ${tier.popular ? "border-[var(--color-accent)]" : ""}`}
    >
      {tier.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold text-white bg-[var(--color-accent)] rounded-full z-10">
          Most popular
        </span>
      )}
      <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
      <div className="mt-4">
        <span className="text-3xl font-bold text-white">
          {tier.name === "Free" ? "R0" : grandTotal}
        </span>
        <span className="ml-1 text-sm text-white/70">
          /{annual ? "year" : "month"}
        </span>
      </div>
      {tier.name !== "Free" && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-white/60">
          <span>{basePrice}/{annual ? "yr" : "mo"}</span>
          {pfCount > 0 && (
            <>
              <span>+</span>
              <span>R{(pfTotal).toLocaleString("en-ZA", { minimumFractionDigits: 0 })} PF</span>
            </>
          )}
        </div>
      )}
      <div className="mt-2 text-sm text-white/70">
        {tier.searches} searches / {tier.cvGens} CVs
      </div>
      {tier.name !== "Free" && (
        <div className="mt-3">
          <PFStepper
            planName={tier.name}
            value={pfCount}
            onChange={onPFChange}
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
        onClick={() => onSubscribe(tier)}
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
}

function SwipePricingCarousel({
  annual,
  processing,
  loggedIn,
  pfCounts,
  setPfCounts,
  onSubscribe,
}: {
  annual: boolean;
  processing: string | null;
  loggedIn: boolean;
  pfCounts: Record<string, number>;
  setPfCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  onSubscribe: (tier: Tier) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [trackWidth, setTrackWidth] = useState(1);
  const startX = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const videoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setVideoFast } = useTransition();
  const animatingRef = useRef(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setTrackWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const goTo = useCallback((index: number) => {
    if (videoTimerRef.current) clearTimeout(videoTimerRef.current);
    const clamped = Math.max(0, Math.min(index, tiers.length - 1));
    setCurrentIndex(clamped);
    setDragOffset(0);
    animatingRef.current = true;
    videoTimerRef.current = setTimeout(() => {
      animatingRef.current = false;
      setVideoFast(false);
    }, 350);
  }, [setVideoFast]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setIsDragging(true);
    setVideoFast(true);
  }, [setVideoFast]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientX - startX.current;
    const atFirst = currentIndex === 0;
    const atLast = currentIndex === tiers.length - 1;
    const resist = (atFirst && delta > 0) || (atLast && delta < 0) ? 3 : 1;
    setDragOffset(delta / resist);
  }, [isDragging, currentIndex]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const cardWidth = trackWidth;
    const threshold = cardWidth * 0.25;
    if (dragOffset < -threshold && currentIndex < tiers.length - 1) {
      goTo(currentIndex + 1);
    } else if (dragOffset > threshold && currentIndex > 0) {
      goTo(currentIndex - 1);
    } else {
      goTo(currentIndex);
    }
  }, [isDragging, dragOffset, currentIndex, goTo, trackWidth]);

  const percent = -currentIndex * 100 + (isDragging ? (dragOffset / trackWidth) * 100 : 0);

  return (
    <div>
      <div className="overflow-hidden rounded-2xl">
        <div
          ref={trackRef}
          className="flex"
          style={{
            transform: `translateX(${percent}%)`,
            transition: isDragging ? "none" : "transform 300ms ease-out",
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {tiers.map((tier) => {
            const pfCount = pfCounts[tier.name] ?? PF_DEFAULT_BY_TIER[tier.name] ?? 0;
            return (
              <div key={tier.name} className="w-full shrink-0 px-1">
                <PricingCard
                  tier={tier}
                  pfCount={pfCount}
                  onPFChange={(v) => setPfCounts((prev) => ({ ...prev, [tier.name]: v }))}
                  annual={annual}
                  processing={processing}
                  loggedIn={loggedIn}
                  onSubscribe={onSubscribe}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 mt-6">
        {tiers.map((_, i) => (
          <button
            key={i}
            onClick={() => { if (!animatingRef.current) goTo(i); }}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentIndex ? "bg-white" : "bg-white/30"
            }`}
            aria-label={`Go to tier ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export function PricingSection() {
  const router = useRouter();
  const supabase = createClient();

  const [annual, setAnnual] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const [processing, setProcessing] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<{ name: string; cycle: string } | null>(null);
  const [paystackReady, setPaystackReady] = useState(false);
  const [pfCounts, setPfCounts] = useState<Record<string, number>>({});
  const [successToast, setSuccessToast] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      if (res.data?.user) {
        setLoggedIn(true);
      }
    });
  }, [supabase]);

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

  useEffect(() => {
    if (loggedIn && pendingPlan) {
      const p = pendingPlan;
      setPendingPlan(null);
      startPayment(p.name, p.cycle);
    }
  }, [loggedIn, pendingPlan]);

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

  const handleSubscribe = useCallback(async (tier: Tier) => {
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
  }, [loggedIn, annual, supabase, pfCounts, paystackReady]);

  return (
    <>
      <section className="px-6 py-16 md:py-32" id="pricing">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
              Find the right plan
            </h2>
            <p className="mt-4 text-white/80">
              All plans include AI-powered job matching. Upgrade anytime.
            </p>
            <div className="mt-8 inline-flex flex-wrap items-center justify-center gap-3 p-1 rounded-full bg-white/10 border border-white/10">
              <button
                onClick={() => setAnnual(false)}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${
                  !annual
                    ? "bg-white/15 text-white shadow-[var(--shadow-sm)]"
                    : "text-white/80 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${
                  annual
                    ? "bg-white/15 text-white shadow-[var(--shadow-sm)]"
                    : "text-white/80 hover:text-white"
                }`}
              >
                Annual{" "}
                <span className="text-[var(--color-success)] whitespace-nowrap">Save 2 months</span>
              </button>
            </div>
          </div>

          <div className="mb-8 mt-10 liquid-glass rounded-xl p-5 text-center">
            <p className="text-sm font-semibold text-white">Persistent Finder - from R45/run</p>
            <p className="mt-1 text-xs text-white/70">
              Multi-round AI search that finds jobs other engines miss. Set the number of search rounds below.
            </p>
          </div>

          <div className="mt-12 md:mt-16 hidden md:grid gap-6 md:grid-cols-4 md:gap-4">
            {tiers.map((tier) => {
              const pfCount = pfCounts[tier.name] ?? PF_DEFAULT_BY_TIER[tier.name] ?? 0;
              return (
                <PricingCard
                  key={tier.name}
                  tier={tier}
                  pfCount={pfCount}
                  onPFChange={(v) => setPfCounts((prev) => ({ ...prev, [tier.name]: v }))}
                  annual={annual}
                  processing={processing}
                  loggedIn={loggedIn}
                  onSubscribe={handleSubscribe}
                />
              );
            })}
          </div>

          <div className="mt-12 md:mt-16 md:hidden">
            <SwipePricingCarousel
              annual={annual}
              processing={processing}
              loggedIn={loggedIn}
              pfCounts={pfCounts}
              setPfCounts={setPfCounts}
              onSubscribe={handleSubscribe}
            />
          </div>
        </div>
      </section>

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
