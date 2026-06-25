"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DataPrivacy } from "@/components/landing/data-privacy";
import { PricingSection } from "@/components/landing/pricing-section";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { AuthModal } from "@/components/auth/auth-modal";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("signup");
  const { startTransition, endTransition } = useTransition();

  useEffect(() => { endTransition(); }, [endTransition]);

  useEffect(() => {
    const hasAuthParam = searchParams.has("code") || searchParams.has("type") || searchParams.has("error");
    if (hasAuthParam) {
      router.replace(`/auth/confirm${window.location.search}`);
    }
  }, [searchParams, router]);

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
      />
      <PageTransitionWrapper>
        <main className="flex-1">
          <Hero onCtaClick={() => openAuth("signup")} />
          <HowItWorks />
          <DataPrivacy />
          <PricingSection />
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
