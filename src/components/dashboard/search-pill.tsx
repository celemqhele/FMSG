"use client";

import { useState } from "react";
import { Search, Crosshair, Square, X, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProfile } from "@/components/dashboard/dashboard-layout";

interface SearchPillProps {
  onSearch: (query: string, profileId?: string | null, pfMode?: boolean, dateFilterDays?: number | null) => void;
  onAbort: () => void;
  searching: boolean;
}

export function SearchPill({ onSearch, onAbort, searching }: SearchPillProps) {
  const { activeProfileId } = useActiveProfile();
  const [displayTitle, setDisplayTitle] = useState("Search for jobs");
  const [bouncing, setBouncing] = useState(false);
  const [pfMode, setPfMode] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [abortMounted, setAbortMounted] = useState(false);
  const [dateFilterDays, setDateFilterDays] = useState<number | null>(null);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFilterMounted, setDateFilterMounted] = useState(false);

  const DATE_OPTIONS = [
    { label: "Any date", value: null },
    { label: "Last 24h", value: 1 },
    { label: "Last 7d", value: 7 },
    { label: "Last 3w", value: 21 },
  ] as const;

  const handleSearch = async () => {
    if (searching) return;
    setBouncing(true);
    setTimeout(() => setBouncing(false), 400);

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
      const { data: sp, error: spErr } = await supabase
        .from("search_profiles")
        .select("job_titles, location, industry")
        .eq("id", usedProfileId)
        .maybeSingle();
      if (spErr) console.log("[SEARCH-PILL] search_profiles error:", spErr.message);
      if (sp) {
        titles = sp.job_titles ?? [];
        loc = sp.location ?? "";
        ind = sp.industry ?? "";
      }
    }

    const pick = titles[Math.floor(Math.random() * titles.length)] ?? "";
    if (!pick) {
      console.log("[SEARCH-PILL] No job titles found — cannot search");
      return;
    }
    const query = [pick, ind, loc].filter(Boolean).join(" ");
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

  const togglePfMode = () => {
    setPfMode(!pfMode);
  };

  const toggleDateFilter = () => {
    if (showDateFilter) {
      setDateFilterMounted(false);
      setTimeout(() => setShowDateFilter(false), 200);
    } else {
      setShowDateFilter(true);
      setTimeout(() => setDateFilterMounted(true), 10);
    }
  };

  const selectDateFilter = (value: number | null) => {
    setDateFilterDays(value);
    setDateFilterMounted(false);
    setTimeout(() => setShowDateFilter(false), 200);
  };

  const activeDateLabel = DATE_OPTIONS.find((o) => o.value === dateFilterDays)?.label ?? "Any date";

  return (
    <>
      {showAbortConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center transition-opacity duration-300" style={{ opacity: abortMounted ? 1 : 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={closeAbortConfirm} />
          <div className="relative">
            <button
              onClick={closeAbortConfirm}
              className="absolute -top-4 -right-4 z-10 p-1.5 bg-white border border-gray-300 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors shadow-lg"
            >
              <X size={20} />
            </button>
            <div
              className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm mx-4 text-center transition-all duration-300 ease-out shadow-xl"
              style={{ opacity: abortMounted ? 1 : 0, transform: abortMounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}
            >
              <p className="text-gray-900 font-semibold mb-2">Abort search?</p>
              <p className="text-sm text-gray-500 mb-5">
                Credits already used will not be refunded. The search will stop immediately.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={closeAbortConfirm}
                  className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-full hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAbort}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-error)] rounded-full hover:bg-red-600 transition-colors"
                >
                  Stop Search
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`w-full max-w-2xl mx-auto flex items-center h-14 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl overflow-visible transition-transform duration-200 ${bouncing ? "scale-[1.02]" : "scale-100"}`}>
      {/* Date filter pill */}
      <div className="relative ml-2">
        <button
          onClick={toggleDateFilter}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${dateFilterDays != null ? "bg-[var(--color-accent)] text-white" : "text-white/60 hover:text-white/90 hover:bg-white/10"}`}
          title={dateFilterDays != null ? `Filtering: ${activeDateLabel}` : "Filter by date"}
        >
          <Calendar size={16} />
        </button>

        {showDateFilter && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-[60] transition-all duration-200 ease-out"
            style={{ opacity: dateFilterMounted ? 1 : 0, transform: dateFilterMounted ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.95)" }}
          >
            <div className="bg-gray-900/95 backdrop-blur-xl border border-white/20 rounded-xl py-1.5 shadow-2xl min-w-[140px]">
              {DATE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => selectDateFilter(opt.value)}
                  className={`w-full text-left px-3.5 py-2 text-xs transition-colors ${
                    dateFilterDays === opt.value
                      ? "text-white bg-white/10"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* PF toggle */}
      <div className="relative ml-1">
        <button
          onClick={togglePfMode}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${pfMode ? "bg-[var(--color-accent)] text-white" : "text-white/60 hover:text-white/90 hover:bg-white/10"}`}
          title={pfMode ? "Persistent Finder active: searches multiple rounds across all titles" : "Click to enable Persistent Finder"}
        >
          <Crosshair size={16} />
        </button>
      </div>

      <span className="flex-1 text-white/60 text-sm px-3 truncate select-none">
        {pfMode ? `Persistent Finder (${activeDateLabel})` : dateFilterDays != null ? `Filtered: ${activeDateLabel} · ${displayTitle}` : displayTitle}
      </span>

      {searching && (
        <button
          onClick={openAbortConfirm}
          className="flex items-center gap-2 px-4 h-10 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-colors mr-1"
          title="Abort search"
        >
          <Square size={16} className="text-[var(--color-error)]" />
        </button>
      )}
      <button
        onClick={handleSearch}
        disabled={searching}
        className="flex items-center gap-2 px-6 h-10 mr-2 rounded-full bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
      >
        <Search size={16} />
        {searching ? (pfMode ? "Finding..." : "Searching...") : "Search"}
      </button>
    </div>
    </>
  );
}
