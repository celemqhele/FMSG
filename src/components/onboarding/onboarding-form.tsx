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
  cv_file_path: string;
}

type Step = "upload" | "extracting" | "review";

const JOB_TYPE_OPTIONS = [
  "Full-time",
  "Part-time",
  "Contract",
  "Freelance",
  "Remote",
  "Hybrid",
  "Internship",
];

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
  const [cvFilePath, setCvFilePath] = useState("");

  const handleFile = async (file: File) => {
    setError("");
    setStep("extracting");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const formData = new FormData();
    formData.append("file", file);
    try {
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
      setCvFilePath(data.cv_file_path ?? "");
      setStep("review");
    } catch {
      setError("Network error. Please try again.");
      setStep("upload");
    }
  };

  const addJobTitle = () => {
    const t = jobTitleInput.trim();
    if (t && !jobTitles.includes(t)) {
      setJobTitles([...jobTitles, t]);
      setJobTitleInput("");
    }
  };

  const removeJobTitle = (t: string) => setJobTitles(jobTitles.filter((x) => x !== t));

  const toggleJobType = (t: string) => {
    setJobTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) {
      setError("Not authenticated.");
      setSaving(false);
      return;
    }
    const { error: err } = await supabase.from("profiles").upsert({
      id: user.user.id,
      email: user.user.email,
      name,
      surname,
      phone,
      address,
      job_titles: jobTitles,
      job_types: jobTypes,
      location,
      current_salary: currentSalary,
      desired_salary: desiredSalary,
      cv_file_path: cvFilePath,
      onboarding_completed: true,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      onOnboarded?.();
    }
  };

  if (step === "upload") {
    return (
      <div className="flex flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
            Upload your CV
          </h1>
          <p className="mt-3 text-white/60">
            PDF only, max 10MB. Your file is stored securely.
          </p>
        </div>
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          className={`w-full max-w-md p-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all text-center ${
            dragOver
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
              : "border-white/20 hover:border-white/40 bg-white/5"
          }`}
        >
          <Upload size={36} className="mx-auto text-white/40" />
          <p className="mt-4 text-sm text-white/60">
            Drag and drop your CV here, or click to browse
          </p>
          <p className="mt-1 text-xs text-white/40">PDF only (max 10MB)</p>
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
        <Loader2 size={32} className="animate-spin text-white/60" />
        <div className="text-center">
          <p className="text-lg font-medium text-white">Analyzing your CV...</p>
          <p className="mt-1 text-sm text-white/40">Extracting your details with AI</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8 pb-16">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-semibold text-white">Review your profile</h1>
        <p className="mt-2 text-sm text-white/60">
          Edit anything AI got wrong, then save.
        </p>
      </div>

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

      {/* Personal Information */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Personal Information</h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-white/80 mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-4 py-2.5 text-sm rounded-lg border text-white placeholder-white/40 focus:outline-none focus:border-white/40 ${
                name ? "bg-white/10 border-white/20" : "bg-yellow-500/10 border-yellow-500/40"
              }`}
              placeholder="First name"
            />
            {!name && <p className="mt-1 text-xs text-yellow-400">Missing - fill in manually</p>}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-white/80 mb-1.5">Surname</label>
            <input
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              className={`w-full px-4 py-2.5 text-sm rounded-lg border text-white placeholder-white/40 focus:outline-none focus:border-white/40 ${
                surname ? "bg-white/10 border-white/20" : "bg-yellow-500/10 border-yellow-500/40"
              }`}
              placeholder="Last name"
            />
            {!surname && <p className="mt-1 text-xs text-yellow-400">Missing - fill in manually</p>}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`w-full px-4 py-2.5 text-sm rounded-lg border text-white placeholder-white/40 focus:outline-none focus:border-white/40 ${
              phone ? "bg-white/10 border-white/20" : "bg-yellow-500/10 border-yellow-500/40"
            }`}
            placeholder="+27 12 345 6789"
          />
          {!phone && <p className="mt-1 text-xs text-yellow-400">Missing - fill in manually</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={`w-full px-4 py-2.5 text-sm rounded-lg border text-white placeholder-white/40 focus:outline-none focus:border-white/40 ${
              address ? "bg-white/10 border-white/20" : "bg-yellow-500/10 border-yellow-500/40"
            }`}
            placeholder="Street, City, Province"
          />
          {!address && <p className="mt-1 text-xs text-yellow-400">Missing - fill in manually</p>}
        </div>
      </section>

      {/* Career Information */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Career Information</h2>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Desired Job Titles</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {jobTitles.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-white/10 rounded-full">
                {t}
                <button onClick={() => removeJobTitle(t)} className="text-white/50 hover:text-white">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={jobTitleInput}
              onChange={(e) => setJobTitleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addJobTitle(); } }}
              className={`flex-1 px-4 py-2 text-sm rounded-lg border text-white placeholder-white/40 focus:outline-none focus:border-white/40 ${
                jobTitles.length > 0 ? "bg-white/10 border-white/20" : "bg-yellow-500/10 border-yellow-500/40"
              }`}
              placeholder="e.g. Software Engineer"
            />
            <button
              onClick={addJobTitle}
              className="px-3 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          {jobTitles.length === 0 && <p className="mt-1 text-xs text-yellow-400">Add at least one job title</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Job Types</label>
          <div className="flex flex-wrap gap-2">
            {JOB_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => toggleJobType(opt)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  jobTypes.includes(opt)
                    ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                    : "bg-white/10 border-white/20 text-white/60 hover:text-white hover:border-white/40"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {jobTypes.length === 0 && <p className="mt-1 text-xs text-yellow-400">Select at least one job type</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Preferred Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={`w-full px-4 py-2.5 text-sm rounded-lg border text-white placeholder-white/40 focus:outline-none focus:border-white/40 ${
              location ? "bg-white/10 border-white/20" : "bg-yellow-500/10 border-yellow-500/40"
            }`}
            placeholder="e.g. Johannesburg, Cape Town, Remote"
          />
          {!location && <p className="mt-1 text-xs text-yellow-400">Missing - fill in manually</p>}
        </div>
      </section>

      {/* Pro tip */}
      <div className="liquid-glass rounded-xl p-4 text-center">
        <p className="text-xs text-white/60">
          <span className="text-[var(--color-accent)] font-medium">Pro tip:</span> After onboarding, try Persistent Finder - it searches multiple rounds of AI-generated title variations to find jobs other engines miss.
        </p>
      </div>

      {/* Salary - always manual */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Salary Expectations</h2>
        <p className="text-xs text-white/40">These fields are always filled manually.</p>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-white/80 mb-1.5">Current Salary</label>
            <input
              type="number"
              value={currentSalary ?? ""}
              onChange={(e) => setCurrentSalary(e.target.value ? Number(e.target.value) : null)}
              min={0}
              className="w-full px-4 py-2.5 text-sm rounded-lg bg-yellow-500/10 border border-yellow-500/40 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="Annual (ZAR)"
            />
            <p className="mt-1 text-xs text-yellow-400">Required - enter manually</p>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-white/80 mb-1.5">Desired Salary</label>
            <input
              type="number"
              value={desiredSalary ?? ""}
              onChange={(e) => setDesiredSalary(e.target.value ? Number(e.target.value) : null)}
              min={0}
              className="w-full px-4 py-2.5 text-sm rounded-lg bg-yellow-500/10 border border-yellow-500/40 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="Annual (ZAR)"
            />
            <p className="mt-1 text-xs text-yellow-400">Required - enter manually</p>
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
