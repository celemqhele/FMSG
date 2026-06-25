"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ArrowLeft, Loader2, Check, Save } from "lucide-react";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import "@/components/landing/liquid-glass.css";

export default function SettingsPage() {
  const router = useRouter();
  const { startTransition, endTransition } = useTransition();
  const supabase = createClient();

  useEffect(() => { endTransition(); }, [endTransition]);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Profile
  const [email, setEmail] = useState("");
  const [nameValue, setNameValue] = useState("");
  const [surnameValue, setSurnameValue] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/"); return; }
      setEmail(user.email ?? "");
      const { data } = await supabase.from("profiles").select("name, surname").eq("id", user.id).single();
      if (data) {
        setNameValue(data.name ?? "");
        setSurnameValue(data.surname ?? "");
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

  const handleProfileSave = async () => {
    setProfileMsg(null);
    if (!nameValue.trim() || !surnameValue.trim()) {
      setProfileMsg({ ok: false, text: "Name and surname are required." });
      return;
    }
    setProfileSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProfileSaving(false); return; }

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ name: nameValue.trim(), surname: surnameValue.trim() })
      .eq("id", user.id);

    if (profileErr) {
      setProfileMsg({ ok: false, text: profileErr.message });
      setProfileSaving(false);
      return;
    }

    setProfileMsg({ ok: true, text: "Profile updated successfully." });
    setTimeout(() => setProfileMsg(null), 3000);
    setProfileSaving(false);
  };

  return (
    <DashboardLayout>
      <PageTransitionWrapper>
      <div className="max-w-2xl mx-auto pt-8 pb-24 space-y-8">
        <div className="flex items-center gap-4">
          <button onClick={() => { startTransition(); router.push("/dashboard"); }} className="p-2 text-white/80 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>

        {/* Section 1: Profile */}
        <div className="liquid-glass rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Profile</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-[var(--color-text-secondary)]">Email</label>
              <input type="email" value={email} readOnly className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] opacity-60 cursor-not-allowed" />
              <p className="text-xs text-[var(--color-text-secondary)]">Email cannot be changed here.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm text-[var(--color-text-secondary)]">Name</label>
                <input type="text" value={nameValue} onChange={(e) => setNameValue(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-[var(--color-text-secondary)]">Surname</label>
                <input type="text" value={surnameValue} onChange={(e) => setSurnameValue(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
              </div>
            </div>
            {profileMsg && (
              <p className={`text-xs flex items-center gap-1 ${profileMsg.ok ? "text-green-500" : "text-red-500"}`}>
                {profileMsg.ok && <Check size={12} />}
                {profileMsg.text}
              </p>
            )}
            <button
              onClick={handleProfileSave}
              disabled={profileSaving}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {profileSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
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

      </div>
      </PageTransitionWrapper>
    </DashboardLayout>
  );
}
