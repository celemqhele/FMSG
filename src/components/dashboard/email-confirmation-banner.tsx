"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Mail } from "lucide-react";

export function EmailConfirmationBanner() {
  const [show, setShow] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("dismissed_email_banner")) {
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: any } }) => {
      if (user && !user.email_confirmed_at) {
        setShow(true);
      }
    });
  }, []);

  const handleResend = async () => {
    setSending(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email;
    if (email) {
      await supabase.auth.resend({ type: "signup", email });
    }
    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  const handleDismiss = () => {
    sessionStorage.setItem("dismissed_email_banner", "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="liquid-glass rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <Mail size={14} className="text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">Confirm your email address</p>
          <p className="text-xs text-white/60">Check your inbox for the confirmation link. It may be in spam.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleResend}
          disabled={sending || sent}
          className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-full transition-colors disabled:opacity-50"
        >
          {sent ? "Sent!" : sending ? "Sending..." : "Resend"}
        </button>
        <button
          onClick={handleDismiss}
          className="p-1.5 text-white/50 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
