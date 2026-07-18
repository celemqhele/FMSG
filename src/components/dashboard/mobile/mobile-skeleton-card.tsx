"use client";

export function MobileSkeletonCard() {
  return (
    <div className="liquid-glass rounded-[10px] p-2.5 animate-pulse">
      <div className="flex items-center gap-1 mb-1.5">
        <div className="h-4 w-20 rounded-full bg-white/10" />
        <div className="h-4 w-16 rounded-full bg-white/10" />
      </div>
      <div className="h-4 w-3/4 rounded bg-white/10 mb-1" />
      <div className="h-3 w-1/2 rounded bg-white/10 mb-0.5" />
      <div className="h-3 w-1/3 rounded bg-white/10 mb-2.5" />
      <div className="flex gap-1.5">
        <div className="h-7 w-16 rounded-[7px] bg-white/10" />
        <div className="h-7 w-16 rounded-[7px] bg-white/10" />
        <div className="h-7 w-7 rounded-[7px] bg-white/10" />
        <div className="h-7 w-7 rounded-[7px] bg-white/10" />
      </div>
    </div>
  );
}
