"use client";

import { useState, useEffect } from "react";
import { ExternalLink, FileText, Bookmark, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProfile } from "../dashboard-layout";
import { MobileVerdictSheet } from "./mobile-verdict-sheet";

interface MobileJobCardProps {
  id: string;
  jobTitle: string;
  company: string;
  location: string;
  salary: string;
  matchScore: number;
  matchSummary?: string;
  verdictBullets?: { industry: string; function: string; competition: string } | null;
  jobUrl: string;
  fullDescription: string;
  suggestedCvName?: string;
  knockoutFail?: boolean | null;
  pillarScores?: { industry: number; function: number; scale: number; tools: number; location: number } | null;
  taxesApplied?: string[] | null;
  totalQuestionsAsked?: number | null;
  yesAnswers?: number | null;
  recruiterVerdict?: string | null;
  dynamicRequirements?: { requirement: string; mandatory: boolean; pillar: string; met: boolean; evidence: string }[] | null;
  specSource?: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "google_search" | null;
  onDelete: (id: string) => void;
}

export function MobileJobCard({
  id,
  jobTitle,
  company,
  location,
  salary,
  matchScore,
  matchSummary = "",
  verdictBullets,
  jobUrl,
  fullDescription,
  suggestedCvName = "",
  knockoutFail,
  pillarScores,
  taxesApplied,
  totalQuestionsAsked,
  yesAnswers,
  recruiterVerdict,
  dynamicRequirements,
  specSource,
  onDelete,
}: MobileJobCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState("");
  const [saved, setSaved] = useState(false);
  const [showVerdict, setShowVerdict] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmMounted, setDeleteConfirmMounted] = useState(false);
  const { activeProfileId } = useActiveProfile();

  useEffect(() => {
    if (!jobUrl) return;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: any }) => {
      const session = data?.session;
      if (!session) return;
      supabase
        .from("saved_jobs")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("profile_id", activeProfileId)
        .eq("job_url", jobUrl)
        .maybeSingle()
        .then(({ data }: { data: any }) => {
          if (data) setSaved(true);
        })
        .catch(() => {});
    }).catch(() => {});
  }, [jobUrl]);

  const scoreBg =
    matchScore >= 80 ? "bg-green-500/20 text-green-400 border-green-500/30" :
    matchScore >= 60 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
    "bg-red-500/20 text-red-400 border-red-500/30";

  const scoreLabel =
    matchScore >= 80 ? "Strong" :
    matchScore >= 60 ? "Good" :
    "Partial";

  const openDeleteConfirm = () => {
    setShowDeleteConfirm(true);
    setTimeout(() => setDeleteConfirmMounted(true), 10);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmMounted(false);
    setTimeout(() => setShowDeleteConfirm(false), 200);
  };

  const handleDelete = async () => {
    closeDeleteConfirm();
    setDeleting(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setDeleting(false); return; }
    try {
      const res = await fetch(`/api/job-results/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ban_job: true, job_url: jobUrl, company, profile_id: activeProfileId }),
      });
      if (res.ok) setTimeout(() => onDelete(id), 300);
      else setDeleting(false);
    } catch {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (saved) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await fetch("/api/job-results/save", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: jobTitle, company, location, estimated_salary: salary,
          match_score: matchScore, match_summary: "", job_url: jobUrl, full_spec: fullDescription,
          profile_id: activeProfileId,
        }),
      });
      if (res.ok) setSaved(true);
    } catch {
      // network error — silently ignore to match existing mobile UX
    }
  };

  const handleGenerateCv = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setCvError("");
    setCvLoading(true);
    try {
      const res = await fetch("/api/generate-cv", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ job_result_id: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "LIMIT_002") {
          window.dispatchEvent(new CustomEvent("show-limit-modal", { detail: "LIMIT_002" }));
        } else {
          setCvError(data.error || "Generation failed.");
        }
        setCvLoading(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CV - ${jobTitle} - ${company} - FMSG.docx`;
      a.click();
      URL.revokeObjectURL(url);
      window.dispatchEvent(new Event("refresh-balances"));
      setCvLoading(false);
    } catch {
      setCvError("Network error.");
      setCvLoading(false);
    }
  };

  return (
    <>
      <div
        className={`liquid-glass rounded-[10px] p-2.5 transition-all duration-300 ${
          deleting ? "opacity-0 scale-95" : "opacity-100 scale-100"
        }`}
      >
        {/* Badges row */}
        <div className="flex items-center gap-1 flex-wrap mb-1.5">
          {matchScore > 0 && (
            <button
              onClick={() => setShowVerdict(true)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border min-h-[36px] ${scoreBg}`}
            >
              {scoreLabel} {matchScore}%
            </button>
          )}
          {suggestedCvName && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
              CV: {suggestedCvName}
            </span>
          )}
          {(specSource === "google_jobs" || specSource === "jsearch" || specSource === "linkedin" || specSource === "google_search") && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Verified
            </span>
          )}
        </div>

        {/* Job info */}
        <p className="text-[11px] font-medium text-[var(--color-text-primary)] mb-0.5 leading-snug line-clamp-2">{jobTitle}</p>
        <p className="text-[10px] text-[var(--color-text-secondary)] mb-0.5 truncate">
          {company}{location ? <> &bull; {location}</> : ""}
        </p>
        {salary && (
          <p className="text-[11px] text-[var(--color-text-secondary)]/60 mb-2.5">{salary}</p>
        )}
        {!salary && <div className="mb-2.5" />}

        {cvError && (
          <p className="text-[11px] text-red-400 mb-2">{cvError}</p>
        )}

        {/* Action row - icon buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateCv}
            disabled={cvLoading}
            className="flex items-center justify-center gap-1.5 h-9 px-2.5 text-[11px] font-medium text-white bg-[var(--color-accent)] rounded-[7px] active:scale-95 disabled:opacity-50 transition-all"
          >
            {cvLoading ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />}
            {cvLoading ? "..." : "CV"}
          </button>
          {jobUrl && (
            <a
              href={jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 h-9 px-2.5 text-[11px] font-medium text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-[7px] active:scale-95 transition-all"
            >
              Apply
              <ExternalLink size={9} />
            </a>
          )}
          <button
            onClick={handleSave}
            disabled={saved}
            className="flex items-center justify-center h-9 w-9 border border-[var(--color-border)] rounded-[7px] text-[var(--color-text-secondary)] active:scale-95 disabled:opacity-40 transition-all"
          >
            <Bookmark size={11} fill={saved ? "currentColor" : "none"} className={saved ? "text-[var(--color-accent)]" : ""} />
          </button>
          <button
            onClick={openDeleteConfirm}
            className="flex items-center justify-center h-9 w-9 border border-[var(--color-border)] rounded-[7px] text-[var(--color-text-secondary)] hover:text-red-400 active:scale-95 transition-all"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center transition-opacity duration-300" style={{ opacity: deleteConfirmMounted ? 1 : 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={closeDeleteConfirm} />
          <div
            className="relative bg-white border border-gray-200 rounded-xl p-4 w-[min(80vw,320px)] mx-3 text-center transition-all duration-300 ease-out shadow-xl"
            style={{ opacity: deleteConfirmMounted ? 1 : 0, transform: deleteConfirmMounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}
          >
            <p className="text-gray-900 font-semibold mb-1">Hide this job?</p>
            <p className="text-[10px] text-gray-500 mb-3">It won't appear in your results again.</p>
            <div className="flex justify-center gap-2.5">
              <button onClick={closeDeleteConfirm} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-full">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-full">Hide</button>
            </div>
          </div>
        </div>
      )}

      {/* Verdict */}
      <MobileVerdictSheet
        isOpen={showVerdict}
        onClose={() => setShowVerdict(false)}
        matchScore={matchScore}
        scoreLabel={scoreLabel}
        scoreBg={scoreBg}
        matchSummary={matchSummary}
        recruiterVerdict={recruiterVerdict}
        knockoutFail={knockoutFail}
        dynamicRequirements={dynamicRequirements}
        pillarScores={pillarScores}
        taxesApplied={taxesApplied}
        suggestedCvName={suggestedCvName}
      />
    </>
  );
}
