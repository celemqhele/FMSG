"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { StarfieldAnimation } from "./starfield-animation";

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
      // 400ms — modal hidden, overlay fully black, starfield at 4x, overlay begins fading
      timers.push(setTimeout(() => setPhase(3), 400));
      // 1000ms — overlay fully gone, dashboard fades in, navigate
      timers.push(setTimeout(() => {
        setPhase(4);
        router.push("/dashboard");
      }, 1000));
      // 1400ms — complete, cleanup
      timers.push(setTimeout(() => {
        cleanupRef.current = true;
        onComplete?.();
      }, 1400));
    } else {
      // Onboarding: skip modal steps, start at fully black overlay
      setPhase(3);
      // 600ms — overlay fully gone, dashboard fades in, navigate
      timers.push(setTimeout(() => {
        setPhase(4);
        router.push("/dashboard");
      }, 600));
      // 1000ms — complete, cleanup
      timers.push(setTimeout(() => {
        cleanupRef.current = true;
        onComplete?.();
      }, 1000));
    }

    return () => timers.forEach(clearTimeout);
  }, [type, router, onComplete]);

  if (phase === 0) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Starfield animation layer — behind overlay */}
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        {phase >= 3 && <StarfieldAnimation speed={4} />}
      </div>

      {/* Black overlay */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-600"
        style={{
          zIndex: 2,
          opacity: phase === 1 ? 0.5 : phase === 2 ? 0.8 : phase === 3 ? 1 : phase === 4 ? 0 : 0,
          transition: phase >= 3 ? "opacity 600ms cubic-bezier(0.4, 0, 0.2, 1)" : "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />

      {/* Dashboard placeholder — fades in during phase 4 */}
      {phase >= 4 && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            zIndex: 0,
            animation: "auth-screen-in 400ms ease-out forwards",
          }}
        >
          <p className="text-white/30 text-sm">Loading dashboard...</p>
        </div>
      )}
    </div>
  );
}
