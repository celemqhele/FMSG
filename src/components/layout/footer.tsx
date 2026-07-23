"use client";

import { TransitionLink } from "@/components/ui/transition-link";

export function Footer() {
  return (
    <footer className="px-6 py-12 pb-24 md:pb-12 border-t border-white/10">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col items-center md:items-start gap-1">
          <img src="/wordmark.png" alt="Find Me Some Jobs" className="h-6 w-auto" />
          <p className="text-sm text-white/70">
            Find Me Some Jobs
          </p>
        </div>
        <div className="flex items-center gap-6 text-sm text-white/70">
          <TransitionLink href="/about" className="hover:text-white transition-colors">
            About
          </TransitionLink>
          <TransitionLink href="/pricing" className="hover:text-white transition-colors">
            Pricing
          </TransitionLink>
          <TransitionLink href="/privacy" className="hover:text-white transition-colors">
            Privacy
          </TransitionLink>
          <TransitionLink href="/terms" className="hover:text-white transition-colors">
            Terms
          </TransitionLink>
          <button
            onClick={() => window.dispatchEvent(new Event("show-cookie-banner"))}
            className="hover:text-white transition-colors"
          >
            Cookie Settings
          </button>
          <span className="text-white/20 cursor-not-allowed select-none">
            Articles
          </span>
        </div>
        <p className="text-sm text-white/70">
          &copy; {new Date().getFullYear()} Find Me Some Jobs
        </p>
      </div>
    </footer>
  );
}
