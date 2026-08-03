"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

interface MobileHeaderProps {
  onAvatarTap: () => void;
  guest?: boolean;
  onSignUp?: () => void;
}

export function MobileHeader({ onAvatarTap, guest, onSignUp }: MobileHeaderProps) {
  const [initials, setInitials] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then((res: any) => {
      const user = res.data?.user;
      if (!user) return;
      supabase
        .from("profiles")
        .select("name, surname")
        .eq("id", user.id)
        .single()
        .then((pRes: any) => {
          const n = pRes.data?.name?.[0] ?? "";
          const s = pRes.data?.surname?.[0] ?? "";
          if (n || s) setInitials((n + s).toUpperCase());
        });
    });
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-9 liquid-glass-surface flex items-center justify-between px-3 safe-area-top">
      <div className="flex items-center gap-1.5">
        <Image src="/icon.png" alt="FMSG" width={22} height={22} className="shrink-0" priority />
        <span className="text-[11px] font-semibold text-white select-none">FMSG</span>
      </div>
      <div className="flex items-center gap-1.5">
        {guest ? (
          <button
            onClick={onSignUp}
            className="px-3 h-8 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-semibold active:scale-95 transition-transform"
          >
            Sign up
          </button>
        ) : (
          <button
            onClick={onAvatarTap}
            className="w-9 h-9 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-[10px] font-semibold text-white"
          >
            {initials || "?"}
          </button>
        )}
      </div>
    </header>
  );
}
