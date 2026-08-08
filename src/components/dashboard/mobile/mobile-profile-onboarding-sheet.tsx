"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, Loader2, Trash2, Plus, FileText } from "lucide-react";

interface CvVariation {
  name: string;
  file_path: string;
}

interface MobileProfileOnboardingSheetProps {
  profileId: string;
  onClose: () => void;
  onDelete?: (id: string) => void;
  editMode?: boolean;
  showUploadStep?: boolean;
  onSaved?: () => void;
}

export function MobileProfileOnboardingSheet({ profileId, onClose, onDelete, editMode, showUploadStep, onSaved }: MobileProfileOnboardingSheetProps) {
  const [step, setStep] = useState<"upload" | "extracting" | "form">(showUploadStep ? "upload" : "form");
  const [name, setName] = useState("");
  const [jobTitles, setJobTitles] = useState<string[]>([""]);
  const [location, setLocation] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryStep1, setIndustryStep1] = useState("");
  const [industryStep2, setIndustryStep2] = useState("");
  const [industryStep3, setIndustryStep3] = useState("");
  const [industryStep4, setIndustryStep4] = useState("");
  const [industryStep5, setIndustryStep5] = useState("");
  const [suggestingIndustry, setSuggestingIndustry] = useState(false);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [cvVariations, setCvVariations] = useState<CvVariation[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [labellingPaths, setLabellingPaths] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const suggestedIndustryRef = useRef(false);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("search_profiles")
      .select("name, job_titles, job_types, location, industry, industry_step_1, industry_step_2, industry_step_3, industry_step_4, industry_step_5, cv_variations")
      .eq("id", profileId).maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data) {
          setName(data.name ?? "");
          setJobTitles(data.job_titles?.length ? data.job_titles : [""]);
          setJobTypes(data.job_types ?? []);
          setLocation(data.location ?? "");
          setIndustry(data.industry ?? "");
          setIndustryStep1(data.industry_step_1 ?? "");
          setIndustryStep2(data.industry_step_2 ?? "");
          setIndustryStep3(data.industry_step_3 ?? "");
          setIndustryStep4(data.industry_step_4 ?? "");
          setIndustryStep5(data.industry_step_5 ?? "");
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
        if (res.ok) { const data = await res.json(); if (data.industry) setIndustry(data.industry); }
      } catch {}
      setSuggestingIndustry(false);
    })();
  }, [step, showUploadStep, jobTitles]);

  if (loadingProfile) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 4);
    const invalid = files.find((f) => f.type !== "application/pdf" && f.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && !f.name.endsWith(".docx"));
    if (invalid) { setError("Only PDF and DOCX files are supported."); return; }
    const oversized = files.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) { setError("File too large. Max 10MB per file."); return; }

    setError(""); setStep("extracting");
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }: { data: { session: { access_token: string; user: { id: string } } | null } }) => {
      const session = data?.session;
      if (!session) { setError("Not authenticated."); setStep("upload"); return; }
      try {
        const uploads = files.map(async (f) => {
          const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filePath = `${session.user.id}/${safeName}`;
          const { error: uploadErr } = await supabase.storage.from("cv-files").upload(filePath, f, { contentType: f.type || "application/pdf", upsert: true });
          if (uploadErr) throw new Error("Failed to upload CV.");
          return { file: f, filePath };
        });
        const uploaded = await Promise.all(uploads);
        const allPaths = uploaded.map((u) => u.filePath);
        const formData = new FormData();
        formData.append("file", uploaded[0].file);
        const res = await fetch("/api/extract-cv", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: formData });
        const data = await res.json();
        if (!res.ok || data.error) { setError(data.error || "Failed to extract CV"); setStep("upload"); return; }

        const titles = Array.isArray(data.job_titles) && data.job_titles.length > 0 ? data.job_titles : [""];
        setJobTitles(titles); setLocation(data.preferred_location ?? ""); setIndustry(data.industry ?? "");
        suggestedIndustryRef.current = true;

        const variations: CvVariation[] = allPaths.map((p) => ({ name: "", file_path: p }));
        setCvVariations(variations);
        setLabellingPaths((prev) => new Set([...prev, ...allPaths]));

        allPaths.forEach((filePath) => {
          fetch("/api/suggest-cv-label", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ file_path: filePath }),
          }).then(async (r) => {
            if (r.ok) { const { label } = await r.json(); if (label) setCvVariations((prev) => { const next = [...prev]; const idx = next.findIndex((cv) => cv.file_path === filePath); if (idx !== -1) next[idx] = { ...next[idx], name: label }; return next; }); }
          }).catch(() => {}).finally(() => setLabellingPaths((prev) => { const next = new Set(prev); next.delete(filePath); return next; }));
        });

        if (data.industry) {
          fetch("/api/suggest-industry-ladder", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ industry: data.industry, job_titles: titles }),
          }).then(async (r) => {
            if (r.ok) { const ladder = await r.json(); if (ladder.steps) { setIndustryStep1(ladder.steps[0]?.value ?? ""); setIndustryStep2(ladder.steps[1]?.value ?? ""); setIndustryStep3(ladder.steps[2]?.value ?? ""); setIndustryStep4(ladder.steps[3]?.value ?? ""); setIndustryStep5(ladder.steps[4]?.value ?? ""); } }
          }).catch(() => {});
        }
        setStep("form");
      } catch { setError("Failed to extract CV. Please try again."); setStep("upload"); }
    });
  };

  const handleAddCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    if (e.target) e.target.value = "";
    const files = Array.from(fileList);
    const invalid = files.find((f) => f.type !== "application/pdf" && f.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && !f.name.endsWith(".docx"));
    if (invalid) { setError("Only PDF and DOCX files are supported."); return; }
    const remaining = 4 - cvVariations.length;
    if (remaining <= 0) { setError("Maximum 4 CV variations allowed."); return; }
    const toUpload = files.slice(0, remaining);

    setUploadingCv(true); setError("");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Not authenticated."); setUploadingCv(false); return; }

    const uploadedPaths: string[] = [];
    for (const f of toUpload) {
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${session.user.id}/${safeName}`;
      const { error: uploadErr } = await supabase.storage.from("cv-files").upload(filePath, f, { contentType: f.type || "application/pdf", upsert: true });
      if (uploadErr) { setError("Failed to upload CV."); setUploadingCv(false); return; }
      uploadedPaths.push(filePath);
    }

    setCvVariations((prev) => [...prev, ...uploadedPaths.map((p) => ({ name: "", file_path: p }))]);
    setUploadingCv(false);
    setLabellingPaths((prev) => new Set([...prev, ...uploadedPaths]));
    uploadedPaths.forEach((filePath) => {
      fetch("/api/suggest-cv-label", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: filePath }),
      }).then(async (r) => {
        if (r.ok) { const { label } = await r.json(); if (label) setCvVariations((prev) => { const next = [...prev]; const idx = next.findIndex((cv) => cv.file_path === filePath); if (idx !== -1) next[idx] = { ...next[idx], name: label }; return next; }); }
      }).catch(() => {}).finally(() => setLabellingPaths((prev) => { const next = new Set(prev); next.delete(filePath); return next; }));
    });
  };

  const handleSave = async () => {
    const filtered = jobTitles.map((t) => t.trim()).filter(Boolean);
    if (filtered.length === 0) { setError("Add at least one job title."); return; }
    const validCvs = cvVariations.filter((cv) => cv.file_path.trim());
    if (validCvs.length === 0) { setError("Upload at least one CV."); return; }
    const namedCvs = validCvs.map((cv) => ({ ...cv, name: cv.name.trim() || "CV" }));

    setSaving(true); setError("");
    const supabase = createClient();
    const cleanedLocation = location.replace(/\b(Remote|Hybrid|On-site|Online|Work from home|WFH|Flexible|Anywhere)\b/gi, "").replace(/[\s,;/-]+/g, " ").trim();
    const updateData: Record<string, any> = {
      job_titles: filtered, location: cleanedLocation, industry: industry.trim(),
      industry_step_1: industryStep1, industry_step_2: industryStep2, industry_step_3: industryStep3,
      industry_step_4: industryStep4, industry_step_5: industryStep5,
      industry_ladder_generated_at: new Date().toISOString(), job_types: jobTypes, cv_variations: namedCvs,
    };
    if (name.trim()) updateData.name = name.trim();
    const { error: updateErr } = await supabase.from("search_profiles").update(updateData).eq("id", profileId);
    if (updateErr) { setError(updateErr.message); setSaving(false); return; }

    setSaved(true);
    setSaving(false);
    onSaved?.();
    // Close after showing success message briefly
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  const handleDelete = async () => {
    const supabase = createClient();
    const { error } = await supabase.from("search_profiles").delete().eq("id", profileId);
    if (error) { setError(error.message); return; }
    onDelete?.(profileId); onClose();
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setDragY(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > 100) onClose(); else setDragY(0);
  }, [dragY, onClose]);

  const inputClass = (filled: boolean) =>
    `w-full h-10 px-3 text-[11px] rounded-[10px] border text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-colors ${filled ? "bg-white/5 border-white/10" : "bg-yellow-500/10 border-yellow-500/30"}`;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-[#1C1C1E] rounded-t-[19px] flex flex-col overflow-hidden"
        style={{ height: "calc(100dvh - 2.5rem)", transform: `translateY(${dragY > 0 ? dragY : 0}px)`, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex justify-center pt-2.5 pb-1.5 shrink-0">
          <div className="w-7 h-[5px] rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-3 pb-2.5 shrink-0 border-b border-white/[0.06]">
          <h2 className="text-[14px] font-semibold text-white">{editMode ? "Edit Search Profile" : "Set Up Search Profile"}</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {error && <div className="mb-3 p-2.5 rounded-[10px] bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">{error}</div>}

          {step === "upload" && (
            <div onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2.5 p-8 rounded-xl border-2 border-dashed border-white/10 hover:border-[var(--color-accent)]/40 cursor-pointer transition-colors">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                <Upload size={18} className="text-white/60" />
              </div>
              <p className="text-[11px] text-white/80 text-center">Upload your CVs (PDF or DOCX) to auto-fill your profile</p>
              <p className="text-[10px] text-white/50">Max 10MB per file, up to 4 CVs</p>
              <input ref={inputRef} type="file" accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {step === "extracting" && (
            <div className="flex flex-col items-center gap-2.5 py-12">
              <Loader2 size={22} className="text-[var(--color-accent)] animate-spin" />
              <p className="text-[11px] text-white/80">Extracting info from your CVs...</p>
            </div>
          )}

          {step === "form" && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] font-medium text-white mb-1.5 block">Profile Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Software Engineer Profile" className={inputClass(!!name)} />
              </div>

              <div>
                <label className="text-[11px] font-medium text-white mb-1.5 block">Job Titles</label>
                <div className="flex flex-col gap-1.5">
                  {jobTitles.map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input value={t} onChange={(e) => { const next = [...jobTitles]; next[i] = e.target.value; setJobTitles(next); }} placeholder="e.g. Software Engineer" className="flex-1 h-10 px-3 text-[11px] rounded-[10px] bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)]" />
                      {jobTitles.length > 1 && <button onClick={() => setJobTitles(jobTitles.filter((_, idx) => idx !== i))} className="w-9 h-9 flex items-center justify-center text-white/50 hover:text-red-400"><X size={13} /></button>}
                    </div>
                  ))}
                </div>
                <button onClick={() => setJobTitles([...jobTitles, ""])} className="mt-1.5 text-[10px] text-[var(--color-accent)]">+ Add another title</button>
              </div>

              <div>
                <label className="text-[11px] font-medium text-white mb-1.5 block">Preferred Location</label>
                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Johannesburg" className={inputClass(!!location)} />
                <p className="mt-0.5 text-[10px] text-white/50">City or country only.</p>
              </div>

              <div>
                <label className="text-[11px] font-medium text-white mb-1.5 block">Industry Ladder <span className="text-white/50 font-normal">(AI-populated)</span></label>
                <div className="space-y-1.5">
                  {[
                    { label: "Step 1: Hyper-Niche", value: industryStep1, setter: setIndustryStep1 },
                    { label: "Step 2: Niche", value: industryStep2, setter: setIndustryStep2 },
                    { label: "Step 3: Sub-Sector", value: industryStep3, setter: setIndustryStep3 },
                    { label: "Step 4: Industry", value: industryStep4, setter: setIndustryStep4 },
                    { label: "Step 5: Broad Sector", value: industryStep5, setter: setIndustryStep5 },
                  ].map((s) => (
                    <div key={s.label}>
                      <label className="text-[11px] text-white/40">{s.label}</label>
                      <input value={s.value} onChange={(e) => s.setter(e.target.value)} placeholder="e.g. Banking"
                        className="w-full h-8 px-2.5 text-[11px] rounded-[7px] bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)]" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-white mb-1.5 block">Work Type</label>
                <div className="flex gap-1.5">
                  {["On-site", "Hybrid", "Remote"].map((type) => (
                    <button key={type} type="button" onClick={() => setJobTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type])}
                      className={`flex-1 h-10 flex items-center justify-center rounded-[10px] text-[11px] border transition-colors ${jobTypes.includes(type) ? "bg-[var(--color-accent)]/20 border-[var(--color-accent)] text-white" : "bg-white/5 border-white/10 text-white/70"}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-white mb-1.5 block">CV Variations <span className="text-white/50 font-normal">(max 4)</span></label>
                <div className="flex flex-col gap-1.5">
                  {cvVariations.map((cv, i) => (
                    <div key={i} className="p-2.5 rounded-[10px] bg-white/5 border border-white/10">
                      <div className="flex items-center gap-1.5">
                        <FileText size={11} className="text-white/50 shrink-0" />
                        {labellingPaths.has(cv.file_path) ? (
                          <div className="flex-1 flex items-center gap-1.5 px-1.5 py-1"><Loader2 size={10} className="text-white/40 animate-spin" /><span className="text-[11px] text-white/40">Identifying...</span></div>
                        ) : (
                          <input value={cv.name} onChange={(e) => { const next = [...cvVariations]; next[i] = { ...next[i], name: e.target.value }; setCvVariations(next); }}
                            placeholder="e.g. General, Tech Focus" className="flex-1 px-1.5 py-1 text-[11px] rounded-[7px] bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)]" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-white/60 mt-1 pl-5">
                        <span className="truncate flex-1">{cv.file_path.split('/').pop()}</span>
                        <button onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = ".pdf,.docx"; input.onchange = async (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; setUploadingCv(true); const supabase = createClient(); const { data: { session } } = await supabase.auth.getSession(); if (!session) { setUploadingCv(false); return; } if (cvVariations[i]?.file_path) await supabase.storage.from("cv-files").remove([cvVariations[i].file_path]); const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_"); const filePath = `${session.user.id}/${safeName}`; await supabase.storage.from("cv-files").upload(filePath, f, { contentType: f.type, upsert: true }); setCvVariations((prev) => prev.map((cv, idx) => idx === i ? { ...cv, file_path: filePath } : cv)); setUploadingCv(false); }; input.click(); }}
                          className="text-[var(--color-accent)]">Replace</button>
                        {cvVariations.length > 1 && <button onClick={() => setCvVariations((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-400"><X size={10} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
                {cvVariations.length < 4 && (
                  <>
                    <input ref={addInputRef} type="file" accept=".pdf,.docx" multiple className="hidden" onChange={handleAddCvUpload} />
                    <button onClick={() => addInputRef.current?.click()} disabled={uploadingCv} className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--color-accent)] disabled:opacity-50">
                      {uploadingCv ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                      {uploadingCv ? "Uploading..." : `Add CVs (${cvVariations.length}/4)`}
                    </button>
                  </>
                )}
              </div>

<button onClick={handleSave} disabled={saving}
                className="w-full h-10 flex items-center justify-center gap-1.5 rounded-[10px] bg-[var(--color-accent)] text-white text-[11px] font-medium disabled:opacity-50">
              {saving && <Loader2 size={12} className="animate-spin" />}
              {editMode ? "Save Changes" : "Save & Start Searching"}
            </button>

            {saved && (
              <p className="mt-2 text-center text-[11px] text-green-400 animate-fade-in">
                ✓ Saved — changes apply to your next search
              </p>
            )}

            {editMode && (
                <div className="pt-2.5 border-t border-white/[0.06]">
                  {confirmDelete ? (
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] text-red-400 flex-1">Delete this profile?</p>
                      <button onClick={handleDelete} className="h-8 px-3 text-[10px] font-medium text-white bg-red-500/80 rounded-[7px]">Confirm</button>
                      <button onClick={() => setConfirmDelete(false)} className="h-8 px-3 text-[10px] font-medium text-white/80">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 text-[10px] text-red-400">
                      <Trash2 size={10} /> Delete profile
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
