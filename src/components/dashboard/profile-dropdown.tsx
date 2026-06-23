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
    <div className="relative">
      {phase !== "closed" && <div className="fixed inset-0 z-40" onClick={closeMenu} />}

      {/* Trigger pill */}
      <div
        className="flex items-center gap-2 px-3 h-[2.75rem] cursor-pointer select-none border border-white/20 z-50 transition-all duration-300 ease-out"
        style={{
          width: phase === "closed" ? "2.75rem" : "14rem",
          borderRadius: "9999px",
          background: "rgba(28,28,30,0.95)",
          justifyContent: phase === "closed" ? "center" : "flex-start",
        }}
        onClick={handleToggle}
      >
        <span className="shrink-0 text-xs font-semibold text-white">{initials || <User size={14} className="text-white" />}</span>
        {phase !== "closed" && (
          <span className="text-xs text-white/80 truncate max-w-[100px] animate-in fade-in duration-200">
            {name}
          </span>
        )}
      </div>

      {/* Dropdown panel */}
      <div
        className="absolute top-full right-0 mt-2 z-50 transition-all duration-300 ease-out overflow-hidden border border-white/20"
        style={{
          width: "14rem",
          maxHeight: phase === "full" ? "20rem" : "0rem",
          borderRadius: "1rem",
          background: "rgba(28,28,30,0.95)",
          opacity: phase === "full" ? 1 : 0,
          transform: phase === "full" ? "translateY(0)" : "translateY(-4px)",
        }}
      >
        <div className="py-1">
          <button
            onClick={() => handleNav("/profile")}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-all duration-300"
          >
            <User size={15} className="opacity-60" />
            My Profile
          </button>
          <button
            onClick={() => { closeMenu(); setTimeout(() => setSettingsOpen(true), 160); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-all duration-300"
          >
            <Settings size={15} className="opacity-60" />
            Settings
          </button>
          <button
            onClick={() => handleNav("/upgrade")}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-all duration-300"
          >
            <Sparkles size={15} className="opacity-60" />
            Upgrade Plan
          </button>
        </div>
        <div className="h-px bg-white/10 mx-3" />
        <div className="py-1">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition-all duration-300"
          >
            <LogOut size={15} className="opacity-70" />
            Logout
          </button>
        </div>
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
