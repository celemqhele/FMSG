"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Crosshair, Minus, Plus, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calculatePFPrice } from "@/lib/plan-limits";

interface PFPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

export function PFPurchaseModal({ isOpen, onClose }: PFPurchaseModalProps) {
  const supabase = createClient();
  const [mounted, setMounted] = useState(false);
  const [quantity, setQuantity] = useState(4);
  const [processing, setProcessing] = useState(false);
  const [paystackReady, setPaystackReady] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      setQuantity(4);
      setSuccessMessage("");
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
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

  const handlePurchase = async () => {
    const runs = quantity;
    if (!PAYSTACK_PUBLIC_KEY) {
      alert("Paystack public key not configured. Please contact support.");
      return;
    }
    if (!paystackReady || !(window as any).PaystackPop) {
      alert("Payment system could not load. Try refreshing the page.");
      return;
    }

    setProcessing(true);
    setSuccessMessage("");

    const sRes = await supabase.auth.getSession();
    const session = sRes.data.session;
    const email = session?.user?.email;
    if (!email) { setProcessing(false); alert("Session expired. Please refresh and try again."); return; }

    const pricePerRun = calculatePFPrice(runs);
    const amount = runs * pricePerRun * 100;

    const handler = (window as any).PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email,
      amount,
      currency: "ZAR",
      ref: "PF-" + Date.now(),
      metadata: { pf_runs: runs },
      onClose: function () {
        setProcessing(false);
      },
      callback: function (response: { reference: string }) {
        fetch("/api/paystack/purchase-pf", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ reference: response.reference }),
        }).then(async (verifyRes) => {
          if (verifyRes.ok) {
            setProcessing(false);
            setSuccessMessage(`Added ${runs} Persistent Finder run${runs > 1 ? "s" : ""}!`);
            window.dispatchEvent(new Event("refresh-balances"));
            setTimeout(() => { onClose(); }, 1500);
          } else {
            setProcessing(false);
            alert("Verification failed. Please contact support.");
          }
        }).catch(() => {
          setProcessing(false);
          alert("Verification failed. Please contact support.");
        });
      },
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

          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1 || processing}
              className="w-10 h-10 flex items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:text-gray-900 hover:border-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Minus size={16} />
            </button>
            <div className="flex-1 text-center">
              <span className="text-2xl font-bold text-gray-900 tabular-nums">{quantity}</span>
              <span className="ml-1 text-sm text-gray-500">runs</span>
            </div>
            <button
              onClick={() => setQuantity(Math.min(25, quantity + 1))}
              disabled={quantity >= 25 || processing}
              className="w-10 h-10 flex items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:text-gray-900 hover:border-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="text-xs text-gray-400 mb-4">
            R{calculatePFPrice(quantity)}/run &middot; R{(quantity * calculatePFPrice(quantity)).toLocaleString("en-ZA", { minimumFractionDigits: 0 })} total
          </div>

          <button
            onClick={handlePurchase}
            disabled={processing || quantity <= 0}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-white bg-[var(--color-accent)] rounded-xl hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ShoppingCart size={16} />
                Buy Now
              </>
            )}
          </button>

          {successMessage && (
            <p className="mt-4 text-sm text-[var(--color-success)]">{successMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
