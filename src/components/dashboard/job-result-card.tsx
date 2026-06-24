"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X, FileText, Bookmark, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface JobResultCardProps {
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
  domainVerified?: boolean;
  domainUnverifiedReason?: string;
  suggestedCvName?: string;
  onDelete: (id: string) => void;
}

export function JobResultCard({
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
  domainVerified = true,
  domainUnverifiedReason = "",
  suggestedCvName = "",
  onDelete,
}: JobResultCardProps) {
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [cvLoading, setCvLoading] = useState(false);
  const [showDomainWarning, setShowDomainWarning] = useState(false);
  const [domainMounted, setDomainMounted] = useState(false);
  const [showTrustedInfo, setShowTrustedInfo] = useState(false);
  const [trustedMounted, setTrustedMounted] = useState(false);
  const [showVerdict, setShowVerdict] = useState(false);
  const [verdictMounted, setVerdictMounted] = useState(false);

  useEffect(() => {
    if (showDomainWarning) {
      setDomainMounted(true);
    } else {
      const timer = setTimeout(() => setDomainMounted(false), 250);
      return () => clearTimeout(timer);
    }
  }, [showDomainWarning]);

  useEffect(() => {
    if (showTrustedInfo) {
      setTrustedMounted(true);
    } else {
      const timer = setTimeout(() => setTrustedMounted(false), 250);
      return () => clearTimeout(timer);
    }
  }, [showTrustedInfo]);

  useEffect(() => {
    if (showVerdict) {
      setVerdictMounted(true);
    } else {
      const timer = setTimeout(() => setVerdictMounted(false), 250);
      return () => clearTimeout(timer);
    }
  }, [showVerdict]);

  // Check if this job is already saved
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
        .eq("job_url", jobUrl)
        .maybeSingle()
        .then(({ data }: { data: any }) => {
          if (data) setSaved(true);
        })
        .catch(() => {});
    }).catch(() => {});
  }, [jobUrl]);

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
    setDeleteError("");
    setDeleting(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setDeleting(false);
      setDeleteError("You must be signed in.");
      return;
    }
    try {
      const res = await fetch(`/api/job-results/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ban_job: banJob, ban_company: banCompany }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Failed to hide job:", errData.error || res.statusText);
        setDeleting(false);
        setDeleteError(errData.error || "Failed to hide job.");
        return;
      }
      setTimeout(() => onDelete(id), 300);
    } catch (err) {
      console.error("Network error hiding job:", err);
      setDeleting(false);
      setDeleteError("Network error. Please try again.");
    }
  };

  const handleSave = async () => {
    setSaveError("");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || saved) return;
    const { error } = await supabase.from("saved_jobs").insert({
      user_id: session.user.id,
      job_title: jobTitle,
      company,
      location,
      estimated_salary: salary,
      match_score: matchScore,
      match_summary: "",
      job_url: jobUrl,
      full_spec: fullDescription,
    });
    if (error) {
      console.error("Failed to save job:", error.message);
      setSaveError(error.message);
    } else {
      setSaved(true);
    }
  };

  const handleGenerateCv = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setCvLoading(true);
    try {
      const res = await fetch("/api/generate-cv", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ job_result_id: id }),
      });
      if (!res.ok) {
        setCvLoading(false);
        const data = await res.json().catch(() => ({}));
        if (data.code === "LIMIT_002") {
          window.dispatchEvent(new CustomEvent("show-limit-modal", { detail: "LIMIT_002" }));
        }
        return;
      }
      const blob = await res.blob();
      if (!blob.type.includes("openxmlformats") && !blob.type.includes("octet-stream")) {
        setCvLoading(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CV - ${jobTitle} - ${company} - FMSG.docx`;
      a.click();
      URL.revokeObjectURL(url);
      window.dispatchEvent(new Event("refresh-balances"));
      setCvLoading(false);
    } catch {
      setCvLoading(false);
    }
  };

  return (
    <div
      className={`liquid-glass rounded-xl p-5 transition-all duration-300 ${
        deleting ? "opacity-0 scale-95" : "opacity-100 scale-100"
      }`}
    >
      {/* Top row: score badge + domain badge left, delete (X) right */}
      <div className="flex justify-between items-start mb-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowVerdict(true)}
            className={`text-xs font-medium px-3 py-1 rounded-full ${scoreBg} cursor-pointer hover:opacity-80 transition-opacity`}
          >
            {scoreLabel} {matchScore}%
          </button>
          {domainVerified && (
            <button
              onClick={() => setShowTrustedInfo(true)}
              className="text-xs font-medium px-3 py-1 rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/30 hover:bg-green-200 dark:hover:bg-green-500/30 transition-colors"
            >
              Trusted Domain
            </button>
          )}
          {!domainVerified && (
            <button
              onClick={() => setShowDomainWarning(true)}
              className="text-xs font-medium px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30 hover:bg-yellow-200 dark:hover:bg-yellow-500/30 transition-colors"
            >
              Untrusted Domain
            </button>
          )}
          {suggestedCvName && (
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-500/30">
              CV: {suggestedCvName}
            </span>
          )}
          {!verdictBullets && (
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-500/30">
              Unverified Job Spec
            </span>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowDeleteMenu(!showDeleteMenu)}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors p-1"
          >
            <X size={18} />
          </button>
          {showDeleteMenu && (
            <div className="absolute right-0 top-8 w-64 rounded-xl liquid-glass border shadow-lg overflow-hidden z-50">
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

      {/* Body */}
      <p className="text-base font-medium text-[var(--color-text-primary)] mb-1">{jobTitle}</p>
      <p className="text-sm text-[var(--color-text-secondary)] mb-0.5">
        {company}
        {location && <> <span className="mx-1">&bull;</span> {location}</>}
      </p>
      {salary && (
        <p className="text-sm text-[var(--color-text-secondary)] opacity-60 mb-4">{salary}</p>
      )}

      {deleteError && (
        <p className="text-xs text-red-400 mb-2">{deleteError}</p>
      )}
      {saveError && (
        <p className="text-xs text-red-400 mb-2">{saveError}</p>
      )}

      {/* Action row */}
      <div className="flex gap-2">
        <button
          onClick={handleGenerateCv}
          disabled={cvLoading}
          className="flex-[2] flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] disabled:opacity-70 transition-colors"
        >
          {cvLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <FileText size={16} />
          )}
          {cvLoading ? "Downloading..." : "Generate CV"}
        </button>
        {jobUrl && (
          <a
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-[1.4] flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-lg hover:bg-white/5 transition-colors"
          >
            Apply
            <ExternalLink size={14} />
          </a>
        )}
        <button
          onClick={handleSave}
          disabled={saved}
          className="flex items-center justify-center px-3 py-2.5 text-sm border border-[var(--color-border)] rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors disabled:opacity-40"
          aria-label="Save for later"
        >
          <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Trusted domain info modal */}
      {trustedMounted && createPortal(
        <div
          className={`fixed inset-0 z-[300] flex items-center justify-center transition-all duration-200 ${
            showTrustedInfo ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowTrustedInfo(false)}
          />
          <div
            className={`relative w-full max-w-sm mx-4 p-6 rounded-2xl liquid-glass transition-all duration-200 ${
              showTrustedInfo ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">Trusted Domain</h3>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              This job listing is from a verified source. We periodically check these platforms and confirm they reliably host active, genuine listings.
            </p>
            <button
              onClick={() => setShowTrustedInfo(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Domain warning modal */}
      {domainMounted && createPortal(
        <div
          className={`fixed inset-0 z-[300] flex items-center justify-center transition-all duration-200 ${
            showDomainWarning ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDomainWarning(false)}
          />
          <div
            className={`relative w-full max-w-sm mx-4 p-6 rounded-2xl liquid-glass transition-all duration-200 ${
              showDomainWarning ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">Untrusted Domain</h3>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              This job listing is from a source that has not been verified. Listings on untrusted platforms may have expired roles, inaccurate details, or lower-quality postings.
            </p>
            {domainUnverifiedReason && (
              <p className="text-xs text-[var(--color-text-secondary)]/60 mt-2">
                Reason: {domainUnverifiedReason}
              </p>
            )}
            <button
              onClick={() => setShowDomainWarning(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Verdict popup */}
      {verdictMounted && createPortal(
        <div
          className={`fixed inset-0 z-[300] flex items-center justify-center transition-all duration-200 ${
            showVerdict ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowVerdict(false)}
          />
          <div
            className={`relative w-full max-w-sm mx-4 p-6 rounded-2xl liquid-glass transition-all duration-200 ${
              showVerdict ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className={`text-sm font-semibold px-3 py-1 rounded-full ${scoreBg}`}>
                {scoreLabel} {matchScore}%
              </span>
              <button
                onClick={() => setShowVerdict(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {matchSummary && (
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-4">
                {matchSummary}
              </p>
            )}

            {verdictBullets && (
              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-[var(--color-accent)] mt-0.5 shrink-0">Industry</span>
                  <p className="text-xs text-[var(--color-text-secondary)]/80 leading-relaxed">{verdictBullets.industry}</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-[var(--color-accent)] mt-0.5 shrink-0">Function</span>
                  <p className="text-xs text-[var(--color-text-secondary)]/80 leading-relaxed">{verdictBullets.function}</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-[var(--color-accent)] mt-0.5 shrink-0">Competition</span>
                  <p className="text-xs text-[var(--color-text-secondary)]/80 leading-relaxed">{verdictBullets.competition}</p>
                </div>
              </div>
            )}

            {suggestedCvName && (
              <div className="mt-4 pt-3 border-t border-white/[0.06]">
                <p className="text-xs text-[var(--color-text-secondary)]/60">
                  Suggested CV: <span className="text-white/80 font-medium">{suggestedCvName}</span>
                </p>
              </div>
            )}

            <button
              onClick={() => setShowVerdict(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
