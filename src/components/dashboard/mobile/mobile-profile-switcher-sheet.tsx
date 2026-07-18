"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Check } from "lucide-react";

interface SearchProfile {
  id: string;
  name: string;
  job_titles: string[];
  location: string;
  industry?: string;
}

interface MobileProfileSwitcherSheetProps {
  isOpen: boolean;
  activeProfileId: string | null;
  onSelect: (id: string) => void;
  onProfileCreated: (id: string) => void;
  onClose: () => void;
  refreshKey?: number;
}

export function MobileProfileSwitcherSheet({
  isOpen,
  activeProfileId,
  onSelect,
  onProfileCreated,
  onClose,
  refreshKey,
}: MobileProfileSwitcherSheetProps) {
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);

  useEffect(() => {
    if (!isOpen) return;
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
          setProfiles((rows ?? []) as SearchProfile[]);
        });
    });
  }, [isOpen, refreshKey]);

  const handleCreate = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("search_profiles")
      .insert({ user_id: user.id, name: `Profile ${profiles.length + 1}` })
      .select("id, name, job_titles, location")
      .single();
    if (error) { alert(error.message); return; }
    if (data) {
      const newProfile = data as SearchProfile;
      setProfiles((prev) => [...prev, newProfile]);
      onSelect(newProfile.id);
      onProfileCreated(newProfile.id);
    }
    onClose();
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-[#1C1C1E] rounded-t-2xl safe-area-bottom">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-6">
          <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Switch Profile</p>
          <div className="space-y-1">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-colors ${
                  p.id === activeProfileId
                    ? "text-white bg-white/10"
                    : "text-white/80 hover:bg-white/5 active:bg-white/10"
                }`}
              >
                <span className="flex-1 text-left truncate">{p.name}</span>
                {p.id === activeProfileId && <Check size={16} className="text-[var(--color-accent)] shrink-0" />}
              </button>
            ))}
          </div>

          <div className="h-px bg-white/10 my-3" />

          <button
            onClick={handleCreate}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm text-[var(--color-accent)] rounded-xl border border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/10 transition-colors"
          >
            <Plus size={16} />
            New Profile
          </button>
        </div>
      </div>
    </div>
  );
}
