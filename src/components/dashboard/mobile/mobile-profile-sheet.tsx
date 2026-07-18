"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, User, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTransition } from "@/components/providers/transition-provider";

interface MobileProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileProfileSheet({ isOpen, onClose }: MobileProfileSheetProps) {
  const { startTransition } = useTransition();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setDragY(0);
    const supabase = createClient();
    supabase.auth.getUser().then((res: any) => {
      const user = res.data?.user;
      if (!user) return;
      setEmail(user.email ?? "");
      supabase
        .from("profiles")
        .select("name, surname")
        .eq("id", user.id)
        .single()
        .then((pRes: any) => {
          const full = [pRes.data?.name, pRes.data?.surname].filter(Boolean).join(" ");
          setName(full || user.email?.split("@")[0] || "User");
        });
    });
  }, [isOpen]);

  const handleNav = useCallback(
    (path: string) => {
      onClose();
      setTimeout(() => {
        startTransition();
        router.push(path);
      }, 150);
    },
    [onClose, startTransition, router]
  );

  const handleLogout = async () => {
    localStorage.removeItem("logged_in");
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setDragY(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > 100) onClose();
    else setDragY(0);
  }, [dragY, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className="relative bg-[#1C1C1E] rounded-t-2xl transition-transform duration-300 ease-out"
        style={{
          transform: `translateY(${dragY > 0 ? dragY : 0}px)`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-sm font-semibold text-white">
              {name[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{name}</p>
              <p className="text-xs text-white/50 truncate">{email}</p>
            </div>
          </div>

          <div className="space-y-1">
            <button
              onClick={() => handleNav("/profile")}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <User size={18} className="opacity-60" />
              My Profile
            </button>
            <button
              onClick={() => handleNav("/settings")}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Settings size={18} className="opacity-60" />
              Settings
            </button>
            <button
              onClick={() => handleNav("/upgrade")}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Sparkles size={18} className="opacity-60" />
              Top Up
            </button>
          </div>

          <div className="h-px bg-white/10 my-3" />

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <LogOut size={18} className="opacity-70" />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
