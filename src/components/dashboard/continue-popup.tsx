"use client";

import { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";

interface ContinuePopupProps {
  isOpen: boolean;
  message: string;
  onContinue: () => void;
  onCancel: () => void;
}

export function ContinuePopup({ isOpen, message, onContinue, onCancel }: ContinuePopupProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  if (!isOpen && !mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-200"
      style={{ opacity: mounted ? 1 : 0 }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white border border-gray-200 rounded-2xl p-6 max-w-sm mx-4 text-center shadow-2xl transition-all duration-200 ease-out"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0) scale(1)" : "translateY(6px) scale(0.98)" }}
      >
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <X size={18} />
        </button>

        <p className="text-sm text-gray-800 font-medium mb-5 leading-relaxed px-1">
          {message}
        </p>

        <button
          onClick={onContinue}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Continue
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
