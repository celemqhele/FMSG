"use client";

import { useState, useEffect } from "react";
import { Crosshair, X } from "lucide-react";

interface PFPromoBannerProps {
  variant: "low-results" | "low-score";
  resultsCount: number;
  avgScore?: number;
  onDismiss?: () => void;
}

const SESSION_KEY = "pf_promo_dismissed";

export function PFPromoBanner({ variant, resultsCount, avgScore, onDismiss }: PFPromoBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check sessionStorage
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored === "true") {
        setDismissed(true);
        return;
      }
    } catch {}

    const show =
      variant === "low-results" ? resultsCount > 0 && resultsCount < 3
      : variant === "low-score" ? resultsCount > 0 && (avgScore ?? 0) < 60
      : false;

    if (show) {
      requestAnimationFrame(() => setVisible(true));
    }
  }, [variant, resultsCount, avgScore]);

  const handleDismiss = () => {
    try { sessionStorage.setItem(SESSION_KEY, "true"); } catch {}
    setVisible(false);
    setDismissed(true);
    onDismiss?.();
  };

  if (dismissed || !visible) return null;

  const message = variant === "low-results"
    ? "Only {count} jobs found. Persistent Finder searches more rounds to find hidden matches."
    : "Most scores are below 60%. More PF rounds could surface better matches.";

  const displayMessage = message.replace("{count}", String(resultsCount));

  return (
    <div
      className="min-h-[48px] flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 animate-[enter_0.35s_ease-out_forwards]"
    >
      <div className="flex items-center gap-2 text-sm text-white">
        <Crosshair size={14} className="text-[var(--color-accent)] shrink-0" />
        <span>{displayMessage}</span>
      </div>
      <button
        onClick={handleDismiss}
        className="p-2.5 text-white/60 hover:text-white transition-colors shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}
