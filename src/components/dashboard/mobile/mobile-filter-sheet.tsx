"use client";

import { useState, useCallback, useEffect } from "react";
import { X, Check, ChevronDown } from "lucide-react";
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
}

const DATE_OPTIONS = [
  { label: "Any time", value: null },
  { label: "24h", value: 1 },
  { label: "7 days", value: 7 },
  { label: "3 weeks", value: 21 },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "date_newest", label: "Date (newest)" },
  { value: "date_oldest", label: "Date (oldest)" },
  { value: "score_highest", label: "Score (highest)" },
  { value: "score_lowest", label: "Score (lowest)" },
];

export function MobileFilterSheet({
  isOpen,
  onClose,
  onApply,
  currentDays,
  currentLabel,
  pfMode,
  onPfModeChange,
}: MobileFilterSheetProps) {
  const [selectedDays, setSelectedDays] = useState<number | null>(currentDays);
  const [selectedLabel, setSelectedLabel] = useState(currentLabel);
  const [sortMode, setSortMode] = useState<SortMode>("date_newest");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(["all"]);

  useEffect(() => {
    if (isOpen) {
      setSelectedDays(currentDays);
      setSelectedLabel(currentLabel);
    }
  }, [isOpen, currentDays, currentLabel]);

  const handleApply = () => {
    onApply(selectedDays, selectedLabel);
    onClose();
  };

  const togglePlatform = (id: PlatformId) => {
    if (id === "all") {
      setSelectedPlatforms((prev) => (prev.includes("all") ? [] : ["all"]));
      return;
    }
    const withoutAll = selectedPlatforms.filter((s) => s !== "all");
    const next = withoutAll.includes(id)
      ? withoutAll.filter((s) => s !== id)
      : [...withoutAll, id];
    setSelectedPlatforms(next.length === 0 ? ["all"] : next);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-[#1C1C1E] rounded-t-2xl max-h-[80dvh] overflow-y-auto safe-area-bottom">
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-[#1C1C1E] z-10">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-8 space-y-6">
          {/* Date filter */}
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Date Posted</p>
            <div className="flex flex-wrap gap-2">
              {DATE_OPTIONS.map((opt) => {
                const active = selectedDays === opt.value;
                return (
                  <button
                    key={opt.label}
                    onClick={() => { setSelectedDays(opt.value); setSelectedLabel(opt.label); }}
                    className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-all ${
                      active
                        ? "bg-[var(--color-accent)]/15 border-[var(--color-accent)]/50 text-[var(--color-accent)]"
                        : "border-white/15 text-white/60 hover:text-white/80"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PF toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium">Persistent Finder</p>
              <p className="text-xs text-white/50 mt-0.5">Search multiple rounds</p>
            </div>
            <button
              onClick={() => onPfModeChange(!pfMode)}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                pfMode ? "bg-[var(--color-accent)]" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                  pfMode ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Sort */}
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Sort By</p>
            <div className="space-y-1">
              {SORT_OPTIONS.map((opt) => {
                const active = sortMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSortMode(opt.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors ${
                      active
                        ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                        : "text-white hover:bg-white/5"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      active ? "border-[var(--color-accent)]" : "border-white/30"
                    }`}>
                      {active && <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Platforms */}
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Platforms</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const active = selectedPlatforms.includes("all")
                  ? p.id === "all"
                  : selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`px-3 py-2 rounded-full text-xs font-medium border transition-all ${
                      active
                        ? "bg-[var(--color-accent)]/15 border-[var(--color-accent)]/40 text-[var(--color-accent)]"
                        : "border-white/15 text-white/60 hover:text-white/80"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleApply}
            className="w-full py-3 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:bg-[var(--color-accent-hover)] active:scale-[0.98] transition-all"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
