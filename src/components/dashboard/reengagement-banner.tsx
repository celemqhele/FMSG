"use client";

import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";

interface ReengagementBannerProps {
  discountPercent: number;
}

export function ReengagementBanner({ discountPercent }: ReengagementBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="liquid-glass rounded-xl p-4 mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--color-accent)]/20 flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-[var(--color-accent)]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            It&apos;s been a while! Come back and get {discountPercent}% off.
          </p>
          <p className="text-xs text-white/60">One-time offer — only pay when you&apos;re job hunting.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => router.push(`/upgrade?discount=reengagement_${discountPercent}`)}
          className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          Get {discountPercent}% Off
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-white/40 hover:text-white/80 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
