"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, Loader2, Trash2, Plus, FileText } from "lucide-react";
import "../landing/liquid-glass.css";

interface CvVariation {
  name: string;
  file_path: string;
}

interface ProfileOnboardingModalProps {
  profileId: string;
  onClose: () => void;
  onDelete?: (id: string) => void;
  editMode?: boolean;
  showUploadStep?: boolean;
  onSaved?: () => void;
}

export function ProfileOnboardingModal({ profileId, onClose, onDelete, editMode, showUploadStep, onSaved }: ProfileOnboardingModalProps) {
  const [step, setStep] = useState<"upload" | "extracting" | "form">(showUploadStep ? "upload" : "form");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [jobTitles, setJobTitles] = useState<string[]>([""]);
  const [location, setLocation] = useState("");
  const [industry, setIndustry] = useState("");
  const [suggestingIndustry, setSuggestingIndustry] = useState(false);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [cvVariations, setCvVariations] = useState<CvVariation[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const suggestedIndustryRef = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("search_profiles")
      .select("name, job_titles, job_types, location, industry, cv_variations")
      .eq("id", profileId)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data) {
          setName(data.name ?? "");
          setJobTitles(data.job_titles?.length ? data.job_titles : [""]);
          setJobTypes(data.job_types ?? []);
          setLocation(data.location ?? "");
          setIndustry(data.industry ?? "");
          setCvVariations(data.cv_variations?.length ? data.cv_variations : []);
        }
        setLoadingProfile(false);
      });
  }, [profileId]);

  useEffect(() => {
    if (step !== "form" || !showUploadStep || suggestedIndustryRef.current) return;
    const titles = jobTitles.filter((t) => t.trim());
    if (titles.length === 0) return;
    suggestedIndustryRef.current = true;
    setSuggestingIndustry(true);
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSuggestingIndustry(false); return; }
      try {
        const res = await fetch("/api/suggest-industry", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ job_titles: titles }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.industry) setIndustry(data.industry);
        }
      } catch {}
      setSuggestingIndustry(false);
    })();
  }, [step, showUploadStep, jobTitles]);

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
        .then(async (r) => {
          if (!r.ok) {
            const errData = await r.json().catch(() => ({}));
            throw new Error(errData.error || "Failed to extract CV");
          }
          return r.json();
        })
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
          setIndustry(data.industry ?? "");
          suggestedIndustryRef.current = true;
          if (data.cv_file_path) {
            setCvVariations([{ name: "CV", file_path: data.cv_file_path }]);
          }
          setStep("form");
        })
        .catch(() => {
          setError("Failed to extract CV. Please try again.");
          setStep("upload");
        });
    });
  };

  const handleAddCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      if (e.target) e.target.value = "";
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File too large. Max 10MB.");
      if (e.target) e.target.value = "";
      return;
    }

    setUploadingCv(true);
    setError("");

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("Not authenticated.");
      setUploadingCv(false);
      return;
    }

    const fileExt = f.name.split('.').pop();
    const filePath = `${session.user.id}/${crypto.randomUUID()}.${fileExt}`;
    const { error: uploadErr } = await supabase.storage
      .from("cv-files")
      .upload(filePath, f, { contentType: "application/pdf" });

    if (uploadErr) {
      setError("Failed to upload CV. Please try again.");
      setUploadingCv(false);
      if (e.target) e.target.value = "";
      return;
    }

    setCvVariations((prev) => [...prev, { name: "", file_path: filePath }]);
    setUploadingCv(false);
    if (addInputRef.current) addInputRef.current.value = "";
  };

  const handleReplaceCv = (index: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,application/pdf";
    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      const f = target.files?.[0];
      if (!f) return;
      if (f.type !== "application/pdf") {
        setError("Only PDF files are supported.");
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        setError("File too large. Max 10MB.");
        return;
      }

      setUploadingCv(true);
      setError("");

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not authenticated.");
        setUploadingCv(false);
        return;
      }

      const oldCv = cvVariations[index];
      if (oldCv?.file_path) {
        await supabase.storage.from("cv-files").remove([oldCv.file_path]);
      }

      const fileExt = f.name.split('.').pop();
      const filePath = `${session.user.id}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage
        .from("cv-files")
        .upload(filePath, f, { contentType: "application/pdf" });

      if (uploadErr) {
        setError("Failed to upload CV. Please try again.");
        setUploadingCv(false);
        return;
      }

      setCvVariations((prev) =>
        prev.map((cv, i) => (i === index ? { ...cv, file_path: filePath } : cv))
      );
      setUploadingCv(false);
    };
    input.click();
  };

  const handleRemoveCv = (index: number) => {
    if (cvVariations.length <= 1) {
      setError("You need at least one CV.");
      return;
    }
    setCvVariations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCvNameChange = (index: number, value: string) => {
    setCvVariations((prev) =>
      prev.map((cv, i) => (i === index ? { ...cv, name: value } : cv))
    );
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

    const validCvs = cvVariations.filter((cv) => cv.file_path.trim());
    if (validCvs.length === 0) {
      setError("Upload at least one CV.");
      return;
    }

    const namedCvs = validCvs.map((cv) => ({
      ...cv,
      name: cv.name.trim() || "CV",
    }));

    setSaving(true);
    setError("");

    const supabase = createClient();
    const cleanedLocation = location
      .replace(/\b(Remote|Hybrid|On-site|Online|Work from home|WFH|Flexible|Anywhere)\b/gi, "")
      .replace(/[\s,;/-]+/g, " ")
      .trim();
    const updateData: Record<string, any> = {
      job_titles: filtered,
      location: cleanedLocation,
      industry: industry.trim(),
      job_types: jobTypes,
      cv_variations: namedCvs,
    };
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

    onSaved?.();
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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-500"
      style={{ opacity: mounted ? 1 : 0 }}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-2xl bg-[#1C1C1E] border border-white/10 shadow-2xl overflow-hidden transition-all duration-500 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white">{editMode ? "Edit Search Profile" : "Set Up Search Profile"}</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6 max-h-[70vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                <Upload size={22} className="text-white/60" />
              </div>
              <p className="text-sm text-white/80 text-center">
                Upload your CV (PDF) to auto-fill job titles and location
              </p>
              <p className="text-xs text-white/50">Max 10MB</p>
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
              <p className="text-sm text-white/80">Extracting info from your CV...</p>
            </div>
          )}

          {step === "form" && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-white mb-1.5 block">Profile Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Software Engineer Profile"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white mb-1.5 block">Job Titles</label>
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
                        <button onClick={() => removeTitle(i)} className="text-white/50 hover:text-red-400 transition-colors p-1">
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
                <label className="text-sm font-medium text-white mb-1.5 block">Preferred Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Johannesburg, Cape Town"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                />
                <p className="mt-1 text-xs text-white/50">City or country only. Select work type below.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-white mb-1.5 block">Industry</label>
                <div className="flex items-center gap-2">
                  <input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Fintech, Healthcare, SaaS"
                    className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                  {suggestingIndustry && <Loader2 size={16} className="text-[var(--color-accent)] animate-spin shrink-0" />}
                </div>
                <p className="mt-1 text-xs text-white/50">Your target industry. Used in search queries and scoring.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-white mb-1.5 block">Work Type</label>
                <div className="flex gap-2">
                  {["On-site", "Hybrid", "Remote"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setJobTypes((prev) =>
                          prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                        )
                      }
                      className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                        jobTypes.includes(type)
                          ? "bg-[var(--color-accent)]/20 border-[var(--color-accent)] text-white"
                          : "bg-white/5 border-white/10 text-white/70 hover:border-white/20"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* CV Variations */}
              <div>
                <label className="text-sm font-medium text-white mb-1.5 block">
                  CV Variations <span className="text-white/50 font-normal">(max 4)</span>
                </label>
                <div className="flex flex-col gap-2">
                  {cvVariations.map((cv, i) => (
                    <div key={i} className="flex flex-col gap-1.5 p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-white/50 shrink-0" />
                        <input
                          value={cv.name}
                          onChange={(e) => handleCvNameChange(i, e.target.value)}
                          placeholder="e.g. General, Tech Focus, Senior"
                          className="flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/60 pl-6">
                        <span className="truncate flex-1">{cv.file_path.split('/').pop()}</span>
                        <button
                          onClick={() => handleReplaceCv(i)}
                          className="text-[var(--color-accent)] hover:underline"
                        >
                          Replace
                        </button>
                        <button
                          onClick={() => handleRemoveCv(i)}
                          className={`${cvVariations.length <= 1 ? 'text-white/20 cursor-not-allowed' : 'text-red-400 hover:text-red-300'}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {cvVariations.length < 4 && (
                  <>
                    <input
                      ref={addInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={handleAddCvUpload}
                    />
                    <button
                      onClick={() => addInputRef.current?.click()}
                      disabled={uploadingCv}
                      className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50"
                    >
                      {uploadingCv ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Plus size={12} />
                      )}
                      {uploadingCv ? "Uploading..." : `Add CV (${cvVariations.length}/4)`}
                    </button>
                  </>
                )}
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
                        className="px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white transition-colors"
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
