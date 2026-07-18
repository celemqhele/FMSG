"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, User, Sparkles, Plus, Check, CirclePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTransition } from "@/components/providers/transition-provider";

interface SearchProfile {
  id: string;
  name: string;
  job_titles: string[];
}

interface MobileProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfileId: string | null;
  onSelectProfile: (id: string) => void;
  onProfileCreated?: (id: string) => void;
  refreshKey?: number;
  isAdmin?: boolean;
  onOpenAdminModal?: () => void;
}

export function MobileProfileSheet({ isOpen, onClose, activeProfileId, onSelectProfile, onProfileCreated, refreshKey, isAdmin, onOpenAdminModal }: MobileProfileSheetProps) {
  const { startTransition } = useTransition();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dragY, setDragY] = useState(0);
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setDragY(0);
    const supabase = createClient();
    supabase.auth.getUser().then((res: any) => {
      const user = res.data?.user;
      if (!user) return;
      setEmail(user.email ?? "");
      supabase
        .from("profiles")
        .select("name, surname")
        .eq("id", user.id)
        .single()
        .then((pRes: any) => {
          const full = [pRes.data?.name, pRes.data?.surname].filter(Boolean).join(" ");
          setName(full || user.email?.split("@")[0] || "User");
        });
      supabase
        .from("search_profiles")
        .select("id, name, job_titles")
        .eq("user_id", user.id)
        .order("created_at")
        .then(({ data }: { data: any }) => {
          setProfiles((data ?? []) as SearchProfile[]);
        });
    });
  }, [isOpen, refreshKey]);

  const handleNav = useCallback(
    (path: string) => {
      onClose();
      setTimeout(() => {
        startTransition();
        router.push(path);
      }, 150);
    },
    [onClose, startTransition, router]
  );

  const handleLogout = async () => {
    localStorage.removeItem("logged_in");
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleCreateProfile = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("search_profiles")
      .insert({ user_id: user.id, name: `Profile ${profiles.length + 1}` })
      .select("id, name, job_titles")
      .single();
    if (error || !data) return;
    setProfiles((prev) => [...prev, data as SearchProfile]);
    onSelectProfile(data.id);
    onProfileCreated?.(data.id);
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setDragY(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > 100) onClose();
    else setDragY(0);
  }, [dragY, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className="relative bg-[#1C1C1E] rounded-t-2xl transition-transform duration-300 ease-out"
        style={{
          transform: `translateY(${dragY > 0 ? dragY : 0}px)`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-sm font-semibold text-white">
              {name[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{name}</p>
              <p className="text-xs text-white/50 truncate">{email}</p>
            </div>
          </div>

          {profiles.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-2 px-1">Search Profile</p>
              <div className="space-y-0.5">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { onSelectProfile(p.id); onClose(); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                      p.id === activeProfileId
                        ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        : "text-white hover:bg-white/5"
                    }`}
                  >
                    <span className="flex-1 text-left truncate">{p.name}</span>
                    {p.id === activeProfileId && <Check size={14} className="shrink-0" />}
                  </button>
                ))}
                <button
                  onClick={handleCreateProfile}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Plus size={14} />
                  New Profile
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {isAdmin && onOpenAdminModal && (
              <button
                onClick={() => { onClose(); onOpenAdminModal(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-amber-400 rounded-xl hover:bg-amber-400/10 active:bg-amber-400/15 transition-colors"
              >
                <CirclePlus size={18} className="opacity-80" />
                Create Job Post
              </button>
            )}
            <button
              onClick={() => handleNav("/profile")}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <User size={18} className="opacity-60" />
              My Profile
            </button>
            <button
              onClick={() => handleNav("/settings")}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Settings size={18} className="opacity-60" />
              Settings
            </button>
            <button
              onClick={() => handleNav("/upgrade")}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Sparkles size={18} className="opacity-60" />
              Top Up
            </button>
          </div>

          <div className="h-px bg-white/10 my-3" />

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <LogOut size={18} className="opacity-70" />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
