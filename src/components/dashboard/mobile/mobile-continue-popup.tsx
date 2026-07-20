"use client";

import { useState, useEffect } from "react";
import { ArrowRight, Eye } from "lucide-react";

interface MobileContinuePopupProps {
  isOpen: boolean;
  message: string;
  onContinue: () => void;
  onShowResults?: () => void;
  onCancel: () => void;
}

export function MobileContinuePopup({ isOpen, message, onContinue, onShowResults, onCancel }: MobileContinuePopupProps) {
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
        className="relative bg-white border border-gray-200 rounded-xl p-4 w-[min(80vw,320px)] mx-3 text-center shadow-2xl transition-all duration-300 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)",
        }}
      >
        <p className="text-[11px] text-gray-800 font-medium mb-4 leading-relaxed">{message}</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onContinue}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-[10px] bg-black text-white text-[11px] font-medium active:scale-95 transition-all"
          >
            Continue
            <ArrowRight size={11} />
          </button>
          {onShowResults && (
            <button
              onClick={onShowResults}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-1.5 text-[11px] font-medium text-gray-500 active:text-gray-800 transition-colors"
            >
              <Eye size={10} />
              Show results now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
