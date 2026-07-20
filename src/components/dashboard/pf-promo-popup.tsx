"use client";

import { Crosshair, Search, Layers } from "lucide-react";

interface PFPromoPopupProps {
  isOpen: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

export function PFPromoPopup({ isOpen, onEnable, onDismiss }: PFPromoPopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onDismiss} />
      <div className="relative w-full max-w-md mx-4 animate-[auth-screen-in_300ms_ease-out]">
        <div className="liquid-glass rounded-2xl p-6 space-y-5">
          {/* Single Search section */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <Search size={18} className="text-white/70" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">You just ran a Single Search</h3>
              </div>
            </div>
            <p className="text-[13px] text-white/60 leading-relaxed">
              This checks 1 job title against 1 industry step. Good for quick, targeted searches when you know exactly what you&apos;re after.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/10" />

          {/* Persistent Finder section */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-accent)]/15 flex items-center justify-center shrink-0">
                <Layers size={18} className="text-[var(--color-accent)]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Persistent Finder searches wider</h3>
              </div>
            </div>
            <p className="text-[13px] text-white/60 leading-relaxed">
              It runs your search across all 5 job titles and all 5 industry steps automatically, from your hyper-niche to the broadest sector, so it finds roles a single search would miss entirely.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onDismiss}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white/60 border border-white/10 rounded-full hover:bg-white/5 transition-colors"
            >
              Maybe later
            </button>
            <button
              onClick={onEnable}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
            >
              <div className="flex items-center justify-center gap-2">
                <Crosshair size={14} />
                Try Persistent Finder
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
