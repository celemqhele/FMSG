"use client";

import { Search, History, Ban, Bookmark } from "lucide-react";

export type TabId = "search" | "history" | "blocked" | "saved";

const tabs: { id: TabId; label: string; icon: typeof Search }[] = [
  { id: "search", label: "Search", icon: Search },
  { id: "history", label: "History", icon: History },
  { id: "blocked", label: "Blocked", icon: Ban },
  { id: "saved", label: "Saved", icon: Bookmark },
];

export function DashboardTabs({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 max-w-md mx-auto">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center justify-center gap-1.5 flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
              active === tab.id
                ? "bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
