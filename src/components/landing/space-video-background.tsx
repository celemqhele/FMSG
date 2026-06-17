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
  const animRef = useRef<number>(0);
  const { isTransitioning } = useTransition();
  const [ready, setReady] = useState(false);

  const targetRate = isTransitioning ? fastPlaybackRate : slowPlaybackRate;

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

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
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
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/60" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
    </div>
  );
}
