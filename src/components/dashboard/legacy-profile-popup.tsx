"use client";

import { Check, Layers, Loader2, Sparkles } from "lucide-react";
import type { LegacyUpgradeResult, LegacyUpgradeStatus } from "@/lib/legacy-profile";

interface LegacyProfilePopupProps {
  isOpen: boolean;
  /** Titles that survive the upgrade (at most two). */
  titles: string[];
  /** How many titles the trim retires. */
  retiredTitleCount: number;
  status: LegacyUpgradeStatus;
  result: LegacyUpgradeResult | null;
  error: string;
  onUpgrade: () => void;
  onReview: () => void;
  onDismiss: () => void;
}

/**
 * One-time prompt for profiles that still carry the retired 5-rung ladder.
 * Owns no state: the dashboard layout runs the upgrade and feeds status back.
 */
export function LegacyProfilePopup({
  isOpen,
  titles,
  retiredTitleCount,
  status,
  result,
  error,
  onUpgrade,
  onReview,
  onDismiss,
}: LegacyProfilePopupProps) {
  if (!isOpen) return null;

  const working = status === "working";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={working ? undefined : onDismiss}
      />
      <div className="relative w-full max-w-md mx-4 animate-[auth-screen-in_300ms_ease-out]">
        <div className="liquid-glass rounded-2xl p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--color-accent)]/15 flex items-center justify-center shrink-0">
              {status === "done" ? (
                <Check size={18} className="text-[var(--color-accent)]" />
              ) : (
                <Layers size={18} className="text-[var(--color-accent)]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-white">
                  {status === "done" ? "Profile upgraded" : "Modernise your profile"}
                </h3>
                {status !== "done" && (
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-medium uppercase tracking-wide text-white/60">
                    Ladder upgrade
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/40 mt-0.5">
                {status === "done" ? "You are on the 2-rung ladder" : "Takes a few seconds · no search credit used"}
              </p>
            </div>
          </div>

          {/* Body */}
          {status === "done" && result ? (
            <div className="space-y-4">
              <p className="text-[13px] text-white/60 leading-relaxed">
                Matching now reads your top two titles and two industry rungs — the retired rungs
                are cleared from your profile.
              </p>
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-white/40">Job titles</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.titles.map((t) => (
                    <span key={t} className="px-2.5 py-1 rounded-full bg-white/10 text-[11px] text-white/80">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-white/40 pt-1">Industry rungs</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.rungs.filter(Boolean).map((r, i) => (
                    <span key={`${r}-${i}`} className="px-2.5 py-1 rounded-full bg-[var(--color-accent)]/15 text-[11px] text-white/80">
                      {i === 0 ? "Niche · " : "Main · "}
                      {r}
                    </span>
                  ))}
                </div>
                {result.retiredTitles.length > 0 && (
                  <p className="text-[11px] text-white/40 pt-1">
                    Retired: {result.retiredTitles.join(", ")}
                  </p>
                )}
                {!result.ladderRebuilt && (
                  <p className="text-[11px] text-white/40 pt-1">
                    The ladder generator was unavailable, so your existing rungs were kept.
                  </p>
                )}
              </div>
            </div>
          ) : working ? (
            <div className="py-6 flex flex-col items-center gap-3">
              <Loader2 size={22} className="animate-spin text-[var(--color-accent)]" />
              <p className="text-[13px] text-white/60">Rebuilding your industry ladder…</p>
              <p className="text-[11px] text-white/35">Your titles stay the same</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] text-white/60 leading-relaxed">
                Job matching runs on a leaner ladder now: two job titles, two industry rungs. Your
                profile still carries the retired 5-rung setup — searches ignore it, but editing
                your profile would quietly drop those rungs.
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2 text-[12px] text-white/60">
                  <Check size={13} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
                  <span>
                    Keeps {titles.length === 1 ? "your title" : "your top two titles"}
                    {titles.length > 0 && <span className="text-white/80"> — {titles.join(", ")}</span>}
                  </span>
                </li>
                <li className="flex items-start gap-2 text-[12px] text-white/60">
                  <Check size={13} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
                  <span>Rebuilds both industry rungs with the current generator</span>
                </li>
                <li className="flex items-start gap-2 text-[12px] text-white/60">
                  <Check size={13} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
                  <span>
                    Clears 3 retired industry rungs
                    {retiredTitleCount > 0 && ` and ${retiredTitleCount} retired job title${retiredTitleCount > 1 ? "s" : ""}`}
                  </span>
                </li>
              </ul>
              {status === "error" && (
                <p className="text-[12px] text-red-300/90 leading-relaxed">
                  {error || "That did not work. Your profile was not changed."}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          {status === "done" ? (
            <div className="flex gap-3">
              <button
                onClick={onReview}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white/60 border border-white/10 rounded-full hover:bg-white/5 transition-colors"
              >
                Review profile
              </button>
              <button
                onClick={onDismiss}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={onDismiss}
                disabled={working}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white/60 border border-white/10 rounded-full hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Not now
              </button>
              <button
                onClick={onUpgrade}
                disabled={working}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  {working ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {working ? "Upgrading…" : status === "error" ? "Try again" : "Upgrade profile"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
