"use client";

import { SearchPill } from "@/components/dashboard/search-pill";
import { BalanceChips } from "@/components/dashboard/balance-chips";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { MobileSkeletonCard } from "@/components/dashboard/mobile/mobile-skeleton-card";
import { useIsMobile } from "@/hooks/use-mobile";

function SkeletonCard() {
  return (
    <div className="liquid-glass rounded-xl p-6 animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="h-5 w-32 rounded-full bg-white/10" />
        <div className="h-4 w-4 rounded bg-white/10" />
      </div>
      <div className="h-5 w-3/4 rounded bg-white/10 mb-2" />
      <div className="h-4 w-1/2 rounded bg-white/10 mb-1" />
      <div className="h-4 w-1/3 rounded bg-white/10 mb-4" />
      <div className="flex gap-3 pt-2">
        <div className="h-10 flex-1 rounded-full bg-white/10" />
        <div className="h-10 flex-1 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  const isMobile = useIsMobile();

  return (
    <PageTransitionWrapper>
      <div className={`max-w-4xl mx-auto space-y-6 ${isMobile ? "pt-16 px-4 pb-20" : "pt-8"}`}>
        {!isMobile && (
          <>
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="h-8 w-20 rounded-lg bg-white/10 animate-pulse" />
              <div className="h-8 w-20 rounded-lg bg-white/10 animate-pulse" />
              <div className="h-8 w-20 rounded-lg bg-white/10 animate-pulse" />
              <div className="h-8 w-20 rounded-lg bg-white/10 animate-pulse" />
              <div className="h-8 w-20 rounded-lg bg-white/10 animate-pulse" />
            </div>
            <div className="w-full max-w-2xl mx-auto">
              <div className="h-14 rounded-full bg-white/10 animate-pulse" />
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              <BalanceChips />
            </div>
          </>
        )}
        {isMobile && (
          <div className="space-y-3 pt-4">
            <MobileSkeletonCard />
            <MobileSkeletonCard />
            <MobileSkeletonCard />
          </div>
        )}
        {!isMobile && (
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}
      </div>
    </PageTransitionWrapper>
  );
}
