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
  const [hold, setHold] = useState(false);
  const holdRef = useRef(false);
  const [warp, setWarp] = useState({ x: 0, y: 0, s: 1 });

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
      holdRef.current = true;
      setHold(true);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setWarp({
        x: ((e.clientX - cx) / cx) * 3,
        y: -((e.clientY - cy) / cy) * 3,
        s: 1.02,
      });
    };
    const onUp = () => {
      holdRef.current = false;
      setHold(false);
      setWarp({ x: 0, y: 0, s: 1 });
    };

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
    <div className="fixed inset-0 overflow-hidden bg-black" style={{ zIndex: -10 }}>
      <div
        ref={wrapperRef}
        className="absolute inset-0 will-change-transform"
        style={{
          transform: `perspective(900px) rotateX(${warp.y}deg) rotateY(${warp.x}deg) scale(${warp.s})`,
          transition: hold ? "none" : "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
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
