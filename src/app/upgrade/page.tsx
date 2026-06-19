"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { LiquidGlassCard } from "@/components/landing/liquid-glass-card";
import { Loader2, Check } from "lucide-react";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { PLAN_PRICES, PLAN_LIMITS } from "@/lib/plan-limits";

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

const tiers: Tier[] = [
  { name: "Free", monthlyPrice: "R0", annualPrice: "R0", searches: 3, cvGens: 1, pfBalance: 0, features: ["3 job searches per month", "1 tailored CV per month", "Basic match scoring"], popular: false },
  { name: "Seeker", monthlyPrice: "R79", annualPrice: "R790", searches: 25, cvGens: 5, pfBalance: 5, features: ["25 job searches per month", "5 tailored CVs per month", "Full match scoring", "Banned company filtering", "5 Persistent Finder rounds"], popular: false },
  { name: "Hunter", monthlyPrice: "R149", annualPrice: "R1,490", searches: 70, cvGens: 15, pfBalance: 15, features: ["70 job searches per month", "15 tailored CVs per month", "Priority AI processing", "Advanced filtering", "15 Persistent Finder rounds"], popular: true },
  { name: "Pro", monthlyPrice: "R249", annualPrice: "R2,490", searches: 200, cvGens: -1, pfBalance: 50, features: ["200 job searches per month", "Unlimited tailored CVs", "Fastest AI processing", "All features unlocked", "50 Persistent Finder rounds"], popular: false },
];

const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

export default function UpgradePage() {
  const router = useRouter();
  const { endTransition } = useTransition();
  const supabase = createClient();
  const [annual, setAnnual] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState(false);
  const [currentPlan, setCurrentPlan] = useState("free");
  const [paystackReady, setPaystackReady] = useState(false);

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    supabase.auth.getUser().then((res: { data: { user: { id: string } | null } }) => {
      const u = res.data.user;
      if (!u) { router.push("/"); return; }
      supabase.from("profiles").select("plan").eq("id", u.id).single().then((res: { data: any }) => {
        if (res.data) setCurrentPlan(res.data.plan ?? "free");
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
    console.log("Upgrade clicked", { plan: tier.name, billingCycle: annual ? "annual" : "monthly" });

    if (tier.name === "Free") return;
    if (tier.name.toLowerCase() === currentPlan) return;

    if (!PAYSTACK_PUBLIC_KEY) {
      console.log("Missing NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY");
      alert("Paystack not configured.");
      return;
    }

    console.log("typeof PaystackPop:", typeof (window as any).PaystackPop);

    if (!paystackReady || !(window as any).PaystackPop) {
      alert("Payment system loading. Please try again.");
      return;
    }

    const amount = (PLAN_PRICES[tier.name] ?? { monthly: 0, annual: 0 })[annual ? "annual" : "monthly"];
    setProcessing(tier.name);

    try {
      const sRes = await supabase.auth.getSession();
      const session = sRes.data.session;
      const email = session?.user?.email;
      if (!email) { setProcessing(null); return; }

      console.log("Initializing Paystack popup", { email, amount, key: PAYSTACK_PUBLIC_KEY ? "present" : "missing" });

      const handler = (window as any).PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email,
        amount,
        currency: "ZAR",
        ref: "FMSG-" + Date.now(),
        metadata: { plan: tier.name, billing_cycle: annual ? "annual" : "monthly" },
        callback: async (response: { reference: string }) => {
          console.log("Paystack callback fired", response);
          try {
            const verifyRes = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ reference: response.reference, plan: tier.name, billing_cycle: annual ? "annual" : "monthly" }),
            });
            if (verifyRes.ok) {
              setProcessing(null);
              setSuccessToast(true);
              setTimeout(() => { setSuccessToast(false); router.push("/dashboard"); }, 2000);
            } else {
              setProcessing(null);
              alert("Payment verification failed. Please contact support.");
            }
          } catch {
            setProcessing(null);
            alert("Payment verification failed. Please contact support.");
          }
        },
        onClose: () => {
          console.log("Paystack popup closed by user");
          setProcessing(null);
        },
      });

      handler.openIframe();
      console.log("openIframe called");
    } catch (err) {
      console.error("Paystack error:", err);
      setProcessing(null);
    }
  };

  return (
    <DashboardLayout>
      <PageTransitionWrapper>
      <div className="max-w-6xl mx-auto pt-8 pb-24">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white">Upgrade Your Plan</h1>
          <p className="mt-2 text-sm text-white/50">Choose the plan that fits your job search needs</p>
          <div className="mt-6 inline-flex items-center gap-1 p-1 rounded-full bg-white/10 border border-white/10">
            <button onClick={() => setAnnual(false)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${!annual ? "bg-white/15 text-white shadow-[var(--shadow-sm)]" : "text-white/60 hover:text-white"}`}>Monthly</button>
            <button onClick={() => setAnnual(true)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${annual ? "bg-white/15 text-white shadow-[var(--shadow-sm)]" : "text-white/60 hover:text-white"}`}>Annual <span className="text-[var(--color-success)]">Save 2 months</span></button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-4 md:gap-4">
          {tiers.map((tier) => {
            const isCurrent = tier.name.toLowerCase() === currentPlan;
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
                  <span className="text-3xl font-bold text-white">{annual ? tier.annualPrice : tier.monthlyPrice}</span>
                  <span className="ml-1 text-sm text-white/50">/{annual ? "year" : "month"}</span>
                </div>
                <div className="mt-2 text-sm text-white/50">
                  {tier.searches === -1 ? "Unlimited searches" : `${tier.searches} searches/mo`}
                  {" / "}
                  {tier.cvGens === -1 ? "Unlimited CVs" : `${tier.cvGens} CVs/mo`}
                  {tier.pfBalance > 0 && ` / ${tier.pfBalance} PF rounds`}
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
                  onClick={() => handleUpgrade(tier)}
                  disabled={isCurrent || processing === tier.name}
                  className={`mt-8 w-full px-5 py-2.5 text-sm font-medium rounded-full transition-colors flex items-center justify-center gap-2 ${
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
                    `Subscribe to ${tier.name}`
                  )}
                </button>
              </LiquidGlassCard>
            );
          })}
        </div>
      </div>

      {successToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-full bg-green-600 text-white text-sm font-medium shadow-lg animate-[auth-screen-in_300ms_ease-out]">
          Payment successful! Redirecting to dashboard...
        </div>
      )}
      </PageTransitionWrapper>
    </DashboardLayout>
  );
}
