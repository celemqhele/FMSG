"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, Loader2 } from "lucide-react";

interface VerifyEmailBannerProps {
  onOpenModal: () => void;
}

export function VerifyEmailBanner({ onOpenModal }: VerifyEmailBannerProps) {
  const [show, setShow] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  const checkStatus = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("email_verified")
      .eq("id", user.id)
      .maybeSingle();

    setShow(!data?.email_verified);
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkStatus();
    });
    return () => { subscription.unsubscribe(); };
  }, [checkStatus]);

  const handleResend = async () => {
    setResending(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setResendSent(true);
      setTimeout(() => setResendSent(false), 4000);
    } catch {}
    setResending(false);
  };

  if (!show) return null;

  return (
    <div className="liquid-glass rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <Mail size={16} className="text-[var(--color-accent)] shrink-0" />
        <p className="text-sm text-white/90">
          Verify your email to unlock search
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleResend}
          disabled={resending || resendSent}
          className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
        >
          {resending ? <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Sending...</span> : resendSent ? "Code sent!" : "Resend"}
        </button>
        <button
          onClick={onOpenModal}
          className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          Verify
        </button>
      </div>
    </div>
  );
}
