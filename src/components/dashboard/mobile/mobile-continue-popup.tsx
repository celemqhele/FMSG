"use client";

import { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";

interface MobileContinuePopupProps {
  isOpen: boolean;
  message: string;
  onContinue: () => void;
  onCancel: () => void;
}

export function MobileContinuePopup({ isOpen, message, onContinue, onCancel }: MobileContinuePopupProps) {
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
      className="fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-300"
      style={{ opacity: mounted ? 1 : 0 }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="relative bg-white border border-gray-200 rounded-2xl p-5 w-[min(90vw,380px)] mx-4 text-center shadow-2xl transition-all duration-300 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)",
        }}
      >
        <p className="text-sm text-gray-800 font-medium mb-5 leading-relaxed">{message}</p>
        <button
          onClick={onContinue}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-black text-white text-sm font-medium active:scale-95 transition-all"
        >
          Continue
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
