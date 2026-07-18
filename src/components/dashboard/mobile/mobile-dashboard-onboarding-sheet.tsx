"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

interface MobileDashboardOnboardingSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOnboarded: () => void;
}

export function MobileDashboardOnboardingSheet({ isOpen, onClose, onOnboarded }: MobileDashboardOnboardingSheetProps) {
  const [step, setStep] = useState<"prompt" | "form" | "done">("prompt");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#1C1C1E] rounded-t-[24px] flex flex-col overflow-hidden" style={{ height: "calc(100dvh - 3rem)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-9 h-[5px] rounded-full bg-white/20" />
        </div>

        {step === "prompt" && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-6">
              <Upload size={28} className="text-white/70" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-3">Set Up Your Account</h2>
            <p className="text-sm text-white/60 mb-8 leading-relaxed">
              Upload your CV and we&apos;ll extract your details automatically to set up your job search profile.
            </p>
            <button
              onClick={() => setStep("form")}
              className="w-full h-12 flex items-center justify-center rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium"
            >
              Set up account
            </button>
          </div>
        )}

        {step === "form" && (
          <div className="flex-1 overflow-y-auto">
            <OnboardingForm onOnboarded={() => setStep("done")} />
          </div>
        )}

        {step === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/20 flex items-center justify-center mb-6">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-xl font-semibold text-white mb-3">Account set up!</h2>
            <p className="text-sm text-white/60 mb-8">You&apos;re ready to start searching for jobs.</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full h-12 flex items-center justify-center rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
