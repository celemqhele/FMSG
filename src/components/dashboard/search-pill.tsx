"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Clock } from "lucide-react";

interface SearchPillProps {
  onSearch: (query: string) => void;
  onToggleHistory: () => void;
  searching: boolean;
}

export function SearchPill({ onSearch, onToggleHistory, searching }: SearchPillProps) {
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !searching) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex items-center h-14 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl overflow-hidden">
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1 px-4 h-14 text-white/60 hover:text-white transition-colors"
          >
            <ChevronDown size={16} />
          </button>
          {showDropdown && (
            <div className="absolute left-0 top-14 w-48 rounded-xl bg-[#1C1C1E] border border-white/10 shadow-xl overflow-hidden z-50">
              <button
                type="button"
                onClick={() => { setShowDropdown(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/5 transition-colors"
              >
                <Search size={16} />
                New Search
              </button>
              <button
                type="button"
                onClick={() => { setShowDropdown(false); onToggleHistory(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/5 transition-colors"
              >
                <Clock size={16} />
                Search History
              </button>
            </div>
          )}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for jobs..."
          className="flex-1 bg-transparent text-white placeholder-white/40 text-sm focus:outline-none px-2"
          disabled={searching}
        />

        <button
          type="submit"
          disabled={!query.trim() || searching}
          className="flex items-center gap-2 px-6 h-10 mr-2 rounded-full bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
        >
          <Search size={16} />
          Search
        </button>
      </div>
    </form>
  );
}
