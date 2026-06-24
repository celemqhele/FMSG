"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { LiquidGlassCard } from "@/components/landing/liquid-glass-card";
import { Loader2, Check, ArrowRight } from "lucide-react";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { PLAN_PRICES, PLAN_LIMITS, calculatePFPrice, PF_DEFAULT_BY_TIER, formatPlanPrice, PAYSTACK_PLAN_CODES, PLAN_TIER_NAMES } from "@/lib/plan-limits";
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

function getTierFeatures(name: string, limits: { searches: number; cv_gens: number; pf_balance: number }): string[] {
  if (name === "Free") {
    return ["1 job search per month", "Basic match scoring"];
  }
  const features = [
    `${limits.searches} job searches per month`,
    `${limits.cv_gens} tailored CVs per month`,
  ];
  if (name === "Seeker") features.push("Full match scoring", "Banned company filtering", `${limits.pf_balance} Persistent Finder rounds`);
  if (name === "Hunter") features.push("Priority AI processing", "Advanced filtering", `${limits.pf_balance} Persistent Finder rounds`);
  if (name === "Pro") features.push("Fastest AI processing", "All features unlocked", `${limits.pf_balance} Persistent Finder rounds`);
  return features;
}

const tiers: Tier[] = PLAN_TIER_NAMES.map((name) => {
  const limits = PLAN_LIMITS[name] ?? { searches: 0, cv_gens: 0, pf_balance: 0 };
  return {
    name,
    monthlyPrice: name === "Free" ? "R0" : formatPlanPrice(name, "monthly"),
    annualPrice: name === "Free" ? "R0" : formatPlanPrice(name, "annual"),
    searches: limits.searches,
    cvGens: limits.cv_gens,
    pfBalance: limits.pf_balance,
    features: getTierFeatures(name, limits),
    popular: name === "Hunter",
  };
});

const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

