"use client";

import { Minus, Plus, type LucideIcon } from "lucide-react";

interface AddonStepperProps {
  label: string;
  icon: LucideIcon;
  currentBalance: number;
  value: number;
  onChange: (v: number) => void;
  priceBreaks: { min: number; max?: number; price: number }[];
  calculatePrice: (count: number) => number;
}

function getVolumeLabel(count: number, priceBreaks: { min: number; max?: number; price: number }[]): string {
  if (count <= 0) return "";
  for (const b of priceBreaks) {
    if (count >= b.min && (!b.max || count <= b.max)) return `R${b.price}/unit`;
  }
  const last = priceBreaks[priceBreaks.length - 1];
  return `R${last.price}/unit`;
}

export function AddonStepper({ label, icon: Icon, currentBalance, value, onChange, priceBreaks, calculatePrice }: AddonStepperProps) {
  const pricePerUnit = calculatePrice(value);
  const total = value * pricePerUnit;
  const volumeLabel = getVolumeLabel(value, priceBreaks);

  return (
    <div className="min-h-[120px]">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-white/60" />
          <span className="text-xs font-medium text-white/90">{label}</span>
        </div>
        <span className="text-xs text-white/60">Balance: {currentBalance}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/20 text-white/90 hover:text-white hover:border-white/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Minus size={16} />
        </button>
        <div className="flex-1 text-center">
          <span className="text-2xl font-bold text-white tabular-nums">{value}</span>
          <span className="ml-1 text-sm text-white/70">extra</span>
        </div>
        <button
          onClick={() => onChange(value + 1)}
          className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/20 text-white/90 hover:text-white hover:border-white/40 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>
      {value > 0 && (
        <div className="mt-2 text-center">
          <span className="text-xs text-white/70">
            {volumeLabel} &middot; R{total.toLocaleString("en-ZA", { minimumFractionDigits: 0 })} total
          </span>
        </div>
      )}
    </div>
  );
}
