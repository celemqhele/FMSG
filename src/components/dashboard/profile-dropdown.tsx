"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, ArrowUpCircle, LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ProfileDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [initials, setInitials] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then((res: any) => {
      const user = res.data?.user;
      if (user) {
        supabase
          .from("profiles")
          .select("name, surname")
          .eq("id", user.id)
          .single()
          .then((pRes: any) => {
            if (pRes.data?.name && pRes.data?.surname) {
              setInitials((pRes.data.name[0] + pRes.data.surname[0]).toUpperCase());
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
        className="w-9 h-9 rounded-full bg-[var(--color-accent)] flex items-center justify-center hover:opacity-90 transition-opacity"
      >
        <span className="text-xs font-semibold text-white">
          {initials || <User size={14} className="text-white" />}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-52 py-1.5 rounded-2xl liquid-glass border shadow-lg overflow-hidden z-50">
          <button
            onClick={() => { setOpen(false); router.push("/profile"); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:bg-white/5 dark:hover:bg-white/5 transition-colors"
          >
            <User size={16} />
            My Profile
          </button>
          <button
            onClick={() => { setOpen(false); router.push("/settings"); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:bg-white/5 dark:hover:bg-white/5 transition-colors"
          >
            <Settings size={16} />
            Settings
          </button>
          <button
            onClick={() => { setOpen(false); router.push("/upgrade"); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-primary)] hover:bg-white/5 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowUpCircle size={16} />
            Upgrade Plan
          </button>
          <div className="h-px bg-[var(--color-border)] mx-2 my-1" />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-error)] hover:bg-white/5 dark:hover:bg-white/5 transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
