"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

interface MobileErrorPopupProps {
  message: string | null;
  onClose: () => void;
}

export function MobileErrorPopup({ message, onClose }: MobileErrorPopupProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (message) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [message]);

  const handleClose = useCallback(() => {
    setMounted(false);
    setTimeout(() => onClose(), 250);
  }, [onClose]);

  useEffect(() => {
    if (!message) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [message, handleClose]);

  if (!message) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Error message"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        style={{ transition: "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)", opacity: mounted ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className={`relative w-[min(90vw,380px)] mx-4 transition-all duration-200 ${mounted ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
        style={{ transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 250ms ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white rounded-[20px] p-8 shadow-[var(--shadow-lg)]">
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center"
              style={{ animation: "error-popup-icon-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
            >
              <AlertTriangle size={28} className="text-red-500" strokeWidth={1.5} />
            </div>
            <p
              className="text-sm text-center leading-relaxed text-gray-700 max-w-xs"
              style={{ animation: "error-popup-text-in 350ms ease-out 100ms both" }}
            >
              {message}
            </p>
            <button
              onClick={handleClose}
              className="mt-2 h-12 px-8 flex items-center justify-center bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 active:scale-[0.97] transition-all duration-150"
              style={{ animation: "error-popup-btn-in 350ms ease-out 200ms both" }}
            >
              OKAY
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
