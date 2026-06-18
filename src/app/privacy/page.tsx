"use client";

import { useState, useEffect } from "react";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { AuthModal } from "@/components/auth/auth-modal";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { LiquidGlassCard } from "@/components/landing/liquid-glass-card";
import { useTransition } from "@/components/providers/transition-provider";
import { FileText } from "lucide-react";

export default function PrivacyPage() {
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

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar
        onLoginClick={() => openAuth("login")}
        onSignUpClick={() => openAuth("signup")}
      />
      <PageTransitionWrapper>
        <main className="flex-1 px-6 py-24 md:py-32">
          <div className="max-w-3xl mx-auto text-center">
            <FileText size={40} className="mx-auto text-white/40" />
            <h1 className="mt-6 text-4xl md:text-5xl font-semibold text-white tracking-tight">
              Privacy Policy
            </h1>
            <p className="mt-4 text-lg text-white/60">
              How we handle your data.
            </p>
          </div>

          <div className="mt-12 max-w-3xl mx-auto">
            <LiquidGlassCard variant="surface" className="p-8 text-center">
              <p className="text-white/50 text-lg">
                No articles yet.
              </p>
              <p className="mt-2 text-white/30 text-sm">
                Privacy policy content will be published once the platform is ready.
              </p>
            </LiquidGlassCard>
          </div>
        </main>
      </PageTransitionWrapper>
      <Footer />
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab={authTab}
      />
    </>
  );
}
