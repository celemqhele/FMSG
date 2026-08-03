"use client";

import { useEffect, useState } from "react";

interface BoardPromptProps {
  open: boolean;
  title: string;
  subtitle: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
}

export function BoardPrompt({
  open,
  title,
  subtitle,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: BoardPromptProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => setMounted(true), 10);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!open && !mounted) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
        style={{ opacity: open ? 1 : 0 }}
        onClick={onSecondary}
      />
      <div
        className={`relative w-full max-w-md mx-4 md:mx-auto mb-0 rounded-t-2xl md:rounded-2xl p-6 liquid-glass transition-all duration-200 ${
          open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full md:translate-y-2"
        }`}
      >
        <p className="text-base font-semibold text-white mb-1">{title}</p>
        <p className="text-sm text-white/70 mb-5">{subtitle}</p>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onPrimary}
            className="w-full px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
          >
            {primaryLabel}
          </button>
          <button
            onClick={onSecondary}
            className="w-full px-5 py-2.5 text-sm font-medium text-white/80 border border-white/20 rounded-full hover:bg-white/5 transition-colors"
          >
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
