"use client";

import type { ReactNode } from "react";
import { ProfileDropdown } from "./profile-dropdown";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col bg-black">
      <header className="flex justify-end items-center px-6 py-4">
        <ProfileDropdown />
      </header>
      <main className="flex-1 px-6 pb-12">
        {children}
      </main>
    </div>
  );
}
