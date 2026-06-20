"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ArrowLeft, Loader2, Check, ExternalLink, Crosshair } from "lucide-react";
import { PFPurchaseModal } from "@/components/dashboard/pf-purchase-modal";
import { useTheme } from "@/components/providers/theme-provider";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import "@/components/landing/liquid-glass.css";

export default function SettingsPage() {
  const router = useRouter();
  const { startTransition, endTransition } = useTransition();
  const { theme, setTheme } = useTheme();
  const supabase = createClient();

  useEffect(() => { endTransition(); }, [endTransition]);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Plan
  const [plan, setPlan] = useState("free");
  const [searchBalance, setSearchBalance] = useState(0);
  const [cvBalance, setCvBalance] = useState(0);
  const [pfBalance, setPfBalance] = useState(0);
  const [pfModalOpen, setPfModalOpen] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/"); return; }
      const { data } = await supabase.from("profiles").select("plan, search_balance, cv_generation_balance, persistent_finder_balance").eq("id", user.id).single();
      if (data) {
        setPlan(data.plan ?? "free");
        setSearchBalance(data.search_balance ?? 0);
        setCvBalance(data.cv_generation_balance ?? 0);
        setPfBalance(data.persistent_finder_balance ?? 0);
      }
    };
    loadProfile();
  }, [router, supabase]);

  const handlePasswordChange = async () => {
    setPasswordMsg(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ ok: false, text: "All fields are required." });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ ok: false, text: "New password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: "Passwords do not match." });
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      setPasswordMsg({ ok: false, text: error.message });
    } else {
      setPasswordMsg({ ok: true, text: "Password updated successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

  return (
    <DashboardLayout>
      <PageTransitionWrapper>
      <div className="max-w-2xl mx-auto pt-8 pb-24 space-y-8">
        <div className="flex items-center gap-4">
          <button onClick={() => { startTransition(); router.push("/dashboard"); }} className="p-2 text-white/60 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>

        {/* Section 1: Appearance */}
        <div className="liquid-glass rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Appearance</h2>
          <div className="flex flex-wrap gap-3">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                  theme === t
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {t === "light" ? "Light" : t === "dark" ? "Dark" : "System"}
              </button>
            ))}
          </div>
        </div>

        {/* Section 2: Notifications */}
        <div className="liquid-glass rounded-xl p-6 space-y-5 opacity-60">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Notifications</h2>
          <label className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-primary)]">Email me when new matching jobs are found</span>
            <div className="relative">
              <input type="checkbox" disabled className="sr-only" />
              <div className="w-10 h-5 rounded-full bg-[var(--color-border)] cursor-not-allowed" />
              <span className="text-xs text-[var(--color-text-secondary)] ml-3">Coming soon</span>
            </div>
          </label>
        </div>

        {/* Section 3: Account */}
        <div className="liquid-glass rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Account</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-[var(--color-text-secondary)]">Current password</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-[var(--color-text-secondary)]">New password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-[var(--color-text-secondary)]">Confirm new password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
            {passwordMsg && (
              <p className={`text-xs flex items-center gap-1 ${passwordMsg.ok ? "text-green-500" : "text-red-500"}`}>
                {passwordMsg.ok && <Check size={12} />}
                {passwordMsg.text}
              </p>
            )}
            <button
              onClick={handlePasswordChange}
              disabled={passwordSaving}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {passwordSaving && <Loader2 size={14} className="animate-spin" />}
              Update Password
            </button>
          </div>
        </div>

        {/* Section 4: Plan and Usage */}
        <div className="liquid-glass rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Plan and Usage</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-[var(--color-text-secondary)]">Current plan</span>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{planLabel}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[var(--color-text-secondary)]">Search balance remaining</span>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{searchBalance}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[var(--color-text-secondary)]">CV generations remaining</span>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{cvBalance === -1 ? "Unlimited" : cvBalance}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[var(--color-text-secondary)]">Persistent Finder balance</span>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{pfBalance}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => { startTransition(); router.push("/upgrade"); }} className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors">
              Upgrade Plan
              <ExternalLink size={14} />
            </button>
            <button onClick={() => setPfModalOpen(true)} className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-white/10 border border-white/20 rounded-full hover:bg-white/20 transition-colors">
              <Crosshair size={14} />
              Buy PF Credits
            </button>
          </div>
        </div>
      </div>

      <PFPurchaseModal isOpen={pfModalOpen} onClose={() => setPfModalOpen(false)} />
      </PageTransitionWrapper>
    </DashboardLayout>
  );
}
