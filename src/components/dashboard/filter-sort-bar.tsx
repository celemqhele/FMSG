"use client";

import { useState, useCallback } from "react";
import { ArrowUpDown } from "lucide-react";

export type SortMode = "date_newest" | "date_oldest";

interface SortBarProps {
  sort: SortMode;
  onSortChange: (s: SortMode) => void;
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "date_newest", label: "Date (newest)" },
  { value: "date_oldest", label: "Date (oldest)" },
];

export function FilterSortBar({ sort, onSortChange }: SortBarProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const [sortMounted, setSortMounted] = useState(false);

  const openSort = useCallback(() => {
    setSortOpen(true);
    setTimeout(() => setSortMounted(true), 10);
  }, []);

  const closeSort = useCallback(() => {
    setSortMounted(false);
    setTimeout(() => setSortOpen(false), 200);
  }, []);

  return (
    <div className="flex items-center gap-2">
      {/* Sort Pill */}
      <div className="relative" style={{ zIndex: sortOpen ? 50 : undefined }}>
        <button
          onClick={sortOpen ? closeSort : openSort}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowUpDown size={13} />
          {SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Date (newest)"}
        </button>

        {sortOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeSort} />
            <div
              className={`absolute left-0 top-8 z-50 w-44 rounded-xl p-2 transition-all duration-200 ${
                sortMounted ? "opacity-100 scale-100" : "opacity-0 scale-95"
              }`}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                backdropFilter: "blur(24px) saturate(1.4)",
                WebkitBackdropFilter: "blur(24px) saturate(1.4)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08), inset 0 0 30px rgba(255, 255, 255, 0.05)",
                pointerEvents: sortMounted ? "auto" as any : "none",
              }}
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
