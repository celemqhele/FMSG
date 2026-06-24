"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { LiquidGlassCard } from "./liquid-glass-card";
import { useTransition } from "@/components/providers/transition-provider";
import { PLAN_LIMITS, PLAN_PRICES, formatPlanPrice, PLAN_TIER_NAMES } from "@/lib/plan-limits";

const TIER_FEATURES: Record<string, string[]> = {
  Free: ["1 job search per month", "Basic match scoring"],
  Seeker: ["10 job searches per month", "5 tailored CVs per month", "Full match scoring", "Banned company filtering", "5 Persistent Finder rounds"],
  Hunter: ["25 job searches per month", "12 tailored CVs per month", "Priority AI processing", "Advanced filtering", "15 Persistent Finder rounds"],
  Pro: ["60 job searches per month", "25 tailored CVs per month", "Fastest AI processing", "All features unlocked", "50 Persistent Finder rounds"],
};

const TIER_POPULAR: Record<string, boolean> = {
  Free: false,
  Seeker: false,
  Hunter: true,
  Pro: false,
};

const tiers = PLAN_TIER_NAMES.map((name) => ({
  name,
  monthlyPrice: name === "Free" ? "R0" : formatPlanPrice(name, "monthly"),
  annualPrice: name === "Free" ? "R0" : formatPlanPrice(name, "annual"),
  searches: PLAN_LIMITS[name]?.searches ?? 0,
  cvGens: PLAN_LIMITS[name]?.cv_gens ?? 0,
  features: TIER_FEATURES[name] ?? [],
  popular: TIER_POPULAR[name] ?? false,
}));

function PricingCard({ tier, annual, compact }: { tier: typeof tiers[number]; annual: boolean; compact?: boolean }) {
  const router = useRouter();
  return (
    <LiquidGlassCard
      variant="surface"
      className={`relative flex flex-col ${compact ? "p-5" : "p-6"} ${
        tier.popular ? "border-[var(--color-accent)]" : ""
      }`}
    >
      {tier.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold text-white bg-[var(--color-accent)] rounded-full z-10">
          Most popular
        </span>
      )}
      <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
      <div className="mt-4">
        <span className="text-3xl font-bold text-white">
          {annual ? tier.annualPrice : tier.monthlyPrice}
        </span>
        <span className="ml-1 text-sm text-white/50">
          /{annual ? "year" : "month"}
        </span>
      </div>
      <ul className="mt-3 flex-1 flex flex-col gap-3">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-white/60">
            <Check size={16} className="mt-0.5 text-[var(--color-success)] shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={() => router.push("/pricing")}
        className={`mt-4 w-full px-5 py-2.5 text-sm font-medium rounded-full transition-colors ${
          tier.name === "Free"
            ? "border border-white/20 text-white hover:bg-white/10"
            : "text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]"
        }`}
      >
        {tier.name === "Free" ? "Get Started" : `Upgrade to ${tier.name}`}
      </button>
    </LiquidGlassCard>
  );
}

function SwipePricingCarousel({ annual }: { annual: boolean }) {
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
          {tiers.map((tier) => (
            <div key={tier.name} className="w-full shrink-0 px-1">
              <PricingCard tier={tier} annual={annual} />
            </div>
          ))}
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
  const [annual, setAnnual] = useState(false);

  return (
    <section className="px-6 py-16 md:py-32" id="pricing">
      <div className="max-w-6xl mx-auto">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
            Simple pricing
          </h2>
          <p className="mt-4 text-white/60">
            All plans include AI-powered job matching. Upgrade anytime.
          </p>
          <div className="mt-8 inline-flex flex-wrap items-center justify-center gap-3 p-1 rounded-full bg-white/10 border border-white/10">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${
                !annual
                  ? "bg-white/15 text-white shadow-[var(--shadow-sm)]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${
                annual
                  ? "bg-white/15 text-white shadow-[var(--shadow-sm)]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Annual{" "}
              <span className="text-[var(--color-success)] whitespace-nowrap">Save 2 months</span>
            </button>
          </div>
        </div>

        <div className="mt-12 md:mt-16 hidden md:grid gap-6 md:grid-cols-2 lg:grid-cols-4 md:gap-4">
          {tiers.map((tier) => (
            <PricingCard key={tier.name} tier={tier} annual={annual} />
          ))}
        </div>

        <div className="mt-12 md:mt-16 md:hidden">
          <SwipePricingCarousel annual={annual} />
        </div>
      </div>
    </section>
  );
}
