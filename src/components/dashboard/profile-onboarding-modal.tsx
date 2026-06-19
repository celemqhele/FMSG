"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, Loader2 } from "lucide-react";

interface ProfileOnboardingModalProps {
  profileId: string;
  onClose: () => void;
}

export function ProfileOnboardingModal({ profileId, onClose }: ProfileOnboardingModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "extracting" | "form">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [jobTitles, setJobTitles] = useState<string[]>([""]);
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    const { error: updateErr } = await supabase
      .from("search_profiles")
      .update({ job_titles: filtered, location: location.trim() })
      .eq("id", profileId);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-[#1C1C1E] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white">Set Up Search Profile</h2>
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
                Save & Start Searching
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
