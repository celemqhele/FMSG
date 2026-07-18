"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Loader2, Plus, X, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ExtractedData {
  name: string;
  surname: string;
  phone: string;
  address: string;
  job_titles: string[];
  job_types: string[];
  preferred_location: string;
  current_salary: number | null;
  desired_salary: number | null;
  cv_file_path: string;
}

type Step = "upload" | "extracting" | "review";

interface OnboardingFormProps {
  onOnboarded?: () => void;
}

export function OnboardingForm({ onOnboarded }: OnboardingFormProps) {
  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [jobTitleInput, setJobTitleInput] = useState("");
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [currentSalary, setCurrentSalary] = useState<number | null>(null);
  const [desiredSalary, setDesiredSalary] = useState<number | null>(null);
  const [cvVariations, setCvVariations] = useState<{ name: string; file_path: string }[]>([]);
  const [labellingPaths, setLabellingPaths] = useState<Set<string>>(new Set());

  const [industry, setIndustry] = useState("");
  const [industryStep1, setIndustryStep1] = useState("");
  const [industryStep2, setIndustryStep2] = useState("");
  const [industryStep3, setIndustryStep3] = useState("");
  const [industryStep4, setIndustryStep4] = useState("");
  const [industryStep5, setIndustryStep5] = useState("");
  const [suggestingIndustry, setSuggestingIndustry] = useState(false);
  const [suggestingLadder, setSuggestingLadder] = useState(false);
  const suggestedIndustryRef = useRef(false);
  const suggestedLadderRef = useRef(false);

  const handleFile = async (files: FileList | File[]) => {
    setError("");
    const fileArr = Array.from(files).slice(0, 4);
    const invalid = fileArr.find((f) => f.type !== "application/pdf" && f.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && !f.name.endsWith(".docx"));
    if (invalid) { setError("Only PDF and DOCX files are supported."); return; }
    const oversized = fileArr.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) { setError("File too large. Max 10MB per file."); return; }

    setStep("extracting");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    try {
      const uploads = fileArr.map(async (f) => {
        const ext = f.name.split('.').pop();
        const filePath = `${session?.user?.id ?? "unknown"}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("cv-files")
          .upload(filePath, f, { contentType: f.type || "application/pdf" });
        if (uploadErr) throw new Error("Failed to upload CV.");
        return { file: f, filePath };
      });

      const uploaded = await Promise.all(uploads);
      const allPaths = uploaded.map((u) => u.filePath);

      const formData = new FormData();
      formData.append("file", uploaded[0].file);
      const res = await fetch("/api/extract-cv", {
        method: "POST",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.code ? `${data.code}: ${data.error}` : data.error || "Extraction failed.");
        setStep("upload");
        return;
      }
      setName(data.name ?? "");
      setSurname(data.surname ?? "");
      setPhone(data.phone ?? "");
      setAddress(data.address ?? "");
      setJobTitles(data.job_titles ?? []);
      setJobTypes(data.job_types ?? []);
      setLocation(data.preferred_location ?? "");
      setCurrentSalary(data.current_salary ?? null);
      setDesiredSalary(data.desired_salary ?? null);
      setIndustry(data.industry ?? "");
      suggestedIndustryRef.current = true;

      const variations = allPaths.map((p) => ({ name: "", file_path: p }));
      setCvVariations(variations);

      // Fire AI labelling for all files in parallel
      setLabellingPaths(new Set(allPaths));
      allPaths.forEach((filePath) => {
        fetch("/api/suggest-cv-label", {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ file_path: filePath }),
        }).then(async (r) => {
          if (r.ok) {
            const { label } = await r.json();
            if (label) {
              setCvVariations((prev) => {
                const next = [...prev];
                const idx = next.findIndex((cv) => cv.file_path === filePath);
                if (idx !== -1) next[idx] = { ...next[idx], name: label };
                return next;
              });
            }
          }
        }).catch(() => {}).finally(() => {
          setLabellingPaths((prev) => {
            const next = new Set(prev);
            next.delete(filePath);
            return next;
          });
        });
      });

      // Auto-suggest industry from job titles (if not already set from CV extraction)
      const titles = data.job_titles ?? [];
      if (!data.industry && titles.length > 0 && session) {
        setSuggestingIndustry(true);
        fetch("/api/suggest-industry", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ job_titles: titles }),
        }).then(async (r) => {
          if (r.ok) {
            const d = await r.json();
            if (d.industry) setIndustry(d.industry);
          }
        }).catch(() => {}).finally(() => setSuggestingIndustry(false));
      }

      setStep("review");
    } catch {
      setError("Could not analyze CV. Please try again.");
      setStep("upload");
    }
  };

  // Auto-suggest industry ladder after industry is set
  useEffect(() => {
    if (step !== "review" || !industry || suggestedLadderRef.current || suggestingLadder) return;
    if (industryStep1) return; // already populated
    suggestedLadderRef.current = true;
    setSuggestingLadder(true);

    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }: { data: { session: { access_token: string } | null } }) => {
      const session = data?.session;
      if (!session) { setSuggestingLadder(false); return; }
      try {
        const res = await fetch("/api/suggest-industry-ladder", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ industry, job_titles: jobTitles }),
        });
        if (res.ok) {
          const ladder = await res.json();
          if (ladder.steps) {
            setIndustryStep1(ladder.steps[0]?.value ?? "");
            setIndustryStep2(ladder.steps[1]?.value ?? "");
            setIndustryStep3(ladder.steps[2]?.value ?? "");
            setIndustryStep4(ladder.steps[3]?.value ?? "");
            setIndustryStep5(ladder.steps[4]?.value ?? "");
          }
        }
      } catch {}
      setSuggestingLadder(false);
    });
  }, [step, industry, jobTitles]);

  const addJobTitle = () => {
    const t = jobTitleInput.trim();
    if (t && !jobTitles.includes(t)) setJobTitles([...jobTitles, t]);
    setJobTitleInput("");
  };

  const removeJobTitle = (t: string) => setJobTitles(jobTitles.filter((j) => j !== t));

  const toggleJobType = (t: string) => {
    setJobTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setSaving(false); return; }

    const fullName = [name, surname].filter(Boolean).join(" ");
    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: fullName,
      name,
      surname,
      phone,
      address,
      current_salary: currentSalary,
      desired_salary: desiredSalary,
      preferred_location: location,
      job_types: jobTypes,
      onboarding_completed: true,
      cv_file_path: cvVariations[0]?.file_path ?? "",
      search_balance: 1,
      cv_generation_balance: 0,
      persistent_finder_balance: 0,
    });

    if (profileErr) { setError(profileErr.message); setSaving(false); return; }

    const { data: existingSP } = await supabase.from("search_profiles").select("id").eq("user_id", user.id).limit(1);
    const profileName = (jobTitles[0] ?? "General").slice(0, 50);
    const cleanedLocation = location
      .replace(/\b(Remote|Hybrid|On-site|Online|Work from home|WFH|Flexible|Anywhere)\b/gi, "")
      .replace(/[\s,;/-]+/g, " ")
      .trim();

    const spData = {
      name: profileName,
      job_titles: jobTitles,
      job_types: jobTypes,
      location: cleanedLocation,
      industry: industry.trim(),
      industry_step_1: industryStep1,
      industry_step_2: industryStep2,
      industry_step_3: industryStep3,
      industry_step_4: industryStep4,
      industry_step_5: industryStep5,
      industry_ladder_generated_at: new Date().toISOString(),
      cv_variations: cvVariations.map((cv) => ({ name: cv.name || "CV", file_path: cv.file_path })),
    };

    if (existingSP?.length) {
      await supabase.from("search_profiles").update(spData).eq("user_id", user.id);
    } else {
      await supabase.from("search_profiles").insert({
        user_id: user.id,
        ...spData,
        is_default: true,
      });
    }

    setSaving(false);
    onOnboarded?.();
  };

  if (step === "upload") {
    return (
      <div className="flex flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 tracking-tight">
            Upload your CVs
          </h1>
          <p className="mt-3 text-gray-500">
            PDF or DOCX, max 10MB per file, up to 4 CVs. Your files are stored securely.
          </p>
        </div>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`w-full max-w-md p-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all text-center ${
            dragOver
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
              : "border-gray-300 hover:border-gray-400 bg-gray-50"
          }`}
        >
          <Upload size={36} className="mx-auto text-gray-400" />
          <p className="mt-4 text-sm text-gray-700">
            Drag and drop your CVs here, or click to browse
          </p>
          <p className="mt-1 text-xs text-gray-400">PDF or DOCX (max 10MB each, up to 4)</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            onChange={(e) => { if (e.target.files?.length) handleFile(e.target.files); }}
            className="hidden"
          />
        </div>
      </div>
    );
  }

  if (step === "extracting") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20">
        <Loader2 size={32} className="animate-spin text-gray-500" />
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">Analyzing your CV...</p>
          <p className="mt-1 text-sm text-gray-500">Extracting your details with AI</p>
        </div>
      </div>
    );
  }

  const inputClass = (filled: boolean) =>
    `w-full px-4 py-2.5 text-sm rounded-lg border text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors ${
      filled ? "bg-gray-50 border-gray-300" : "bg-yellow-50 border-yellow-300"
    }`;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8 pb-16">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">Review your profile</h1>
        <p className="mt-2 text-sm text-gray-500">Edit anything AI got wrong, then save.</p>
      </div>

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass(!!name)} placeholder="First name" />
            {!name && <p className="mt-1 text-xs text-yellow-600">Missing, fill in manually</p>}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Surname</label>
            <input value={surname} onChange={(e) => setSurname(e.target.value)} className={inputClass(!!surname)} placeholder="Surname" />
            {!surname && <p className="mt-1 text-xs text-yellow-600">Missing, fill in manually</p>}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass(!!phone)} placeholder="Phone number" />
          {!phone && <p className="mt-1 text-xs text-yellow-600">Missing, fill in manually</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass(!!address)} placeholder="Your address" />
          {!address && <p className="mt-1 text-xs text-yellow-600">Missing, fill in manually</p>}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Career Information</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Desired Job Titles</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {jobTitles.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-full">
                {t}
                <button onClick={() => removeJobTitle(t)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={jobTitleInput}
              onChange={(e) => setJobTitleInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addJobTitle())}
              className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              placeholder="Add a title"
            />
            <button onClick={addJobTitle} className="px-3 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors">
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Preferred Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass(!!location)} placeholder="City or province" />
          {!location && <p className="mt-1 text-xs text-yellow-600">Missing, fill in manually</p>}
          <p className="mt-1 text-xs text-gray-400">City or country only. Select work type below.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Work Type</label>
          <div className="flex flex-wrap gap-2">
            {["On-site", "Hybrid", "Remote"].map((t) => (
              <button
                key={t}
                onClick={() => toggleJobType(t)}
                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  jobTypes.includes(t)
                    ? "bg-[var(--color-accent)]/10 border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Industry</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Industry
            {suggestingIndustry && <span className="ml-2 text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">AI suggested</span>}
          </label>
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputClass(!!industry)} placeholder="e.g. Fintech, Healthcare, E-commerce" />
          {!industry && !suggestingIndustry && <p className="mt-1 text-xs text-yellow-600">Missing, fill in manually</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700">
              Industry Ladder
              <span className="ml-2 text-[10px] font-normal text-gray-400">(AI-populated, edit any step)</span>
            </label>
            {suggestingLadder && <Loader2 size={12} className="text-blue-500 animate-spin" />}
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Controls how Persistent Finder broadens your industry across 5 search rounds.
          </p>
          <div className="space-y-2">
            {[
              { label: "Step 1: Hyper-Niche", value: industryStep1, setter: setIndustryStep1, placeholder: "e.g. Private Wealth Banking" },
              { label: "Step 2: Niche", value: industryStep2, setter: setIndustryStep2, placeholder: "e.g. Wealth Management" },
              { label: "Step 3: Sub-Sector", value: industryStep3, setter: setIndustryStep3, placeholder: "e.g. Banking" },
              { label: "Step 4: Industry", value: industryStep4, setter: setIndustryStep4, placeholder: "e.g. Financial Services" },
              { label: "Step 5: Broad Sector", value: industryStep5, setter: setIndustryStep5, placeholder: "e.g. Financial Services" },
            ].map((s) => (
              <div key={s.label} className="space-y-0.5">
                <label className="text-[11px] text-gray-500">{s.label}</label>
                <input
                  value={s.value}
                  onChange={(e) => s.setter(e.target.value)}
                  placeholder={s.placeholder}
                  className={`w-full px-3 py-1.5 rounded-lg border text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors ${
                    s.value ? "bg-gray-50 border-gray-300" : "bg-yellow-50 border-yellow-300"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="text-xs text-gray-500">
        A search profile will be created from this data. You can edit or add more profiles later in Settings.
      </p>

      {cvVariations.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">CV Variations</h2>
          <p className="text-xs text-gray-500">AI is identifying each CV's focus area. You can edit the labels after saving.</p>
          <div className="flex flex-col gap-2">
            {cvVariations.map((cv, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                <FileText size={14} className="text-gray-400 shrink-0" />
                {labellingPaths.has(cv.file_path) ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Loader2 size={12} className="text-gray-400 animate-spin" />
                    <span className="text-sm text-gray-400">Identifying CV focus...</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-700 flex-1">{cv.name || "CV"}</span>
                )}
                <span className="text-xs text-gray-400 truncate">{cv.file_path.split('/').pop()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Salary Expectations</h2>
        <p className="text-xs text-gray-500">AI estimated from your experience &amp; region, adjust if needed.</p>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Current Salary
              {currentSalary != null && <span className="ml-1.5 text-[10px] font-normal text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">AI estimated</span>}
            </label>
            <input
              type="number"
              value={currentSalary ?? ""}
              onChange={(e) => setCurrentSalary(e.target.value ? Number(e.target.value) : null)}
              className={currentSalary != null
                ? "w-full px-4 py-2.5 text-sm rounded-lg bg-blue-50 border border-blue-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                : "w-full px-4 py-2.5 text-sm rounded-lg bg-yellow-50 border border-yellow-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              }
              placeholder="Monthly ZAR"
            />
            {currentSalary == null && <p className="mt-1 text-xs text-yellow-600">Missing, fill in manually</p>}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Desired Salary
              {desiredSalary != null && <span className="ml-1.5 text-[10px] font-normal text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">AI estimated</span>}
            </label>
            <input
              type="number"
              value={desiredSalary ?? ""}
              onChange={(e) => setDesiredSalary(e.target.value ? Number(e.target.value) : null)}
              className={desiredSalary != null
                ? "w-full px-4 py-2.5 text-sm rounded-lg bg-blue-50 border border-blue-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                : "w-full px-4 py-2.5 text-sm rounded-lg bg-yellow-50 border border-yellow-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              }
              placeholder="Monthly ZAR"
            />
            {desiredSalary == null && <p className="mt-1 text-xs text-yellow-600">Missing, fill in manually</p>}
          </div>
        </div>
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-5 py-3 text-sm font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full transition-colors disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Profile"}
      </button>
    </div>
  );
}
