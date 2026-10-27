"use client";

import { Loader2, RefreshCw } from "lucide-react";
import type { LegacyLadderProfile } from "@/lib/legacy-profile";

interface MobileLegacyProfilePopupProps {
  isOpen: boolean;
  profiles: LegacyLadderProfile[];
  status: "idle" | "working" | "done" | "error";
  error: string;
  onUpgrade: () => void;
}

/**
 * Mandatory blocking sheet: shows a loading spinner while all legacy profiles
 * are updated with AI in the background, then triggers a refill.
 */
export function MobileLegacyProfilePopup({
  isOpen,
  profiles,
  status,
  error,
  onUpgrade,
}: MobileLegacyProfilePopupProps) {
  if (!isOpen) return null;

  const working = status === "working";
  const count = profiles.length;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <div
        className="relative bg-[#1C1C1E] rounded-t-[19px] overflow-y-auto"
        style={{
          maxHeight: "calc(100dvh - 2.5rem)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-[5px] rounded-full bg-white/20" />
        </div>

        <div className="px-4 pb-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-11 h-11 rounded-full bg-[var(--color-accent)]/15 flex items-center justify-center">
              {working ? (
                <Loader2 size={20} className="animate-spin text-[var(--color-accent)]" />
              ) : (
                <RefreshCw size={20} className="text-[var(--color-accent)]" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="text-[13px] font-semibold text-white">
                {working ? "Updating your profiles" : "Updating profiles to the new format"}
              </h3>
              <p className="text-[11px] text-white/50 leading-relaxed">
                {working
                  ? "Refreshing all profiles with AI. This may take a moment."
                  : count === 1
                    ? "One profile needs updating before you continue."
                    : `${count} profiles need updating before you continue.`}
              </p>
            </div>
            {error && (
              <p className="text-[11px] text-red-300/90 leading-relaxed">{error}</p>
            )}
          </div>

          {!working && (
            <button
              onClick={onUpgrade}
              className="w-full h-11 flex items-center justify-center text-[12px] font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full active:scale-[0.98] transition-all"
            >
              Update all profiles
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
