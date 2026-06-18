"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { X } from "lucide-react";
import { LogInForm } from "./log-in-form";
import { SignUpForm } from "./sign-up-form";
import { ForgotPasswordForm } from "./forgot-password-form";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "login" | "signup";
}

type Screen = "login" | "signup" | "signup-sent" | "forgot" | "forgot-sent";

export function AuthModal({ isOpen, onClose, defaultTab = "signup" }: AuthModalProps) {
  const [mounted, setMounted] = useState(false);
  const [screen, setScreen] = useState<Screen>(defaultTab);
  const [pendingEmail, setPendingEmail] = useState("");

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setScreen(defaultTab);
    } else {
      const timer = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, defaultTab]);

  const switchScreen = useCallback((s: Screen) => {
    setScreen(s);
  }, []);

  const handleSignUpSubmit = useCallback(({ email, autoConfirmed }: { email: string; autoConfirmed: boolean }) => {
    if (autoConfirmed) {
      onClose();
    } else {
      setPendingEmail(email);
      setScreen("signup-sent");
    }
  }, [onClose]);

  const handleVerified = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleLoggedIn = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!mounted && !isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[110] flex items-center justify-center transition-opacity duration-200 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={`relative w-full max-w-md mx-4 p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[var(--color-border)] shadow-[var(--shadow-lg)] transition-all duration-200 ${
          isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {screen !== "signup-sent" && screen !== "forgot-sent" && (
          <div className="flex gap-1 mb-6 p-1 rounded-lg bg-[var(--color-surface)]">
            <button
              onClick={() => switchScreen("login")}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                screen === "login"
                  ? "bg-white dark:bg-[#2C2C2E] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => switchScreen("signup")}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                screen === "signup"
                  ? "bg-white dark:bg-[#2C2C2E] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        <ContentWrapper key={screen}>
          {screen === "login" && (
            <LogInForm onForgotPassword={() => switchScreen("forgot")} onLoggedIn={handleLoggedIn} />
          )}
          {screen === "signup" && <SignUpForm onSuccess={handleSignUpSubmit} />}
          {screen === "signup-sent" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Check your email for the confirmation link.
              </p>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{pendingEmail}</p>
              <button
                onClick={() => switchScreen("signup")}
                className="text-sm text-[var(--color-accent)] hover:underline transition-colors"
              >
                Back to Sign Up
              </button>
            </div>
          )}
          {screen === "forgot" && (
            <ForgotPasswordForm
              onBack={() => switchScreen("login")}
              onSent={(email) => {
                setPendingEmail(email);
                switchScreen("forgot-sent");
              }}
            />
          )}
          {screen === "forgot-sent" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Check your email. We sent a password reset link to
              </p>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{pendingEmail}</p>
              <button
                onClick={() => switchScreen("login")}
                className="text-sm text-[var(--color-accent)] hover:underline transition-colors"
              >
                Back to Log In
              </button>
            </div>
          )}
        </ContentWrapper>
      </div>

      <button
        onClick={onClose}
        className="fixed top-6 right-6 z-[111] p-2 text-white/60 hover:text-white transition-colors"
        aria-label="Close modal"
      >
        <X size={24} />
      </button>
    </div>
  );
}

function ContentWrapper({ children }: { children: ReactNode }) {
  return (
    <div style={{ animation: "auth-screen-in 200ms ease-out" }}>
      {children}
    </div>
  );
}
