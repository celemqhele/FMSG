"use client";

import { Search } from "lucide-react";

interface MobileSearchGuidancePopupProps {
  isOpen: boolean;
  onDismiss: () => void;
}

export function MobileSearchGuidancePopup({ isOpen, onDismiss }: MobileSearchGuidancePopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onDismiss} />
      <div className="relative w-[min(80vw,320px)] mx-3 animate-[auth-screen-in_300ms_ease-out]">
        <div className="bg-white rounded-[16px] p-5 text-center space-y-3 shadow-2xl">
          <div className="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
            <Search size={19} className="text-indigo-600" />
          </div>
          <div className="space-y-1">
            <h3 className="text-[14px] font-semibold text-gray-900">Ready to find jobs?</h3>
            <p className="text-[11px] text-gray-500">
              Tap the search bar above to find jobs matched to your profile.
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="h-10 px-6 flex items-center justify-center text-[11px] font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
