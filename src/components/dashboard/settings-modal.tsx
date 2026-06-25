"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, CreditCard, Ban, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import "../landing/liquid-glass.css";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const supabase = createClient();
  const [mounted, setMounted] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showUpdateCardConfirm, setShowUpdateCardConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      loadSubscription();
    } else {
      const timer = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const loadSubscription = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setSubscription(data);
    setLoading(false);
  };

  const handleCancel = async () => {
    if (!subscription) return;
    setCancelling(true);
    setErrorMsg("");
    setSuccessMsg("");

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
        await loadSubscription();
      } else {
        setErrorMsg(data.error ?? "Failed to cancel.");
      }
    } catch {
      setErrorMsg("Failed to cancel subscription.");
    }
    setCancelling(false);
  };

  const handleUpdateCard = () => {
    setShowUpdateCardConfirm(true);
  };

  const confirmUpdateCard = async () => {
    setShowUpdateCardConfirm(false);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { return; }

    const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!PAYSTACK_PUBLIC_KEY) {
      setErrorMsg("Payment system not configured.");
      return;
    }

    if (!(window as any).PaystackPop) {
      setErrorMsg("Payment system could not load. Try refreshing the page.");
      return;
    }

    const email = session.user?.email;
    if (!email) { return; }

    setGeneratingLink(true);
    setErrorMsg("");

    const handler = (window as any).PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email,
      amount: 100,
      currency: "ZAR",
      ref: "FMSG-CARD-" + Date.now(),
      channels: ["card"],
      metadata: { purpose: "card_update" },
      onClose: () => setGeneratingLink(false),
      callback: (response: { reference: string }) => {
        fetch("/api/paystack/verify-card-update", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reference: response.reference }),
        }).then(async (verifyRes) => {
          const data = await verifyRes.json();
          if (verifyRes.ok && data.ok) {
            setSuccessMsg(data.message ?? "Card updated successfully.");
            await loadSubscription();
          } else {
            setErrorMsg(data.error ?? "Failed to verify card update.");
          }
          setGeneratingLink(false);
        }).catch(() => {
          setErrorMsg("Failed to verify card update.");
          setGeneratingLink(false);
        });
      },
    });

    handler.openIframe();
  };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!mounted && !isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[110] flex items-center justify-center p-4 transition-opacity duration-200 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div
        className={`relative w-full max-w-md mx-4 p-6 rounded-2xl liquid-glass transition-all duration-200 max-h-[85vh] overflow-y-auto ${
          isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={handleClose}
            className="p-1 text-white/80 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-white/80" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Subscription Info */}
            <div>
              <h3 className="text-sm font-medium text-white/80 mb-2">Subscription</h3>
              {subscription ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white">Plan</span>
                    <span className="text-white font-medium capitalize">{subscription.plan}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white">Status</span>
                    <span className={`font-medium capitalize ${
                      subscription.status === "active" ? "text-green-400" :
                      subscription.status === "past_due" ? "text-yellow-400" :
                      "text-red-400"
                    }`}>
                      {subscription.status === "active" ? "Active" :
                       subscription.status === "past_due" ? "Past Due" :
                       "Cancelled"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white">Billing</span>
                    <span className="text-white capitalize">{subscription.billing_cycle}</span>
                  </div>
                  {subscription.expiry_date && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white">Expires</span>
                      <span className="text-white">{new Date(subscription.expiry_date).toLocaleDateString()}</span>
                    </div>
                  )}

                  {subscription.status === "active" && (
                    <div className="flex flex-col gap-2 pt-2">
                      {showUpdateCardConfirm ? (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                          <p className="text-sm text-white/80 mb-3">
                            A <strong className="text-white">R1.00</strong> verification charge
                            will be placed on your card. This will be credited toward your next bill.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowUpdateCardConfirm(false)}
                              className="flex-1 px-3 py-2 text-sm font-medium text-white/80 bg-white/10 hover:bg-white/15 rounded-full transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={confirmUpdateCard}
                              className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-[var(--color-success)] hover:brightness-110 rounded-full transition-colors"
                            >
                              Continue
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={handleUpdateCard}
                          disabled={generatingLink}
                          className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors disabled:opacity-50"
                        >
                          {generatingLink ? (
                            <><Loader2 size={14} className="animate-spin" /> Opening Paystack...</>
                          ) : (
                            <><CreditCard size={14} /> Update Card</>
                          )}
                        </button>
                      )}
                      <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-full transition-colors disabled:opacity-50"
                      >
                        {cancelling ? (
                          <><Loader2 size={14} className="animate-spin" /> Cancelling...</>
                        ) : (
                          <><Ban size={14} /> Cancel Subscription</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-white/70 text-center py-4">
                  No active subscription.
                </div>
              )}

              {successMsg && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
                  <Check size={14} />
                  {successMsg}
                </div>
              )}

              {errorMsg && (
                <div className="mt-3 text-sm text-red-400">{errorMsg}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
