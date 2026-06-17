"use client";

interface HeroProps {
  onCtaClick: () => void;
}

export function Hero({ onCtaClick }: HeroProps) {
  return (
    <section className="flex flex-col items-center justify-center px-6 pt-40 pb-24 md:pt-48 md:pb-32 text-center">
      <h1 className="max-w-3xl text-4xl md:text-6xl font-semibold tracking-tight text-white leading-tight">
        Find jobs that match{" "}
        <span className="text-[var(--color-accent)]">your skills</span>, not
        just your keywords
      </h1>
      <p className="mt-6 max-w-xl text-lg md:text-xl text-white/60 leading-relaxed">
        Upload your CV once. AI matches you to live job listings that fit your
        experience, salary expectations, and career goals.
      </p>
      <button
        onClick={onCtaClick}
        className="mt-10 px-8 py-3.5 text-base font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors shadow-[var(--shadow-md)]"
      >
        Get Started Free
      </button>
    </section>
  );
}
