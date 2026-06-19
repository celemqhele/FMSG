"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, Loader2, Trash2 } from "lucide-react";

interface ProfileOnboardingModalProps {
  profileId: string;
  onClose: () => void;
  onDelete?: (id: string) => void;
  editMode?: boolean;
}

export function ProfileOnboardingModal({ profileId, onClose, onDelete, editMode }: ProfileOnboardingModalProps) {
  const [step, setStep] = useState<"upload" | "extracting" | "form">(editMode ? "form" : "upload");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [jobTitles, setJobTitles] = useState<string[]>([""]);
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(editMode ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editMode) return;
    const supabase = createClient();
    supabase
      .from("search_profiles")
      .select("name, job_titles, location")
      .eq("id", profileId)
      .single()
      .then(({ data }: { data: any }) => {
        if (data) {
          setName(data.name ?? "");
          setJobTitles(data.job_titles?.length ? data.job_titles : [""]);
          setLocation(data.location ?? "");
        }
        setLoadingProfile(false);
      });
  }, [editMode, profileId]);

  if (loadingProfile) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File too large. Max 10MB.");
      return;
    }
    setFile(f);
    setError("");
    setStep("extracting");

    const supabase = createClient();
    const formData = new FormData();
    formData.append("file", f);

    supabase.auth.getSession().then(({ data }: { data: { session: { access_token: string } | null } }) => {
      const session = data?.session;
      fetch("/api/extract-cv", {
        method: "POST",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
            setStep("upload");
            return;
          }
          const titles = Array.isArray(data.job_titles) && data.job_titles.length > 0
            ? data.job_titles
            : [""];
          setJobTitles(titles);
          setLocation(data.preferred_location ?? "");
          setStep("form");
        })
        .catch(() => {
          setError("Failed to extract CV. Please try again.");
          setStep("upload");
        });
    });
  };

  const handleTitleChange = (i: number, v: string) => {
    const next = [...jobTitles];
    next[i] = v;
    setJobTitles(next);
  };

  const addTitle = () => setJobTitles((prev) => [...prev, ""]);

  const removeTitle = (i: number) => {
    if (jobTitles.length <= 1) return;
    setJobTitles((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    const filtered = jobTitles.map((t) => t.trim()).filter(Boolean);
    if (filtered.length === 0) {
      setError("Add at least one job title.");
      return;
    }
    setSaving(true);
    setError("");

    const supabase = createClient();
    const updateData: Record<string, any> = { job_titles: filtered, location: location.trim() };
    if (name.trim()) updateData.name = name.trim();

    const { error: updateErr } = await supabase
      .from("search_profiles")
      .update(updateData)
      .eq("id", profileId);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    onClose();
  };

  const handleDelete = async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("search_profiles")
      .delete()
      .eq("id", profileId);

    if (error) {
      setError(error.message);
      return;
    }

    onDelete?.(profileId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-[#1C1C1E] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white">{editMode ? "Edit Search Profile" : "Set Up Search Profile"}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          {step === "upload" && (
            <div
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 p-10 rounded-xl border-2 border-dashed border-white/10 hover:border-[var(--color-accent)]/40 cursor-pointer transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                <Upload size={22} className="text-white/40" />
              </div>
              <p className="text-sm text-white/60 text-center">
                Upload your CV (PDF) to auto-fill job titles and location
              </p>
              <p className="text-xs text-white/30">Max 10MB</p>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {step === "extracting" && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 size={28} className="text-[var(--color-accent)] animate-spin" />
              <p className="text-sm text-white/60">Extracting info from your CV...</p>
            </div>
          )}

          {step === "form" && (
            <div className="flex flex-col gap-4">
              {editMode && (
                <div>
                  <label className="text-sm font-medium text-white/80 mb-1.5 block">Profile Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Software Engineer Profile"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-white/80 mb-1.5 block">Job Titles</label>
                <div className="flex flex-col gap-2">
                  {jobTitles.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={t}
                        onChange={(e) => handleTitleChange(i, e.target.value)}
                        placeholder="e.g. Software Engineer"
                        className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                      />
                      {jobTitles.length > 1 && (
                        <button onClick={() => removeTitle(i)} className="text-white/30 hover:text-red-400 transition-colors p-1">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addTitle}
                  className="mt-1.5 text-xs text-[var(--color-accent)] hover:underline"
                >
                  + Add another title
                </button>
              </div>

              <div>
                <label className="text-sm font-medium text-white/80 mb-1.5 block">Preferred Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Johannesburg, Remote"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full mt-2 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editMode ? "Save Changes" : "Save & Start Searching"}
              </button>

              {editMode && (
                <div className="pt-2 border-t border-white/[0.06]">
                  {confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-red-400 flex-1">Delete this profile?</p>
                      <button
                        onClick={handleDelete}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={12} />
                      Delete profile
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
