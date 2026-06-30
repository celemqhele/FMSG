"use client";

import { useState, useEffect, useRef } from "react";
import { Search, FileText, Crosshair } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface Balances {
  search: number;
  cv: number;
  pf: number;
}

const MAX_BALANCES: Record<string, number> = {
  search: 15,
  cv: 15,
  pf: 4,
};

function AnimatedNumber({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === value) {
      setDisplayed(value);
      return;
    }
    prevRef.current = value;
    const diff = value - prev;
    const steps = Math.abs(diff) > 10 ? 5 : Math.max(Math.abs(diff), 1);
    const increment = diff / steps;
    let current = prev;
    const interval = setInterval(() => {
      current += increment;
      if (increment > 0 ? current >= value : current <= value) {
        setDisplayed(value);
        clearInterval(interval);
      } else {
        setDisplayed(Math.round(current));
      }
    }, 80);
    return () => clearInterval(interval);
  }, [value]);

  return <span>{displayed}</span>;
}

export function BalanceChips({ balances: propBalances, plan: propPlan }: { balances?: Balances; plan?: string }) {
  const supabaseRef = useRef(createClient());
  const [fetchedBalances, setFetchedBalances] = useState<Balances>({ search: 0, cv: 0, pf: 0 });
  const [fetchedPlan, setFetchedPlan] = useState("free");
  const hasProps = propBalances !== undefined && propPlan !== undefined;

  useEffect(() => {
    if (hasProps) return;
    const supabase = supabaseRef.current;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("search_balance, cv_generation_balance, persistent_finder_balance, plan")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setFetchedBalances({
          search: data.search_balance ?? 0,
          cv: data.cv_generation_balance ?? 0,
          pf: data.persistent_finder_balance ?? 0,
        });
        setFetchedPlan(data.plan ?? "free");
      }
    };
    load();

    const handler = () => load();
    window.addEventListener("refresh-balances", handler);
    return () => window.removeEventListener("refresh-balances", handler);
  }, [hasProps]);

  const balances = hasProps ? propBalances : fetchedBalances;
  const plan = hasProps ? propPlan : fetchedPlan;

  const chip = (type: "search" | "cv" | "pf", icon: React.ReactNode, balance: number) => {
    const empty = balance <= 0;
    const low = balance > 0 && balance <= Math.ceil((MAX_BALANCES[type] ?? 10) * 0.2);
    const color = empty ? "text-red-400 border-red-400/30" : low ? "text-amber-400 border-amber-400/30" : "text-white/90 border-white/20";

    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors duration-500 ${color}`}>
        {icon}
        <AnimatedNumber value={balance} />
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
