"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { SpaceVideoBackground } from "@/components/landing/space-video-background";
import { FloatingNavbar } from "@/components/layout/floating-navbar";
import { Footer } from "@/components/layout/footer";

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref") || "";

  return (
    <>
      <SpaceVideoBackground src="/videos/space.mp4" />
      <FloatingNavbar />
      <main className="flex-1 pt-28 pb-24 px-6 flex items-center justify-center">
        <div className="max-w-md w-full liquid-glass rounded-2xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/30 mb-5">
            <Check size={28} className="text-emerald-400" />
          </div>

          <h1 className="text-2xl font-bold text-white">Payment received</h1>
          <p className="mt-2 text-sm text-white/75 leading-relaxed">
            Your payment has been completed. If you started this upgrade from{" "}
            <strong className="text-white">FMSG Agents</strong>, switch back to
            the desktop app — your plan and balances update automatically within
            a few seconds.
          </p>

          {reference && (
            <div className="mt-5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 font-mono truncate">
              Ref: {reference}
            </div>
          )}

          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition"
            >
              Open web dashboard
            </Link>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium transition"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center min-h-screen">
          <Loader2 size={24} className="animate-spin text-white/80" />
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
