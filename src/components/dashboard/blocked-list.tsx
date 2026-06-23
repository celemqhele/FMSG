"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Ban, Globe, XCircle } from "lucide-react";

type Tab = "companies" | "jobs";

export function BlockedList() {
  const [tab, setTab] = useState<Tab>("companies");
  const [companies, setCompanies] = useState<string[]>([]);
  const [jobs, setJobs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      const user = data?.user;
      if (!user) { setLoading(false); return; }
      supabase
        .from("profiles")
        .select("banned_companies, banned_jobs")
        .eq("id", user.id)
        .single()
        .then((res: any) => {
          if (res.data) {
            setCompanies(res.data.banned_companies ?? []);
            setJobs(res.data.banned_jobs ?? []);
          }
          setLoading(false);
        });
    });
  }, []);

  const handleUnbanCompany = async (company: string) => {
    const updated = companies.filter((c) => c !== company);
    setCompanies(updated);
    const supabase = createClient();
    const { data }: { data: any } = await supabase.auth.getUser();
    const user = data?.user;
    if (user) {
      const { error: err } = await supabase.from("profiles").update({ banned_companies: updated }).eq("id", user.id);
      if (err) {
        console.error("Failed to unban company:", err.message);
        setCompanies(companies);
      }
    }
  };

  const handleUnbanJob = async (url: string) => {
    const updated = jobs.filter((j) => j !== url);
    setJobs(updated);
    const supabase = createClient();
    const { data }: { data: any } = await supabase.auth.getUser();
    const user = data?.user;
    if (user) {
      const { error: err } = await supabase.from("profiles").update({ banned_jobs: updated }).eq("id", user.id);
      if (err) {
        console.error("Failed to unban job:", err.message);
        setJobs(jobs);
      }
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">Loading...</p>;
  }

  const items = tab === "companies" ? companies : jobs;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10 max-w-xs mx-auto">
        <button
          onClick={() => setTab("companies")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === "companies"
              ? "bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          Companies ({companies.length})
        </button>
        <button
          onClick={() => setTab("jobs")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === "jobs"
              ? "bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          Jobs ({jobs.length})
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12">
          <Ban size={32} className="mx-auto mb-2 text-[var(--color-text-secondary)] opacity-40" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            {tab === "companies" ? "No blocked companies." : "No blocked jobs."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item} className="flex items-center justify-between gap-3 liquid-glass rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                {tab === "companies" ? <Globe size={14} className="shrink-0 text-[var(--color-text-secondary)]" /> : <XCircle size={14} className="shrink-0 text-[var(--color-text-secondary)]" />}
                <span className="text-sm text-[var(--color-text-primary)] truncate">{item}</span>
              </div>
              <button
                onClick={() => tab === "companies" ? handleUnbanCompany(item) : handleUnbanJob(item)}
                className="shrink-0 text-xs text-[var(--color-accent)] hover:underline transition-colors"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
