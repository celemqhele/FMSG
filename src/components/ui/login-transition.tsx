"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";

interface LoginTransitionProps {
  type: "login" | "onboarding";
  redirectTo?: string;
  onComplete?: () => void;
}

export function LoginTransition({ type, redirectTo, onComplete }: LoginTransitionProps) {
  const router = useRouter();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (type === "login") {
      startTransition(() => setPhase(1));
      timers.push(setTimeout(() => setPhase(2), 200));
      timers.push(setTimeout(() => setPhase(3), 400));
      timers.push(setTimeout(() => {
        setPhase(4);
        window.location.href = redirectTo ?? "/dashboard";
      }, 1200));
      timers.push(setTimeout(() => onComplete?.(), 1700));
    } else {
      startTransition(() => setPhase(3));
      timers.push(setTimeout(() => {
        setPhase(4);
        window.location.href = redirectTo ?? "/dashboard";
      }, 800));
      timers.push(setTimeout(() => onComplete?.(), 1300));
    }

    return () => timers.forEach(clearTimeout);
  }, [type, redirectTo, router, onComplete]);

  if (phase === 0) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      <div
        className="absolute inset-0 bg-black transition-opacity duration-600"
        style={{
          zIndex: 2,
          opacity: phase === 1 ? 0.5 : phase === 2 ? 0.8 : phase === 3 ? 1 : phase === 4 ? 0 : 0,
          transition: phase >= 3 ? "opacity 600ms cubic-bezier(0.4, 0, 0.2, 1)" : "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}
