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
      <div className="relative w-[min(90vw,380px)] mx-4 animate-[auth-screen-in_300ms_ease-out]">
        <div className="bg-white rounded-[20px] p-6 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <Crosshair size={24} className="text-amber-600" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold text-gray-900">Want more results?</h3>
            <p className="text-sm text-gray-500">
              Persistent Finder searches multiple rounds to find hidden job matches you&apos;d otherwise miss.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onDismiss}
              className="flex-1 h-12 flex items-center justify-center text-sm font-medium text-gray-600 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
            >
              Not now
            </button>
            <button
              onClick={onEnable}
              className="flex-1 h-12 flex items-center justify-center text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
            >
              Enable PF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
