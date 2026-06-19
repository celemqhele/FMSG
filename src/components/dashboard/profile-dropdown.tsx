"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, User, Sparkles } from "lucide-react";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";

export function ProfileDropdown() {
  const router = useRouter();
  const { startTransition } = useTransition();
  const [open, setOpen] = useState(false);
  const [animPhase, setAnimPhase] = useState<"closed" | "pill" | "open">("closed");
  const [itemsVisible, setItemsVisible] = useState(false);
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [email, setEmail] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const animTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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
      if (ref.current && !ref.current.contains(e.target as Node) && open) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const closeDropdown = () => {
    setItemsVisible(false);
    setAnimPhase("pill");
    animTimer.current = setTimeout(() => {
      setAnimPhase("closed");
      setOpen(false);
    }, 180);
  };

  const openDropdown = () => {
    setOpen(true);
    setAnimPhase("pill");
    animTimer.current = setTimeout(() => {
      setAnimPhase("open");
      setTimeout(() => setItemsVisible(true), 150);
    }, 180);
  };

  const handleToggle = () => {
    if (animTimer.current) clearTimeout(animTimer.current);
    if (open) {
      closeDropdown();
    } else {
      openDropdown();
    }
  };

  const handleNav = (path: string) => {
    if (animTimer.current) clearTimeout(animTimer.current);
    setItemsVisible(false);
    setAnimPhase("closed");
    setOpen(false);
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
      <div
        className={[
          "absolute right-0 top-0 overflow-hidden z-50",
          "bg-[#1C1C1E] border border-white/10 shadow-xl",
          "transition-all duration-[180ms] ease-out",
          animPhase === "closed" && "w-10 h-10 rounded-full",
          animPhase === "pill" && "w-56 h-10 rounded-full",
          animPhase === "open" && "w-56 rounded-2xl",
        ].filter(Boolean).join(" ")}
      >
        <div
          className="flex items-center justify-center w-10 h-10 shrink-0 cursor-pointer"
          onClick={handleToggle}
        >
          <span className="text-sm font-semibold text-white tracking-wide">
            {initials || <User size={16} className="text-white" />}
          </span>
        </div>

        <div
          className={[
            "transition-all duration-150 ease-out overflow-hidden",
            itemsVisible ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
          ].join(" ")}
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
