"use client";

import { useState } from "react";
import { Search, Crosshair, X, Calendar } from "lucide-react";

interface GuestSearchPillProps {
  onSearch: (query: string, pfMode?: boolean, dateFilterDays?: number | null) => void;
  searching: boolean;
  onAbort: () => void;
  initialPfMode?: boolean;
  initialDateFilter?: number | null;
}

export function GuestSearchPill({ onSearch, onAbort, searching, initialPfMode = false, initialDateFilter = null }: GuestSearchPillProps) {
  const [query, setQuery] = useState("");
  const [pfMode, setPfMode] = useState(initialPfMode);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [abortMounted, setAbortMounted] = useState(false);
  const [dateFilterDays, setDateFilterDays] = useState<number | null>(initialDateFilter);
  const [showDateFilter, setShowDateFilter] = useState(false);

  const DATE_OPTIONS = [
    { label: "Any date", value: null },
    { label: "Last 24h", value: 1 },
    { label: "Last 7d", value: 7 },
    { label: "Last 3w", value: 21 },
  ] as const;

  const handleSearch = () => {
    const trimmed = query.trim();
    if (!trimmed || searching) return;
    onSearch(trimmed, pfMode, dateFilterDays);
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

  return (
    <div className="w-full max-w-2xl mx-auto space-y-2">
      <div className="liquid-glass rounded-full px-4 py-3 flex items-center gap-3">
        {searching ? (
          <button
            onClick={openAbortConfirm}
            className="p-2 text-red-400 hover:text-red-300 transition-colors"
            aria-label="Abort search"
          >
            <X size={20} />
          </button>
        ) : (
          <Search size={20} className="text-white/60 shrink-0" />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder={pfMode ? "Try: Software Developer Johannesburg" : "Try: Software Developer Johannesburg"}
          disabled={searching}
          className="flex-1 bg-transparent text-white placeholder-white/40 text-base outline-none"
        />
        {!searching && (
          <button
            onClick={handleSearch}
            disabled={!query.trim()}
            className="px-5 py-1.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors disabled:opacity-40"
          >
            Search
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setPfMode(!pfMode)}
          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full transition-colors ${
            pfMode
              ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
              : "text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20"
          }`}
        >
          <Crosshair size={12} />
          Persistent Finder {pfMode && "(on)"}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowDateFilter(!showDateFilter)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full transition-colors ${
              dateFilterDays != null
                ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
                : "text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20"
            }`}
          >
            <Calendar size={12} />
            {dateFilterDays != null ? DATE_OPTIONS.find(o => o.value === dateFilterDays)?.label : "Any date"}
          </button>

          {showDateFilter && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 liquid-glass rounded-xl p-1 z-10 min-w-[140px]">
              {DATE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => { setDateFilterDays(opt.value); setShowDateFilter(false); }}
                  className={`block w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${
                    dateFilterDays === opt.value
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-white/40">
        {pfMode ? "1 free PF search — multi-round AI matching" : "1 free search — no signup required"}
      </p>

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
            <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm mx-4 text-center transition-all duration-300 ease-out shadow-xl"
              style={{ opacity: abortMounted ? 1 : 0, transform: abortMounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}>
              <p className="text-gray-900 font-semibold mb-2">Cancel search?</p>
              <p className="text-sm text-gray-500 mb-4">Results found so far will still be shown.</p>
              <div className="flex justify-center gap-3">
                <button onClick={closeAbortConfirm} className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-full hover:bg-gray-200 transition-colors">Keep searching</button>
                <button onClick={confirmAbort} className="px-5 py-2.5 text-sm font-semibold text-white bg-red-500 rounded-full hover:bg-red-600 transition-colors">Stop</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
