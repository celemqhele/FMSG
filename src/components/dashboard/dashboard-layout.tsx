"use client";

import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { ProfileSwitcher } from "./profile-switcher";
import { ProfileDropdown } from "./profile-dropdown";
import { ProfileOnboardingModal } from "./profile-onboarding-modal";
import "../landing/liquid-glass.css";

const ProfileContext = createContext<{ activeProfileId: string | null; setActiveProfileId: (id: string) => void }>({
  activeProfileId: null,
  setActiveProfileId: () => {},
});

export const useActiveProfile = () => useContext(ProfileContext);

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editProfileId, setEditProfileId] = useState<string | null>(null);

  const handleProfileCreated = useCallback((id: string) => {
    setEditProfileId(id);
  }, []);

  const handleDeleteProfile = useCallback((id: string) => {
    if (activeProfileId === id) {
      setActiveProfileId(null);
    }
  }, [activeProfileId]);

  return (
    <ProfileContext.Provider value={{ activeProfileId, setActiveProfileId }}>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl">
        <div className="liquid-glass-surface flex items-center justify-between px-4 py-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-white select-none">FMSG</span>
            <ProfileSwitcher activeProfileId={activeProfileId} onSelect={setActiveProfileId} onProfileCreated={handleProfileCreated} />
            {activeProfileId && (
              <button
                onClick={() => setEditProfileId(activeProfileId)}
                className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                title="Edit profile"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
          <ProfileDropdown />
        </div>
      </header>
      <main className="relative z-10 flex-1 px-6 pb-12 pt-24">
        {children}
      </main>

      {editProfileId && (
        <ProfileOnboardingModal
          profileId={editProfileId}
          editMode
          onDelete={handleDeleteProfile}
          onClose={() => setEditProfileId(null)}
        />
      )}
    </ProfileContext.Provider>
  );
}
