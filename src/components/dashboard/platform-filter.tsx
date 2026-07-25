"use client";

export type PlatformId = "linkedin" | "pnet" | "indeed" | "careerjunction" | "glassdoor" | "offerzen" | "ditto" | "all";

export interface PlatformDef {
  id: PlatformId;
  label: string;
  viaMatch: string[];
}

export const PLATFORMS: PlatformDef[] = [
  { id: "linkedin", label: "LinkedIn", viaMatch: ["linkedin"] },
  { id: "pnet", label: "Pnet", viaMatch: ["pnet", "careerjet"] },
  { id: "indeed", label: "Indeed", viaMatch: ["indeed"] },
  { id: "careerjunction", label: "CareerJunction", viaMatch: ["careerjunction"] },
  { id: "glassdoor", label: "Glassdoor", viaMatch: ["glassdoor"] },
  { id: "offerzen", label: "OfferZen", viaMatch: ["offerzen"] },
  { id: "ditto", label: "Ditto", viaMatch: ["ditto"] },
  { id: "all", label: "All", viaMatch: [] },
];

interface PlatformFilterProps {
  selected: PlatformId[];
  onChange: (ids: PlatformId[]) => void;
}

export function PlatformFilter({ selected, onChange }: PlatformFilterProps) {
  const isAllSelected = selected.includes("all");

  const toggle = (id: PlatformId) => {
    if (id === "all") {
      onChange(isAllSelected ? [] : ["all"]);
      return;
    }
    const withoutAll = selected.filter((s) => s !== "all");
    const next = withoutAll.includes(id)
      ? withoutAll.filter((s) => s !== id)
      : [...withoutAll, id];
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-center">
      <span className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider mr-1 hidden sm:inline">Platforms:</span>
      {PLATFORMS.map((p) => {
        const active = isAllSelected ? p.id === "all" : selected.includes(p.id);
        return (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 ${
              active
                ? "bg-[var(--color-accent)]/15 border-[var(--color-accent)]/40 text-[var(--color-accent)]"
                : "border-white/15 text-white/60 hover:text-white/80 hover:bg-white/5"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
