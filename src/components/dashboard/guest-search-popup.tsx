"use client";

import { X } from "lucide-react";

interface GuestSearchPopupProps {
  isOpen: boolean;
  resultCount: number;
  onSignUp: () => void;
  onDismiss: () => void;
}

export function GuestSearchPopup({ isOpen, resultCount, onSignUp, onDismiss }: GuestSearchPopupProps) {
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
            You&apos;re seeing 3 of {resultCount} results
          </p>
          <p className="text-sm text-white/80">
            Sign up for free and get <strong className="text-white">+1 bonus search</strong> on top of the Free plan. Unlock all results, save jobs, and access your history across devices.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={onSignUp}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Sign Up Free
            </button>
            <button
              onClick={onDismiss}
              className="px-5 py-2.5 text-sm font-medium text-white/70 bg-transparent border border-white/20 rounded-full hover:bg-white/10 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
