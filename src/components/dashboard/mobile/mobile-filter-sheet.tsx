"use client";

import { useState, useEffect, useCallback } from "react";
import type { SortMode } from "@/components/dashboard/filter-sort-bar";
import type { PlatformId } from "@/components/dashboard/platform-filter";
import { PLATFORMS } from "@/components/dashboard/platform-filter";

interface MobileFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (days: number | null, label: string) => void;
  currentDays: number | null;
  currentLabel: string;
  pfMode: boolean;
  onPfModeChange: (v: boolean) => void;
  currentSort: SortMode;
  onSortChange: (sort: SortMode) => void;
  currentPlatforms: PlatformId[];
  onPlatformsChange: (platforms: PlatformId[]) => void;
}

const DATE_OPTIONS = [
  { label: "Any time", value: null },
  { label: "24h", value: 1 },
  { label: "7 days", value: 7 },
  { label: "3 weeks", value: 21 },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "date_newest", label: "Newest" },
  { value: "date_oldest", label: "Oldest" },
  { value: "score_highest", label: "Top score" },
  { value: "score_lowest", label: "Low score" },
];

export function MobileFilterSheet({
  isOpen,
  onClose,
  onApply,
  currentDays,
  currentLabel,
  pfMode,
  onPfModeChange,
  currentSort,
  onSortChange,
  currentPlatforms,
  onPlatformsChange,
}: MobileFilterSheetProps) {
  const [selectedDays, setSelectedDays] = useState<number | null>(currentDays);
  const [selectedLabel, setSelectedLabel] = useState(currentLabel);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setSelectedDays(currentDays);
      setSelectedLabel(currentLabel);
      setDragY(0);
    }
  }, [isOpen, currentDays, currentLabel]);

  const handleApply = () => {
    onApply(selectedDays, selectedLabel);
    onClose();
  };

  const togglePlatform = (id: PlatformId) => {
    if (id === "all") {
      const next: PlatformId[] = currentPlatforms.includes("all") ? [] : ["all"];
      onPlatformsChange(next.length === 0 ? (["all"] as PlatformId[]) : next);
      return;
    }
    const withoutAll = currentPlatforms.filter((s) => s !== "all");
    const next = withoutAll.includes(id)
      ? withoutAll.filter((s) => s !== id)
      : [...withoutAll, id];
    onPlatformsChange(next.length === 0 ? (["all"] as PlatformId[]) : next);
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setDragY(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > 100) onClose();
    else setDragY(0);
  }, [dragY, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className="relative bg-[#1C1C1E] rounded-t-[19px] transition-transform duration-300 ease-out"
        style={{
          transform: `translateY(${dragY > 0 ? dragY : 0}px)`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex justify-center pt-2.5 pb-1.5">
          <div className="w-9 h-[5px] rounded-full bg-white/20" />
        </div>

        <div className="px-4 pb-5 space-y-4">
          {/* Date filter */}
          <div>
            <p className="text-[10px] font-medium text-white/50 uppercase tracking-wider mb-2">Date Posted</p>
            <div className="flex gap-1.5">
              {DATE_OPTIONS.map((opt) => {
                const active = selectedDays === opt.value;
                return (
                  <button
                    key={opt.label}
                    onClick={() => { setSelectedDays(opt.value); setSelectedLabel(opt.label); }}
                    className={`flex-1 px-2 py-1.5 rounded-full text-[10px] font-medium border transition-all text-center ${
                      active
                        ? "bg-[var(--color-accent)]/15 border-[var(--color-accent)]/50 text-[var(--color-accent)]"
                        : "border-white/15 text-white/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort */}
          <div>
            <p className="text-[10px] font-medium text-white/50 uppercase tracking-wider mb-2">Sort By</p>
            <div className="flex gap-1.5">
              {SORT_OPTIONS.map((opt) => {
                const active = currentSort === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => onSortChange(opt.value)}
                    className={`flex-1 px-2 py-1.5 rounded-full text-[10px] font-medium border transition-all text-center ${
                      active
                        ? "bg-[var(--color-accent)]/15 border-[var(--color-accent)]/50 text-[var(--color-accent)]"
                        : "border-white/15 text-white/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Platforms */}
          <div>
            <p className="text-[10px] font-medium text-white/50 uppercase tracking-wider mb-2">Platforms</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => {
                const active = currentPlatforms.includes("all")
                  ? p.id === "all"
                  : currentPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`px-2.5 py-1.5 rounded-full text-[10px] font-medium border transition-all ${
                      active
                        ? "bg-[var(--color-accent)]/15 border-[var(--color-accent)]/40 text-[var(--color-accent)]"
                        : "border-white/15 text-white/60"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PF toggle + Apply row */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onPfModeChange(!pfMode)}
              className={`shrink-0 relative inline-flex h-8 w-11 items-center rounded-full transition-colors ${
                pfMode ? "bg-[var(--color-accent)]" : "bg-white/15"
              }`}
            >
              <span
                className={`inline-block h-5 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                  pfMode ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-[10px] text-white/50 shrink-0">PF</span>
            <button
              onClick={handleApply}
              className="flex-1 py-2 rounded-[10px] bg-[var(--color-accent)] text-white text-[11px] font-semibold active:scale-[0.98] transition-all"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
