"use client";

import { useState, useEffect, useCallback, startTransition, type ReactNode } from "react";
import { X } from "lucide-react";
import { LogInForm } from "@/components/auth/log-in-form";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { LoginTransition } from "@/components/ui/login-transition";

interface MobileAuthSheetProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "login" | "signup";
}

type Screen = "login" | "signup" | "forgot" | "forgot-sent";

export function MobileAuthSheet({ isOpen, onClose, defaultTab = "signup" }: MobileAuthSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [screen, setScreen] = useState<Screen>(defaultTab);
  const [pendingEmail, setPendingEmail] = useState("");
  const [transitionType, setTransitionType] = useState<"login" | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (isOpen) {
      startTransition(() => { setMounted(true); setScreen(defaultTab); });
    } else {
      const timer = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, defaultTab]);

  const switchScreen = useCallback((s: Screen) => setScreen(s), []);

  const handleSignUpSubmit = useCallback(() => setTransitionType("login"), []);

  const handleLoggedIn = useCallback(() => {
    setTransitionType("login");
    setTimeout(() => { setTransitionType(null); onClose(); }, 5000);
  }, [onClose]);

  const handleTransitionComplete = useCallback(() => onClose(), [onClose]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setDragY(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > 100) onClose();
    else setDragY(0);
  }, [dragY, onClose]);

  if (!mounted && !isOpen && !transitionType) return null;

  return (
    <>
      <div className={`fixed inset-0 z-[110] flex flex-col justify-end transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0"} ${transitionType ? "pointer-events-none" : ""}`}>
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          style={{ transition: "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)", opacity: transitionType === "login" ? 1 : undefined }}
          onClick={onClose}
        />
        <div
          className="relative bg-[#1C1C1E] rounded-t-[19px] overflow-hidden transition-transform duration-300 ease-out"
          style={{
            transform: `translateY(${dragY > 0 ? dragY : 0}px)`,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            maxHeight: "90dvh",
          }}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex justify-center pt-2.5 pb-1.5 shrink-0">
            <div className="w-7 h-[5px] rounded-full bg-white/20" />
          </div>

          {screen !== "forgot-sent" && (
            <div className="flex gap-1 mx-4 mb-3 p-1 rounded-[7px] bg-white/10 shrink-0">
              <button
                onClick={() => switchScreen("login")}
                className={`flex-1 h-9 flex items-center justify-center text-[11px] font-medium rounded transition-colors ${screen === "login" ? "bg-white/15 text-white" : "text-white/50"}`}
              >
                Log In
              </button>
              <button
                onClick={() => switchScreen("signup")}
                className={`flex-1 h-9 flex items-center justify-center text-[11px] font-medium rounded transition-colors ${screen === "signup" ? "bg-white/15 text-white" : "text-white/50"}`}
              >
                Sign Up
              </button>
            </div>
          )}

          <div className="overflow-y-auto px-4 pb-5 max-h-[calc(90dvh-64px)]">
            <ContentWrapper key={screen}>
              {screen === "login" && (
                <LogInForm onForgotPassword={() => switchScreen("forgot")} onLoggedIn={handleLoggedIn} />
              )}
              {screen === "signup" && <SignUpForm onSuccess={handleSignUpSubmit} />}
              {screen === "forgot" && (
                <ForgotPasswordForm
                  onBack={() => switchScreen("login")}
                  onSent={(email) => { setPendingEmail(email); switchScreen("forgot-sent"); }}
                />
              )}
              {screen === "forgot-sent" && (
                <div className="flex flex-col items-center gap-3 text-center py-6">
                  <p className="text-[11px] text-white/60">Check your email. We sent a password reset link to</p>
                  <p className="text-[11px] font-medium text-white">{pendingEmail}</p>
                  <button onClick={() => switchScreen("login")} className="text-[11px] text-[var(--color-accent)] hover:underline">
                    Back to Log In
                  </button>
                </div>
              )}
            </ContentWrapper>
          </div>

          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center text-white/60 hover:text-white z-10"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {transitionType && (
        <LoginTransition type="login" onComplete={handleTransitionComplete} />
      )}
    </>
  );
}

function ContentWrapper({ children }: { children: ReactNode }) {
  return <div style={{ animation: "auth-screen-in 200ms ease-out" }}>{children}</div>;
}
