"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { JobResultCard } from "./job-result-card";
import { X } from "lucide-react";

interface HistoryResult {
  id: string;
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  match_score: number;
  job_url: string;
  full_description: string;
}

interface SearchHistoryProps {
  open: boolean;
  onClose: () => void;
}

export function SearchHistory({ open, onClose }: SearchHistoryProps) {
  const [results, setResults] = useState<HistoryResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (!session) { setLoading(false); return; }
      supabase
        .from("job_results")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .then(({ data }: { data: any }) => {
          setResults((data ?? []) as HistoryResult[]);
          setLoading(false);
        });
    });
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg ml-auto bg-[#1C1C1E] border-l border-white/10 h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Search History</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-white/40 text-center py-8">Loading...</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-white/40 text-center py-8">No previous searches.</p>
        ) : (
          <div className="space-y-4">
            {results.map((r) => (
              <JobResultCard
                key={r.id}
                id={r.id}
                jobTitle={r.job_title}
                company={r.company}
                location={r.location}
                salary={r.estimated_salary}
                matchScore={r.match_score}
                jobUrl={r.job_url}
                fullDescription={r.full_description}
                onDelete={(id) => setResults((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
