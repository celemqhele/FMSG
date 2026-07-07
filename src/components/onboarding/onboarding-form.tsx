"use client";

import { useState, useRef, type ReactNode } from "react";
import { Upload, Loader2, Plus, X } from "lucide-react";
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

const JOB_TYPE_OPTIONS = [
  "Full-time", "Part-time", "Contract", "Freelance", "Remote", "Hybrid", "Internship",
];

interface OnboardingFormProps {
  onOnboarded?: () => void;
  guestMode?: boolean;
  onGuestProfile?: (data: { job_titles: string[]; location: string; job_types: string[]; name: string; surname: string; phone: string; address: string; current_salary: number | null; desired_salary: number | null }) => void;
}

export function OnboardingForm({ onOnboarded, guestMode, onGuestProfile }: OnboardingFormProps) {
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
  const [cvFilePath, setCvFilePath] = useState("");

  const handleFile = async (file: File) => {
    setError("");
    setStep("extracting");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const formData = new FormData();
    formData.append("file", file);
    try {
      const apiUrl = guestMode ? "/api/cv/parse-guest" : "/api/extract-cv";
      const headers: Record<string, string> = {};
      if (session && !guestMode) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch(apiUrl, { method: "POST", headers, body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Extraction failed.");
        setStep("upload");
        return;
      }
      setName(data.name ?? "");
      setSurname(data.surname ?? "");
      setPhone(data.phone ?? "");
      setAddress(data.address ?? "");
      setJobTitles(data.job_titles ?? []);
      setJobTypes(data.job_types ?? []);
      setLocation(data.preferred_location ?? data.location ?? "");
      setCurrentSalary(data.current_salary ?? null);
      setDesiredSalary(data.desired_salary ?? null);
      setCvFilePath(data.cv_file_path ?? "");
      setStep("review");
    } catch {
      setError("Could not analyze CV. Please try again.");
      setStep("upload");
    }
  };

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

    if (guestMode) {
      onGuestProfile?.({
        job_titles: jobTitles,
        location,
        job_types: jobTypes,
        name,
        surname,
        phone,
        address,
        current_salary: currentSalary,
        desired_salary: desiredSalary,
      });
      setSaving(false);
      onOnboarded?.();
      return;
    }

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
      cv_file_path: cvFilePath,
      search_balance: 1,
      cv_generation_balance: 0,
      persistent_finder_balance: 0,
    });

    if (profileErr) { setError(profileErr.message); setSaving(false); return; }

    const { data: existingSP } = await supabase.from("search_profiles").select("id").eq("user_id", user.id).limit(1);
    const profileName = (jobTitles[0] ?? "General").slice(0, 50);

    if (existingSP?.length) {
      await supabase.from("search_profiles").update({
        name: profileName,
        job_titles: jobTitles,
        job_types: jobTypes,
        location,
        cv_variations: cvFilePath ? [{ name: "CV", file_path: cvFilePath }] : [],
      }).eq("user_id", user.id);
    } else {
      const variations = cvFilePath ? [{ name: "CV", file_path: cvFilePath }] : [];
      await supabase.from("search_profiles").insert({
        user_id: user.id,
        name: profileName,
        job_titles: jobTitles,
        job_types: jobTypes,
        location,
        cv_variations: variations,
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
            Upload your CV
          </h1>
          <p className="mt-3 text-gray-500">
            PDF only, max 10MB. Your file is stored securely.
          </p>
        </div>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          className={`w-full max-w-md p-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all text-center ${
            dragOver
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
              : "border-gray-300 hover:border-gray-400 bg-gray-50"
          }`}
        >
          <Upload size={36} className="mx-auto text-gray-400" />
          <p className="mt-4 text-sm text-gray-700">
            Drag and drop your CV here, or click to browse
          </p>
          <p className="mt-1 text-xs text-gray-400">PDF only (max 10MB)</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
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
            {!name && <p className="mt-1 text-xs text-yellow-600">Missing — fill in manually</p>}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Surname</label>
            <input value={surname} onChange={(e) => setSurname(e.target.value)} className={inputClass(!!surname)} placeholder="Surname" />
            {!surname && <p className="mt-1 text-xs text-yellow-600">Missing — fill in manually</p>}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass(!!phone)} placeholder="Phone number" />
          {!phone && <p className="mt-1 text-xs text-yellow-600">Missing — fill in manually</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass(!!address)} placeholder="Your address" />
          {!address && <p className="mt-1 text-xs text-yellow-600">Missing — fill in manually</p>}
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Job Types</label>
          <div className="flex flex-wrap gap-2">
            {JOB_TYPE_OPTIONS.map((t) => (
              <button
                key={t}
                onClick={() => toggleJobType(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  jobTypes.includes(t)
                    ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                    : "bg-gray-100 border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Preferred Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass(!!location)} placeholder="City or province" />
          {!location && <p className="mt-1 text-xs text-yellow-600">Missing — fill in manually</p>}
        </div>
      </section>

      <p className="text-xs text-gray-500">
        A search profile will be created from this data. You can edit or add more profiles later in Settings.
      </p>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Salary Expectations</h2>
        <p className="text-xs text-gray-500">AI estimated from your experience &amp; region — adjust if needed.</p>
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
            {currentSalary == null && <p className="mt-1 text-xs text-yellow-600">Missing — fill in manually</p>}
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
            {desiredSalary == null && <p className="mt-1 text-xs text-yellow-600">Missing — fill in manually</p>}
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
