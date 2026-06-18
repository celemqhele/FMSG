"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTransition } from "@/components/providers/transition-provider";

export function PageTransitionWrapper({ children }: { children: ReactNode }) {
  const { isTransitioning } = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`transition-all duration-500 ease-out ${
        isTransitioning
          ? "opacity-0 scale-[0.98] blur-[2px]"
          : mounted
            ? "opacity-100 scale-100 blur-0"
            : "opacity-0"
      }`}
    >
      {children}
    </div>
  );
}
