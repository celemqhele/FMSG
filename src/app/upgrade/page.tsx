"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { LiquidGlassCard } from "@/components/landing/liquid-glass-card";
import { Loader2, Check, ArrowRight, ArrowLeft, CreditCard, Ban, Crosshair, ShoppingCart, X } from "lucide-react";
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

function daysRemaining(expiryDate: string): number {
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function ManageSubscriptionPage() {
  const router = useRouter();
  const { startTransition, endTransition } = useTransition();
  const supabase = createClient();
  const [annual, setAnnual] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [currentPlan, setCurrentPlan] = useState("free");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [paystackReady, setPaystackReady] = useState(false);
  const [pfCounts, setPfCounts] = useState<Record<string, number>>({});

  // Subscription overview state
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelMounted, setCancelMounted] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Buy PF credits
  const [buyPfQty, setBuyPfQty] = useState(1);
  const [buyingPf, setBuyingPf] = useState(false);

  useEffect(() => { endTransition(); }, [endTransition]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/"); return; }

    const [profileRes, subRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["active", "past_due", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data);
      const plan = profileRes.data.plan ?? "free";
      setCurrentPlan(plan);
    }

    if (subRes.data) {
      setSubscription(subRes.data);
      setHasSubscription(subRes.data.status === "active");
    }
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // --- Buy PF Credits ---
  const handleBuyPf = async () => {
    if (buyPfQty <= 0 || !PAYSTACK_PUBLIC_KEY) return;
    if (!paystackReady || !(window as any).PaystackPop) {
      alert("Payment system could not load. Try refreshing the page.");
      return;
    }

    setBuyingPf(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setBuyingPf(false); alert("Session expired. Please refresh and try again."); return; }

    const amount = buyPfQty * calculatePFPrice(buyPfQty) * 100;

    try {
      const handler = (window as any).PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: session.user?.email ?? "",
        amount,
        currency: "ZAR",
        ref: "PFTOPUP-" + Date.now(),
        metadata: { pf_runs: buyPfQty },
        callback: function (response: { reference: string }) {
          fetch("/api/paystack/purchase-pf", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ reference: response.reference }),
          }).then(async (verifyRes) => {
            const data = await verifyRes.json();
            if (verifyRes.ok) {
              setSuccessMsg(`Added ${buyPfQty} PF run${buyPfQty > 1 ? "s" : ""} to your balance!`);
              setSuccessToast(true);
              setTimeout(() => { setSuccessToast(false); }, 3000);
              loadData();
            } else {
              alert(data.error ?? "Verification failed. Contact support.");
            }
          }).catch(() => {
            alert("Verification failed. Contact support.");
          }).finally(() => {
            setBuyingPf(false);
          });
        },
        onClose: () => setBuyingPf(false),
      });
      handler.openIframe();
    } catch (err) {
      console.error("[BUY_PF] Paystack error:", err);
      setBuyingPf(false);
    }
  };

  // --- Cancel Subscription ---
  const handleCancel = () => {
    setShowCancelConfirm(true);
    setTimeout(() => setCancelMounted(true), 10);
  };

  const closeCancelConfirm = () => {
    setCancelMounted(false);
    setTimeout(() => setShowCancelConfirm(false), 200);
  };

  const confirmCancel = async () => {
    if (!subscription) return;
    closeCancelConfirm();
    setCancelling(true);
    setErrorMsg("");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setCancelling(false); return; }

    try {
      const res = await fetch("/api/cancel-subscription", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(data.message ?? "Subscription cancelled.");
        setSuccessToast(true);
        setTimeout(() => { setSuccessToast(false); }, 3000);
        loadData();
      } else {
        setErrorMsg(data.error ?? "Failed to cancel.");
      }
    } catch {
      setErrorMsg("Failed to cancel subscription.");
    }
    setCancelling(false);
  };

  // --- Update Card ---
  const handleUpdateCard = async () => {
    setGeneratingLink(true);
    setErrorMsg("");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setGeneratingLink(false); return; }

    try {
      const res = await fetch("/api/update-payment-method", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (res.ok && data.link) {
        window.open(data.link, "_blank");
      } else {
        setErrorMsg(data.error ?? "Failed to generate update link.");
      }
    } catch {
      setErrorMsg("Failed to generate update link.");
    }
    setGeneratingLink(false);
  };

  // --- Switch Plan ---
  const handleUpgrade = async (tier: Tier) => {
    if (tier.name === "Free") return;
    if (tier.name.toLowerCase() === currentPlan) return;

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
        const pfCount = pfCounts[tier.name] ?? PF_DEFAULT_BY_TIER[tier.name] ?? PLAN_LIMITS[tier.name]?.pf_balance ?? 0;
        const res = await fetch("/api/paystack/change-plan", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan: tier.name,
            billing_cycle: annual ? "annual" : "monthly",
            pf_count: pfCount,
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
            loadData();
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
        if (!email) { setProcessing(null); alert("Session expired. Please refresh and try again."); return; }

        const fullName = (session?.user?.user_metadata?.full_name as string) || "";
        const nameParts = fullName.split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        const planCode = PAYSTACK_PLAN_CODES[`${tier.name}_${annual ? "annual" : "monthly"}`] || "";

        if (!planCode) {
          console.warn("[UPGRADE] No Paystack plan code for", tier.name, annual ? "annual" : "monthly", "- payment will be one-time, not a subscription");
        }

        const handler = (window as any).PaystackPop.setup({
          key: PAYSTACK_PUBLIC_KEY,
          email,
          first_name: firstName,
          last_name: lastName,
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

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "text-green-400";
      case "past_due": return "text-yellow-400";
      default: return "text-red-400";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "active": return "Active";
      case "past_due": return "Past Due";
      default: return "Cancelled";
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
          <h1 className="text-2xl font-bold text-white">Manage Subscription</h1>
        </div>

        {!loading && subscription && (subscription.status !== "cancelled" || (subscription.expiry_date && new Date(subscription.expiry_date) > new Date())) && (
          <div className="liquid-glass rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Your Subscription</h2>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full ${
                subscription.status === "active" ? "bg-green-400/10 text-green-400" :
                subscription.status === "past_due" ? "bg-yellow-400/10 text-yellow-400" :
                "bg-red-400/10 text-red-400"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  subscription.status === "active" ? "bg-green-400" :
                  subscription.status === "past_due" ? "bg-yellow-400" : "bg-red-400"
                }`} />
                {statusLabel(subscription.status)}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <span className="text-xs text-white/70 block mb-1">Plan</span>
                <span className="text-xl font-bold text-white capitalize">{subscription.plan}</span>
              </div>

              <div>
                <span className="text-xs text-white/70 block mb-1">Billing</span>
                <span className="text-lg font-semibold text-white capitalize">
                  {subscription.billing_cycle === "annual" ? "Annual" : "Monthly"}
                </span>
                {subscription.amount && (
                  <span className="text-xs text-white/60 ml-2">
                    R{(subscription.amount / 100).toLocaleString("en-ZA")}/{subscription.billing_cycle === "annual" ? "yr" : "mo"}
                  </span>
                )}
              </div>

              {subscription.next_payment_date && (
                <div>
                  <span className="text-xs text-white/70 block mb-1">Next payment</span>
                  <span className="text-lg font-semibold text-white">
                    {new Date(subscription.next_payment_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              )}

                  {subscription.expiry_date && (
                <div>
                  <span className="text-xs text-white/70 block mb-1">
                    {subscription.status === "cancelled" ? "Access ends" : "Period ends"}
                  </span>
                  <span className="text-lg font-semibold text-white">
                    {new Date(subscription.expiry_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className="text-xs text-white/60 ml-2">
                    ({daysRemaining(subscription.expiry_date)} days left)
                  </span>
                </div>
              )}

              {subscription.created_at && (
                <div>
                  <span className="text-xs text-white/70 block mb-1">Started</span>
                  <span className="text-lg font-semibold text-white">
                    {new Date(subscription.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              )}
            </div>

            {/* Buy PF Credits */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <h3 className="text-sm font-medium text-white mb-3">Buy Extra PF Runs</h3>
              <p className="text-xs text-white/70 mb-3">Purchase one-time Persistent Finder runs that are added to your balance immediately. To change your monthly refill amount, switch to a different plan.</p>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setBuyPfQty(Math.max(1, buyPfQty - 1))}
                    disabled={buyPfQty <= 1 || buyingPf}
                    className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/20 text-white/90 hover:text-white hover:border-white/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="text-lg font-bold">−</span>
                  </button>
                  <div className="text-center min-w-[60px]">
                    <span className="text-2xl font-bold text-white tabular-nums">{buyPfQty}</span>
                    <span className="ml-1 text-sm text-white/70">runs</span>
                  </div>
                  <button
                    onClick={() => setBuyPfQty(buyPfQty + 1)}
                    disabled={buyingPf}
                    className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/20 text-white/90 hover:text-white hover:border-white/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="text-lg font-bold">+</span>
                  </button>
                </div>
                <span className="text-xs text-white/60">
                  R{(buyPfQty * calculatePFPrice(buyPfQty)).toLocaleString("en-ZA", { minimumFractionDigits: 0 })} total
                </span>
                <button
                  onClick={handleBuyPf}
                  disabled={buyingPf || buyPfQty <= 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
                >
                  {buyingPf ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
                  {buyingPf ? "Processing..." : "Buy Now"}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-6 border-t border-white/10 flex flex-wrap gap-3">
              <button
                onClick={handleUpdateCard}
                disabled={generatingLink || !hasSubscription}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors disabled:opacity-50"
              >
                {generatingLink ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                {generatingLink ? "Opening Paystack..." : "Update Card"}
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling || !hasSubscription}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-full transition-colors disabled:opacity-50"
              >
                {cancelling ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                {cancelling ? "Cancelling..." : "Cancel Subscription"}
              </button>
            </div>

            {/* Usage Balances */}
            {profile && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <h3 className="text-sm font-medium text-white mb-3">Current Usage</h3>
                <div className="flex flex-wrap gap-6">
                  <div>
                    <span className="text-xs text-white/70 block">Searches</span>
                    <span className="text-lg font-semibold text-white">{profile.search_balance ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-xs text-white/70 block">CV Generations</span>
                    <span className="text-lg font-semibold text-white">{profile.cv_generation_balance ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-xs text-white/70 block">PF Balance</span>
                    <span className="text-lg font-semibold text-white">{profile.persistent_finder_balance ?? 0}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && (!subscription || (subscription.status === "cancelled" && subscription.expiry_date && new Date(subscription.expiry_date) <= new Date())) && (
          <div className="liquid-glass rounded-xl p-6 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <Crosshair size={18} className="text-white/80" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">You&apos;re on the <span className="capitalize">{currentPlan}</span> plan</h2>
                <p className="text-sm text-white/70">Choose a plan below to unlock more features.</p>
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-400/10 border border-red-400/20 text-sm text-red-400">
            {errorMsg}
          </div>
        )}

        {/* Switch Plan Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Switch Plan</h2>
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/10 border border-white/10">
              <button onClick={() => setAnnual(false)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${!annual ? "bg-white/15 text-white shadow-[var(--shadow-sm)]" : "text-white/80 hover:text-white"}`}>Monthly</button>
              <button onClick={() => setAnnual(true)} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${annual ? "bg-white/15 text-white shadow-[var(--shadow-sm)]" : "text-white/80 hover:text-white"}`}>Annual <span className="text-[var(--color-success)]">Save 2 months</span></button>
            </div>
          </div>
          <p className="text-sm text-white/70 mb-6">
            {subscription && subscription.status === "cancelled" && subscription.expiry_date && new Date(subscription.expiry_date) > new Date()
              ? "Your subscription is cancelled. You can switch to a new plan or re-subscribe."
              : hasSubscription
              ? "Upgrades take effect immediately. Downgrades apply at the end of your current billing period."
              : "Select a plan to start your subscription."}
          </p>
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
                    <li key={f} className="flex items-start gap-2 text-sm text-white/80">
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

      {/* Cancel subscription confirmation modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center transition-opacity duration-300" style={{ opacity: cancelMounted ? 1 : 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={closeCancelConfirm} />
          <div className="relative">
            <button
              onClick={closeCancelConfirm}
              className="absolute -top-4 -right-4 z-10 p-1.5 bg-white border border-gray-300 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors shadow-lg"
            >
              <X size={20} />
            </button>
            <div
              className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm mx-4 text-center transition-all duration-300 ease-out shadow-xl"
              style={{ opacity: cancelMounted ? 1 : 0, transform: cancelMounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}
            >
              <p className="text-gray-900 font-semibold mb-2">Cancel {subscription?.plan ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1) : ""} plan?</p>
              <p className="text-sm text-gray-500 mb-4">
                You'll keep access to your current plan features until{" "}
                <strong className="text-gray-700">
                  {subscription?.expiry_date
                    ? new Date(subscription.expiry_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
                    : "the end of your billing period"}
                </strong>.
                After that, your account will switch to the Free tier.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={closeCancelConfirm}
                  className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-full hover:bg-gray-200 transition-colors"
                >
                  Keep Plan
                </button>
                <button
                  onClick={confirmCancel}
                  disabled={cancelling}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-red-500 rounded-full hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {cancelling ? <Loader2 size={14} className="animate-spin" /> : null}
                  {cancelling ? "Cancelling..." : "Yes, Cancel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </PageTransitionWrapper>
    </DashboardLayout>
  );
}
