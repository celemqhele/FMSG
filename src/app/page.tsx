"use client";

import { useState, useEffect, useCallback } from "react";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DataPrivacy } from "@/components/landing/data-privacy";
import { PricingSection } from "@/components/landing/pricing-section";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { AuthModal } from "@/components/auth/auth-modal";
import { MobileAuthSheet } from "@/components/auth/mobile-auth-sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";

export default function HomePage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { startTransition, endTransition } = useTransition();
  const isMobile = useIsMobile();

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      setIsLoggedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      setIsLoggedIn(!!session);
    });
    return () => { subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (authOpen) {
      startTransition();
      const timer = setTimeout(endTransition, 800);
      return () => clearTimeout(timer);
    } else {
      endTransition();
    }
  }, [authOpen, startTransition, endTransition]);

  const openAuth = (tab: "login" | "signup") => {
    setAuthTab(tab);
    setAuthOpen(true);
  };

  const handleClose = useCallback(() => setAuthOpen(false), []);

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar
        onLoginClick={() => openAuth("login")}
        onSignUpClick={() => openAuth("signup")}
        isLoggedIn={isLoggedIn}
      />
      <PageTransitionWrapper>
        <main className="flex-1">
          <Hero onCtaClick={() => openAuth("signup")} isLoggedIn={isLoggedIn} />
          <HowItWorks />
          <DataPrivacy />
          <PricingSection />
        </main>
      </PageTransitionWrapper>
      <Footer />
      {isMobile ? (
        <MobileAuthSheet
          isOpen={authOpen}
          onClose={handleClose}
          defaultTab={authTab}
        />
      ) : (
        <AuthModal
          isOpen={authOpen}
          onClose={handleClose}
          defaultTab={authTab}
        />
      )}
    </>
  );
}
