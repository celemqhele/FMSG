"use client";

import { useState, useRef, useEffect } from "react";
import { User, Settings, ArrowUpCircle, LogOut } from "lucide-react";

export function ProfileDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
      >
        <User size={18} className="text-white/80" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-48 rounded-xl bg-[#1C1C1E] border border-white/10 shadow-xl overflow-hidden z-50">
          <button className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/5 transition-colors">
            <Settings size={16} />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/5 transition-colors">
            <ArrowUpCircle size={16} />
            Upgrade Plan
          </button>
          <div className="h-px bg-white/10" />
          <button
            onClick={() => {
              import("@/lib/supabase/client").then((m) => {
                m.createClient().auth.signOut().then(() => {
                  window.location.href = "/";
                });
              });
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-white/5 transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
