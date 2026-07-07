"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

interface GuestSearchPillProps {
  onSearch: (query: string) => void;
  searching: boolean;
  onAbort: () => void;
}

export function GuestSearchPill({ onSearch, onAbort, searching }: GuestSearchPillProps) {
  const [query, setQuery] = useState("");
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [abortMounted, setAbortMounted] = useState(false);

  const handleSearch = () => {
    const trimmed = query.trim();
    if (!trimmed || searching) return;
    onSearch(trimmed);
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
    <div className="w-full max-w-2xl mx-auto">
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
          placeholder="Try: Software Developer Johannesburg"
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
      <p className="text-center text-xs text-white/40 mt-2">
        1 free search — no signup required
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
