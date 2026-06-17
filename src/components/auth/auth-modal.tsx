"use client";

import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { LogInForm } from "./log-in-form";
import { SignUpForm } from "./sign-up-form";
import { VerifyCode } from "./verify-code";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "login" | "signup";
}

type Screen = "login" | "signup" | "verify";

export function AuthModal({ isOpen, onClose, defaultTab = "signup" }: AuthModalProps) {
  const [screen, setScreen] = useState<Screen>(defaultTab);
  const [pendingEmail, setPendingEmail] = useState("");

  const switchToLogin = useCallback(() => setScreen("login"), []);
  const switchToSignUp = useCallback(() => setScreen("signup"), []);

  const handleSignUpSubmit = useCallback((email: string) => {
    setPendingEmail(email);
    setScreen("verify");
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[var(--color-border)] shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>

        <div className="flex gap-1 mb-6 p-1 rounded-lg bg-[var(--color-surface)]">
          <button
            onClick={switchToLogin}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              screen === "login"
                ? "bg-white dark:bg-[#2C2C2E] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            Log In
          </button>
          <button
            onClick={switchToSignUp}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              screen === "signup"
                ? "bg-white dark:bg-[#2C2C2E] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            Sign Up
          </button>
        </div>

        {screen === "login" && <LogInForm />}
        {screen === "signup" && <SignUpForm onSuccess={handleSignUpSubmit} />}
        {screen === "verify" && (
          <VerifyCode email={pendingEmail} onBack={switchToSignUp} />
        )}
      </div>
    </div>
  );
}
