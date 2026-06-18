"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Plus, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Experience {
  company: string;
  role: string;
  start_date: string;
  end_date: string;
  description: string;
}

interface Education {
  institution: string;
  degree: string;
  year: number;
}

interface ExtractedProfile {
  name: string;
  surname: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  years_of_experience: number;
  current_role: string;
  location: string;
  salary_min: number | null;
  salary_max: number | null;
  career_goals: string;
  cv_text: string;
}

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [yearsExp, setYearsExp] = useState(0);
  const [location, setLocation] = useState("");
  const [salaryMin, setSalaryMin] = useState<number | null>(null);
  const [salaryMax, setSalaryMax] = useState<number | null>(null);
  const [careerGoals, setCareerGoals] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [experience, setExperience] = useState<Experience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importError, setImportError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
      setSkillInput("");
    }
  };

  const removeSkill = (s: string) => setSkills(skills.filter((x) => x !== s));

  const addExperience = () => {
    setExperience([...experience, { company: "", role: "", start_date: "", end_date: "", description: "" }]);
  };

  const removeExperience = (i: number) => {
    setExperience(experience.filter((_, idx) => idx !== i));
  };

  const updateExperience = (i: number, field: keyof Experience, value: string) => {
    const next = [...experience];
    next[i] = { ...next[i], [field]: value };
    setExperience(next);
  };

  const addEducation = () => {
    setEducation([...education, { institution: "", degree: "", year: new Date().getFullYear() }]);
  };

  const removeEducation = (i: number) => {
    setEducation(education.filter((_, idx) => idx !== i));
  };

  const updateEducation = (i: number, field: keyof Education, value: string | number) => {
    const next = [...education];
    next[i] = { ...next[i], [field]: value as any };
    setEducation(next);
  };

  const handleFile = async (file: File) => {
    setImportError("");
    setImporting(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/extract-cv", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.code ? `${data.code}: ${data.error}` : data.error || "Extraction failed.");
        return;
      }
      setName(data.name ?? "");
      setSurname(data.surname ?? "");
      setSkills(data.skills ?? []);
      setExperience(data.experience ?? []);
      setEducation(data.education ?? []);
      setYearsExp(data.years_of_experience ?? 0);
      setCurrentRole(data.current_role ?? "");
      setLocation(data.location ?? "");
      setSalaryMin(data.salary_min ?? null);
      setSalaryMax(data.salary_max ?? null);
      setCareerGoals(data.career_goals ?? "");
    } catch {
      setImportError("Network error. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    setSaveError("");
    setSaving(true);
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) {
      setSaveError("Not authenticated.");
      setSaving(false);
      return;
    }
    const { error: err } = await supabase.from("profiles").upsert({
      id: user.user.id,
      email: user.user.email,
      name,
      surname,
      skills,
      experience,
      education,
      years_of_experience: yearsExp,
      current_role: currentRole,
      location,
      salary_min: salaryMin,
      salary_max: salaryMax,
      career_goals: careerGoals,
      onboarding_completed: true,
    });
    setSaving(false);
    if (err) {
      setSaveError(err.message);
    } else {
      setSaved(true);
      setTimeout(() => router.push("/"), 1500);
    }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
          <span className="text-2xl text-green-400">check</span>
        </div>
        <p className="text-xl font-semibold text-white">Profile saved!</p>
        <p className="text-sm text-white/60">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-semibold text-white">Complete your profile</h1>
        <p className="mt-2 text-sm text-white/60">
          Import from your CV or fill in manually.
        </p>
      </div>

      {/* Import CV */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => !importing && inputRef.current?.click()}
        className={`relative p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all text-center ${
          dragOver
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
            : "border-white/20 hover:border-white/40 bg-white/5"
        }`}
      >
        {importing ? (
          <div className="flex items-center justify-center gap-3">
            <Loader2 size={20} className="animate-spin text-white/60" />
            <p className="text-sm text-white/60">Extracting from CV...</p>
          </div>
        ) : (
          <>
            <Upload size={24} className="mx-auto text-white/40" />
            <p className="mt-3 text-sm font-medium text-white/70">Import from CV</p>
            <p className="mt-1 text-xs text-white/40">Drag & drop or click — PDF or TXT</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          className="hidden"
        />
      </div>

      {importError && (
        <p className="text-sm text-red-400 text-center">{importError}</p>
      )}

      {/* Personal Information */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Personal Information</h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-white/80 mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="First name"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-white/80 mb-1.5">Surname</label>
            <input
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              className="w-full px-4 py-2.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="Last name"
            />
          </div>
        </div>
      </section>

      {/* Professional Information */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Professional Information</h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-white/80 mb-1.5">Current Role</label>
            <input
              value={currentRole}
              onChange={(e) => setCurrentRole(e.target.value)}
              className="w-full px-4 py-2.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="e.g. Software Engineer"
            />
          </div>
          <div className="w-28">
            <label className="block text-sm font-medium text-white/80 mb-1.5">Years Exp</label>
            <input
              type="number"
              value={yearsExp}
              onChange={(e) => setYearsExp(Number(e.target.value))}
              min={0}
              className="w-full px-4 py-2.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-4 py-2.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
            placeholder="e.g. Johannesburg, SA"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-white/80 mb-1.5">Salary Min</label>
            <input
              type="number"
              value={salaryMin ?? ""}
              onChange={(e) => setSalaryMin(e.target.value ? Number(e.target.value) : null)}
              min={0}
              className="w-full px-4 py-2.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="e.g. 50000"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-white/80 mb-1.5">Salary Max</label>
            <input
              type="number"
              value={salaryMax ?? ""}
              onChange={(e) => setSalaryMax(e.target.value ? Number(e.target.value) : null)}
              min={0}
              className="w-full px-4 py-2.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="e.g. 120000"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1.5">Career Goals</label>
          <textarea
            value={careerGoals}
            onChange={(e) => setCareerGoals(e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40 resize-none"
            placeholder="What are you looking for in your next role?"
          />
        </div>
      </section>

      {/* Skills */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Skills</h2>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-white/10 rounded-full">
              {s}
              <button onClick={() => removeSkill(s)} className="text-white/50 hover:text-white">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
            className="flex-1 px-4 py-2 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
            placeholder="Add a skill"
          />
          <button
            onClick={addSkill}
            className="px-3 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      {/* Experience */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Experience</h2>
          <button
            onClick={addExperience}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        {experience.length === 0 && (
          <p className="text-sm text-white/40">No experience entries yet.</p>
        )}
        {experience.map((exp, i) => (
          <div key={i} className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-xs font-medium text-white/40">Entry {i + 1}</span>
              <button onClick={() => removeExperience(i)} className="text-white/30 hover:text-red-400 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-3">
              <input
                value={exp.role}
                onChange={(e) => updateExperience(i, "role", e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Role"
              />
              <input
                value={exp.company}
                onChange={(e) => updateExperience(i, "company", e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Company"
              />
            </div>
            <div className="flex gap-3">
              <input
                value={exp.start_date}
                onChange={(e) => updateExperience(i, "start_date", e.target.value)}
                className="w-28 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Start"
              />
              <input
                value={exp.end_date}
                onChange={(e) => updateExperience(i, "end_date", e.target.value)}
                className="w-28 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="End"
              />
            </div>
            <textarea
              value={exp.description}
              onChange={(e) => updateExperience(i, "description", e.target.value)}
              rows={2}
              className="w-full px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40 resize-none"
              placeholder="Description of responsibilities"
            />
          </div>
        ))}
      </section>

      {/* Education */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Education</h2>
          <button
            onClick={addEducation}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        {education.length === 0 && (
          <p className="text-sm text-white/40">No education entries yet.</p>
        )}
        {education.map((edu, i) => (
          <div key={i} className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-xs font-medium text-white/40">Entry {i + 1}</span>
              <button onClick={() => removeEducation(i)} className="text-white/30 hover:text-red-400 transition-colors">
                <X size={14} />
              </button>
            </div>
            <input
              value={edu.institution}
              onChange={(e) => updateEducation(i, "institution", e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="Institution"
            />
            <div className="flex gap-3">
              <input
                value={edu.degree}
                onChange={(e) => updateEducation(i, "degree", e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Degree"
              />
              <input
                type="number"
                value={edu.year}
                onChange={(e) => updateEducation(i, "year", Number(e.target.value))}
                className="w-20 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Year"
              />
            </div>
          </div>
        ))}
      </section>

      {saveError && (
        <p className="text-sm text-red-400 text-center">{saveError}</p>
      )}

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
