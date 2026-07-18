"use client";

import { useState } from "react";
import { Search, Square, X, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProfile } from "@/components/dashboard/dashboard-layout";
import { MobileFilterSheet } from "./mobile-filter-sheet";
import type { SortMode } from "@/components/dashboard/filter-sort-bar";
import type { PlatformId } from "@/components/dashboard/platform-filter";

interface MobileSearchPillProps {
  onSearch: (query: string, profileId?: string | null, pfMode?: boolean, dateFilterDays?: number | null) => void;
  onAbort: () => void;
  searching: boolean;
  pfMode: boolean;
  onPfModeChange: (v: boolean) => void;
  referralQuery?: string | null;
  sortMode: SortMode;
  onSortChange: (sort: SortMode) => void;
  platforms: PlatformId[];
  onPlatformsChange: (platforms: PlatformId[]) => void;
}

export function MobileSearchPill({ onSearch, onAbort, searching, pfMode, onPfModeChange, referralQuery, sortMode, onSortChange, platforms, onPlatformsChange }: MobileSearchPillProps) {
  const { activeProfileId } = useActiveProfile();
  const [displayTitle, setDisplayTitle] = useState("Search for jobs");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [abortMounted, setAbortMounted] = useState(false);
  const [dateFilterDays, setDateFilterDays] = useState<number | null>(null);
  const [activeDateLabel, setActiveDateLabel] = useState("Any time");

  const handleSearch = async () => {
    if (searching) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let titles: string[] = [];
    let loc = "";
    let ind = "";

    let usedProfileId = activeProfileId;
    if (!usedProfileId) {
      const { data: firstSp } = await supabase
        .from("search_profiles")
        .select("id, job_titles, location, industry")
        .eq("user_id", user.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (firstSp) {
        usedProfileId = firstSp.id;
        titles = firstSp.job_titles ?? [];
        loc = firstSp.location ?? "";
        ind = firstSp.industry ?? "";
      }
    } else {
      const { data: sp } = await supabase
        .from("search_profiles")
        .select("job_titles, location, industry")
        .eq("id", usedProfileId)
        .maybeSingle();
      if (sp) {
        titles = sp.job_titles ?? [];
        loc = sp.location ?? "";
        ind = sp.industry ?? "";
      }
    }

    const pick = titles[Math.floor(Math.random() * titles.length)] ?? "";
    const query = [pick, ind, loc].filter(Boolean).join(" ");
    if (!query) return;

    setDisplayTitle(query);
    onSearch(query, usedProfileId, pfMode, dateFilterDays);
  };

  const openAbortConfirm = () => {
    setShowAbortConfirm(true);
    setTimeout(() => setAbortMounted(true), 10);
  };

  const closeAbortConfirm = () => {
    setAbortMounted(false);
    setTimeout(() => setShowAbortConfirm(false), 200);
  };

  const confirmAbort = () => {
    closeAbortConfirm();
    onAbort();
  };

  const handleFilterApply = (days: number | null, label: string) => {
    setDateFilterDays(days);
    setActiveDateLabel(label);
  };

  return (
    <>
      {showAbortConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center transition-opacity duration-300" style={{ opacity: abortMounted ? 1 : 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={closeAbortConfirm} />
          <div
            className="relative bg-white border border-gray-200 rounded-2xl p-6 max-w-[280px] mx-8 text-center transition-all duration-300 ease-out shadow-xl"
            style={{ opacity: abortMounted ? 1 : 0, transform: abortMounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}
          >
            <p className="text-gray-900 font-semibold mb-2">Abort search?</p>
            <p className="text-xs text-gray-500 mb-5">Credits already used will not be refunded.</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={closeAbortConfirm}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={confirmAbort}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--color-error)] rounded-full"
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      )}

      <MobileFilterSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        onApply={handleFilterApply}
        currentDays={dateFilterDays}
        currentLabel={activeDateLabel}
        pfMode={pfMode}
        onPfModeChange={onPfModeChange}
        currentSort={sortMode}
        onSortChange={onSortChange}
        currentPlatforms={platforms}
        onPlatformsChange={onPlatformsChange}
      />

      <div className="space-y-2">
        <div className="flex items-center h-12 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl overflow-hidden">
          <button
            onClick={() => setFilterSheetOpen(true)}
            className="flex items-center justify-center w-11 h-full shrink-0 text-white/60 hover:text-white/90 active:text-white transition-colors"
          >
            <SlidersHorizontal size={18} />
          </button>

          <span className="flex-1 text-white/60 text-sm truncate select-none pr-2">
            {pfMode
              ? `Persistent Finder · ${activeDateLabel}`
              : dateFilterDays != null
              ? `${activeDateLabel} · ${displayTitle}`
              : displayTitle}
          </span>

          {searching ? (
            <button
              onClick={openAbortConfirm}
              className="flex items-center justify-center w-11 h-full shrink-0 text-[var(--color-error)]"
            >
              <Square size={18} />
            </button>
          ) : (
            <button
              onClick={handleSearch}
              className="flex items-center justify-center w-11 h-full shrink-0 text-[var(--color-accent)]"
            >
              <Search size={18} />
            </button>
          )}
        </div>

        {(dateFilterDays != null || pfMode) && !searching && (
          <div className="flex items-center justify-center gap-2">
            {dateFilterDays != null && (
              <span className="text-[10px] text-[var(--color-accent)] font-medium bg-[var(--color-accent)]/10 px-2 py-0.5 rounded-full">
                {activeDateLabel}
              </span>
            )}
            {pfMode && (
              <span className="text-[10px] text-[var(--color-accent)] font-medium bg-[var(--color-accent)]/10 px-2 py-0.5 rounded-full">
                PF Active
              </span>
            )}
          </div>
        )}

        {searching && (
          <p className="text-[11px] text-green-400 text-center">
            Search can take up to 2 minutes
          </p>
        )}
      </div>
    </>
  );
}
