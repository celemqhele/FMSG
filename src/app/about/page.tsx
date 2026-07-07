"use client";

import { useEffect } from "react";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { AboutSection } from "@/components/about/about-section";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";

export default function AboutPage() {
  const { endTransition } = useTransition();

  useEffect(() => { endTransition(); }, [endTransition]);

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar />
      <PageTransitionWrapper>
        <main className="flex-1">
          <AboutSection />
        </main>
      </PageTransitionWrapper>
      <Footer />
    </>
  );
}
