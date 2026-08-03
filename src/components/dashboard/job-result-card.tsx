"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X, FileText, Bookmark, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProfile } from "./dashboard-layout";

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
  suggestedCvName?: string;
  knockoutFail?: boolean | null;
  pillarScores?: { industry: number; function: number; scale: number; tools: number; location: number } | null;
  taxesApplied?: string[] | null;
  totalQuestionsAsked?: number | null;
  yesAnswers?: number | null;
  recruiterVerdict?: string | null;
  dynamicRequirements?: { requirement: string; mandatory: boolean; pillar: string; met: boolean; evidence: string }[] | null;
  specSource?: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "bing_jobs" | "scrappa" | null;
  onDelete: (id: string) => void;
  guest?: boolean;
  gold?: boolean;
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
  guest,
  gold,
}: JobResultCardProps) {
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState("");
  const [showVerdict, setShowVerdict] = useState(false);
  const [verdictMounted, setVerdictMounted] = useState(false);
  const { activeProfileId } = useActiveProfile();

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
        .eq("profile_id", activeProfileId)
        .eq("job_url", jobUrl)
        .maybeSingle()
        .then(({ data }: { data: any }) => {
          if (data) setSaved(true);
        })
        .catch(() => {});
    }).catch(() => {});
  }, [jobUrl]);

  if (guest) {
    return (
      <div
        className={`liquid-glass rounded-xl p-5 transition-all duration-300 ${
          gold ? "border border-yellow-400/50" : ""
        }`}
      >
        {gold && (
          <span className="inline-block mb-3 text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/40">
            Featured
          </span>
        )}
        <p className="text-base font-medium text-[var(--color-text-primary)] mb-1">{jobTitle}</p>
        <p className="text-sm text-[var(--color-text-secondary)] mb-0.5">
          {company}
          {location && <> <span className="mx-1">&bull;</span> {location}</>}
        </p>
        {salary ? (
          <p className="text-sm text-[var(--color-text-secondary)] opacity-60 mb-4">{salary}</p>
        ) : (
          <div className="mb-4" />
        )}
        {jobUrl && (
          <a
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-lg hover:bg-white/5 transition-colors"
          >
            Apply
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    );
  }

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
        body: JSON.stringify({ ban_job: banJob, ban_company: banCompany, job_url: jobUrl, company, profile_id: activeProfileId }),
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
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Failed to save job:", errData.error || res.statusText);
        setSaveError(errData.error || "Failed to save job.");
        return;
      }
      setSaved(true);
    } catch (err) {
      console.error("Network error saving job:", err);
      setSaveError("Network error. Please try again.");
    }
  };

  const handleGenerateCv = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setCvError("You must be signed in.");
      return;
    }
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
        } else if (data.code === "AI_OVERLOADED") {
          setCvError(data.error || "AI is busy. Please try again shortly.");
        } else {
          setCvError(data.error || `Generation failed (${res.status}). Please try again.`);
        }
        setCvLoading(false);
        return;
      }
      const blob = await res.blob();
      if (!blob.type.includes("openxmlformats") && !blob.type.includes("octet-stream")) {
        setCvError("Unexpected response format. Please try again.");
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
    } catch (err) {
      setCvError("Network error. Please try again.");
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
          {matchScore > 0 && (
            <button
              onClick={() => setShowVerdict(true)}
              className={`text-xs font-medium px-3 py-1 rounded-full ${scoreBg} cursor-pointer hover:opacity-80 transition-opacity`}
            >
              {scoreLabel} {matchScore}%
            </button>
          )}
          {suggestedCvName && (
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-500/30">
              CV: {suggestedCvName}
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
      {cvError && (
        <p className="text-xs text-red-400 mb-2">{cvError}</p>
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
            className={`relative w-full max-w-2xl mx-4 p-6 rounded-2xl liquid-glass max-h-[95vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-all duration-200 ${
              showVerdict ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-semibold px-3 py-1 rounded-full ${scoreBg}`}>
                  {scoreLabel} {matchScore}%
                </span>
                {recruiterVerdict && (
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    recruiterVerdict === "HIRE" ? "bg-green-500/20 text-green-400" :
                    recruiterVerdict === "INTERVIEW" ? "bg-amber-500/20 text-amber-400" :
                    "bg-red-500/20 text-red-400"
                  }`}>
                    {recruiterVerdict}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowVerdict(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Summary */}
            {matchSummary && (
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-4 whitespace-pre-line">
                {matchSummary}
              </p>
            )}

            {/* Knockout warning */}
            {knockoutFail && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
                <p className="text-xs text-red-400 font-medium">Knockout triggered, mandatory requirement not met.</p>
              </div>
            )}

            {/* Dynamic requirements checklist */}
            {dynamicRequirements && dynamicRequirements.length > 0 && (() => {
              const pillarLabels: Record<string, string> = { industry: "Industry", function: "Function", scale: "Experience", tools: "Tools", location: "Location" };
              const pillarOrder = ["industry", "function", "scale", "tools", "location"];
              const grouped: Record<string, typeof dynamicRequirements> = {};
              for (const req of dynamicRequirements) {
                const p = req.pillar || "other";
                if (!grouped[p]) grouped[p] = [];
                grouped[p].push(req);
              }
              const orderedPillars = pillarOrder.filter(p => grouped[p]);
              const extraPillars = Object.keys(grouped).filter(p => !pillarOrder.includes(p));
              return (
                <div className="mb-4">
                  <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Requirements Checklist</p>
                  <div className="space-y-3">
                    {[...orderedPillars, ...extraPillars].map(pillar => {
                      const reqs = grouped[pillar];
                      const met = reqs.filter(r => r.met).length;
                      const total = reqs.length;
                      const score = pillarScores?.[pillar as keyof typeof pillarScores];
                      return (
                        <div key={pillar} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                              {pillarLabels[pillar] || pillar}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[var(--color-text-secondary)]">{met}/{total} met</span>
                              {score != null && (
                                <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${score >= 70 ? "bg-green-400" : score >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                                    style={{ width: `${Math.min(score, 100)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {reqs.map((r, i) => (
                              <div key={i} className="flex items-start gap-2">
                                {r.met ? (
                                  <span className="text-green-400 mt-0.5 shrink-0">&#10003;</span>
                                ) : (
                                  <span className="text-red-400 mt-0.5 shrink-0">&#10007;</span>
                                )}
                                <div className="min-w-0">
                                  <span className={`text-xs ${r.met ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}`}>
                                    {r.requirement}
                                    {r.mandatory && !r.met && (
                                      <span className="ml-1.5 text-[10px] font-medium text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">required</span>
                                    )}
                                  </span>
                                  {r.evidence && (
                                    <p className="text-[10px] text-[var(--color-text-secondary)] opacity-60 mt-0.5 leading-relaxed">{r.evidence}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Taxes */}
            {taxesApplied && taxesApplied.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">Deductions</p>
                <div className="flex flex-wrap gap-1.5">
                  {taxesApplied.map((t, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested CV */}
            {suggestedCvName && (
              <div className="pt-3 border-t border-white/[0.06] mb-2">
                <p className="text-xs text-[var(--color-text-secondary)]/60">
                  Suggested CV: <span className="text-white font-medium">{suggestedCvName}</span>
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
