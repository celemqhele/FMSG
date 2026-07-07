"use client";

import { useEffect } from "react";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DataPrivacy } from "@/components/landing/data-privacy";
import { PricingSection } from "@/components/landing/pricing-section";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";

export default function HomePage() {
  const { endTransition } = useTransition();

  useEffect(() => { endTransition(); }, [endTransition]);

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar />
      <PageTransitionWrapper>
        <main className="flex-1">
          <Hero />
          <HowItWorks />
          <DataPrivacy />
          <PricingSection />
        </main>
      </PageTransitionWrapper>
      <Footer />
    </>
  );
}
