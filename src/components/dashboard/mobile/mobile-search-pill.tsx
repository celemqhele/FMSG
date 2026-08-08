"use client";

import { useState } from "react";
import { Square, X, SlidersHorizontal, Search, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProfile } from "@/components/dashboard/dashboard-layout";
import { MobileFilterSheet } from "./mobile-filter-sheet";
import type { SortMode } from "@/components/dashboard/filter-sort-bar";
import type { PlatformId } from "@/components/dashboard/platform-filter";

interface MobileSearchPillProps {
  onSearch: (query: string, profileId?: string | null, pfMode?: boolean, dateFilterDays?: number | null, location?: string) => void;
  onAbort: () => void;
  searching: boolean;
  pfMode: boolean;
  onPfModeChange: (v: boolean) => void;
  sortMode: SortMode;
  onSortChange: (sort: SortMode) => void;
  platforms: PlatformId[];
  onPlatformsChange: (platforms: PlatformId[]) => void;
  guest?: boolean;
  initialQuery?: string;
  initialLocation?: string;
}

export function MobileSearchPill({ onSearch, onAbort, searching, pfMode, onPfModeChange, sortMode, onSortChange, platforms, onPlatformsChange, guest, initialQuery, initialLocation }: MobileSearchPillProps) {
  const { activeProfileId } = useActiveProfile();
  const [displayTitle, setDisplayTitle] = useState("Search for jobs");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [abortMounted, setAbortMounted] = useState(false);
  const [dateFilterDays, setDateFilterDays] = useState<number | null>(null);
  const [activeDateLabel, setActiveDateLabel] = useState("Any time");
  const [typedQuery, setTypedQuery] = useState(initialQuery ?? "");
  const [guestLocation, setGuestLocation] = useState(initialLocation ?? "");

  const handleSearch = async () => {
    if (searching) return;

    if (guest) {
      const query = typedQuery.trim();
      if (!query) return;
      setDisplayTitle(query);
      onSearch(query, null, undefined, undefined, guestLocation.trim());
      return;
    }

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
        .maybeSingle({ headers: { "Cache-Control": "no-cache, no-store, must-revalidate" } });
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
        .maybeSingle({ headers: { "Cache-Control": "no-cache, no-store, must-revalidate" } });
      if (sp) {
        titles = sp.job_titles ?? [];
        loc = sp.location ?? "";
        ind = sp.industry ?? "";
      }
    }

    const typed = typedQuery.trim();
    const pick = titles[Math.floor(Math.random() * titles.length)] ?? "";
    const query = typed || [pick, ind, loc].filter(Boolean).join(" ");
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

  if (guest) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center h-10 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl overflow-hidden">
          <Search size={13} className="ml-3 text-white/50 shrink-0" />
          <input
            value={typedQuery}
            onChange={(e) => setTypedQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="e.g. Software developer, accountant"
            className="flex-1 bg-transparent text-white/80 text-[11px] px-2 outline-none placeholder-white/50 min-w-0"
          />
          {searching ? (
            <button
              onClick={onAbort}
              className="flex items-center justify-center w-9 h-full shrink-0 text-[var(--color-error)]"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSearch}
              className="shrink-0 px-3 h-7 mr-1 text-[11px] font-semibold text-black bg-[var(--color-accent)] rounded-full active:scale-95 transition-transform"
            >
              Start Search
            </button>
          )}
        </div>
        <div className="flex items-center h-9 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl overflow-hidden">
          <MapPin size={12} className="ml-3 text-white/50 shrink-0" />
          <input
            value={guestLocation}
            onChange={(e) => setGuestLocation(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="Location (optional)"
            className="flex-1 bg-transparent text-white/80 text-[11px] px-2 outline-none placeholder-white/50 min-w-0"
          />
          {guestLocation && (
            <button
              onClick={() => setGuestLocation("")}
              className="flex items-center justify-center w-8 h-full shrink-0 text-white/50 hover:text-white/90 transition-colors"
              aria-label="Clear location"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {searching && (
          <p className="text-[11px] text-green-400 text-center">
            Search can take up to a minute
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {showAbortConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center transition-opacity duration-300" style={{ opacity: abortMounted ? 1 : 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={closeAbortConfirm} />
          <div
            className="relative bg-white border border-gray-200 rounded-xl p-5 w-[min(80vw,320px)] mx-3 text-center transition-all duration-300 ease-out shadow-xl"
            style={{ opacity: abortMounted ? 1 : 0, transform: abortMounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}
          >
            <p className="text-gray-900 font-semibold mb-1.5">Abort search?</p>
            <p className="text-[10px] text-gray-500 mb-5">Credits already used will not be refunded.</p>
            <div className="flex justify-center gap-2.5">
              <button
                onClick={closeAbortConfirm}
                className="px-3 py-2 text-[11px] font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={confirmAbort}
                className="px-3 py-2 text-[11px] font-semibold text-white bg-[var(--color-error)] rounded-full"
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

      <div className="space-y-1.5">
        <div className="flex items-center h-10 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl overflow-hidden">
          <button
            onClick={() => setFilterSheetOpen(true)}
            className="flex items-center justify-center w-9 h-full shrink-0 text-white/60 hover:text-white/90 active:text-white transition-colors"
          >
            <SlidersHorizontal size={14} />
          </button>

          <input
            value={typedQuery}
            onChange={(e) => setTypedQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder={pfMode
              ? `Persistent Finder · ${activeDateLabel}`
              : dateFilterDays != null
              ? `${activeDateLabel} · ${displayTitle}`
              : displayTitle}
            className="flex-1 bg-transparent text-white/80 text-[11px] px-2 outline-none placeholder-white/50 min-w-0"
          />

          {searching ? (
            <button
              onClick={openAbortConfirm}
              className="flex items-center justify-center w-9 h-full shrink-0 text-[var(--color-error)]"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSearch}
              className="shrink-0 px-3 h-7 mr-1 text-[11px] font-semibold text-black bg-[var(--color-accent)] rounded-full active:scale-95 transition-transform"
            >
              Start Search
            </button>
          )}
        </div>

        {(dateFilterDays != null || pfMode) && !searching && (
          <div className="flex items-center justify-center gap-1.5">
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
