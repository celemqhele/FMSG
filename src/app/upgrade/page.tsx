"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { LiquidGlassCard } from "@/components/landing/liquid-glass-card";
import { Loader2, Check, ArrowLeft, Search, FileText, Crosshair } from "lucide-react";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { PLAN_PRICES, PLAN_LIMITS, calculatePFPrice, PF_DEFAULT_BY_TIER, formatPlanPrice, PLAN_TIER_NAMES } from "@/lib/plan-limits";
import { PFStepper } from "@/components/pricing/pf-stepper";

interface Tier {
  name: string;
  price: string;
  searches: number;
  cvGens: number;
  pfBalance: number;
  features: string[];
  popular: boolean;
}

function getTierFeatures(name: string, limits: { searches: number; cv_gens: number; pf_balance: number }): string[] {
  if (name === "Free") {
    return ["2 job searches", "Basic match scoring"];
  }
  const features = [
    `${limits.searches} job searches`,
    `${limits.cv_gens} tailored CVs`,
  ];
  if (name === "Seeker") features.push("Full match scoring", "Banned company filtering", `${limits.pf_balance} Persistent Finder round`);
  if (name === "Hunter") features.push("Priority AI processing", "Advanced filtering", `${limits.pf_balance} Persistent Finder rounds`);
  if (name === "Pro") features.push("Fastest AI processing", "All features unlocked", `${limits.pf_balance} Persistent Finder rounds`);
  return features;
}

const tiers: Tier[] = PLAN_TIER_NAMES.filter((n) => n !== "Free").map((name) => {
  const limits = PLAN_LIMITS[name] ?? { searches: 0, cv_gens: 0, pf_balance: 0 };
  return {
    name,
    price: formatPlanPrice(name),
    searches: limits.searches,
    cvGens: limits.cv_gens,
    pfBalance: limits.pf_balance,
    features: getTierFeatures(name, limits),
    popular: name === "Hunter",
  };
});

const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

function TopUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startTransition, endTransition } = useTransition();
  const supabase = createClient();
  const [processing, setProcessing] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [currentPlan, setCurrentPlan] = useState("free");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [paystackReady, setPaystackReady] = useState(false);
  const [pfCounts, setPfCounts] = useState<Record<string, number>>({});
  const [discountPercent, setDiscountPercent] = useState<number | null>(null);
  const [discountType, setDiscountType] = useState<string | null>(null);
  const [discountValidated, setDiscountValidated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    const discountParam = searchParams.get("discount");
    if (!discountParam) return;

    const type = discountParam === "first_order_85" ? "first_order_85" : discountParam === "first_order" ? "first_order_85" : discountParam === "reengagement_40" ? "reengagement_40" : null;
    if (!type) return;

    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: any } }) => {
      if (!session) return;
      try {
        const res = await fetch(`/api/discount/validate?type=${type}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.eligible) {
            setDiscountPercent(data.discount_percent);
            setDiscountType(type === "first_order_85" ? "FIRST_ORDER_85" : "REENGAGEMENT_40");
          }
        }
      } catch {}
      setDiscountValidated(true);
    });
  }, [searchParams, supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/"); return; }

    const [profileRes, subRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("subscriptions")
        .select("status, expiry_date")
        .eq("user_id", user.id)
        .in("status", ["active", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data);
      setCurrentPlan(profileRes.data.plan ?? "free");
    }

    if (subRes.data) {
      const hasActive = subRes.data.status === "active";
      const hasCancelledWithTime = subRes.data.status === "cancelled" && subRes.data.expiry_date && new Date(subRes.data.expiry_date) > new Date();
      setHasSubscription(hasActive || hasCancelledWithTime);
    }
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).PaystackPop) {
      setPaystackReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setPaystackReady(true);
    script.onerror = () => setPaystackReady(false);
    document.body.appendChild(script);
    const timeout = setTimeout(() => {
      if (!(window as any).PaystackPop) setPaystackReady(false);
    }, 10000);
    return () => clearTimeout(timeout);
  }, []);

  const handlePurchase = async (tier: Tier) => {
    if (tier.name === "Free") return;

    if (!PAYSTACK_PUBLIC_KEY) {
      alert("Payment system misconfigured. Please contact support.");
      return;
    }

    setProcessing(tier.name);

    if (hasSubscription) {
      const sRes = await supabase.auth.getSession();
      const session = sRes.data.session;
      if (!session) { setProcessing(null); alert("Session expired. Please refresh and try again."); return; }

      try {
        const extraPf = pfCounts[tier.name] ?? PF_DEFAULT_BY_TIER[tier.name] ?? 0;
        const basePf = PLAN_LIMITS[tier.name]?.pf_balance ?? 0;
        const totalPf = basePf + extraPf;
        const res = await fetch("/api/paystack/change-plan", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan: tier.name,
            billing_cycle: "once",
            pf_count: totalPf,
          }),
        });

        const data = await res.json();

        if (res.ok && data.ok) {
          setProcessing(null);
          setSuccessMsg(data.message ?? `${tier.name} credits added!`);
          setSuccessToast(true);
          setTimeout(() => {
            setSuccessToast(false);
            loadData();
          }, 2500);
        } else {
          setProcessing(null);
          alert(data.error ?? "Failed to process. Please contact support.");
        }
      } catch {
        setProcessing(null);
        alert("Failed to process. Please contact support.");
      }
    } else {
      if (!paystackReady || !(window as any).PaystackPop) {
        alert("Payment system is still loading. Please try again.");
        setProcessing(null);
        return;
      }

      const baseKobo = (PLAN_PRICES[tier.name] ?? 0);
      const extraPf = pfCounts[tier.name] ?? PF_DEFAULT_BY_TIER[tier.name] ?? 0;
      const basePf = PLAN_LIMITS[tier.name]?.pf_balance ?? 0;
      const totalPf = basePf + extraPf;
      const pfPriceZar = calculatePFPrice(extraPf);
      const pfKobo = extraPf * pfPriceZar * 100;
      let amount = baseKobo + pfKobo;

      if (discountPercent && discountType) {
        let effectiveDiscount = discountPercent;
        if (discountType === "FIRST_ORDER_85" && tier.name !== "Seeker") {
          effectiveDiscount = 60;
        }
        amount = Math.round(amount * (1 - effectiveDiscount / 100));
      }

      try {
        const sRes = await supabase.auth.getSession();
        const session = sRes.data.session;
        const email = session?.user?.email;
        if (!email) { setProcessing(null); alert("Session expired. Please refresh and try again."); return; }

        const fullName = (session?.user?.user_metadata?.full_name as string) || "";
        const nameParts = fullName.split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        const handler = (window as any).PaystackPop.setup({
          key: PAYSTACK_PUBLIC_KEY,
          email,
          first_name: firstName,
          last_name: lastName,
          amount,
          currency: "ZAR",
          ref: "FMSG-" + Date.now(),
          metadata: { plan: tier.name, billing_cycle: "once", pf_count: totalPf, ...(discountType ? { discount_code: discountType } : {}) },
          callback: function (response: { reference: string }) {
            fetch("/api/verify-payment", {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ reference: response.reference, plan: tier.name, billing_cycle: "once" }),
            }).then((verifyRes) => {
              if (verifyRes.ok) {
                setProcessing(null);
                setSuccessMsg("Payment successful!");
                setSuccessToast(true);
                setTimeout(() => { setSuccessToast(false); loadData(); }, 2000);
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
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => { startTransition(); router.push("/dashboard"); }} className="p-2 text-white/80 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-white">Top Up</h1>
        </div>

        {!loading && profile && (
          <div className="liquid-glass rounded-xl p-6 mb-8">
            <h2 className="text-sm font-medium text-white/70 mb-3">Your Balance</h2>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Search size={16} className="text-white/60" />
                <div>
                  <span className="text-xs text-white/70 block">Searches</span>
                  <span className="text-lg font-semibold text-white">{profile.search_balance ?? 0}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-white/60" />
                <div>
                  <span className="text-xs text-white/70 block">CV Generations</span>
                  <span className="text-lg font-semibold text-white">{profile.cv_generation_balance ?? 0}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Crosshair size={16} className="text-white/60" />
                <div>
                  <span className="text-xs text-white/70 block">PF Rounds</span>
                  <span className="text-lg font-semibold text-white">{profile.persistent_finder_balance ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {discountPercent && (
          <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-center">
            <p className="text-sm font-semibold text-green-400">
              {discountType === "FIRST_ORDER_85"
                ? "85% off Seeker / 60% off Hunter & Pro — first purchase only"
                : `${discountPercent}% off applied — welcome back offer`}
            </p>
            <p className="text-xs text-green-400/80 mt-1">
              This discount will be applied at checkout. Only valid for this purchase.
            </p>
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Choose a Package</h2>
          <p className="text-sm text-white/70 mt-1">
            Pay once, no auto-renewal. Credits stack on top of your current balance.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 md:gap-4">
          {tiers.map((tier) => {
            const pfCount = pfCounts[tier.name] ?? PF_DEFAULT_BY_TIER[tier.name] ?? 0;
            const pricePerRun = calculatePFPrice(pfCount);
            const pfTotal = pfCount * pricePerRun;
            const baseKobo = (PLAN_PRICES[tier.name] ?? 0);
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
                  <span className="text-3xl font-bold text-white">{grandTotal}</span>
                  <span className="ml-1 text-sm text-white/70">/once-off</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-white/60">
                  <span>{tier.price} base</span>
                  {pfCount > 0 && (
                    <>
                      <span>+</span>
                      <span>R{(pfTotal).toLocaleString("en-ZA", { minimumFractionDigits: 0 })} PF</span>
                    </>
                  )}
                </div>
                <div className="mt-2 text-sm text-white/70">
                  {tier.searches} searches / {tier.cvGens} CVs
                </div>
                <div className="mt-3">
                  <PFStepper
                    planName={tier.name}
                    value={pfCount}
                    onChange={(v) => setPfCounts((prev) => ({ ...prev, [tier.name]: v }))}
                  />
                </div>
                <ul className="mt-3 flex-1 flex flex-col gap-3">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-white/80">
                      <Check size={16} className="mt-0.5 text-[var(--color-success)] shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handlePurchase(tier)}
                  disabled={processing === tier.name}
                  className="mt-4 w-full px-5 py-2.5 text-sm font-medium rounded-full transition-colors flex items-center justify-center gap-2 text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                >
                  {processing === tier.name ? (
                    <><Loader2 size={14} className="animate-spin" /> Processing...</>
                  ) : (
                    `Get ${tier.name}`
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

export default function TopUpPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-white/80" />
      </div>
    }>
      <TopUpContent />
    </Suspense>
  );
}
