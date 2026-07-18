"use client";

import { type ReactNode } from "react";
import { MobileHeader } from "./mobile-header";
import { MobileProfileSheet } from "./mobile-profile-sheet";

interface MobileLayoutProps {
  children: ReactNode;
  profileSheetOpen: boolean;
  onProfileSheetOpen: () => void;
  onProfileSheetClose: () => void;
  activeProfileId: string | null;
  onSelectProfile: (id: string) => void;
  onProfileCreated?: (id: string) => void;
  profileRefreshKey?: number;
}

export function MobileLayout({ children, profileSheetOpen, onProfileSheetOpen, onProfileSheetClose, activeProfileId, onSelectProfile, onProfileCreated, profileRefreshKey }: MobileLayoutProps) {
  return (
    <>
      <MobileHeader onAvatarTap={onProfileSheetOpen} />
      <main className="relative z-10 pt-14 pb-20 px-4 min-h-dvh">
        {children}
      </main>
      <MobileProfileSheet isOpen={profileSheetOpen} onClose={onProfileSheetClose} activeProfileId={activeProfileId} onSelectProfile={onSelectProfile} onProfileCreated={onProfileCreated} refreshKey={profileRefreshKey} />
    </>
  );
}
