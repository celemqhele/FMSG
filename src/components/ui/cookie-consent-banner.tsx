"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (consent === null) {
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem("cookie_consent", "true");
    window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: { consent: "true" } }));
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem("cookie_consent", "false");
    localStorage.setItem("keep_signed_in", "false");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70] p-4">
      <div className="max-w-2xl mx-auto bg-white dark:bg-[#1C1C1E] border border-[var(--color-border)] shadow-lg rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-3">
        <p className="flex-1 text-sm text-[var(--color-text-secondary)] text-center sm:text-left">
          We use cookies to keep you signed in and improve your experience. By accepting you agree to our{" "}
          <Link href="/privacy" className="underline hover:text-[var(--color-accent)] transition-colors">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={decline}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-full hover:bg-white/5 dark:hover:bg-white/5 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
