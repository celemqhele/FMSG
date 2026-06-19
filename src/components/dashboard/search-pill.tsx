"use client";

import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface SearchPillProps {
  onSearch: (query: string) => void;
  searching: boolean;
}

export function SearchPill({ onSearch, searching }: SearchPillProps) {
  const handleSearch = async () => {
    if (searching) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("job_titles, location")
      .eq("id", user.id)
      .single();

    const titles = (profile?.job_titles ?? []).slice(0, 3).join(" ");
    const loc = profile?.location ?? "";
    const query = [titles, loc].filter(Boolean).join(" in ") || "jobs";
    onSearch(query);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center h-14 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl overflow-hidden">
        <span className="flex-1 text-white/40 text-sm px-4 select-none">
          Search for jobs
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
    </div>
  );
}