export default function ManageSubscriptionPage() {
  const router = useRouter();
  const { endTransition } = useTransition();
  const supabase = createClient();
  const [annual, setAnnual] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [currentPlan, setCurrentPlan] = useState("free");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [paystackReady, setPaystackReady] = useState(false);
  const [pfCounts, setPfCounts] = useState<Record<string, number>>({});

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    supabase.auth.getUser().then((res: { data: { user: { id: string } | null } }) => {
      const u = res.data.user;
      if (!u) { router.push("/"); return; }
      supabase.from("profiles").select("plan").eq("id", u.id).single().then((res: { data: any }) => {
        if (res.data) {
          const plan = res.data.plan ?? "free";
          setCurrentPlan(plan);
          if (plan !== "free") {
            supabase
              .from("subscriptions")
              .select("id")
              .eq("user_id", u.id)
              .eq("status", "active")
              .limit(1)
              .maybeSingle()
              .then((subRes: any) => {
                setHasSubscription(!!subRes.data);
              });
          }
        }
      });
    });
  }, [router, supabase]);

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

  const handleUpgrade = async (tier: Tier) => {
    if (tier.name === "Free") return;
    if (tier.name.toLowerCase() === currentPlan) return;

    if (!PAYSTACK_PUBLIC_KEY) {
      alert("Payment system misconfigured. Please contact support.");
      return;
    }

    setProcessing(tier.name);

    if (hasSubscription) {
      // Use change-plan API for existing subscribers
      const sRes = await supabase.auth.getSession();
      const session = sRes.data.session;
      if (!session) { setProcessing(null); return; }

      try {
        const res = await fetch("/api/paystack/change-plan", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan: tier.name,
            billing_cycle: annual ? "annual" : "monthly",
          }),
        });

        const data = await res.json();

        if (res.ok && data.ok) {
          setProcessing(null);
          if (data.type === "downgrade") {
            setSuccessMsg(data.message ?? "Plan change scheduled.");
          } else {
            setSuccessMsg(`Upgraded to ${tier.name}!`);
          }
          setSuccessToast(true);
          setTimeout(() => {
            setSuccessToast(false);
            router.push("/welcome?plan=" + tier.name.toLowerCase());
          }, 2500);
        } else {
          setProcessing(null);
          alert(data.error ?? "Failed to change plan. Please contact support.");
        }
      } catch {
        setProcessing(null);
        alert("Failed to change plan. Please contact support.");
      }
    } else {
      // First-time purchase — use Paystack popup
      if (!paystackReady || !(window as any).PaystackPop) {
        alert("Payment system is still initializing. Please wait a second and try again.");
        setProcessing(null);
        return;
      }

      const baseKobo = (PLAN_PRICES[tier.name] ?? { monthly: 0, annual: 0 })[annual ? "annual" : "monthly"];
      const pfCount = pfCounts[tier.name] ?? PF_DEFAULT_BY_TIER[tier.name] ?? 0;
      const pfPriceZar = calculatePFPrice(pfCount);
      const pfKobo = pfCount * pfPriceZar * 100 * (annual ? 12 : 1);
      const amount = baseKobo + pfKobo;

      try {
        const sRes = await supabase.auth.getSession();
        const session = sRes.data.session;
        const email = session?.user?.email;
        if (!email) { setProcessing(null); return; }

        const planCode = PAYSTACK_PLAN_CODES[`${tier.name}_${annual ? "annual" : "monthly"}`] || "";

        const handler = (window as any).PaystackPop.setup({
          key: PAYSTACK_PUBLIC_KEY,
          email,
          amount,
          currency: "ZAR",
          ref: "FMSG-" + Date.now(),
          plan: planCode,
          metadata: { plan: tier.name, billing_cycle: annual ? "annual" : "monthly", pf_count: pfCount },
          callback: function (response: { reference: string }) {
            fetch("/api/verify-payment", {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ reference: response.reference, plan: tier.name, billing_cycle: annual ? "annual" : "monthly" }),
            }).then((verifyRes) => {
              if (verifyRes.ok) {
                setProcessing(null);
                setSuccessMsg("Payment successful!");
                setSuccessToast(true);
                setTimeout(() => { setSuccessToast(false); router.push("/welcome?plan=" + tier.name.toLowerCase()); }, 2000);
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
      } catch (err) {
        console.error("Paystack error:", err);
        setProcessing(null);
      }
    }
  };

  return (
    <DashboardLayout>
      <PageTransitionWrapper>
      <div className="max-w-6xl mx-auto pt-8 pb-24">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white">Manage Subscription</h1>
          <p className="mt-2 text-sm text-white/50">Switch plans or upgrade your subscription</p>
          <div className="mt-6 inline-flex items-center gap-1 p-1 rounded-full bg-white/10 border border-white/10">
            <button onClick={() => setAnnual(false)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${!annual ? "bg-white/15 text-white shadow-[var(--shadow-sm)]" : "text-white/60 hover:text-white"}`}>Monthly</button>
            <button onClick={() => setAnnual(true)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${annual ? "bg-white/15 text-white shadow-[var(--shadow-sm)]" : "text-white/60 hover:text-white"}`}>Annual <span className="text-[var(--color-success)]">Save 2 months</span></button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-4 md:gap-4">
          {tiers.map((tier) => {
            const isCurrent = tier.name.toLowerCase() === currentPlan;
            const pfCount = pfCounts[tier.name] ?? PF_DEFAULT_BY_TIER[tier.name] ?? 0;
            const pricePerRun = calculatePFPrice(pfCount);
            const pfTotal = pfCount * pricePerRun * (annual ? 12 : 1);
            const basePrice = annual ? tier.annualPrice : tier.monthlyPrice;
            const baseKobo = (PLAN_PRICES[tier.name] ?? { monthly: 0, annual: 0 })[annual ? "annual" : "monthly"];
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
                  <span className="ml-1 text-sm text-white/50">/{annual ? "year" : "month"}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-white/40">
                  <span>{basePrice}/{annual ? "yr" : "mo"}</span>
                  {pfCount > 0 && (
                    <>
                      <span>+</span>
                      <span>R{(pfTotal).toLocaleString("en-ZA", { minimumFractionDigits: 0 })} PF</span>
                    </>
                  )}
                </div>
                <div className="mt-2 text-sm text-white/50">
                  {tier.searches} searches / {tier.cvGens} CVs
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
                    <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                      <Check size={16} className="mt-0.5 text-[var(--color-success)] shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(tier)}
                  disabled={isCurrent || processing === tier.name}
                  className={`mt-4 w-full px-5 py-2.5 text-sm font-medium rounded-full transition-colors flex items-center justify-center gap-2 ${
                    tier.name === "Free"
                      ? "border border-white/20 text-white hover:bg-white/10"
                      : "text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                  }`}
                >
                  {processing === tier.name ? (
                    <><Loader2 size={14} className="animate-spin" /> Processing...</>
                  ) : isCurrent ? (
                    "Current Plan"
                  ) : tier.name === "Free" ? (
                    "Free"
                  ) : (
                    `Switch to ${tier.name}`
                  )}
                </button>
              </LiquidGlassCard>
            );
          })}
        </div>
      </div>

      {successToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-full bg-green-600 text-white text-sm font-medium shadow-lg animate-[auth-screen-in_300ms_ease-out]">
          <div className="flex items-center gap-2">
            <Check size={16} />
            {successMsg ?? "Success!"}
          </div>
        </div>
      )}
      </PageTransitionWrapper>
    </DashboardLayout>
  );
}
