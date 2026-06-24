"use client";

import { useState } from "react";
import { Search, Crosshair } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProfile } from "@/components/dashboard/dashboard-layout";

interface SearchPillProps {
  onSearch: (query: string, profileId?: string | null, pfMode?: boolean) => void;
  searching: boolean;
}

export function SearchPill({ onSearch, searching }: SearchPillProps) {
  const { activeProfileId } = useActiveProfile();
  const [displayTitle, setDisplayTitle] = useState("Search for jobs");
  const [bouncing, setBouncing] = useState(false);
  const [pfMode, setPfMode] = useState(false);

  const handleSearch = async () => {
    if (searching) return;
    setBouncing(true);
    setTimeout(() => setBouncing(false), 400);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let titles: string[] = [];
    let loc = "";
    let ind = "";

    let usedProfileId = activeProfileId;

    if (!usedProfileId) {
      const { data: firstSp } = await supabase
        .from("search_profiles")
        .select("id, job_titles, location, industry")
        .eq("user_id", user.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (firstSp) {
        usedProfileId = firstSp.id;
        titles = firstSp.job_titles ?? [];
        loc = firstSp.location ?? "";
        ind = firstSp.industry ?? "";
      }
    } else {
      const { data: sp, error: spErr } = await supabase
        .from("search_profiles")
        .select("job_titles, location, industry")
        .eq("id", usedProfileId)
        .maybeSingle();
      if (spErr) console.log("[SEARCH-PILL] search_profiles error:", spErr.message);
      if (sp) {
        titles = sp.job_titles ?? [];
        loc = sp.location ?? "";
        ind = sp.industry ?? "";
      }
    }

    const pick = titles[Math.floor(Math.random() * titles.length)] ?? "";
    if (!pick) {
      console.log("[SEARCH-PILL] No job titles found — cannot search");
      return;
    }
    const query = [pick, ind, loc].filter(Boolean).join(" ");
    setDisplayTitle(query);
    onSearch(query, usedProfileId, pfMode);
  };

  return (
    <div className={`w-full max-w-2xl mx-auto flex items-center h-14 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl overflow-hidden transition-transform duration-200 ${bouncing ? "scale-[1.02]" : "scale-100"}`}>
      <button
        onClick={() => setPfMode(!pfMode)}
        className={`ml-2 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${pfMode ? "bg-[var(--color-accent)] text-white" : "text-white/40 hover:text-white/70 hover:bg-white/10"}`}
        title={pfMode ? "Persistent Finder active: searches multiple rounds across all titles" : "Click to enable Persistent Finder"}
      >
        <Crosshair size={16} />
      </button>

      <span className="flex-1 text-white/40 text-sm px-3 truncate select-none">
        {pfMode ? "Persistent Finder: scanning all titles" : displayTitle}
      </span>

      <button
        onClick={handleSearch}
        disabled={searching}
        className="flex items-center gap-2 px-6 h-10 mr-2 rounded-full bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
      >
        <Search size={16} />
        {searching ? (pfMode ? "Finding..." : "Searching...") : "Search"}
      </button>
    </div>
  );
}
