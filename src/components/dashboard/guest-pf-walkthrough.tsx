"use client";

import { useState } from "react";
import { ArrowRight, Crosshair, Sparkles, Search, Zap } from "lucide-react";

interface PFWalkthroughProps {
  isOpen: boolean;
  onStart: () => void;
  onDismiss: () => void;
}

const steps = [
  {
    icon: Crosshair,
    title: "You've got a free Persistent Finder search",
    body: "This isn't a basic job search. Persistent Finder runs multiple search rounds with different queries to surface roles that regular search engines miss. It's our most powerful tool — and your first one is free.",
  },
  {
    icon: Search,
    title: "How it works",
    body: "Instead of searching once, PF generates multiple targeted queries, searches each one, and AI-scores every result. You get higher-quality matches with deeper analysis — not just keyword hits. One PF search can find what would take hours of manual searching.",
  },
  {
    icon: Sparkles,
    title: "Ready to find your next job?",
    body: "Your free PF search is a one-time, lifetime allowance. It'll search the last 7 days of job listings with multiple rounds to find the best matches. Sign up anytime to save your results and unlock more.",
  },
];

export function GuestPFWalkthrough({ isOpen, onStart, onDismiss }: PFWalkthroughProps) {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onDismiss} />
      <div className="relative liquid-glass rounded-2xl p-6 max-w-md mx-4 space-y-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--color-accent)]/20 flex items-center justify-center shrink-0">
            <current.icon size={20} className="text-[var(--color-accent)]" />
          </div>
          <div className="flex-1">
            <div className="flex gap-1 mb-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-[var(--color-accent)]" : "bg-white/20"}`}
                />
              ))}
            </div>
            <p className="text-xs text-white/60">Step {step + 1} of {steps.length}</p>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">{current.title}</h3>
          <p className="text-sm text-white/80 leading-relaxed">{current.body}</p>
        </div>

        <div className="flex gap-3 justify-between">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-3">
            {!isLast && (
              <button
                onClick={() => setStep(step + 1)}
                className="px-5 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors flex items-center gap-1.5"
              >
                Next
                <ArrowRight size={14} />
              </button>
            )}
            {isLast && (
              <button
                onClick={onStart}
                className="px-5 py-2 text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors flex items-center gap-1.5"
              >
                <Zap size={14} />
                Start using PF
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
