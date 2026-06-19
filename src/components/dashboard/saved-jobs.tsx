"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { JobResultCard } from "./job-result-card";
import { Bookmark } from "lucide-react";

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
}

export function SavedJobs() {
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: any }) => {
      const session = data?.session;
      if (!session) { setLoading(false); return; }
      supabase
        .from("saved_jobs")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .then(({ data }: { data: any }) => {
          setJobs((data ?? []) as SavedJob[]);
          setLoading(false);
        });
    });
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">Loading...</p>;
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
          jobUrl={j.job_url}
          fullDescription={j.full_spec}
          onDelete={(id) => setJobs((prev) => prev.filter((x) => x.id !== id))}
        />
      ))}
    </div>
  );
}
