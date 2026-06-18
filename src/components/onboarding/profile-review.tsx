"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, X } from "lucide-react";

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

interface ProfileData {
  skills: string[];
  experience: Experience[];
  education: Education[];
  years_of_experience: number;
  current_role: string;
  location: string;
  cv_text: string;
}

interface ProfileReviewProps {
  data: ProfileData;
}

export function ProfileReview({ data }: ProfileReviewProps) {
  const [skills, setSkills] = useState<string[]>(data.skills || []);
  const [skillInput, setSkillInput] = useState("");
  const [experience, setExperience] = useState<Experience[]>(data.experience || []);
  const [education, setEducation] = useState<Education[]>(data.education || []);
  const [currentRole, setCurrentRole] = useState(data.current_role || "");
  const [location, setLocation] = useState(data.location || "");
  const [yearsExp, setYearsExp] = useState(data.years_of_experience || 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
      setSkillInput("");
    }
  };

  const removeSkill = (s: string) => setSkills(skills.filter((x) => x !== s));

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      setError("Not authenticated.");
      setSaving(false);
      return;
    }

    const meta = user.user.user_metadata;
    const fullName = (meta?.full_name as string) || "";
    const nameParts = fullName.split(" ");

    const payload = {
      id: user.user.id,
      email: user.user.email,
      name: nameParts[0] || "",
      surname: nameParts.slice(1).join(" ") || "",
      skills,
      experience,
      education,
      current_role: currentRole,
      location,
      years_of_experience: yearsExp,
      onboarding_completed: true,
    };

    const { error: err } = await supabase.from("profiles").upsert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSaved(true);
    }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-[var(--color-success)]/20 flex items-center justify-center">
          <span className="text-2xl text-[var(--color-success)]">check</span>
        </div>
        <p className="text-xl font-semibold text-white">Profile saved!</p>
        <p className="text-sm text-white/60">Redirecting to job search...</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-white">Review your profile</h2>
        <p className="mt-1 text-sm text-white/60">
          Edit anything AI got wrong, then save.
        </p>
      </div>

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

      <div>
        <label className="block text-sm font-medium text-white mb-2">Current Role</label>
        <input
          value={currentRole}
          onChange={(e) => setCurrentRole(e.target.value)}
          className="w-full px-4 py-2.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
          placeholder="e.g. Software Engineer"
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-white mb-2">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-4 py-2.5 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
            placeholder="e.g. Johannesburg, SA"
          />
        </div>
        <div className="w-28">
          <label className="block text-sm font-medium text-white mb-2">Years Exp</label>
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
        <label className="block text-sm font-medium text-white mb-2">Skills</label>
        <div className="flex flex-wrap gap-2 mb-3">
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
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-2">Experience</label>
        {experience.map((exp, i) => (
          <div key={i} className="mb-3 p-4 rounded-lg bg-white/5 border border-white/10 space-y-2">
            <div className="flex gap-3">
              <input
                value={exp.role}
                onChange={(e) => {
                  const next = [...experience];
                  next[i] = { ...next[i], role: e.target.value };
                  setExperience(next);
                }}
                className="flex-1 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Role"
              />
              <input
                value={exp.company}
                onChange={(e) => {
                  const next = [...experience];
                  next[i] = { ...next[i], company: e.target.value };
                  setExperience(next);
                }}
                className="flex-1 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Company"
              />
            </div>
            <div className="flex gap-3">
              <input
                value={exp.start_date}
                onChange={(e) => {
                  const next = [...experience];
                  next[i] = { ...next[i], start_date: e.target.value };
                  setExperience(next);
                }}
                className="w-28 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Start"
              />
              <input
                value={exp.end_date}
                onChange={(e) => {
                  const next = [...experience];
                  next[i] = { ...next[i], end_date: e.target.value };
                  setExperience(next);
                }}
                className="w-28 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="End"
              />
            </div>
          </div>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-2">Education</label>
        {education.map((edu, i) => (
          <div key={i} className="mb-3 p-4 rounded-lg bg-white/5 border border-white/10 space-y-2">
            <input
              value={edu.institution}
              onChange={(e) => {
                const next = [...education];
                next[i] = { ...next[i], institution: e.target.value };
                setEducation(next);
              }}
              className="w-full px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="Institution"
            />
            <div className="flex gap-3">
              <input
                value={edu.degree}
                onChange={(e) => {
                  const next = [...education];
                  next[i] = { ...next[i], degree: e.target.value };
                  setEducation(next);
                }}
                className="flex-1 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Degree"
              />
              <input
                type="number"
                value={edu.year}
                onChange={(e) => {
                  const next = [...education];
                  next[i] = { ...next[i], year: Number(e.target.value) };
                  setEducation(next);
                }}
                className="w-20 px-3 py-1.5 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Year"
              />
            </div>
          </div>
        ))}
      </div>

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
