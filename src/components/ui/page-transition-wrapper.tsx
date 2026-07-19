"use client";

import { useEffect, useState, type ReactNode } from "react";

export function PageTransitionWrapper({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="transition-all duration-700 ease-out"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? undefined : "translateY(12px) scale(0.98)",
        filter: mounted ? undefined : "blur(4px)",
      }}
    >
      {children}
    </div>
  );
}
