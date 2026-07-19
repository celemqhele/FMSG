"use client";

import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from "react";
import { Pencil, Plus } from "lucide-react";
import Image from "next/image";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { ProfileSwitcher } from "./profile-switcher";
import { ProfileDropdown } from "./profile-dropdown";
import { EmailConfirmationBanner } from "./email-confirmation-banner";
import dynamic from "next/dynamic";
const ProfileOnboardingModal = dynamic(
  () => import("./profile-onboarding-modal").then((mod) => mod.ProfileOnboardingModal),
  { ssr: false }
);
const MobileProfileOnboardingSheet = dynamic(
  () => import("./mobile/mobile-profile-onboarding-sheet").then((mod) => mod.MobileProfileOnboardingSheet),
  { ssr: false }
);
const AdminCreateJobModal = dynamic(
  () => import("./admin-create-job-modal").then((mod) => mod.AdminCreateJobModal),
  { ssr: false }
);
const MobileAdminCreateJobSheet = dynamic(
  () => import("./mobile/mobile-admin-create-job-sheet").then((mod) => mod.MobileAdminCreateJobSheet),
  { ssr: false }
);
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLayout } from "./mobile/mobile-layout";
import "../landing/liquid-glass.css";

const ProfileContext = createContext<{
  activeProfileId: string | null;
  setActiveProfileId: (id: string) => void;
}>({
  activeProfileId: null,
  setActiveProfileId: () => {},
});

export const useActiveProfile = () => useContext(ProfileContext);

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { startTransition, endTransition } = useTransition();
  const isMobile = useIsMobile();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editProfileId, setEditProfileId] = useState<string | null>(null);
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [mobileProfileSheetOpen, setMobileProfileSheetOpen] = useState(false);

  useEffect(() => {
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (!adminEmail) return;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (session?.user?.email === adminEmail) {
        setIsAdmin(true);
      }
    });
  }, []);

  useEffect(() => {
    if (activeProfileId) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      const user = data?.user;
      if (!user) return;
      supabase
        .from("search_profiles")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at")
        .limit(1)
        .maybeSingle()
        .then(({ data }: { data: any }) => {
          if (data?.id) setActiveProfileId(data.id);
        });
    });
  }, [activeProfileId]);

  const handleProfileCreated = useCallback((id: string) => {
    setEditProfileId(id);
    setIsNewProfile(true);
  }, []);

  const handleProfileSaved = useCallback(() => {
    setProfileRefreshKey((k) => k + 1);
  }, []);

  const handleDeleteProfile = useCallback(
    (id: string) => {
      if (activeProfileId === id) {
        setActiveProfileId(null);
      }
      setProfileRefreshKey((k) => k + 1);
    },
    [activeProfileId]
  );

  const handleOpenEdit = useCallback(
    (id: string) => {
      startTransition();
      setEditProfileId(id);
    },
    [startTransition]
  );

  const handleCloseModal = useCallback(() => {
    setEditProfileId(null);
    setIsNewProfile(false);
    endTransition();
  }, [endTransition]);

  return (
    <ProfileContext.Provider value={{ activeProfileId, setActiveProfileId }}>
      <SpaceVideoBackground src="/videos/space.mp4" fastPlaybackRate={4} />

      {isMobile === null ? null : isMobile ? (
        <MobileLayout
          profileSheetOpen={mobileProfileSheetOpen}
          onProfileSheetOpen={() => setMobileProfileSheetOpen(true)}
          onProfileSheetClose={() => setMobileProfileSheetOpen(false)}
          activeProfileId={activeProfileId}
          onSelectProfile={setActiveProfileId}
          onProfileCreated={handleProfileCreated}
          profileRefreshKey={profileRefreshKey}
          onEditProfile={(id) => handleOpenEdit(id)}
          isAdmin={isAdmin}
          onOpenAdminModal={() => setAdminModalOpen(true)}
        >
          <div className="max-w-4xl mx-auto mb-4">
            <EmailConfirmationBanner />
          </div>
          {children}
        </MobileLayout>
      ) : (
        <>
          <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl">
            <div className="liquid-glass-surface flex items-center justify-between px-4 py-2 rounded-2xl pr-11">
              <div className="flex items-center gap-2">
                <Image src="/icon.png" alt="FMSG" width={24} height={24} className="shrink-0" priority />
                <span className="text-base font-semibold text-white select-none">
                  FMSG
                </span>
                <ProfileSwitcher
                  activeProfileId={activeProfileId}
                  onSelect={setActiveProfileId}
                  onProfileCreated={handleProfileCreated}
                  refreshKey={profileRefreshKey}
                />
                {activeProfileId && (
                  <button
                    onClick={() => handleOpenEdit(activeProfileId)}
                    className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                    title="Edit profile"
                  >
                    <Pencil size={12} />
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => setAdminModalOpen(true)}
                    className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                    title="Create job post"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            </div>
            <div className="absolute right-0 top-0 bottom-0 flex items-center z-[60] pr-1">
              <ProfileDropdown />
            </div>
          </header>
          <main className="relative z-10 flex-1 px-6 pb-12 pt-24">
            <div className="max-w-4xl mx-auto mb-6">
              <EmailConfirmationBanner />
            </div>
            {children}
          </main>
        </>
      )}

      {editProfileId && (
        isMobile ? (
          <MobileProfileOnboardingSheet
            profileId={editProfileId}
            editMode={!isNewProfile}
            showUploadStep={isNewProfile}
            onSaved={handleProfileSaved}
            onDelete={handleDeleteProfile}
            onClose={handleCloseModal}
          />
        ) : (
          <ProfileOnboardingModal
            profileId={editProfileId}
            editMode={!isNewProfile}
            showUploadStep={isNewProfile}
            onSaved={handleProfileSaved}
            onDelete={handleDeleteProfile}
            onClose={handleCloseModal}
          />
        )
      )}
      {isAdmin && (
        isMobile ? (
          <MobileAdminCreateJobSheet isOpen={adminModalOpen} onClose={() => setAdminModalOpen(false)} />
        ) : (
          <AdminCreateJobModal isOpen={adminModalOpen} onClose={() => setAdminModalOpen(false)} />
        )
      )}
    </ProfileContext.Provider>
  );
}
