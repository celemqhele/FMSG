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
  fastPlaybackRate = 4,
}: SpaceVideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const animRef = useRef<number>(0);
  const { isTransitioning, videoFast } = useTransition();
  // No need for 'ready' state; the video should load and display immediately.

  return (
    <div className="fixed inset-0 overflow-hidden bg-black pointer-events-none" style={{ zIndex: -10 }}>
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover object-[55%_50%] md:object-center"
          // Appending ?v=1 to bust cache. Increment this if the video file changes.
          src={`${src}?v=1`}
          autoPlay
          muted
          loop
          playsInline
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/60 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none" />
    </div>
  );
}
