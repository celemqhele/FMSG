"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, Loader2 } from "lucide-react";

export function EmailConfirmationBanner() {
  const [show, setShow] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const checkConfirmation = useCallback(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: any } }) => {
      if (user && !user.email_confirmed_at) {
        setShow(true);
      }
    });
  }, []);

  useEffect(() => {
    checkConfirmation();
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      if (session?.user?.email_confirmed_at) {
        setShow(false);
      } else if (session?.user) {
        setShow(true);
      }
    });
    return () => { subscription.unsubscribe(); };
  }, [checkConfirmation]);

  const handleResend = async () => {
    setSending(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      await supabase.auth.resend({ type: "signup", email: user.email });
    }
    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  if (!show) return null;

  return (
    <div className="liquid-glass rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5">
        <Mail size={16} className="text-amber-400 shrink-0" />
        <p className="text-sm text-amber-300">
          Confirm your email address, check your inbox
        </p>
      </div>
      <button
        onClick={handleResend}
        disabled={sending || sent}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-full transition-colors disabled:opacity-50 shrink-0"
      >
        {sending && <Loader2 size={12} className="animate-spin" />}
        {sent ? "Sent!" : sending ? "Sending..." : "Resend"}
      </button>
    </div>
  );
}
