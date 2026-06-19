"use client";

import { useState, createContext, useContext, type ReactNode } from "react";
import { ProfileDropdown } from "./profile-dropdown";
import { ProfileSwitcher } from "./profile-switcher";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";

const ProfileContext = createContext<{ activeProfileId: string | null; setActiveProfileId: (id: string) => void }>({
  activeProfileId: null,
  setActiveProfileId: () => {},
});

export const useActiveProfile = () => useContext(ProfileContext);

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  return (
    <ProfileContext.Provider value={{ activeProfileId, setActiveProfileId }}>
      <div className="min-h-dvh flex flex-col text-[var(--color-text-primary)]">
        <SpaceVideoBackground src="/videos/space.mp4" />
        <header className="relative z-10 flex items-center justify-between gap-3 px-4 md:px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight text-white/80 md:text-white/60 select-none">FMSG</span>
            <ProfileSwitcher activeProfileId={activeProfileId} onSelect={setActiveProfileId} />
          </div>
          <ProfileDropdown />
        </header>
      <main className="relative z-10 flex-1 px-6 pb-12">
        {children}
      </main>
    </div>
    </ProfileContext.Provider>
  );
}
