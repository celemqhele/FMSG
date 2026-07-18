"use client";

import { type ReactNode } from "react";
import { MobileHeader } from "./mobile-header";
import { MobileProfileSheet } from "./mobile-profile-sheet";

interface MobileLayoutProps {
  children: ReactNode;
  profileSheetOpen: boolean;
  onProfileSheetOpen: () => void;
  onProfileSheetClose: () => void;
}

export function MobileLayout({ children, profileSheetOpen, onProfileSheetOpen, onProfileSheetClose }: MobileLayoutProps) {
  return (
    <>
      <MobileHeader onAvatarTap={onProfileSheetOpen} />
      <main className="relative z-10 pt-14 pb-20 px-4 min-h-dvh">
        {children}
      </main>
      <MobileProfileSheet isOpen={profileSheetOpen} onClose={onProfileSheetClose} />
    </>
  );
}
