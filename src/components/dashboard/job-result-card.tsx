"use client";

import { useState } from "react";
import { ExternalLink, FileText, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface JobResultCardProps {
  id: string;
  jobTitle: string;
  company: string;
  location: string;
  salary: string;
  matchScore: number;
  jobUrl: string;
  fullDescription: string;
  onDelete: (id: string) => void;
}

export function JobResultCard({
  id,
  jobTitle,
  company,
  location,
  salary,
  matchScore,
  jobUrl,
  fullDescription,
  onDelete,
}: JobResultCardProps) {
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const scoreLabel =
    matchScore >= 80 ? "Strong Match" :
    matchScore >= 60 ? "Good Match" :
    "Partial Match";

  const scoreBg =
    matchScore >= 80 ? "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400" :
    matchScore >= 60 ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400" :
    "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400";

  const handleDelete = async (banJob: boolean, banCompany: boolean) => {
    setShowDeleteMenu(false);
    setDeleting(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setDeleting(false);
      return;
    }
    await fetch(`/api/job-results/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ban_job: banJob, ban_company: banCompany }),
    });
    setTimeout(() => onDelete(id), 300);
  };

  const handleTailor = async () => {
    setTailoring(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setTailoring(false);
      return;
    }

    try {
      const res = await fetch("/api/tailor-cv", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ job_description: fullDescription, job_title: jobTitle, company }),
      });

      if (res.status === 403) {
        const data = await res.json();
        if (data.code === "LIMIT_002") {
          alert("You've used all your CV generations. Upgrade your plan to generate more.");
          setTailoring(false);
          return;
        }
      }

      if (!res.ok) {
        alert("Failed to generate CV. Please try again.");
        setTailoring(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${jobTitle}_${company}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Network error. Please try again.");
    }
    setTailoring(false);
  };

  return (
    <div
      className={`bg-white dark:bg-[#1C1C1E] shadow-md rounded-xl p-6 transition-all duration-300 ${
        deleting ? "opacity-0 scale-95" : "opacity-100 scale-100"
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <span className={`text-xs font-medium px-3 py-1 rounded-full ${scoreBg}`}>
          {scoreLabel} {matchScore}%
        </span>
        <div className="relative">
          <button
            onClick={() => setShowDeleteMenu(!showDeleteMenu)}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X size={16} />
          </button>
          {showDeleteMenu && (
            <div className="absolute right-0 top-8 w-64 rounded-xl bg-white dark:bg-[#1C1C1E] border border-[var(--color-border)] shadow-lg overflow-hidden z-50">
              <button
                onClick={() => handleDelete(true, false)}
                className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-primary)] hover:bg-white/5 dark:hover:bg-white/5 transition-colors"
              >
                Hide this job
              </button>
              <div className="h-px bg-[var(--color-border)]" />
              <button
                onClick={() => handleDelete(false, true)}
                className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-primary)] hover:bg-white/5 dark:hover:bg-white/5 transition-colors"
              >
                Never show {company} again
              </button>
            </div>
          )}
        </div>
      </div>

      <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-1">{jobTitle}</h3>
      <p className="text-sm text-[var(--color-text-secondary)] mb-1">
        {company}
        {location && <> <span className="mx-1">&bull;</span> {location}</>}
      </p>
      {salary && (
        <p className="text-sm text-[var(--color-text-secondary)] opacity-70 mb-4">{salary}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleTailor}
          disabled={tailoring}
          className="flex items-center justify-center gap-2 flex-1 px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
        >
          {tailoring ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          {tailoring ? "Generating..." : "Tailor CV"}
        </button>
        {jobUrl && (
          <a
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-full hover:bg-white/5 dark:hover:bg-white/5 transition-colors"
          >
            Apply
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
