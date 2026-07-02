"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight } from "lucide-react";

interface ContinuePopupProps {
  isOpen: boolean;
  message: string;
  onContinue: () => void;
  onCancel: () => void;
}

export function ContinuePopup({ isOpen, message, onContinue, onCancel }: ContinuePopupProps) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"closed" | "entering" | "open">("closed");

  useEffect(() => {
    if (isOpen) {
      setPhase("entering");
      const t = setTimeout(() => setPhase("open"), 50);
      return () => clearTimeout(t);
    } else {
      setPhase("closed");
      setMounted(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (phase === "entering") {
      requestAnimationFrame(() => setMounted(true));
    }
  }, [phase]);

  if (phase === "closed" && !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-300 ease-out"
      style={{ opacity: (phase === "open" && mounted) ? 1 : 0 }}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-out"
        style={{ opacity: (phase === "open" && mounted) ? 1 : 0 }}
      />
      <div
        className="relative bg-white border border-gray-200 rounded-2xl p-6 max-w-sm mx-4 text-center shadow-2xl transition-all duration-300 ease-out"
        style={{
          opacity: (phase === "open" && mounted) ? 1 : 0,
          transform: (phase === "open" && mounted) ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)",
        }}
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
    </div>,
    document.body
  );
}
