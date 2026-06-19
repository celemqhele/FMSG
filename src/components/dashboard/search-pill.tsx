"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface SearchPillProps {
  onSearch: (query: string) => void;
  searching: boolean;
  activeProfileId?: string | null;
}

export function SearchPill({ onSearch, searching, activeProfileId }: SearchPillProps) {
  const [displayTitle, setDisplayTitle] = useState("Search for jobs");
  const [bouncing, setBouncing] = useState(false);

  const handleSearch = async () => {
    if (searching) return;
    setBouncing(true);
    setTimeout(() => setBouncing(false), 400);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let titles: string[] = [];
    let loc = "";

    if (activeProfileId) {
      const { data: sp } = await supabase
        .from("search_profiles")
        .select("job_titles, location")
        .eq("id", activeProfileId)
        .single();
      if (sp) {
        titles = sp.job_titles ?? [];
        loc = sp.location ?? "";
      }
    }

    if (titles.length === 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("job_titles, location")
        .eq("id", user.id)
        .single();
      titles = profile?.job_titles ?? [];
      loc = profile?.location ?? "";
    }

    const pick = titles[Math.floor(Math.random() * titles.length)] ?? "";
    const query = [pick, loc].filter(Boolean).join(" in ") || "jobs";
    setDisplayTitle(query || "Search for jobs");
    onSearch(query);
  };

  return (
    <div className={`w-full max-w-2xl mx-auto flex items-center h-14 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl overflow-hidden transition-transform duration-200 ${bouncing ? "scale-[1.02]" : "scale-100"}`}>
      <span className="flex-1 text-white/40 text-sm px-4 truncate select-none">
        {displayTitle}
      </span>

      <button
        onClick={handleSearch}
        disabled={searching}
        className="flex items-center gap-2 px-6 h-10 mr-2 rounded-full bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
      >
        <Search size={16} />
        Search
      </button>
    </div>
  );
}
