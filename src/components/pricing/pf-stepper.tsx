"use client";

import { Minus, Plus } from "lucide-react";
import { calculatePFPrice, PF_PRICE_BREAKS, PF_DEFAULT_BY_TIER } from "@/lib/plan-limits";

interface PFStepperProps {
  planName: string;
  value: number;
  onChange: (v: number) => void;
  annual: boolean;
}

function getVolumeLabel(count: number): string {
  if (count <= 0) return "";
  for (const b of PF_PRICE_BREAKS) {
    if (count >= b.min && count <= b.max) return `R${b.price}/run`;
  }
  const last = PF_PRICE_BREAKS[PF_PRICE_BREAKS.length - 1];
  return `R${last.price}/run`;
}

export function PFStepper({ planName, value, onChange, annual }: PFStepperProps) {
  const defaultVal = PF_DEFAULT_BY_TIER[planName] ?? 0;
  const pricePerRun = calculatePFPrice(value);
  const pfTotal = value * pricePerRun * (annual ? 12 : 1);
  const volumeLabel = getVolumeLabel(value);

  return (
    <div className="min-h-[120px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-white/70">Persistent Finder rounds</span>
        <span className="text-xs text-white/40">Cap 25</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Minus size={16} />
        </button>
        <div className="flex-1 text-center">
          <span className="text-2xl font-bold text-white tabular-nums">{value}</span>
          <span className="ml-1 text-sm text-white/50">runs</span>
        </div>
        <button
          onClick={() => onChange(Math.min(25, value + 1))}
          disabled={value >= 25}
          className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus size={16} />
        </button>
      </div>
      {value > 0 && (
        <div className="mt-2 text-center">
          <span className="text-xs text-white/50">
            {volumeLabel}
          </span>
        </div>
      )}
      {value !== defaultVal && value > 0 && (
        <div className="mt-1 text-center">
          <span className="text-xs text-[var(--color-accent)] cursor-pointer" onClick={() => onChange(defaultVal)}>
            Reset to default ({defaultVal})
          </span>
        </div>
      )}
    </div>
  );
}
