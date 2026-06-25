"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, Crosshair } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calculatePFPrice } from "@/lib/plan-limits";

interface PFPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PURCHASE_OPTIONS = [1, 3, 5] as const;

const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

export function PFPurchaseModal({ isOpen, onClose }: PFPurchaseModalProps) {
  const supabase = createClient();
  const [mounted, setMounted] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [paystackReady, setPaystackReady] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const mountedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
      setSuccessMessage("");
    }
  }, [isOpen]);

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

  const handlePurchase = async (runs: number) => {
    if (!PAYSTACK_PUBLIC_KEY) {
      alert("Paystack public key not configured. Please contact support.");
      return;
    }
    if (!paystackReady || !(window as any).PaystackPop) {
      alert("Payment system could not load. Try refreshing the page.");
      return;
    }

    setProcessing(runs);
    setSuccessMessage("");

    const sRes = await supabase.auth.getSession();
    const session = sRes.data.session;
    const email = session?.user?.email;
    if (!email) { setProcessing(null); alert("Session expired. Please refresh and try again."); return; }

    const pricePerRun = calculatePFPrice(runs);
    const amount = runs * pricePerRun * 100;

    const handler = (window as any).PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email,
      amount,
      currency: "ZAR",
      ref: "PF-" + Date.now(),
      metadata: { pf_runs: runs },
      callback: async (response: { reference: string }) => {
        try {
          const verifyRes = await fetch("/api/paystack/purchase-pf", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ reference: response.reference }),
          });
          if (verifyRes.ok) {
            setProcessing(null);
            setSuccessMessage(`Added ${runs} Persistent Finder run${runs > 1 ? "s" : ""}!`);
            window.dispatchEvent(new Event("refresh-balances"));
            setTimeout(() => { onClose(); }, 1500);
          } else {
            setProcessing(null);
            alert("Verification failed. Please contact support.");
          }
        } catch {
          setProcessing(null);
          alert("Verification failed. Please contact support.");
        }
      },
      onClose: () => setProcessing(null),
    });

    handler.openIframe();
  };

  if (!isOpen && !mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-300"
      style={{ opacity: mounted ? 1 : 0 }}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative">
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 z-10 p-1.5 bg-white border border-gray-300 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors shadow-lg"
        >
          <X size={20} />
        </button>
        <div
          className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm mx-4 text-center transition-all duration-300 ease-out shadow-xl"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Crosshair size={20} className="text-[var(--color-accent)]" />
            <h3 className="text-lg font-semibold text-gray-900">Buy PF Credits</h3>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            Persistent Finder runs: volume discounts apply
          </p>

          <div className="space-y-3">
            {PURCHASE_OPTIONS.map((runs) => {
              const price = calculatePFPrice(runs) * runs;
              return (
                <button
                  key={runs}
                  onClick={() => handlePurchase(runs)}
                  disabled={processing !== null}
                  className="w-full flex items-center justify-between px-5 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-gray-900">{runs} run{runs > 1 ? "s" : ""}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">R{calculatePFPrice(runs)}/run</span>
                    <span className="text-sm font-bold text-gray-900">
                      {processing === runs ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        `R${price}`
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {successMessage && (
            <p className="mt-4 text-sm text-[var(--color-success)]">{successMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
