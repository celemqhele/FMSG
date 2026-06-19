"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { XCircle } from "lucide-react";
import { JobResultCard } from "./job-result-card";

interface DeletedJob {
  id: string;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  job_url: string;
  full_spec: string;
  domain_verified?: boolean;
  domain_unverified_reason?: string;
}

export function RejectedJobs() {
  const [jobs, setJobs] = useState<DeletedJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: any }) => {
      const session = data?.session;
      if (!session) { setLoading(false); return; }
      supabase
        .from("job_results")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_deleted", true)
        .order("created_at", { ascending: false })
        .then(({ data }: { data: any }) => {
          setJobs((data ?? []) as DeletedJob[]);
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
        <XCircle size={32} className="mx-auto mb-2 text-[var(--color-text-secondary)] opacity-40" />
        <p className="text-sm text-[var(--color-text-secondary)]">No rejected jobs yet.</p>
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
          domainVerified={j.domain_verified ?? true}
          domainUnverifiedReason={j.domain_unverified_reason ?? ""}
          onDelete={(id) => setJobs((prev) => prev.filter((x) => x.id !== id))}
        />
      ))}
    </div>
  );
}
