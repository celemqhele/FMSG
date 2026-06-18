"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.has("code")) {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }: { data: { session: any } | null }) => {
        if (!data?.session) {
          router.replace("/");
        }
      });
    }
  }, [searchParams, router]);

  const handleContinue = async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .single();

      if (profile?.onboarding_completed) {
        router.push("/");
      } else {
        router.push("/onboarding");
      }
    } catch {
      router.push("/onboarding");
    }
  };

  return (
    <div className="relative z-10 flex items-center justify-center min-h-dvh px-6">
      <div className="liquid-glass-card w-full max-w-sm text-center space-y-6 p-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          Email Confirmed
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">
            Thanks for confirming your email
          </h1>
          <p className="text-sm text-white/60">
            Your account is ready to go.
          </p>
        </div>

        <button
          onClick={handleContinue}
          disabled={loading}
          className="w-full px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors disabled:opacity-50"
        >
          {loading ? "Loading..." : "Continue to Dashboard"}
        </button>
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <Suspense fallback={null}>
        <ConfirmContent />
      </Suspense>
    </>
  );
}
