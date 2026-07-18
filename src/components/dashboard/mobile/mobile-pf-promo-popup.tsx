"use client";

import { Crosshair } from "lucide-react";

interface MobilePFPromoPopupProps {
  isOpen: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

export function MobilePFPromoPopup({ isOpen, onEnable, onDismiss }: MobilePFPromoPopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onDismiss} />
      <div className="relative w-[min(80vw,320px)] mx-3 animate-[auth-screen-in_300ms_ease-out]">
        <div className="bg-white rounded-[16px] p-5 text-center space-y-3 shadow-2xl">
          <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <Crosshair size={19} className="text-amber-600" />
          </div>
          <div className="space-y-1">
            <h3 className="text-[14px] font-semibold text-gray-900">Want more results?</h3>
            <p className="text-[11px] text-gray-500">
              Persistent Finder searches multiple rounds to find hidden job matches you&apos;d otherwise miss.
            </p>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={onDismiss}
              className="flex-1 h-10 flex items-center justify-center text-[11px] font-medium text-gray-600 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
            >
              Not now
            </button>
            <button
              onClick={onEnable}
              className="flex-1 h-10 flex items-center justify-center text-[11px] font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
            >
              Enable PF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
