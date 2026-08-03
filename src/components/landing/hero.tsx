"use client";

import Link from "next/link";
import { TransitionLink } from "@/components/ui/transition-link";

interface HeroProps {
  onCtaClick: () => void;
  isLoggedIn?: boolean;
}

export function Hero({ onCtaClick, isLoggedIn }: HeroProps) {
  return (
    <section className="flex flex-col items-center justify-center px-6 pt-28 pb-20 md:pt-48 md:pb-32 text-center">
      <h1 className="max-w-3xl text-3xl md:text-6xl font-semibold tracking-tight text-white leading-tight">
        Find jobs that match{" "}
        <span className="text-[var(--color-accent)]">your skills</span>, not
        just your keywords
      </h1>
      <p className="mt-5 md:mt-6 max-w-xl text-base md:text-xl text-white/80 leading-relaxed">
        Upload your CV once. AI matches you to live job listings that fit your
        experience, salary expectations, and career goals.
      </p>
      {isLoggedIn ? (
        <Link
          href="/dashboard"
          className="mt-8 md:mt-10 inline-block w-full sm:w-auto px-8 py-3.5 text-base font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors shadow-[var(--shadow-md)]"
        >
          Go to Dashboard
        </Link>
      ) : (
        <div className="mt-8 md:mt-10 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <button
            onClick={onCtaClick}
            className="w-full sm:w-auto px-8 py-3.5 text-base font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors shadow-[var(--shadow-md)]"
          >
            Get Started Free
          </button>
          <TransitionLink
            href="/guest"
            className="w-full sm:w-auto px-8 py-3.5 text-base font-medium text-white/80 border border-white/25 hover:border-white/50 rounded-full transition-colors"
          >
            Start Searching
          </TransitionLink>
        </div>
      )}
    </section>
  );
}
