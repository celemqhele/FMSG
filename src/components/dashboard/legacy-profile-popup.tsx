"use client";

import { Loader2, RefreshCw } from "lucide-react";
import type { LegacyLadderProfile } from "@/lib/legacy-profile";

interface LegacyProfilePopupProps {
  isOpen: boolean;
  /** Every legacy profile on the account — the upgrade covers all of them. */
  profiles: LegacyLadderProfile[];
  status: "idle" | "working" | "done" | "error";
  error: string;
  onUpgrade: () => void;
}

/**
 * Mandatory one-time refresh for accounts with legacy 5-rung profiles.
 * Non-optional: only a loading state until all profiles are updated with AI,
 * then it auto-continues to refill the dashboard.
 */
export function LegacyProfilePopup({
  isOpen,
  profiles,
  status,
  error,
  onUpgrade,
}: LegacyProfilePopupProps) {
  if (!isOpen) return null;

  const working = status === "working";
  const count = profiles.length;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <div className="relative w-full max-w-sm mx-4 animate-[auth-screen-in_300ms_ease-out]">
        <div className="liquid-glass rounded-2xl p-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[var(--color-accent)]/15 flex items-center justify-center">
              {working ? (
                <Loader2 size={22} className="animate-spin text-[var(--color-accent)]" />
              ) : (
                <RefreshCw size={22} className="text-[var(--color-accent)]" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">
                {working ? "Updating your profiles" : "Updating profiles to the new format"}
              </h3>
              <p className="text-[12px] text-white/50 leading-relaxed">
                {working
                  ? "Refreshing all profiles with AI. This may take a moment."
                  : count === 1
                    ? "One profile needs updating before you continue."
                    : `${count} profiles need updating before you continue.`}
              </p>
            </div>
            {error && (
              <p className="text-[12px] text-red-300/90 leading-relaxed">{error}</p>
            )}
          </div>

          {!working && (
            <button
              onClick={onUpgrade}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors"
            >
              Update all profiles
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
