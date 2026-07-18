"use client";

export function MobileSkeletonCard() {
  return (
    <div className="liquid-glass rounded-xl p-3.5 animate-pulse">
      <div className="flex items-center gap-1.5 mb-2">
        <div className="h-4 w-20 rounded-full bg-white/10" />
        <div className="h-4 w-16 rounded-full bg-white/10" />
      </div>
      <div className="h-4 w-3/4 rounded bg-white/10 mb-1.5" />
      <div className="h-3 w-1/2 rounded bg-white/10 mb-1" />
      <div className="h-3 w-1/3 rounded bg-white/10 mb-3" />
      <div className="flex gap-2">
        <div className="h-9 w-16 rounded-lg bg-white/10" />
        <div className="h-9 w-16 rounded-lg bg-white/10" />
        <div className="h-9 w-9 rounded-lg bg-white/10" />
        <div className="h-9 w-9 rounded-lg bg-white/10" />
      </div>
    </div>
  );
}
