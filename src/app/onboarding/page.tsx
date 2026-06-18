"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: any } | null }) => {
      if (!data?.user) {
        router.push("/");
      }
    });
  }, [router]);

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <PageTransitionWrapper>
        <main className="flex-1 flex items-start justify-center px-6 py-24 md:py-32">
          <OnboardingForm />
        </main>
      </PageTransitionWrapper>
    </>
  );
}
