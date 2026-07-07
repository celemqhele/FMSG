"use client";

import { useState, useEffect, useCallback } from "react";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { AboutSection } from "@/components/about/about-section";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { AuthModal } from "@/components/auth/auth-modal";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";

export default function AboutPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const { startTransition, endTransition } = useTransition();

  useEffect(() => {
    endTransition();
  }, [endTransition]);

  useEffect(() => {
    if (authOpen) {
      startTransition();
      const timer = setTimeout(endTransition, 800);
      return () => clearTimeout(timer);
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
      />
      <PageTransitionWrapper>
        <main className="flex-1">
          <AboutSection />
        </main>
      </PageTransitionWrapper>
      <Footer />
      <AuthModal
        isOpen={authOpen}
        onClose={handleClose}
        defaultTab={authTab}
      />
    </>
  );
}
