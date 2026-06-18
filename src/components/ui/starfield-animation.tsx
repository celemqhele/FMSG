"use client";

import { useMemo } from "react";

interface StarfieldAnimationProps {
  speed?: number;
  className?: string;
}

export function StarfieldAnimation({ speed = 1, className = "" }: StarfieldAnimationProps) {
  const stars = useMemo(() => {
    const result: Array<{ x: number; y: number; size: number; opacity: number; dur: number; delay: number }> = [];
    for (let i = 0; i < 200; i++) {
      result.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2.5 + 0.5,
        opacity: Math.random() * 0.8 + 0.2,
        dur: Math.random() * 4 + 2,
        delay: Math.random() * 3,
      });
    }
    return result;
  }, []);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 30% 40%, rgba(88, 48, 176, 0.3) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 60%, rgba(0, 120, 255, 0.25) 0%, transparent 40%),
            radial-gradient(ellipse at 50% 80%, rgba(200, 50, 150, 0.2) 0%, transparent 40%)
          `,
        }}
      />
      <div
        className="absolute inset-0"
        style={{ animation: `starfield-drift ${20 / speed}s linear infinite` }}
      >
        {stars.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              opacity: s.opacity,
              animation: `starfield-twinkle ${s.dur / speed}s ease-in-out ${s.delay / speed}s infinite alternate`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
