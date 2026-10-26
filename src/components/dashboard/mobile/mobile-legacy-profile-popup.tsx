"use client";

import { useCallback, useState } from "react";
import { Check, Layers, Loader2, Sparkles } from "lucide-react";
import type { LegacyUpgradeResult, LegacyUpgradeStatus } from "@/lib/legacy-profile";

interface MobileLegacyProfilePopupProps {
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
 * Mobile bottom-sheet twin of {@link LegacyProfilePopup}. Same states, same
 * callbacks — the dashboard layout drives both.
 */
export function MobileLegacyProfilePopup({
  isOpen,
  titles,
  retiredTitleCount,
  status,
  result,
  error,
  onUpgrade,
  onReview,
  onDismiss,
}: MobileLegacyProfilePopupProps) {
  const [dragY, setDragY] = useState(0);
  const working = status === "working";
  const dismissable = !working;

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dismissable) return;
    const dy = e.touches[0].clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setDragY(Math.max(0, dy));
  }, [dismissable]);

  const handleTouchEnd = useCallback(() => {
    if (dismissable && dragY > 100) onDismiss();
    else setDragY(0);
  }, [dismissable, dragY, onDismiss]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={dismissable ? onDismiss : undefined}
      />
      <div
        className="relative bg-[#1C1C1E] rounded-t-[19px] transition-transform duration-300 ease-out overflow-y-auto"
        style={{
          maxHeight: "calc(100dvh - 2.5rem)",
          transform: `translateY(${dragY > 0 ? dragY : 0}px)`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-[5px] rounded-full bg-white/20" />
        </div>

        <div className="px-4 pb-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[var(--color-accent)]/15 flex items-center justify-center shrink-0">
              {status === "done" ? (
                <Check size={15} className="text-[var(--color-accent)]" />
              ) : (
                <Layers size={15} className="text-[var(--color-accent)]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-[13px] font-semibold text-white">
                  {status === "done" ? "Profile upgraded" : "Modernise your profile"}
                </h3>
                {status !== "done" && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[9px] font-medium uppercase tracking-wide text-white/60">
                    Ladder upgrade
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/40 mt-0.5">
                {status === "done" ? "You are on the 2-rung ladder" : "Takes a few seconds · no credit used"}
              </p>
            </div>
          </div>

          {/* Body */}
          {status === "done" && result ? (
            <div className="space-y-3">
              <p className="text-[11px] text-white/60 leading-relaxed">
                Matching now reads your top two titles and two industry rungs — the retired rungs
                are cleared from your profile.
              </p>
              <div className="space-y-1.5">
                <p className="text-[9px] font-medium uppercase tracking-wide text-white/40">Job titles</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.titles.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] text-white/80">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-[9px] font-medium uppercase tracking-wide text-white/40 pt-1">Industry rungs</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.rungs.filter(Boolean).map((r, i) => (
                    <span key={`${r}-${i}`} className="px-2 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[10px] text-white/80">
                      {i === 0 ? "Niche · " : "Main · "}
                      {r}
                    </span>
                  ))}
                </div>
                {result.retiredTitles.length > 0 && (
                  <p className="text-[10px] text-white/40 pt-1">
                    Retired: {result.retiredTitles.join(", ")}
                  </p>
                )}
                {!result.ladderRebuilt && (
                  <p className="text-[10px] text-white/40 pt-1">
                    The ladder generator was unavailable, so your existing rungs were kept.
                  </p>
                )}
              </div>
            </div>
          ) : working ? (
            <div className="py-5 flex flex-col items-center gap-2.5">
              <Loader2 size={20} className="animate-spin text-[var(--color-accent)]" />
              <p className="text-[11px] text-white/60">Rebuilding your industry ladder…</p>
              <p className="text-[10px] text-white/35">Your titles stay the same</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-white/60 leading-relaxed">
                Job matching runs on a leaner ladder now: two job titles, two industry rungs. Your
                profile still carries the retired 5-rung setup — searches ignore it, but editing
                your profile would quietly drop those rungs.
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-1.5 text-[11px] text-white/60">
                  <Check size={12} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
                  <span>
                    Keeps {titles.length === 1 ? "your title" : "your top two titles"}
                    {titles.length > 0 && <span className="text-white/80"> — {titles.join(", ")}</span>}
                  </span>
                </li>
                <li className="flex items-start gap-1.5 text-[11px] text-white/60">
                  <Check size={12} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
                  <span>Rebuilds both industry rungs with the current generator</span>
                </li>
                <li className="flex items-start gap-1.5 text-[11px] text-white/60">
                  <Check size={12} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
                  <span>
                    Clears 3 retired industry rungs
                    {retiredTitleCount > 0 && ` and ${retiredTitleCount} retired job title${retiredTitleCount > 1 ? "s" : ""}`}
                  </span>
                </li>
              </ul>
              {status === "error" && (
                <p className="text-[11px] text-red-300/90 leading-relaxed">
                  {error || "That did not work. Your profile was not changed."}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          {status === "done" ? (
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={onReview}
                className="flex-1 h-11 flex items-center justify-center text-[12px] font-medium text-white/60 border border-white/10 rounded-full hover:bg-white/5 active:scale-[0.98] transition-all"
              >
                Review profile
              </button>
              <button
                onClick={onDismiss}
                className="flex-1 h-11 flex items-center justify-center text-[12px] font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full active:scale-[0.98] transition-all"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={onDismiss}
                disabled={working}
                className="flex-1 h-11 flex items-center justify-center text-[12px] font-medium text-white/60 border border-white/10 rounded-full hover:bg-white/5 active:scale-[0.98] transition-all disabled:opacity-40"
              >
                Not now
              </button>
              <button
                onClick={onUpgrade}
                disabled={working}
                className="flex-1 h-11 flex items-center justify-center gap-1.5 text-[12px] font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {working ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {working ? "Upgrading…" : status === "error" ? "Try again" : "Upgrade profile"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
