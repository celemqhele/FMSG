"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Check, ChevronDown } from "lucide-react";

interface SearchProfile {
  id: string;
  name: string;
  job_titles: string[];
  location: string;
  industry?: string;
}

export function ProfileSwitcher({ activeProfileId, onSelect, onProfileCreated, refreshKey }: { activeProfileId: string | null; onSelect: (id: string) => void; onProfileCreated?: (id: string) => void; refreshKey?: number }) {
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [open, setOpen] = useState(false);
  const [dropdownMounted, setDropdownMounted] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      const user = data?.user;
      if (!user) return;
      supabase
        .from("search_profiles")
        .select("id, name, job_titles, location, industry")
        .eq("user_id", user.id)
        .order("created_at")
        .then(({ data: rows }: { data: any }) => {
          const list = (rows ?? []) as SearchProfile[];
          setProfiles(list);
          if (list.length > 0 && !activeProfileId) {
            onSelect(list[0].id);
          }
        });
    });
  }, [activeProfileId, onSelect, refreshKey]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setDropdownMounted(true));
    } else {
      setDropdownMounted(false);
    }
  }, [open]);

  const active = profiles.find((p) => p.id === activeProfileId);

  const handleCreate = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("search_profiles")
      .insert({ user_id: user.id, name: `Profile ${profiles.length + 1}` })
      .select("id, name, job_titles, location")
      .single();
    if (error) {
      alert(error.message);
      setOpen(false);
      return;
    }
    if (data) {
      const newProfile = data as SearchProfile;
      setProfiles((prev) => [...prev, newProfile]);
      onSelect(newProfile.id);
      onProfileCreated?.(newProfile.id);
    }
    setOpen(false);
  };

  if (profiles.length === 0) {
    return (
      <button
        onClick={handleCreate}
        className="flex items-center gap-1.5 px-3 h-8 text-xs font-medium text-white/60 hover:text-white rounded-full border border-white/10 hover:border-white/20 transition-colors"
      >
        <Plus size={14} />
        New Profile
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 h-8 text-xs font-medium text-white/80 hover:text-white rounded-full border border-white/10 hover:border-white/20 transition-colors"
      >
        <span className="max-w-[120px] truncate">{active?.name ?? "Profile"}</span>
        <ChevronDown size={12} />
      </button>

      {(open || dropdownMounted) && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-9 w-48 py-1.5 rounded-xl bg-[#1C1C1E] border border-white/10 shadow-xl overflow-hidden z-50 transition-all duration-200 ease-out"
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.96)",
              pointerEvents: open ? "auto" : "none",
            }}
          >
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/80 hover:bg-white/5 transition-colors"
              >
                <span className="flex-1 text-left truncate">{p.name}</span>
                {p.id === activeProfileId && <Check size={12} className="text-[var(--color-accent)] shrink-0" />}
              </button>
            ))}
            <div className="h-px bg-white/10 mx-2 my-1" />
            <button
              onClick={handleCreate}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Plus size={12} />
              New Profile
            </button>
          </div>
        </>
      )}
    </div>
  );
}
