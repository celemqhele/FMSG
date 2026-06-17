"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { LiquidGlassCard } from "./liquid-glass-card";

const tiers = [
  {
    name: "Free",
    monthlyPrice: "R0",
    annualPrice: "R0",
    searches: 3,
    cvGens: 1,
    features: ["3 job searches per month", "1 tailored CV per month", "Basic match scoring"],
    popular: false,
  },
  {
    name: "Seeker",
    monthlyPrice: "R79",
    annualPrice: "R790",
    searches: 25,
    cvGens: 5,
    features: [
      "25 job searches per month",
      "5 tailored CVs per month",
      "Full match scoring",
      "Banned company filtering",
    ],
    popular: false,
  },
  {
    name: "Hunter",
    monthlyPrice: "R149",
    annualPrice: "R1,490",
    searches: 70,
    cvGens: 15,
    features: [
      "70 job searches per month",
      "15 tailored CVs per month",
      "Priority AI processing",
      "Advanced filtering",
    ],
    popular: true,
  },
  {
    name: "Pro",
    monthlyPrice: "R249",
    annualPrice: "R2,490",
    searches: 200,
    cvGens: -1,
    features: [
      "200 job searches per month",
      "Unlimited tailored CVs",
      "Fastest AI processing",
      "All features unlocked",
    ],
    popular: false,
  },
];

export function PricingSection() {
  const [annual, setAnnual] = useState(false);

  return (
    <section className="px-6 py-24 md:py-32" id="pricing">
      <div className="max-w-6xl mx-auto">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
            Simple pricing
          </h2>
          <p className="mt-4 text-white/60">
            All plans include AI-powered job matching. Upgrade anytime.
          </p>
          <div className="mt-8 inline-flex items-center gap-3 p-1 rounded-full bg-white/10 border border-white/10">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                !annual
                  ? "bg-white/15 text-white shadow-[var(--shadow-sm)]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                annual
                  ? "bg-white/15 text-white shadow-[var(--shadow-sm)]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Annual{" "}
              <span className="text-[var(--color-success)]">Save 2 months</span>
            </button>
          </div>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-4 md:gap-4">
          {tiers.map((tier) => (
            <LiquidGlassCard
              key={tier.name}
              variant="surface"
              className={`relative flex flex-col p-6 ${
                tier.popular ? "border-[var(--color-accent)]" : ""
              }`}
            >
              {tier.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold text-white bg-[var(--color-accent)] rounded-full z-10">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-white">
                {tier.name}
              </h3>
              <div className="mt-4">
                <span className="text-3xl font-bold text-white">
                  {annual ? tier.annualPrice : tier.monthlyPrice}
                </span>
                <span className="ml-1 text-sm text-white/50">
                  /{annual ? "year" : "month"}
                </span>
              </div>
              <div className="mt-2 text-sm text-white/50">
                {tier.searches === -1
                  ? "Unlimited searches"
                  : `${tier.searches} searches/mo`}
                {" / "}
                {tier.cvGens === -1
                  ? "Unlimited CVs"
                  : `${tier.cvGens} CVs/mo`}
              </div>
              <ul className="mt-6 flex-1 flex flex-col gap-3">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                    <Check size={16} className="mt-0.5 text-[var(--color-success)] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`mt-8 w-full px-5 py-2.5 text-sm font-medium rounded-full transition-colors ${
                  tier.name === "Free"
                    ? "border border-white/20 text-white hover:bg-white/10"
                    : "text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]"
                }`}
              >
                {tier.name === "Free" ? "Get Started" : `Upgrade to ${tier.name}`}
              </button>
            </LiquidGlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}
