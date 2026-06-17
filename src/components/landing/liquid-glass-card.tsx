import type { ReactNode } from "react";
import "./liquid-glass.css";

interface LiquidGlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: "card" | "surface";
}

export function LiquidGlassCard({
  children,
  className = "",
  variant = "card",
}: LiquidGlassCardProps) {
  const base = variant === "card" ? "liquid-glass" : "liquid-glass-surface";
  return (
    <div className={`${base} rounded-2xl ${className}`}>
      {children}
    </div>
  );
}
