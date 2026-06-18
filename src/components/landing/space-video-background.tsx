"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useTransition } from "@/components/providers/transition-provider";

interface SpaceVideoBackgroundProps {
  src: string;
  slowPlaybackRate?: number;
  fastPlaybackRate?: number;
}

export function SpaceVideoBackground({
  src,
  slowPlaybackRate = 0.5,
  fastPlaybackRate = 2,
}: SpaceVideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const { isTransitioning } = useTransition();
  const [ready, setReady] = useState(false);
  const [hold, setHold] = useState<{ x: number; y: number } | null>(null);

  const baseRate = isTransitioning ? fastPlaybackRate : slowPlaybackRate;
  const holdBoost = hold ? 1.1 : 1;
  const targetRate = baseRate * holdBoost;

  const smoothRate = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const current = video.playbackRate;
    const diff = targetRate - current;
    if (Math.abs(diff) < 0.05) {
      video.playbackRate = targetRate;
      return;
    }
    video.playbackRate = current + diff * 0.08;
    animRef.current = requestAnimationFrame(smoothRate);
  }, [targetRate]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(smoothRate);
    return () => cancelAnimationFrame(animRef.current);
  }, [smoothRate]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("button,a,input,textarea,select,[role=button]")) return;
      setHold({ x: e.clientX, y: e.clientY });
    };
    const onUp = () => setHold(null);

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointerleave", onUp);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onUp);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ zIndex: -10 }}>
      <div
        ref={wrapperRef}
        className="absolute inset-0 transition-transform duration-[250ms] ease-out will-change-transform"
        style={
          hold
            ? {
                transformOrigin: `${hold.x}px ${hold.y}px`,
                transform: "scale(1.04)",
              }
            : undefined
        }
      >
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
          src={src}
          autoPlay
          muted
          loop
          playsInline
          onCanPlay={() => {
            if (videoRef.current) {
              videoRef.current.playbackRate = slowPlaybackRate;
              setReady(true);
            }
          }}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/60 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none" />
    </div>
  );
}
