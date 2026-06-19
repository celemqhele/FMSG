"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, FileText, Crosshair, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Balances {
  search: number;
  cv: number;
  pf: number;
}

interface PopoverState {
  type: "search" | "cv" | "pf" | null;
  mounted: boolean;
}

const MAX_BALANCES: Record<string, number> = {
  search: 25,
  cv: 5,
  pf: 15,
};

export function BalanceChips() {
  const supabase = createClient();
  const router = useRouter();
  const [balances, setBalances] = useState<Balances>({ search: 0, cv: 0, pf: 0 });
  const [plan, setPlan] = useState("free");
  const [popover, setPopover] = useState<PopoverState>({ type: null, mounted: false });

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("search_balance, cv_generation_balance, persistent_finder_balance, plan")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setBalances({
          search: data.search_balance ?? 0,
          cv: data.cv_generation_balance ?? 0,
          pf: data.persistent_finder_balance ?? 0,
        });
        setPlan(data.plan ?? "free");
      }
    };
    load();

    // Listen for balance refresh signals
    const handler = () => load();
    window.addEventListener("refresh-balances", handler);
    return () => window.removeEventListener("refresh-balances", handler);
  }, [supabase]);

  const openPopover = useCallback((type: "search" | "cv" | "pf") => {
    setPopover({ type, mounted: true });
  }, []);

  const closePopover = useCallback(() => {
    setPopover((p) => ({ ...p, mounted: false }));
    setTimeout(() => setPopover({ type: null, mounted: false }), 200);
  }, []);

  const chip = (type: "search" | "cv" | "pf", icon: React.ReactNode, balance: number) => {
    const empty = balance <= 0;
    const low = balance > 0 && balance <= Math.ceil((MAX_BALANCES[type] ?? 10) * 0.2);
    const color = empty ? "text-red-400 border-red-400/30" : low ? "text-amber-400 border-amber-400/30" : "text-white/70 border-white/20";
    const bg = empty ? "hover:bg-red-400/10" : low ? "hover:bg-amber-400/10" : "hover:bg-white/10";

    return (
      <div className="relative">
        <button
          onClick={() => {
            if (popover.type === type && popover.mounted) {
              closePopover();
            } else {
              openPopover(type);
            }
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${color} ${bg}`}
        >
          {icon}
          <span>{balance}</span>
        </button>

        {popover.type === type && (
          <>
            <div className="fixed inset-0 z-40" onClick={closePopover} />
            <div
              className={`absolute right-0 top-8 z-50 w-48 rounded-xl liquid-glass border border-white/10 p-3 transition-all duration-200 ${
                popover.mounted ? "opacity-100 scale-100" : "opacity-0 scale-95"
              }`}
              style={{ pointerEvents: popover.mounted ? "auto" : "none" }}
            >
              <p className="text-xs text-white/50 mb-2 capitalize">{type === "pf" ? "Persistent Finder" : type} balance</p>
              <p className="text-lg font-bold text-white">{balance} <span className="text-sm font-normal text-white/50">remaining</span></p>
              <button
                onClick={() => { closePopover(); router.push("/upgrade"); }}
                className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                <ExternalLink size={12} />
                Upgrade Plan
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  if (plan === "free" && balances.search === 0 && balances.cv === 0 && balances.pf === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {chip("search", <Search size={12} />, balances.search)}
      {chip("cv", <FileText size={12} />, balances.cv)}
      {chip("pf", <Crosshair size={12} />, balances.pf)}
    </div>
  );
}
