"use client";

import { useEffect } from "react";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en" className={geistSans.variable} suppressHydrationWarning>
      <body className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-center space-y-6 p-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Something went wrong
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-md mx-auto">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={() => reset()}
            className="px-6 py-3 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
