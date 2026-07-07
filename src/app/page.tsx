"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DataPrivacy } from "@/components/landing/data-privacy";
import { PricingSection } from "@/components/landing/pricing-section";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";

export default function HomePage() {
  const router = useRouter();
  const { endTransition } = useTransition();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar
        isLoggedIn={isLoggedIn}
        onSignUpClick={() => router.push("/dashboard")}
      />
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
