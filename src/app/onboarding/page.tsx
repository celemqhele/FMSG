"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { LoginTransition } from "@/components/ui/login-transition";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const [transitionType, setTransitionType] = useState<"onboarding" | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: any } | null }) => {
      if (!data?.user) {
        router.push("/");
      }
    });
  }, [router]);

  if (transitionType) {
    return <LoginTransition type={transitionType} onComplete={() => {}} />;
  }

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <PageTransitionWrapper>
        <main className="flex-1 flex items-start justify-center px-6 py-24 md:py-32">
          <OnboardingForm onOnboarded={() => setTransitionType("onboarding")} />
        </main>
      </PageTransitionWrapper>
    </>
  );
}
