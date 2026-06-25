"use client";

import { useState, useCallback } from "react";
import { Filter, ArrowUpDown, Check } from "lucide-react";

export interface FilterState {
  trusted: boolean;
  untrusted: boolean;
  scoreHigh: boolean;
  scoreMid: boolean;
  scoreLow: boolean;
}

export type SortMode = "score" | "date_newest" | "date_oldest";

interface FilterSortBarProps {
  filter: FilterState;
  sort: SortMode;
  onFilterChange: (f: FilterState) => void;
  onSortChange: (s: SortMode) => void;
}

const FILTER_LABELS: Record<keyof FilterState, string> = {
  trusted: "Trusted domains",
  untrusted: "Untrusted domains",
  scoreHigh: "Score >= 80",
  scoreMid: "Score 40-79",
  scoreLow: "Score < 40",
};

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "score", label: "Best Match" },
  { value: "date_newest", label: "Date (newest)" },
  { value: "date_oldest", label: "Date (oldest)" },
];

export function FilterSortBar({ filter, sort, onFilterChange, onSortChange }: FilterSortBarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterMounted, setFilterMounted] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortMounted, setSortMounted] = useState(false);

  const openFilter = useCallback(() => {
    setFilterOpen(true);
    setTimeout(() => setFilterMounted(true), 10);
  }, []);

  const closeFilter = useCallback(() => {
    setFilterMounted(false);
    setTimeout(() => setFilterOpen(false), 200);
  }, []);

  const openSort = useCallback(() => {
    setSortOpen(true);
    setTimeout(() => setSortMounted(true), 10);
  }, []);

  const closeSort = useCallback(() => {
    setSortMounted(false);
    setTimeout(() => setSortOpen(false), 200);
  }, []);

  const toggleFilter = (key: keyof FilterState) => {
    const next = { ...filter, [key]: !filter[key] };
    // Ensure at least one is checked
    const anyChecked = Object.values(next).some(Boolean);
    if (!anyChecked) return;
    onFilterChange(next);
  };

  const activeFilterCount = Object.values(filter).filter(Boolean).length;
  const allSelected = activeFilterCount === Object.keys(FILTER_LABELS).length;

  return (
    <div className="flex items-center gap-2">
      {/* Filter Pill */}
      <div className="relative">
        <button
          onClick={filterOpen ? closeFilter : openFilter}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
            allSelected
              ? "border-white/20 text-white/80 hover:text-white hover:bg-white/10"
              : "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10"
          }`}
        >
          <Filter size={13} />
          Filter
          {!allSelected && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>

        {filterOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeFilter} />
            <div
              className={`absolute left-0 top-8 z-50 w-52 rounded-xl liquid-glass border border-white/10 p-2 transition-all duration-200 ${
                filterMounted ? "opacity-100 scale-100" : "opacity-0 scale-95"
              }`}
              style={{ pointerEvents: filterMounted ? "auto" : "none" }}
            >
              {(Object.keys(FILTER_LABELS) as (keyof FilterState)[]).map((key) => (
                <button
                  key={key}
                  onClick={() => toggleFilter(key)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                    filter[key]
                      ? "bg-[var(--color-accent)] border-[var(--color-accent)]"
                      : "border-white/30"
                  }`}>
                    {filter[key] && <Check size={11} className="text-white" />}
                  </span>
                  {FILTER_LABELS[key]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sort Pill */}
      <div className="relative">
        <button
          onClick={sortOpen ? closeSort : openSort}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowUpDown size={13} />
          {SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Best Match"}
        </button>

        {sortOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeSort} />
            <div
              className={`absolute left-0 top-8 z-50 w-44 rounded-xl liquid-glass border border-white/10 p-2 transition-all duration-200 ${
                sortMounted ? "opacity-100 scale-100" : "opacity-0 scale-95"
              }`}
              style={{ pointerEvents: sortMounted ? "auto" : "none" }}
            >
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { onSortChange(opt.value); closeSort(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                    sort === opt.value
                      ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : "text-white hover:bg-white/5"
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                    sort === opt.value
                      ? "border-[var(--color-accent)]"
                      : "border-white/30"
                  }`}>
                    {sort === opt.value && <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
