"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, User, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTransition } from "@/components/providers/transition-provider";
import { SettingsModal } from "./settings-modal";

export function ProfileDropdown() {
  const { startTransition } = useTransition();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"closed" | "pill" | "full">("closed");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then((res: any) => {
      const user = res.data?.user;
      if (user) {
        setEmail(user.email ?? "");
        supabase
          .from("profiles")
          .select("name, surname")
          .eq("id", user.id)
          .single()
          .then((pRes: any) => {
            const fullName = [pRes.data?.name, pRes.data?.surname].filter(Boolean).join(" ");
            if (fullName) {
              setName(fullName);
              setInitials((pRes.data.name[0] + pRes.data.surname[0]).toUpperCase());
            } else {
              setName(user.email?.split("@")[0] ?? "User");
            }
          });
      }
    });
  }, []);

  const openMenu = useCallback(() => {
    setOpen(true);
    setPhase("pill");
    const t = setTimeout(() => setPhase("full"), 180);
    return () => clearTimeout(t);
  }, []);

  const closeMenu = useCallback(() => {
    setPhase("pill");
    const t = setTimeout(() => {
      setPhase("closed");
      setOpen(false);
    }, 150);
    return () => clearTimeout(t);
  }, []);

  const handleToggle = () => {
    if (open) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("logged_in");
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleNav = (path: string) => {
    closeMenu();
    setTimeout(() => {
      startTransition();
      router.push(path);
    }, 160);
  };

  return (
    <div className="relative flex flex-col items-end">
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 rounded-full border border-white/20 text-xs font-semibold text-white hover:bg-white/20 transition-all duration-300 overflow-hidden"
        style={{
          width: phase === "closed" ? "2.75rem" : "auto",
          height: "2.75rem",
          paddingLeft: phase === "closed" ? "0" : "0.75rem",
          paddingRight: phase === "closed" ? "0" : "0.75rem",
          background: phase !== "closed" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.10)",
        }}
      >
        <span className="shrink-0">{initials || <User size={14} className="text-white" />}</span>
        {phase !== "closed" && (
          <span className="text-xs text-white/80 truncate max-w-[100px] animate-in fade-in duration-200">
            {name}
          </span>
        )}
      </button>

      {phase !== "closed" && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="absolute right-0 top-10 w-56 rounded-2xl bg-[#1C1C1E] border border-white/10 shadow-xl overflow-hidden z-50 transition-all duration-200 ease-out"
            style={{
              opacity: phase === "full" ? 1 : 0,
              transform: phase === "full" ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.96)",
              pointerEvents: phase === "full" ? "auto" : "none",
            }}
          >
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate leading-tight">{name}</p>
              <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">{email}</p>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div className="py-1">
              <button
                onClick={() => handleNav("/profile")}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:bg-white/[0.04] transition-colors"
              >
                <User size={15} className="opacity-60" />
                My Profile
              </button>
              <button
                onClick={() => { closeMenu(); setTimeout(() => setSettingsOpen(true), 160); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:bg-white/[0.04] transition-colors"
              >
                <Settings size={15} className="opacity-60" />
                Settings
              </button>
              <button
                onClick={() => handleNav("/upgrade")}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:bg-white/[0.04] transition-colors"
              >
                <Sparkles size={15} className="opacity-60" />
                Upgrade Plan
              </button>
            </div>

            <div className="h-px bg-white/[0.06] mx-3" />

            <div className="py-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-error)] hover:bg-white/[0.04] transition-colors"
              >
                <LogOut size={15} className="opacity-70" />
                Logout
              </button>
            </div>
          </div>
        </>
      )}

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
