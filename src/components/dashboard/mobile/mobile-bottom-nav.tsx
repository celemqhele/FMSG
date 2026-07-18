"use client";

import { Search, History, Bookmark, XCircle, Ban } from "lucide-react";
import type { TabId } from "@/components/dashboard/dashboard-tabs";

const tabs: { id: TabId; label: string; icon: typeof Search }[] = [
  { id: "search", label: "Search", icon: Search },
  { id: "history", label: "History", icon: History },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "rejected", label: "Rejected", icon: XCircle },
  { id: "blocked", label: "Blocked", icon: Ban },
];

export function MobileBottomNav({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 liquid-glass-surface border-t border-white/10 safe-area-bottom">
      <div className="flex items-stretch h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? "text-[var(--color-accent)]" : "text-white/50"
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              <span className={`text-xs font-medium ${isActive ? "text-[var(--color-accent)]" : ""}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
