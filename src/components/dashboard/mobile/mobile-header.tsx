"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { Pencil } from "lucide-react";

interface MobileHeaderProps {
  onAvatarTap: () => void;
  onEditProfile?: () => void;
  hasActiveProfile?: boolean;
}

export function MobileHeader({ onAvatarTap, onEditProfile, hasActiveProfile }: MobileHeaderProps) {
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
    <header className="fixed top-0 left-0 right-0 z-50 h-12 liquid-glass-surface flex items-center justify-between px-4 safe-area-top">
      <div className="flex items-center gap-2">
        <Image src="/icon.png" alt="FMSG" width={22} height={22} className="shrink-0" priority />
        <span className="text-sm font-semibold text-white select-none">FMSG</span>
      </div>
      <div className="flex items-center gap-2">
        {hasActiveProfile && onEditProfile && (
          <button
            onClick={onEditProfile}
            className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <Pencil size={14} />
          </button>
        )}
        <button
          onClick={onAvatarTap}
          className="w-11 h-11 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-xs font-semibold text-white"
        >
          {initials || "?"}
        </button>
      </div>
    </header>
  );
}
