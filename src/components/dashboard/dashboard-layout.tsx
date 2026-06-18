"use client";

import type { ReactNode } from "react";
import { ProfileDropdown } from "./profile-dropdown";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col text-[var(--color-text-primary)] bg-[var(--color-bg)]">
      <SpaceVideoBackground src="/videos/space.mp4" />
      <header className="relative z-10 flex justify-end items-center px-6 py-4">
        <ProfileDropdown />
      </header>
      <main className="relative z-10 flex-1 px-6 pb-12">
        {children}
      </main>
    </div>
  );
}
