"use client";

import { useState, useCallback } from "react";
import { Crosshair, Search, Layers } from "lucide-react";

interface MobilePFPromoPopupProps {
  isOpen: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

export function MobilePFPromoPopup({ isOpen, onEnable, onDismiss }: MobilePFPromoPopupProps) {
  const [dragY, setDragY] = useState(0);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setDragY(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > 100) onDismiss();
    else setDragY(0);
  }, [dragY, onDismiss]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={onDismiss}
      />
      <div
        className="relative bg-[#1C1C1E] rounded-t-[19px] transition-transform duration-300 ease-out overflow-y-auto"
        style={{
          maxHeight: "calc(100dvh - 2.5rem)",
          transform: `translateY(${dragY > 0 ? dragY : 0}px)`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-[5px] rounded-full bg-white/20" />
        </div>

        <div className="px-4 pb-5 space-y-4">
          {/* Single Search section */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <Search size={15} className="text-white/70" />
              </div>
              <h3 className="text-[13px] font-semibold text-white">You just ran a Single Search</h3>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              This checks 1 job title against 1 industry step. Good for quick, targeted searches when you know exactly what you&apos;re after.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/10" />

          {/* Persistent Finder section */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[var(--color-accent)]/15 flex items-center justify-center shrink-0">
                <Layers size={15} className="text-[var(--color-accent)]" />
              </div>
              <h3 className="text-[13px] font-semibold text-white">Persistent Finder searches wider</h3>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              It runs your search across all 5 job titles and all 5 industry steps automatically, from your hyper-niche to the broadest sector, so it finds roles a single search would miss entirely.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onDismiss}
              className="flex-1 h-11 flex items-center justify-center text-[12px] font-medium text-white/60 border border-white/10 rounded-full hover:bg-white/5 active:scale-[0.98] transition-all"
            >
              Maybe later
            </button>
            <button
              onClick={onEnable}
              className="flex-1 h-11 flex items-center justify-center gap-1.5 text-[12px] font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full active:scale-[0.98] transition-all"
            >
              <Crosshair size={13} />
              Try Persistent Finder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
