"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Loader2, Check } from "lucide-react";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";

interface Tier {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  searches: number;
  cvGens: number;
  features: string[];
  popular: boolean;
}

const tiers: Tier[] = [
  { name: "Free", monthlyPrice: "R0", annualPrice: "R0", searches: 3, cvGens: 1, features: ["3 job searches per month", "1 tailored CV per month", "Basic match scoring"], popular: false },
  { name: "Seeker", monthlyPrice: "R79", annualPrice: "R790", searches: 25, cvGens: 5, features: ["25 job searches per month", "5 tailored CVs per month", "Full match scoring", "Banned company filtering"], popular: false },
  { name: "Hunter", monthlyPrice: "R149", annualPrice: "R1,490", searches: 70, cvGens: 15, features: ["70 job searches per month", "15 tailored CVs per month", "Priority AI processing", "Advanced filtering"], popular: true },
  { name: "Pro", monthlyPrice: "R249", annualPrice: "R2,490", searches: 200, cvGens: -1, features: ["200 job searches per month", "Unlimited tailored CVs", "Fastest AI processing", "All features unlocked"], popular: false },
];

const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
const PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  Seeker: { monthly: 7900, annual: 79000 },
  Hunter: { monthly: 14900, annual: 149000 },
  Pro: { monthly: 24900, annual: 249000 },
};

const PLAN_LIMITS: Record<string, { searches: number; cvGens: number }> = {
  Free: { searches: 3, cvGens: 1 },
  Seeker: { searches: 25, cvGens: 5 },
  Hunter: { searches: 70, cvGens: 15 },
  Pro: { searches: 200, cvGens: -1 },
};

export default function UpgradePage() {
  const router = useRouter();
  const { endTransition } = useTransition();
  const supabase = createClient();
  const [annual, setAnnual] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState(false);
  const [currentPlan, setCurrentPlan] = useState("free");
  const paystackLoaded = useRef(false);

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
    if (!(window as any).PaystackPop && !paystackLoaded.current) {
      paystackLoaded.current = true;
      const script = document.createElement("script");
      script.src = "https://js.paystack.co/v1/inline.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const handleUpgrade = (tier: Tier) => {
    if (tier.name === "Free") return;
    if (tier.name.toLowerCase() === currentPlan) return;
    if (!PAYSTACK_PUBLIC_KEY) { alert("Paystack not configured."); return; }

    const amount = annual ? PLAN_PRICES[tier.name].annual : PLAN_PRICES[tier.name].monthly;

    if (!(window as any).PaystackPop) {
      alert("Payment system loading. Please try again.");
      return;
    }

    setProcessing(tier.name);

    // Get user email synchronously from cached session
    supabase.auth.getSession().then((sRes: any) => {
      const session = sRes.data.session;
      const email = session?.user?.email;
      if (!email) { setProcessing(null); return; }

      const handler = (window as any).PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email,
        amount,
        currency: "ZAR",
        ref: "FMSG-" + Date.now(),
        metadata: { plan: tier.name, billing_cycle: annual ? "annual" : "monthly" },
        callback: async (response: { reference: string }) => {
          // Verify server-side
          const verifyRes = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ reference: response.reference, plan: tier.name, billing_cycle: annual ? "annual" : "monthly" }),
          });
          setProcessing(null);
          if (verifyRes.ok) {
            setSuccessToast(true);
            setTimeout(() => { setSuccessToast(false); router.push("/dashboard"); }, 2000);
          } else {
            alert("Payment verification failed. Please contact support.");
          }
        },
        onClose: () => setProcessing(null),
      });
      handler.openIframe();
    });
  };

  return (
    <DashboardLayout>
      <PageTransitionWrapper>
      <div className="max-w-6xl mx-auto pt-8 pb-24">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Upgrade Your Plan</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Choose the plan that fits your job search needs</p>
          <div className="mt-6 inline-flex items-center gap-1 p-1 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)]">
            <button onClick={() => setAnnual(false)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${!annual ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}>Monthly</button>
            <button onClick={() => setAnnual(true)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${annual ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}>Annual <span className="text-green-500">Save 2 months</span></button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-4 md:gap-4">
          {tiers.map((tier) => {
            const isCurrent = tier.name.toLowerCase() === currentPlan;
            return (
              <div key={tier.name} className={`relative bg-white dark:bg-[#1C1C1E] shadow-md rounded-xl p-6 flex flex-col ${tier.popular ? "ring-2 ring-[var(--color-accent)]" : ""}`}>
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold text-white bg-[var(--color-accent)] rounded-full z-10">Most popular</span>
                )}
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{tier.name}</h3>
                <div className="mt-4">
                  <span className="text-3xl font-bold text-[var(--color-text-primary)]">{annual ? tier.annualPrice : tier.monthlyPrice}</span>
                  <span className="ml-1 text-sm text-[var(--color-text-secondary)]">/{annual ? "year" : "month"}</span>
                </div>
                <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {tier.searches === -1 ? "Unlimited searches" : `${tier.searches} searches/mo`}
                  {" / "}
                  {tier.cvGens === -1 ? "Unlimited CVs" : `${tier.cvGens} CVs/mo`}
                </div>
                <ul className="mt-6 flex-1 flex flex-col gap-3">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
                      <Check size={16} className="mt-0.5 text-green-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(tier)}
                  disabled={isCurrent || processing === tier.name}
                  className={`mt-8 w-full px-5 py-2.5 text-sm font-medium rounded-full transition-colors flex items-center justify-center gap-2 ${
                    tier.name === "Free"
                      ? "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/5 dark:hover:bg-white/5"
                      : "text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                  }`}
                >
                  {processing === tier.name ? (
                    <><Loader2 size={14} className="animate-spin" /> Processing...</>
                  ) : isCurrent ? (
                    "Current Plan"
                  ) : (
                    tier.name === "Free" ? "Current Plan" : `Upgrade to ${tier.name}`
                  )}
                </button>
              </div>
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
