"use client";

import { Search } from "lucide-react";

interface SearchGuidancePopupProps {
  isOpen: boolean;
  onDismiss: () => void;
}

export function SearchGuidancePopup({ isOpen, onDismiss }: SearchGuidancePopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onDismiss} />
      <div className="relative w-full max-w-sm mx-4 animate-[auth-screen-in_300ms_ease-out]">
        <div className="bg-white rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
            <Search size={24} className="text-indigo-600" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold text-gray-900">Ready to find jobs?</h3>
            <p className="text-sm text-gray-500">
              Click the search bar above to find jobs matched to your profile.
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="px-6 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
