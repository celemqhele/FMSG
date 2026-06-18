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

  const scoreColor =
    matchScore >= 80 ? "text-green-400 border-green-500/30" :
    matchScore >= 60 ? "text-amber-400 border-amber-500/30" :
    "text-red-400 border-red-500/30";

  const handleDelete = async (banJob: boolean, banCompany: boolean) => {
    setShowDeleteMenu(false);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/job-results/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ban_job: banJob, ban_company: banCompany }),
    });
    onDelete(id);
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
    <div className="relative rounded-2xl bg-white/5 border border-white/10 p-5 space-y-3 hover:border-white/20 transition-colors">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-base truncate">{jobTitle}</h3>
          <p className="text-sm text-white/60">{company}</p>
          <p className="text-sm text-white/40">{location}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {salary && (
            <span className="text-xs text-white/50 bg-white/10 px-2.5 py-1 rounded-full">
              {salary}
            </span>
          )}
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${scoreColor}`}>
            {matchScore}%
          </span>
          <button
            onClick={() => setShowDeleteMenu(!showDeleteMenu)}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {showDeleteMenu && (
        <div className="absolute right-5 top-14 w-64 rounded-xl bg-[#1C1C1E] border border-white/10 shadow-xl overflow-hidden z-50">
          <button
            onClick={() => handleDelete(true, false)}
            className="w-full text-left px-4 py-3 text-sm text-white/80 hover:bg-white/5 transition-colors"
          >
            Hide this job
          </button>
          <div className="h-px bg-white/10" />
          <button
            onClick={() => handleDelete(false, true)}
            className="w-full text-left px-4 py-3 text-sm text-white/80 hover:bg-white/5 transition-colors"
          >
            Never show {company} again
          </button>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleTailor}
          disabled={tailoring}
          className="flex items-center justify-center gap-2 flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-full hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
        >
          {tailoring ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          {tailoring ? "Generating..." : "Tailor CV"}
        </button>
        {jobUrl && (
          <a
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white/80 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
          >
            <ExternalLink size={16} />
            Apply
          </a>
        )}
      </div>
    </div>
  );
}
