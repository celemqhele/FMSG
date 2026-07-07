"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";

interface FirstSearchDiscountPopupProps {
  isOpen: boolean;
  onDismiss: () => void;
}

export function FirstSearchDiscountPopup({ isOpen, onDismiss }: FirstSearchDiscountPopupProps) {
  const router = useRouter();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ opacity: 1 }}>
      <div className="absolute inset-0 bg-black/60" onClick={onDismiss} />
      <div className="relative">
        <button
          onClick={onDismiss}
          className="absolute -top-4 -right-4 z-10 p-1.5 bg-[var(--color-accent)] rounded-full text-white/80 hover:text-white transition-colors shadow-lg"
        >
          <X size={20} />
        </button>
        <div className="liquid-glass rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4 shadow-2xl">
          <p className="text-white font-semibold text-lg">
            You&apos;ve used up your searches
          </p>
          <p className="text-sm text-white/80">
            Upgrade now and get <strong className="text-[var(--color-success)]">50% off</strong> your first order. This is a one-time offer — you only pay when you&apos;re actually job hunting.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => { onDismiss(); router.push("/upgrade?discount=first_order"); }}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-success)] rounded-full hover:brightness-110 transition-colors"
            >
              Get 50% Off
            </button>
            <button
              onClick={onDismiss}
              className="px-5 py-2.5 text-sm font-medium text-white/70 bg-transparent border border-white/20 rounded-full hover:bg-white/10 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
