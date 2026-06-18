"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
interface LoginTransitionProps {
  type: "login" | "onboarding";
  onComplete?: () => void;
}

export function LoginTransition({ type, onComplete }: LoginTransitionProps) {
  const router = useRouter();
  const [phase, setPhase] = useState(0);
  const cleanupRef = useRef(false);

  useEffect(() => {
    if (cleanupRef.current) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (type === "login") {
      // 0ms — modal scaling started by AuthModal
      setPhase(1);
      // 200ms — modal content fades
      timers.push(setTimeout(() => setPhase(2), 200));
      // 400ms — navigate to dashboard + overlay fully black
      timers.push(setTimeout(() => {
        setPhase(3);
        router.push("/dashboard");
      }, 400));
      // 1000ms — overlay fades out revealing dashboard underneath
      timers.push(setTimeout(() => setPhase(4), 1000));
      // 1700ms — complete, cleanup
      timers.push(setTimeout(() => {
        cleanupRef.current = true;
        onComplete?.();
      }, 1700));
    } else {
      // Onboarding: start at fully black overlay + navigate immediately
      setPhase(3);
      router.push("/dashboard");
      // 600ms — overlay fades out revealing dashboard
      timers.push(setTimeout(() => setPhase(4), 600));
      // 1300ms — complete, cleanup
      timers.push(setTimeout(() => {
        cleanupRef.current = true;
        onComplete?.();
      }, 1300));
    }

    return () => timers.forEach(clearTimeout);
  }, [type, router, onComplete]);

  if (phase === 0) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Black overlay */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-600"
        style={{
          zIndex: 2,
          opacity: phase === 1 ? 0.5 : phase === 2 ? 0.8 : phase === 3 ? 1 : phase === 4 ? 0 : 0,
          transition: phase >= 3 ? "opacity 600ms cubic-bezier(0.4, 0, 0.2, 1)" : "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />

      {/* Dashboard renders behind overlay — phase 4 reveals it */}
    </div>
  );
}
