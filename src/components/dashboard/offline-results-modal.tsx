"use client";

import { useEffect, useState } from "react";
import { X, Briefcase, Building2, MapPin, DollarSign, Star, Filter, XCircle } from "lucide-react";

interface OfflineResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewResults: () => void;
  searchId: string;
}

interface StoredJobResult {
  id: string;
  user_id: string;
  search_id: string;
  profile_id: string | null;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  match_summary: string;
  verdict_bullets: { industry: string; function: string; competition: string } | null;
  job_url: string;
  full_spec: string;
  search_query: string;
  posted_at: string;
  posted_at_ms: number;
  suggested_cv: string;
  knockout_fail: boolean | null;
  pillar_scores: { industry: number; function: number; scale: number; tools: number; location: number } | null;
  taxes_applied: string[] | null;
  total_questions_asked: number | null;
  yes_answers: number | null;
  recruiter_verdict: string | null;
  dynamic_requirements: { requirement: string; mandatory: boolean; pillar: string; met: boolean; evidence: string }[] | null;
  spec_source: string | null;
}

interface StoredSearchData {
  search_id: string;
  jobs: StoredJobResult[];
  timestamp: string;
  completed: boolean;
  search_metadata: {
    query: string;
    pf_mode: boolean;
    round: number;
    total_rounds: number;
  };
}

const STORAGE_PREFIX = "fmsg_search_";

export function OfflineResultsModal({ isOpen, onClose, onViewResults, searchId }: OfflineResultsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [jobs, setJobs] = useState<StoredJobResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchMetadata, setSearchMetadata] = useState<StoredSearchData["search_metadata"] | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      loadResults();
    } else {
      setMounted(false);
    }
  }, [isOpen, searchId]);

  const loadResults = () => {
    try {
      const key = `${STORAGE_PREFIX}${searchId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const data: StoredSearchData = JSON.parse(stored);
        // Sort: AI-screened jobs (match_score !== -1) first, then by match_score descending
        const sortedJobs = [...data.jobs].sort((a, b) => {
          const aScreened = a.match_score !== -1 && a.match_score !== 0;
          const bScreened = b.match_score !== -1 && b.match_score !== 0;
          if (aScreened && !bScreened) return -1;
          if (!aScreened && bScreened) return 1;
          return (b.match_score ?? 0) - (a.match_score ?? 0);
        });
        setJobs(sortedJobs);
        setSearchMetadata(data.search_metadata);
      }
    } catch (err) {
      console.error("[OfflineResultsModal] Failed to load results:", err);
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    const key = `${STORAGE_PREFIX}${searchId}`;
    localStorage.removeItem(key);
    onClose();
  };

  const getVerdictColor = (verdict: string | null) => {
    switch (verdict) {
      case "HIRE": return "text-green-400 bg-green-500/10";
      case "INTERVIEW": return "text-yellow-400 bg-yellow-500/10";
      case "REJECT": return "text-red-400 bg-red-500/10";
      default: return "text-gray-400 bg-gray-500/10";
    }
  };

  const formatSalary = (salary: string) => {
    if (!salary) return "Not specified";
    return salary;
  };

  if (!isOpen && !mounted) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center transition-opacity duration-300" style={{ opacity: mounted ? 1 : 0 }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative">
        <div
          className="bg-white border border-gray-200 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto transition-all duration-300 ease-out shadow-xl"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)" }}
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <span className="text-yellow-500 text-xl">⚠</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Search Interrupted</h3>
            </div>
            <button
              onClick={clearResults}
              className="absolute top-3 right-3 p-1.5 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              aria-label="Dismiss"
            >
              <XCircle size={20} />
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-5">
            The search took longer than the server allows (5 min limit). 
            {jobs.length > 0 && `Showing ${jobs.length} jobs that were already analyzed.`}
          </p>

          {jobs.length > 0 && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm">
              ✓ {jobs.length} results recovered from this search
              {jobs.filter(j => j.match_score !== -1 && j.match_score !== 0).length > 0 && (
                <span className="ml-2">({jobs.filter(j => j.match_score !== -1 && j.match_score !== 0).length} AI-screened)</span>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <div className="w-6 h-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
              <span className="text-sm text-gray-500">Loading recovered results...</span>
            </div>
          ) : jobs.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {jobs.map((job) => (
                <div key={job.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-[var(--color-accent)]/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{job.job_title}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getVerdictColor(job.recruiter_verdict)}`}>
                          {job.recruiter_verdict || "UNSCREENED"}
                        </span>
                        {job.match_score !== -1 && job.match_score !== 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500">
                            Match: {job.match_score}%
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1 truncate">{job.company}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                        {job.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={10} /> {job.location}
                          </span>
                        )}
                        {job.estimated_salary && (
                          <span className="flex items-center gap-1">
                            <DollarSign size={10} /> {formatSalary(job.estimated_salary)}
                          </span>
                        )}
                        {job.spec_source && (
                          <span className="flex items-center gap-1">
                            <Briefcase size={10} /> {job.spec_source}
                          </span>
                        )}
                      </div>
                    </div>
                    <a
                      href={job.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-accent)] text-sm font-medium hover:underline whitespace-nowrap flex-shrink-0"
                    >
                      View Job
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No results were recovered from this search.</p>
            </div>
          )}

          <div className="flex flex-col gap-2.5 mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={onViewResults}
              className="w-full py-2.5 px-4 rounded-xl bg-[var(--color-accent)] text-white font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              View Full Results
            </button>
            <button
              onClick={clearResults}
              className="w-full py-2.5 px-4 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getVerdictColor(verdict: string | null) {
  switch (verdict) {
    case "HIRE": return "text-green-400 bg-green-500/10";
    case "INTERVIEW": return "text-yellow-400 bg-yellow-500/10";
    case "REJECT": return "text-red-400 bg-red-500/10";
    default: return "text-gray-400 bg-gray-500/10";
  }
}

function formatSalary(salary: string) {
  if (!salary) return "Not specified";
  return salary;
}