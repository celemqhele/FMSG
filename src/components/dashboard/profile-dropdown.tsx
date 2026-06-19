"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, ArrowUpCircle, LogOut, User, Sparkles } from "lucide-react";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";

export function ProfileDropdown() {
  const router = useRouter();
  const { startTransition } = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [email, setEmail] = useState("");
  const ref = useRef<HTMLDivElement>(null);

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
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem("logged_in");
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-10 h-10 rounded-full bg-[var(--color-accent)] ring-1 ring-white/10 hover:ring-white/25 flex items-center justify-center transition-all duration-200"
      >
        <span className="text-sm font-semibold text-white tracking-wide">
          {initials || <User size={16} className="text-white" />}
        </span>
      </button>

      <div
        className={`absolute right-0 top-12 w-56 py-2 rounded-2xl liquid-glass border shadow-xl z-50 transition-all duration-200 origin-top-right ${
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate leading-tight">{name}</p>
          <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">{email}</p>
        </div>

        <div className="py-1">
          <button
            onClick={() => { setOpen(false); startTransition(); router.push("/profile"); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:bg-white/[0.04] transition-colors"
          >
            <User size={15} className="opacity-60" />
            My Profile
          </button>
          <button
            onClick={() => { setOpen(false); startTransition(); router.push("/settings"); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:bg-white/[0.04] transition-colors"
          >
            <Settings size={15} className="opacity-60" />
            Settings
          </button>
          <button
            onClick={() => { setOpen(false); startTransition(); router.push("/upgrade"); }}
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
  );
}
