"use client";

import { useTransition } from "@/components/providers/transition-provider";

export function TransitionOverlay() {
  const { isTransitioning } = useTransition();

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none transition-opacity duration-[600ms] ease-in-out"
      style={{
        opacity: isTransitioning ? 1 : 0,
        background: "black",
      }}
    />
  );
}
