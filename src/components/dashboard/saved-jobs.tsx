"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { JobResultCard } from "./job-result-card";
import { Bookmark } from "lucide-react";
import { useActiveProfile } from "./dashboard-layout";

interface SavedJob {
  id: string;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  match_summary: string;
  job_url: string;
  full_spec: string;
  suggested_cv?: string;
  knockout_fail?: boolean | null;
  pillar_scores?: { industry: number; function: number; scale: number; tools: number; location: number } | null;
  taxes_applied?: string[] | null;
  total_questions_asked?: number | null;
  yes_answers?: number | null;
  recruiter_verdict?: string | null;
  dynamic_requirements?: { requirement: string; mandatory: boolean; pillar: string; met: boolean; evidence: string }[] | null;
  spec_source?: "google_jobs" | "jsearch" | "adzuna" | "linkedin" | "bing_jobs" | "scrappa" | null;
}

export function SavedJobs() {
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { activeProfileId } = useActiveProfile();

  useEffect(() => {
    if (!activeProfileId) { setJobs([]); setLoading(false); return; }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: any }) => {
      const session = data?.session;
      if (!session) { setLoading(false); return; }
      supabase
        .from("saved_jobs")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("profile_id", activeProfileId)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data }: { data: any }) => {
          setJobs((data ?? []) as SavedJob[]);
          setLoading(false);
        })
        .catch((err: Error) => {
          console.error("Failed to load saved jobs:", err.message);
          setError("Failed to load saved jobs.");
          setLoading(false);
        });
    }).catch((err: Error) => {
      console.error("Failed to get session:", err.message);
      setError("Session error.");
      setLoading(false);
    });
  }, [activeProfileId]);

  if (loading) {
    return <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">Loading...</p>;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <Bookmark size={32} className="mx-auto mb-2 text-[var(--color-text-secondary)] opacity-40" />
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <Bookmark size={32} className="mx-auto mb-2 text-[var(--color-text-secondary)] opacity-40" />
        <p className="text-sm text-[var(--color-text-secondary)]">No saved jobs yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((j) => (
        <JobResultCard
          key={j.id}
          id={j.id}
          jobTitle={j.job_title}
          company={j.company}
          location={j.location}
          salary={j.estimated_salary}
          matchScore={j.match_score}
          matchSummary={j.match_summary}
          jobUrl={j.job_url}
          fullDescription={j.full_spec}
          suggestedCvName={j.suggested_cv ?? ""}
          knockoutFail={j.knockout_fail}
          pillarScores={j.pillar_scores}
          taxesApplied={j.taxes_applied}
          totalQuestionsAsked={j.total_questions_asked}
          yesAnswers={j.yes_answers}
          recruiterVerdict={j.recruiter_verdict}
          dynamicRequirements={j.dynamic_requirements}
          specSource={j.spec_source}
          onDelete={(id) => setJobs((prev) => prev.filter((x) => x.id !== id))}
        />
      ))}
    </div>
  );
}
