"use client";

import { useState, useEffect } from "react";
import { Search, FileText, Crosshair } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Balances {
  search: number;
  cv: number;
  pf: number;
}

const MAX_BALANCES: Record<string, number> = {
  search: 25,
  cv: 5,
  pf: 15,
};

export function BalanceChips() {
  const supabase = createClient();
  const [balances, setBalances] = useState<Balances>({ search: 0, cv: 0, pf: 0 });
  const [plan, setPlan] = useState("free");

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

    const handler = () => load();
    window.addEventListener("refresh-balances", handler);
    return () => window.removeEventListener("refresh-balances", handler);
  }, [supabase]);

  const chip = (type: "search" | "cv" | "pf", icon: React.ReactNode, balance: number) => {
    const empty = balance <= 0;
    const low = balance > 0 && balance <= Math.ceil((MAX_BALANCES[type] ?? 10) * 0.2);
    const color = empty ? "text-red-400 border-red-400/30" : low ? "text-amber-400 border-amber-400/30" : "text-white/70 border-white/20";

    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${color}`}>
        {icon}
        <span>{balance}</span>
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
