"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface TransitionContextValue {
  isTransitioning: boolean;
  videoFast: boolean;
  startTransition: () => void;
  endTransition: () => void;
  setVideoFast: (fast: boolean) => void;
}

const TransitionContext = createContext<TransitionContextValue | null>(null);

export function TransitionProvider({ children }: { children: ReactNode }) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [videoFast, setVideoFast] = useState(false);

  const startTransition = useCallback(() => setIsTransitioning(true), []);
  const endTransition = useCallback(() => setIsTransitioning(false), []);

  return (
    <TransitionContext.Provider value={{ isTransitioning, videoFast, startTransition, endTransition, setVideoFast }}>
      {children}
    </TransitionContext.Provider>
  );
}

export function useTransition() {
  const ctx = useContext(TransitionContext);
  if (!ctx) throw new Error("useTransition must be used within TransitionProvider");
  return ctx;
}
