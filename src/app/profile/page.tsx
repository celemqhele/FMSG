"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ArrowLeft, Loader2, Upload, X } from "lucide-react";
import { PageTransitionWrapper } from "@/components/ui/page-transition-wrapper";
import { useTransition } from "@/components/providers/transition-provider";
import { createClient } from "@/lib/supabase/client";
import "@/components/landing/liquid-glass.css";

const JOB_TYPE_OPTIONS = ["Full-time", "Part-time", "Remote", "Contract"];

export default function ProfilePage() {
  const router = useRouter();
  const { startTransition, endTransition } = useTransition();
  const supabase = createClient();

  useEffect(() => { endTransition(); }, [endTransition]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Personal info
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [currentSalary, setCurrentSalary] = useState<number | null>(null);
  const [desiredSalary, setDesiredSalary] = useState<number | null>(null);

  // Job preferences
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [jobTitleInput, setJobTitleInput] = useState("");
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [location, setLocation] = useState("");

  // CV
  const [cvFileName, setCvFileName] = useState("");
  const [cvUploadDate, setCvUploadDate] = useState("");
  const [cvUploading, setCvUploading] = useState(false);
  const [cvFilePath, setCvFilePath] = useState("");

  // Danger zone
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then((res: { data: { user: { id: string; email?: string } | null } }) => {
      const u = res.data.user;
      if (!u) { router.push("/"); return; }
      setEmail(u.email ?? "");
      supabase.from("profiles").select("*").eq("id", u.id).single().then((res: { data: any }) => {
        const d = res.data;
        if (d) {
          setName(d.name ?? "");
          setSurname(d.surname ?? "");
          setPhone(d.phone ?? "");
          setAddress(d.address ?? "");
          setCurrentSalary(d.current_salary ?? null);
          setDesiredSalary(d.desired_salary ?? null);
          setJobTitles(d.job_titles ?? []);
          setJobTypes(d.job_types ?? []);
          setLocation(d.location ?? "");
          setCvFilePath(d.cv_file_path ?? "");
        }
        setLoading(false);
      });
    });
  }, [router, supabase]);

  // Load CV metadata
  useEffect(() => {
    if (!cvFilePath) return;
    (async () => {
      const { data: fileList } = await supabase.storage.from("cv-files").list(cvFilePath.split("/")[0], { limit: 1 });
      if (fileList && fileList.length > 0) {
        setCvFileName(fileList[0].name);
        setCvUploadDate(new Date(fileList[0].created_at ?? "").toLocaleDateString());
      }
    })();
  }, [cvFilePath, supabase]);

  const getUserId = async (): Promise<string | null> => {
    const res = await supabase.auth.getUser() as { data: { user: { id: string } | null } };
    return res.data.user?.id ?? null;
  };

  const savePersonalInfo = async () => {
    setSaving("personal");
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from("profiles").update({ name, surname, phone, address, current_salary: currentSalary, desired_salary: desiredSalary }).eq("id", userId);
    setSaving(null);
  };

  const saveJobPrefs = async () => {
    setSaving("jobs");
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from("profiles").update({ job_titles: jobTitles, job_types: jobTypes, location }).eq("id", userId);
    setSaving(null);
  };

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { alert("PDF only."); return; }
    if (file.size > 10 * 1024 * 1024) { alert("Max 10MB."); return; }

    setCvUploading(true);
    const userId = await getUserId();
    if (!userId) { setCvUploading(false); return; }
    const userPrefix = userId.substring(0, 6);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${userPrefix}/${safeName}`;

    if (cvFilePath) {
      await supabase.storage.from("cv-files").remove([cvFilePath]);
    }

    const { error: uploadErr } = await supabase.storage.from("cv-files").upload(filePath, file, { upsert: true });
    if (uploadErr) { console.error("[CV UPLOAD]", uploadErr); alert(`Upload failed: ${uploadErr.message}`); setCvUploading(false); return; }

    await supabase.from("profiles").update({ cv_file_path: filePath }).eq("id", userId);
    setCvFilePath(filePath);
    setCvFileName(file.name);
    setCvUploadDate(new Date().toLocaleDateString());
    setCvUploading(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch("/api/delete-account", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-white/40" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageTransitionWrapper>
      <div className="max-w-2xl mx-auto pt-8 pb-24 space-y-8">
        <div className="flex items-center gap-4">
          <button onClick={() => { startTransition(); router.push("/dashboard"); }} className="p-2 text-white/60 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-white">My Profile</h1>
        </div>

        {/* Section 1: Personal Information */}
        <div className="liquid-glass rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Personal Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm text-[var(--color-text-secondary)]">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-[var(--color-text-secondary)]">Surname</label>
              <input value={surname} onChange={(e) => setSurname(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-[var(--color-text-secondary)]">Email</label>
            <input value={email} disabled className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] opacity-60 cursor-not-allowed" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-[var(--color-text-secondary)]">Phone number</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-[var(--color-text-secondary)]">Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm text-[var(--color-text-secondary)]">Current salary (ZAR)</label>
              <input type="number" value={currentSalary ?? ""} onChange={(e) => setCurrentSalary(e.target.value ? Number(e.target.value) : null)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-[var(--color-text-secondary)]">Desired salary (ZAR)</label>
              <input type="number" value={desiredSalary ?? ""} onChange={(e) => setDesiredSalary(e.target.value ? Number(e.target.value) : null)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
          </div>
          <button
            onClick={savePersonalInfo}
            disabled={saving === "personal"}
            className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving === "personal" && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>

        {/* Section 2: Job Preferences */}
        <div className="liquid-glass rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Job Preferences</h2>
          <div className="space-y-1.5">
            <label className="text-sm text-[var(--color-text-secondary)]">Job titles wanted</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {jobTitles.map((t) => (
                <span key={t} className="flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent)]">
                  {t}
                  <button onClick={() => setJobTitles(jobTitles.filter((x) => x !== t))}><X size={12} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={jobTitleInput} onChange={(e) => setJobTitleInput(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && jobTitleInput.trim()) {
                  e.preventDefault();
                  if (!jobTitles.includes(jobTitleInput.trim())) setJobTitles([...jobTitles, jobTitleInput.trim()]);
                  setJobTitleInput("");
                }
              }} placeholder="Type and press Enter" className="flex-1 px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
              <button onClick={() => {
                if (jobTitleInput.trim() && !jobTitles.includes(jobTitleInput.trim())) setJobTitles([...jobTitles, jobTitleInput.trim()]);
                setJobTitleInput("");
              }} className="px-3 py-2 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors">Add</button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-[var(--color-text-secondary)]">Job types wanted</label>
            <div className="flex flex-wrap gap-3">
              {JOB_TYPE_OPTIONS.map((jt) => (
                <label key={jt} className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                  <input type="checkbox" checked={jobTypes.includes(jt)} onChange={() => {
                    setJobTypes(jobTypes.includes(jt) ? jobTypes.filter((x) => x !== jt) : [...jobTypes, jt]);
                  }} className="rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]" />
                  {jt}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-[var(--color-text-secondary)]">Preferred job location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]" />
          </div>
          <button
            onClick={saveJobPrefs}
            disabled={saving === "jobs"}
            className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving === "jobs" && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>

        {/* Section 3: CV Management */}
        <div className="liquid-glass rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">CV Management</h2>
          {cvFilePath ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-[var(--color-text-primary)]">{cvFileName}</span>
                {cvUploadDate && <span className="text-[var(--color-text-secondary)]">Uploaded {cvUploadDate}</span>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-secondary)]">No CV uploaded yet.</p>
          )}
          <div>
            <label className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors cursor-pointer disabled:opacity-50">
              {cvUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {cvFilePath ? "Replace CV" : "Upload CV"}
              <input type="file" accept=".pdf" onChange={handleCvUpload} disabled={cvUploading} className="hidden" />
            </label>
          </div>
        </div>

        {/* Section 4: Danger Zone */}
        <div className="liquid-glass rounded-xl p-6 space-y-5 border-2 border-red-500/30">
          <h2 className="text-lg font-semibold text-red-500">Danger Zone</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">Permanently delete your account and all associated data.</p>
          <button onClick={() => setShowDeleteConfirm(true)} className="px-5 py-2.5 text-sm font-medium text-red-500 border border-red-500/50 rounded-full hover:bg-red-500/10 transition-colors">
            Request Data Deletion
          </button>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative bg-white dark:bg-[#1C1C1E] border border-[var(--color-border)] rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4">
              <p className="text-[var(--color-text-primary)] font-semibold">Are you sure?</p>
              <p className="text-sm text-[var(--color-text-secondary)]">This will permanently delete your account and all associated data including your CV. This cannot be undone.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-full hover:bg-white/5 dark:hover:bg-white/5 transition-colors">
                  Cancel
                </button>
                <button onClick={handleDeleteAccount} disabled={deleting} className="px-5 py-2.5 text-sm font-medium text-white bg-red-500 rounded-full hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2">
                  {deleting && <Loader2 size={14} className="animate-spin" />}
                  Yes, delete everything
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </PageTransitionWrapper>
    </DashboardLayout>
  );
}
