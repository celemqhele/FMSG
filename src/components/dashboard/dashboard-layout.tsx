"use client";

import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from "react";
import { Pencil } from "lucide-react";
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
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLayout } from "./mobile/mobile-layout";
import { LegacyProfilePopup } from "./legacy-profile-popup";
import { MobileLegacyProfilePopup } from "./mobile/mobile-legacy-profile-popup";
import {
  MAX_LADDER_TITLES,
  isLegacyLadderProfile,
  isLegacyLadderSnoozed,
  snoozeLegacyLadder,
  surplusTitles,
  upgradeLegacyProfile,
  type LegacyLadderProfile,
  type LegacyUpgradeResult,
  type LegacyUpgradeStatus,
} from "@/lib/legacy-profile";
import "../landing/liquid-glass.css";

const ProfileContext = createContext<{
  activeProfileId: string | null;
  setActiveProfileId: (id: string) => void;
}>({
  activeProfileId: null,
  setActiveProfileId: () => {},
});

export const useActiveProfile = () => useContext(ProfileContext);

export function DashboardLayout({ children, guest, onGuestSignUp }: { children: ReactNode; guest?: boolean; onGuestSignUp?: () => void }) {
  const { startTransition, endTransition } = useTransition();
  const isMobile = useIsMobile();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editProfileId, setEditProfileId] = useState<string | null>(null);
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [mobileProfileSheetOpen, setMobileProfileSheetOpen] = useState(false);

  useEffect(() => {
    if (guest || activeProfileId) return;
    const supabase = createClient();
    const loadProfile = (userId: string) => {
      supabase
        .from("search_profiles")
        .select("id")
        .eq("user_id", userId)
        .order("created_at")
        .limit(1)
        .maybeSingle()
        .then(({ data }: { data: any }) => {
          if (data?.id) setActiveProfileId(data.id);
        });
    };
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      const user = data?.user;
      if (user) { loadProfile(user.id); return; }
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: { user: { id: string } } | null) => {
        if (session?.user) { loadProfile(session.user.id); subscription.unsubscribe(); }
      });
    });
  }, [guest, activeProfileId]);

  const handleProfileCreated = useCallback((id: string) => {
    setEditProfileId(id);
    setIsNewProfile(true);
  }, []);

  const handleProfileSaved = useCallback(() => {
    setProfileRefreshKey((k) => k + 1);
    // Clear any paused search continuation token since profile data changed
    if (typeof window !== "undefined") {
      localStorage.removeItem("fmsg_continuation_token");
      window.dispatchEvent(new Event("fmsg-profile-saved"));
    }
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

  // ── Legacy (retired 5-rung) profile upgrade prompt ──────────────────────
  // Profiles created before the 2-rung ladder trim still carry rungs 3-5.
  // Searches ignore them, but the profile editor would drop them silently, so
  // offer a one-click rewrite. Dismissals are snoozed per profile for a week.
  const [legacyProfile, setLegacyProfile] = useState<LegacyLadderProfile | null>(null);
  const [legacyStatus, setLegacyStatus] = useState<LegacyUpgradeStatus>("idle");
  const [legacyResult, setLegacyResult] = useState<LegacyUpgradeResult | null>(null);
  const [legacyError, setLegacyError] = useState("");

  useEffect(() => {
    if (guest || !activeProfileId) return;
    if (isLegacyLadderSnoozed(activeProfileId)) return;

    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("search_profiles")
      .select("id, job_titles, industry, industry_step_1, industry_step_2, industry_step_3, industry_step_4, industry_step_5")
      .eq("id", activeProfileId)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (cancelled) return;
        if (data && isLegacyLadderProfile(data)) {
          setLegacyProfile(data as LegacyLadderProfile);
          setLegacyStatus("idle");
          setLegacyResult(null);
          setLegacyError("");
        } else {
          setLegacyProfile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [guest, activeProfileId, profileRefreshKey]);

  const handleLegacyUpgrade = useCallback(async () => {
    if (!legacyProfile || legacyStatus === "working") return;
    setLegacyStatus("working");
    setLegacyError("");
    try {
      const result = await upgradeLegacyProfile(legacyProfile);
      setLegacyResult(result);
      setLegacyStatus("done");
      // Profile data changed: refresh dependent views and drop any paused search.
      handleProfileSaved();
    } catch (err) {
      setLegacyError(err instanceof Error ? err.message : "Could not upgrade your profile.");
      setLegacyStatus("error");
    }
  }, [legacyProfile, legacyStatus, handleProfileSaved]);

  const handleLegacyDismiss = useCallback(() => {
    if (legacyProfile) snoozeLegacyLadder(legacyProfile.id);
    setLegacyProfile(null);
    setLegacyStatus("idle");
    setLegacyResult(null);
    setLegacyError("");
  }, [legacyProfile]);

  const handleLegacyReview = useCallback(() => {
    if (!legacyProfile) return;
    snoozeLegacyLadder(legacyProfile.id);
    const id = legacyProfile.id;
    setLegacyProfile(null);
    setLegacyStatus("idle");
    handleOpenEdit(id);
  }, [legacyProfile, handleOpenEdit]);

  const legacyTitlesToKeep = (legacyProfile?.job_titles ?? [])
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_LADDER_TITLES);
  const legacyRetiredTitleCount = surplusTitles(legacyProfile).length;

  return (
    <ProfileContext.Provider value={{ activeProfileId, setActiveProfileId }}>
      <SpaceVideoBackground src="/videos/space.mp4" fastPlaybackRate={4} />

      {isMobile === null ? null : isMobile ? (
        <MobileLayout
          guest={guest}
          onSignUp={onGuestSignUp}
          profileSheetOpen={mobileProfileSheetOpen}
          onProfileSheetOpen={() => setMobileProfileSheetOpen(true)}
          onProfileSheetClose={() => setMobileProfileSheetOpen(false)}
          activeProfileId={activeProfileId}
          onSelectProfile={setActiveProfileId}
          onProfileCreated={handleProfileCreated}
          profileRefreshKey={profileRefreshKey}
          onEditProfile={(id) => handleOpenEdit(id)}
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
                {!guest && (
                  <ProfileSwitcher
                    activeProfileId={activeProfileId}
                    onSelect={setActiveProfileId}
                    onProfileCreated={handleProfileCreated}
                    refreshKey={profileRefreshKey}
                  />
                )}
                {!guest && activeProfileId && (
                  <button
                    onClick={() => handleOpenEdit(activeProfileId)}
                    className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                    title="Edit profile"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            </div>
            <div className="absolute right-0 top-0 bottom-0 flex items-center z-[60] pr-1">
              {guest ? (
                <button
                  onClick={onGuestSignUp}
                  className="flex items-center gap-2 px-4 h-10 rounded-full bg-[var(--color-accent)] text-white text-xs font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  Sign up
                </button>
              ) : (
                <ProfileDropdown />
              )}
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

      {legacyProfile && legacyProfile.id === activeProfileId && !editProfileId && (
        isMobile ? (
          <MobileLegacyProfilePopup
            isOpen={true}
            titles={legacyTitlesToKeep}
            retiredTitleCount={legacyRetiredTitleCount}
            status={legacyStatus}
            result={legacyResult}
            error={legacyError}
            onUpgrade={handleLegacyUpgrade}
            onReview={handleLegacyReview}
            onDismiss={handleLegacyDismiss}
          />
        ) : (
          <LegacyProfilePopup
            isOpen={true}
            titles={legacyTitlesToKeep}
            retiredTitleCount={legacyRetiredTitleCount}
            status={legacyStatus}
            result={legacyResult}
            error={legacyError}
            onUpgrade={handleLegacyUpgrade}
            onReview={handleLegacyReview}
            onDismiss={handleLegacyDismiss}
          />
        )
      )}
    </ProfileContext.Provider>
  );
}
