"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, User, Sparkles } from "lucide-react";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";

type Phase = "closed" | "open";

export function ProfileDropdown() {
  const router = useRouter();
  const { startTransition } = useTransition();
  const [phase, setPhase] = useState<Phase>("closed");
  const [itemsVisible, setItemsVisible] = useState(false);
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [email, setEmail] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleToggle = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (phase === "closed") {
      setPhase("open");
      setTimeout(() => setItemsVisible(true), 200);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setItemsVisible(false);
    closeTimer.current = setTimeout(() => setPhase("closed"), 200);
  };

  const handleNav = (path: string) => {
    handleClose();
    startTransition();
    router.push(path);
  };

  const handleLogout = async () => {
    localStorage.removeItem("logged_in");
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div ref={ref} className="relative h-10">
      {/* The morphing container: circle → pill → menu */}
      <div
        className={`
          absolute right-0 top-0
          overflow-hidden
          z-50
          transition-all duration-300 ease-out
          ${phase === "closed" ? "w-10 h-10 rounded-full cursor-pointer" : "w-56 rounded-2xl cursor-default"}
          bg-[#1C1C1E] border border-white/10 shadow-xl
        `}
        onClick={phase === "closed" ? handleToggle : undefined}
      >
        {/* Trigger circle — always visible, clicks toggle menu */}
        <div
          className="flex items-center justify-center w-10 h-10 shrink-0 cursor-pointer"
          onClick={phase !== "closed" ? handleToggle : undefined}
        >
          <span className="text-sm font-semibold text-white tracking-wide">
            {initials || <User size={16} className="text-white" />}
          </span>
        </div>

        {/* Dropdown content — expands downward */}
        <div
          className={`
            transition-all duration-200 ease-out overflow-hidden
            ${itemsVisible ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}
          `}
        >
          <div className="px-4 py-3 border-t border-white/[0.06]">
            <p className="text-sm font-medium text-[var(--color-text-primary)] truncate leading-tight">{name}</p>
            <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">{email}</p>
          </div>

          <div className="py-1">
            <button
              onClick={() => handleNav("/profile")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:bg-white/[0.04] transition-colors"
            >
              <User size={15} className="opacity-60" />
              My Profile
            </button>
            <button
              onClick={() => handleNav("/settings")}
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
      </div>
    </div>
  );
}
